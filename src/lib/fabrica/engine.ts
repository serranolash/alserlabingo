// =============================================================================
//  LA FÁBRICA LOCA — Motor de juego (tycoon persistente de puntos).
//
//  Tipos de máquinas con costo, producción y probabilidad de avería.
//  La producción se calcula stateless: cada TURNO_MS (30s) desde lastProducedAt,
//  cada máquina activa produce su cantidad. Las averiadas no producen.
//  El incendio es un evento raro (~5%) que destruye toda la producción acumulada.
// =============================================================================

export const TURN_MS = 30_000; // 30 segundos por turno de producción
export const FIRE_PROBABILITY = 0.05; // 5% de incendio por turno
export const FIRE_COOLDOWN_MS = 120_000; // 2 min de cooldown tras incendio

export interface MachineSpec {
  type: string;
  label: string;
  emoji: string;
  cost: number; // puntos para comprar
  production: number; // goods por turno
  breakChance: number; // probabilidad de avería por turno
  repairCost: number; // puntos para reparar
  color: string; // color CSS
}

// Catálogo de máquinas (de barato/productivo a caro/poderoso)
export const MACHINE_SPECS: Record<string, MachineSpec> = {
  SOLDADORA: {
    type: "SOLDADORA",
    label: "Soldadora",
    emoji: "🔧",
    cost: 100,
    production: 8,
    breakChance: 0.08,
    repairCost: 30,
    color: "#f59e0b",
  },
  PRENSA: {
    type: "PRENSA",
    label: "Prensa",
    emoji: "⚙️",
    cost: 250,
    production: 22,
    breakChance: 0.06,
    repairCost: 60,
    color: "#8b5cf6",
  },
  HORNO: {
    type: "HORNO",
    label: "Horno",
    emoji: "🔥",
    cost: 500,
    production: 50,
    breakChance: 0.05,
    repairCost: 100,
    color: "#ef4444",
  },
  ROBOT: {
    type: "ROBOT",
    label: "Robot Industrial",
    emoji: "🤖",
    cost: 1000,
    production: 120,
    breakChance: 0.03,
    repairCost: 200,
    color: "#10b981",
  },
};

export const MACHINE_ORDER = ["SOLDADORA", "PRENSA", "HORNO", "ROBOT"];

/** Conversión de goods a puntos: 10 goods = 1 punto. */
export const GOODS_TO_POINTS_RATIO = 10;

/** Convierte goods a puntos. */
export function goodsToPoints(goods: number): number {
  return Math.floor(goods / GOODS_TO_POINTS_RATIO);
}

/**
 * Calcula cuántos turnos pasaron desde lastProducedAt hasta now.
 * Cada turno = TURN_MS (30s).
 */
export function calculateTurns(lastProducedAt: number | null, now: number): number {
  if (!lastProducedAt) return 0;
  return Math.floor((now - lastProducedAt) / TURN_MS);
}

/**
 * Simula los turnos transcurridos para una fábrica:
 * - Cada turno: máquinas activas producen goods.
 * - Cada turno: máquinas activas pueden averiarse (breakChance).
 * - Cada turno: probabilidad de incendio (destruye accumulatedGoods).
 * Devuelve el resultado: goods acumulados, máquinas averiadas, incendio.
 */
export interface ProductionResult {
  newGoods: number;
  brokenMachineIds: string[];
  hadFire: boolean;
  turnsProcessed: number;
}

export function simulateProduction(
  machines: Array<{ id: string; machineType: string; broken: boolean }>,
  currentAccumulated: number,
  turns: number,
): ProductionResult {
  let goods = currentAccumulated;
  const brokenIds: string[] = [];
  let hadFire = false;

  for (let t = 0; t < turns; t++) {
    // Producción de máquinas activas
    for (const m of machines) {
      if (m.broken) continue;
      const spec = MACHINE_SPECS[m.machineType];
      if (!spec) continue;
      goods += spec.production;
    }

    // Probabilidad de avería por máquina activa
    for (const m of machines) {
      if (m.broken) continue;
      const spec = MACHINE_SPECS[m.machineType];
      if (!spec) continue;
      if (Math.random() < spec.breakChance) {
        brokenIds.push(m.id);
      }
    }

    // Probabilidad de incendio (solo si hay goods acumulados)
    if (goods > 0 && Math.random() < FIRE_PROBABILITY) {
      goods = 0; // el incendio destruye toda la producción
      hadFire = true;
      break; // no seguir procesando turnos tras incendio
    }
  }

  return { newGoods: goods, brokenMachineIds: [...new Set(brokenIds)], hadFire, turnsProcessed: turns };
}
