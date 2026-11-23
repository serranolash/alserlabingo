// =============================================================================
//  COHETE SERVICE — lógica de negocio de El Cohete Criollo (PUNTOS gratis).
//
//  Motor determinístico stateless: getOrCreateCurrentRound() evalúa el tiempo,
//  transiciona vuelos a crashed (crashea apuestas activas) y crea el siguiente
//  vuelo automáticamente si pasaron 4s desde el crash.
//
//  Economía aislada: usa user.points (compartido con La Tómbola Caliente).
// =============================================================================
import { db } from "@/lib/db";
import { HttpError } from "@/lib/game/room-service";
import {
  BETTING_DURATION_MS,
  ROUND_GAP_MS,
  computeCrashMultiplier,
  computeCurrentMult,
  generateServerSeed,
  getRocketPhase,
  hashSeed,
} from "./engine";

const notFound = (msg: string) => new HttpError(404, msg);
const badRequest = (msg: string) => new HttpError(400, msg);

export interface RocketState {
  round: {
    id: string;
    seedHash: string;
    serverSeed: string | null;
    status: string;
    phase: "betting" | "flying" | "crashed";
    crashMultiplier: number;
    bettingEndsAt: number;
    startedAt: number;
    crashedAt: number | null;
    currentMult: number;
    nextRoundIn: number | null;
  } | null;
  myBet: {
    id: string;
    pointsWagered: number;
    autoCashoutAt: number | null;
    status: string;
    cashoutMultiplier: number | null;
    pointsWon: number;
    currentMult: number;
    potentialWin: number;
  } | null;
  bets: Array<{
    userId: string;
    name: string;
    pointsWagered: number;
    status: string;
    cashoutMultiplier: number | null;
    pointsWon: number;
  }>;
  points: number;
  canClaimDaily: boolean;
  nextDailyIn: number | null;
  recentFlights: Array<{ crashMultiplier: number }>;
}

/** Devuelve/crea el vuelo actual y entrega el estado completo para el usuario. */
export async function getRocketState(userId: string): Promise<RocketState> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario no encontrado");

  const round = await getOrCreateCurrentRound();
  const now = Date.now();
  const phase = getRocketPhase(
    round.bettingEndsAt.getTime(),
    round.startedAt?.getTime() ?? null,
    round.crashedAt?.getTime() ?? null,
    round.crashMultiplier,
    now,
  );

  // Si la fase cambió a crashed pero la ronda no estaba crasheada, transicionar.
  if (phase.phase === "crashed" && round.status !== "crashed") {
    await crashRound(round.id, round.startedAt, round.crashMultiplier);
    return getRocketState(userId);
  }

  // Sincronizar status a flying si corresponde
  if (phase.phase === "flying" && round.status === "betting") {
    await db.rocketRound.update({
      where: { id: round.id },
      data: { status: "flying", startedAt: round.bettingEndsAt },
    });
  }

  // Auto-salto: si hay apuestas con autoCashoutAt y currentMult >= autoCashoutAt, saltarlas
  if (phase.phase === "flying") {
    await processAutoCashouts(round.id, phase.currentMult, round.crashMultiplier);
  }

  // Apuesta del usuario
  const myBet = await db.rocketBet.findFirst({
    where: { roundId: round.id, userId },
  });
  // Todas las apuestas (prueba social)
  const allBets = await db.rocketBet.findMany({
    where: { roundId: round.id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Historial de últimos 10 vuelos
  const recentCrashed = await db.rocketRound.findMany({
    where: { status: "crashed" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { crashMultiplier: true },
  });

  const nextRoundIn =
    phase.phase === "crashed" && round.crashedAt
      ? Math.max(0, round.crashedAt.getTime() + ROUND_GAP_MS - now)
      : null;

  return {
    round: {
      id: round.id,
      seedHash: round.seedHash,
      serverSeed: phase.phase === "crashed" ? round.serverSeed : null,
      status: phase.phase,
      phase: phase.phase,
      crashMultiplier: round.crashMultiplier,
      bettingEndsAt: round.bettingEndsAt.getTime(),
      startedAt: round.startedAt?.getTime() ?? round.bettingEndsAt.getTime(),
      crashedAt: round.crashedAt?.getTime() ?? null,
      currentMult: phase.currentMult,
      nextRoundIn,
    },
    myBet: myBet
      ? {
          id: myBet.id,
          pointsWagered: myBet.pointsWagered,
          autoCashoutAt: myBet.autoCashoutAt,
          status: myBet.status,
          cashoutMultiplier: myBet.cashoutMultiplier,
          pointsWon: myBet.pointsWon,
          currentMult: phase.currentMult,
          potentialWin: Math.floor(myBet.pointsWagered * phase.currentMult),
        }
      : null,
    bets: allBets.map((b) => ({
      userId: b.userId,
      name: b.user.name,
      pointsWagered: b.pointsWagered,
      status: b.status,
      cashoutMultiplier: b.cashoutMultiplier,
      pointsWon: b.pointsWon,
    })),
    points: user.points,
    canClaimDaily:
      !user.lastDailyPointsAt ||
      now - user.lastDailyPointsAt.getTime() >= 12 * 60 * 60 * 1000,
    nextDailyIn:
      !user.lastDailyPointsAt ||
      now - user.lastDailyPointsAt.getTime() >= 12 * 60 * 60 * 1000
        ? null
        : user.lastDailyPointsAt.getTime() + 12 * 60 * 60 * 1000 - now,
    recentFlights: recentCrashed.map((r) => ({ crashMultiplier: r.crashMultiplier })),
  };
}

/** Obtiene el vuelo actual; crea uno nuevo si no hay o el anterior explotó hace >4s. */
async function getOrCreateCurrentRound() {
  const now = Date.now();
  const latest = await db.rocketRound.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (latest) {
    const phase = getRocketPhase(
      latest.bettingEndsAt.getTime(),
      latest.startedAt?.getTime() ?? null,
      latest.crashedAt?.getTime() ?? null,
      latest.crashMultiplier,
      now,
    );

    if (phase.phase !== "crashed") {
      return latest;
    }
    const crashTime = latest.crashedAt?.getTime() ?? now;
    if (now - crashTime < ROUND_GAP_MS) {
      return latest;
    }
  }

  // Crear nuevo vuelo
  const serverSeed = generateServerSeed();
  const seedHash = hashSeed(serverSeed);
  const crashMultiplier = computeCrashMultiplier(serverSeed);
  const bettingEndsAt = new Date(now + BETTING_DURATION_MS);

  return db.rocketRound.create({
    data: {
      serverSeed,
      seedHash,
      status: "betting",
      crashMultiplier,
      bettingEndsAt,
      startedAt: bettingEndsAt,
    },
  });
}

/** Transiciona un vuelo a crashed: registra crashedAt, status, y crashea apuestas activas. */
async function crashRound(roundId: string, startedAt: Date | null, crashMultiplier: number) {
  await db.$transaction(async (tx) => {
    const round = await tx.rocketRound.findUnique({ where: { id: roundId } });
    if (!round || round.status === "crashed") return;
    // Calcular el momento exacto del crash
    const crashElapsedSec = Math.log(crashMultiplier) / 0.065;
    const crashTime = (round.startedAt ?? round.bettingEndsAt).getTime() + crashElapsedSec * 1000;
    await tx.rocketRound.update({
      where: { id: roundId },
      data: { status: "crashed", crashedAt: new Date(crashTime) },
    });
    // Crashear apuestas activas
    await tx.rocketBet.updateMany({
      where: { roundId, status: "active" },
      data: { status: "crashed", pointsWon: 0 },
    });
  });
}

/** Procesa auto-saltos: si currentMult >= autoCashoutAt, salta la apuesta. */
async function processAutoCashouts(roundId: string, currentMult: number, crashMultiplier: number) {
  if (currentMult >= crashMultiplier) return; // ya va a crashear
  const pending = await db.rocketBet.findMany({
    where: { roundId, status: "active", autoCashoutAt: { not: null, lte: currentMult } },
  });
  for (const bet of pending) {
    if (bet.autoCashoutAt && bet.autoCashoutAt <= currentMult && bet.autoCashoutAt < crashMultiplier) {
      const won = Math.floor(bet.pointsWagered * bet.autoCashoutAt);
      await db.$transaction(async (tx) => {
        await tx.rocketBet.update({
          where: { id: bet.id },
          data: { status: "jumped", cashoutMultiplier: bet.autoCashoutAt, pointsWon: won },
        });
        await tx.user.update({
          where: { id: bet.userId },
          data: { points: { increment: won } },
        });
      });
    }
  }
}

/** Apuesta puntos en el vuelo actual (solo fase betting). */
export async function placeBet(userId: string, pointsWagered: number, autoCashoutAt?: number) {
  if (![50, 100, 250, 500].includes(pointsWagered)) {
    throw badRequest("Apuesta permitida: 50, 100, 250 o 500 puntos");
  }
  if (autoCashoutAt !== undefined && (autoCashoutAt < 1.01 || autoCashoutAt > 100)) {
    throw badRequest("Auto-salto debe estar entre 1.01x y 100x");
  }
  const now = Date.now();
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");
    if (user.points < pointsWagered) throw badRequest("No tienes suficientes puntos");

    const latest = await tx.rocketRound.findFirst({ orderBy: { createdAt: "desc" } });
    if (!latest) throw badRequest("No hay vuelo activo");
    if (now >= latest.bettingEndsAt.getTime()) throw badRequest("La fase de apuestas terminó");

    const existing = await tx.rocketBet.findFirst({
      where: { roundId: latest.id, userId, status: "active" },
    });
    if (existing) throw badRequest("Ya apostaste en este vuelo");

    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: { decrement: pointsWagered } },
    });

    const bet = await tx.rocketBet.create({
      data: {
        roundId: latest.id,
        userId,
        pointsWagered,
        autoCashoutAt: autoCashoutAt ?? null,
        status: "active",
      },
    });
    return { bet, points: updated.points };
  });
}

/** Salta (cashout) la apuesta activa — verifica currentMult < crashMultiplier. */
export async function jump(userId: string) {
  const now = Date.now();
  return db.$transaction(async (tx) => {
    const latest = await tx.rocketRound.findFirst({ orderBy: { createdAt: "desc" } });
    if (!latest) throw badRequest("No hay vuelo activo");

    const bet = await tx.rocketBet.findFirst({
      where: { roundId: latest.id, userId, status: "active" },
    });
    if (!bet) throw badRequest("No tienes apuesta activa para saltar");

    const phase = getRocketPhase(
      latest.bettingEndsAt.getTime(),
      latest.startedAt?.getTime() ?? null,
      latest.crashedAt?.getTime() ?? null,
      latest.crashMultiplier,
      now,
    );
    if (phase.phase !== "flying") throw badRequest("El cohete no está volando");
    if (phase.currentMult >= latest.crashMultiplier) throw badRequest("El cohete ya explotó");

    const won = Math.floor(bet.pointsWagered * phase.currentMult);
    await tx.rocketBet.update({
      where: { id: bet.id },
      data: {
        status: "jumped",
        cashoutMultiplier: phase.currentMult,
        pointsWon: won,
      },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: { increment: won } },
    });
    return { won, multiplier: phase.currentMult, points: updated.points };
  });
}
