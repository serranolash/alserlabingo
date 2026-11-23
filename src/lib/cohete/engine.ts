// =============================================================================
//  EL COHETE CRIOLLO — Motor determinístico stateless (Crash / Aviator).
//
//  CERO setInterval / variables globales. El multiplicador crece exponencialmente
//  según el tiempo transcurrido desde startedAt:
//
//    currentMult = Math.pow(Math.E, 0.065 * elapsedSec)
//
//  La explosión ocurre cuando currentMult >= crashMultiplier (precalculado).
//
//  House edge 3%: la distribución del crashMultiplier tiene un 3% de
//  instant-crash (1.00x) y el resto sigue una cola pesada.
// =============================================================================

import { createHash, randomBytes } from "node:crypto";

export const ROCKET_GROWTH_RATE = 0.065; // e^(0.065 * t)
export const BETTING_DURATION_MS = 6000;
export const ROUND_GAP_MS = 4000;
export const HOUSE_EDGE = 0.03; // 3%

/** Genera una seed secreta de 32 bytes (hex). */
export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

/** Hash público de la seed (sha256 hex). */
export function hashSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

/**
 * Calcula el crashMultiplier provably fair a partir de serverSeed.
 * House edge 3%: 3% de instant-crash (1.00x), el resto distribución de cola pesada.
 * Fórmula estilo crash: result = (1 - edge) / (1 - r), con r derivado de la hash.
 */
export function computeCrashMultiplier(serverSeed: string): number {
  const hash = hashSeed(serverSeed);
  // 52-bit int de los primeros 13 hex chars
  const h = parseInt(hash.slice(0, 13), 16);

  // 3% instant-crash
  if (h % 100 < HOUSE_EDGE * 100) {
    return 1.0;
  }

  // r en [0, 1) a partir de la hash
  const r = (h % 1000000) / 1000000;
  // Fórmula crash: (1 - edge) / (1 - r) da cola pesada
  // Evitar división por 0 (r muy cerca de 1)
  const denom = Math.max(0.0001, 1 - r);
  const raw = (1 - HOUSE_EDGE) / denom;

  // Mínimo 1.01x (si no fue instant-crash), máximo 100x
  const result = Math.min(100, Math.max(1.01, raw));
  return Math.round(result * 100) / 100;
}

/** Multiplicador actual según el tiempo transcurrido. */
export function computeCurrentMult(startedAt: number, now: number): number {
  const elapsedSec = Math.max(0, (now - startedAt) / 1000);
  const mult = Math.pow(Math.E, ROCKET_GROWTH_RATE * elapsedSec);
  return Math.round(mult * 100) / 100;
}

export type RocketPhase = "betting" | "flying" | "crashed";

/** Fase actual del vuelo calculada por timestamp (stateless). */
export function getRocketPhase(
  bettingEndsAt: number,
  startedAt: number | null,
  crashedAt: number | null,
  crashMultiplier: number,
  now: number,
): { phase: RocketPhase; currentMult: number; crashTime: number | null } {
  if (now < bettingEndsAt) {
    return { phase: "betting", currentMult: 1.0, crashTime: null };
  }
  const start = startedAt ?? bettingEndsAt;
  const currentMult = computeCurrentMult(start, now);
  if (currentMult >= crashMultiplier) {
    // Calcular el momento exacto del crash: e^(0.065*t) = crashMult => t = ln(crashMult)/0.065
    const crashElapsedSec = Math.log(crashMultiplier) / ROCKET_GROWTH_RATE;
    const crashTime = start + crashElapsedSec * 1000;
    return { phase: "crashed", currentMult: crashMultiplier, crashTime };
  }
  return { phase: "flying", currentMult, crashTime: null };
}
