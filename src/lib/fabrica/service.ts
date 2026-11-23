// =============================================================================
//  FÁBRICA SERVICE — lógica de negocio de La Fábrica Loca (PUNTOS gratis).
//
//  Tycoon persistente: las máquinas del jugador se guardan entre sesiones.
//  La producción se calcula stateless: al cargar el estado, se procesan todos
//  los turnos transcurridos desde lastProducedAt (sin setInterval).
// =============================================================================
import { db } from "@/lib/db";
import { HttpError } from "@/lib/game/room-service";
import {
  GOODS_TO_POINTS_RATIO,
  MACHINE_ORDER,
  MACHINE_SPECS,
  TURN_MS,
  calculateTurns,
  goodsToPoints,
  simulateProduction,
  type MachineSpec,
} from "./engine";

const notFound = (msg: string) => new HttpError(404, msg);
const badRequest = (msg: string) => new HttpError(400, msg);

export interface FactoryState {
  factory: {
    id: string;
    accumulatedGoods: number;
    totalSold: number;
    machineCount: number;
    brokenCount: number;
    activeCount: number;
    productionPerTurn: number; // goods por turno con máquinas activas
    potentialPoints: number; // goods acumulados convertidos a puntos
    turnsPending: number; // turnos sin procesar
    nextTurnIn: number; // ms al próximo turno
  } | null;
  machines: Array<{
    id: string;
    machineType: string;
    label: string;
    emoji: string;
    color: string;
    broken: boolean;
    production: number;
  }>;
  catalog: Array<MachineSpec>;
  points: number;
  canClaimDaily: boolean;
  lastFire: boolean; // si hubo incendio en el último procesamiento
}

/** Obtiene o crea la fábrica del usuario y procesa la producción pendiente. */
export async function getFactoryState(userId: string): Promise<FactoryState> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario no encontrado");

  // Obtener o crear fábrica
  let factory = await db.factory.findUnique({
    where: { userId },
    include: { machines: true },
  });

  if (!factory) {
    factory = await db.factory.create({
      data: { userId },
      include: { machines: true },
    });
  }

  // Procesar producción pendiente (stateless)
  const now = Date.now();
  const lastProducedAt = factory.lastProducedAt?.getTime() ?? null;
  const turns = calculateTurns(lastProducedAt, now);
  let hadFire = false;

  // Si es la primera vez (lastProducedAt null) y hay máquinas, inicializar el reloj
  if (lastProducedAt === null && factory.machines.length > 0) {
    await db.factory.update({
      where: { id: factory.id },
      data: { lastProducedAt: new Date(now) },
    });
  } else if (turns > 0 && factory.machines.length > 0) {
    const result = simulateProduction(
      factory.machines.map((m) => ({ id: m.id, machineType: m.machineType, broken: m.broken })),
      factory.accumulatedGoods,
      Math.min(turns, 50), // cap a 50 turnos para evitar sobrecarga
    );

    // Marcar máquinas averiadas
    if (result.brokenMachineIds.length > 0) {
      await db.factoryMachine.updateMany({
        where: { id: { in: result.brokenMachineIds } },
        data: { broken: true, brokenAt: new Date() },
      });
    }

    // Actualizar fábrica
    await db.factory.update({
      where: { id: factory.id },
      data: {
        accumulatedGoods: result.newGoods,
        lastProducedAt: new Date(now),
        lastFireAt: result.hadFire ? new Date(now) : factory.lastFireAt,
      },
    });

    hadFire = result.hadFire;

    // Recargar fábrica con máquinas actualizadas
    factory = await db.factory.findUnique({
      where: { id: factory.id },
      include: { machines: true },
    })!;
  }

  // Calcular producción por turno (máquinas activas)
  const activeMachines = factory!.machines.filter((m) => !m.broken);
  const productionPerTurn = activeMachines.reduce((sum, m) => {
    const spec = MACHINE_SPECS[m.machineType];
    return sum + (spec?.production ?? 0);
  }, 0);

  const nextTurnIn = factory!.lastProducedAt
    ? Math.max(0, factory!.lastProducedAt.getTime() + TURN_MS - now)
    : 0;

  const canClaimDaily =
    !user.lastDailyPointsAt ||
    now - user.lastDailyPointsAt.getTime() >= 12 * 60 * 60 * 1000;

  return {
    factory: {
      id: factory!.id,
      accumulatedGoods: factory!.accumulatedGoods,
      totalSold: factory!.totalSold,
      machineCount: factory!.machines.length,
      brokenCount: factory!.machines.filter((m) => m.broken).length,
      activeCount: activeMachines.length,
      productionPerTurn,
      potentialPoints: goodsToPoints(factory!.accumulatedGoods),
      turnsPending: Math.floor(nextTurnIn === 0 ? 0 : 0),
      nextTurnIn,
    },
    machines: factory!.machines.map((m) => {
      const spec = MACHINE_SPECS[m.machineType];
      return {
        id: m.id,
        machineType: m.machineType,
        label: spec?.label ?? m.machineType,
        emoji: spec?.emoji ?? "❓",
        color: spec?.color ?? "#888",
        broken: m.broken,
        production: spec?.production ?? 0,
      };
    }),
    catalog: MACHINE_ORDER.map((t) => MACHINE_SPECS[t]),
    points: user.points,
    canClaimDaily,
    lastFire: hadFire,
  };
}

/** Compra una máquina para la fábrica. */
export async function buyMachine(userId: string, machineType: string) {
  const spec = MACHINE_SPECS[machineType];
  if (!spec) throw badRequest("Tipo de máquina inválido");

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");
    if (user.points < spec.cost) throw badRequest(`Necesitas ${spec.cost} puntos`);

    let factory = await tx.factory.findUnique({ where: { userId } });
    if (!factory) {
      factory = await tx.factory.create({ data: { userId } });
    }

    // Debitar puntos
    await tx.user.update({
      where: { id: userId },
      data: { points: { decrement: spec.cost } },
    });

    // Crear máquina
    const machine = await tx.factoryMachine.create({
      data: { factoryId: factory.id, machineType },
    });

    return { machine, points: user.points - spec.cost, machineSpec: spec };
  });
}

/** Vende la producción acumulada (convierte goods a puntos). */
export async function sellProduction(userId: string) {
  return db.$transaction(async (tx) => {
    const factory = await tx.factory.findUnique({ where: { userId } });
    if (!factory) throw notFound("No tienes fábrica");
    if (factory.accumulatedGoods < GOODS_TO_POINTS_RATIO)
      throw badRequest("No tienes suficientes goods para vender");

    const points = goodsToPoints(factory.accumulatedGoods);
    const remainingGoods = factory.accumulatedGoods % GOODS_TO_POINTS_RATIO;

    // Actualizar fábrica
    await tx.factory.update({
      where: { id: factory.id },
      data: {
        accumulatedGoods: remainingGoods,
        totalSold: { increment: factory.accumulatedGoods - remainingGoods },
      },
    });

    // Acreditar puntos
    const user = await tx.user.update({
      where: { id: userId },
      data: { points: { increment: points } },
    });

    return { points: user.points, sold: points, remainingGoods };
  });
}

/** Repara una máquina averiada. */
export async function repairMachine(userId: string, machineId: string) {
  return db.$transaction(async (tx) => {
    const machine = await tx.factoryMachine.findUnique({
      where: { id: machineId },
      include: { factory: true },
    });
    if (!machine) throw notFound("Máquina no encontrada");
    if (machine.factory.userId !== userId) throw new HttpError(403, "No es tu máquina");
    if (!machine.broken) throw badRequest("La máquina no está averiada");

    const spec = MACHINE_SPECS[machine.machineType];
    if (!spec) throw badRequest("Tipo de máquina inválido");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");
    if (user.points < spec.repairCost) throw badRequest(`Necesitas ${spec.repairCost} puntos para reparar`);

    await tx.user.update({
      where: { id: userId },
      data: { points: { decrement: spec.repairCost } },
    });

    await tx.factoryMachine.update({
      where: { id: machineId },
      data: { broken: false, brokenAt: null },
    });

    return { repaired: true, points: user.points - spec.repairCost, machineSpec: spec };
  });
}
