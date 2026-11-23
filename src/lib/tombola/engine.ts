// =============================================================================
//  LA TÓMBOLA CALIENTE — Motor determinístico stateless (Provably Fair).
//
//  CERO setInterval / variables globales. El ciclo de vida se calcula por
//  timestamps en la BD (compatible con Vercel serverless):
//
//    Fase apuestas (betting): now < bettingEndsAt  (6 segundos)
//    Fase sorteo  (running):  ballIndex = floor((now - startedAt) / BALL_INTERVAL_MS)
//      - bolilla dorada i < bombIndex => suma al multiplicador
//      - ballIndex >= bombIndex => BOMBA => crashed
//
//  serverSeed (SHA-256) => seedHash pública + ballsSequence precalculada.
// =============================================================================

import { createHash, randomBytes } from "node:crypto";

export const BALL_INTERVAL_MS = 2000; // 2.0s entre bolillas
export const BETTING_DURATION_MS = 6000; // 6s de apuestas
export const ROUND_GAP_MS = 4000; // 4s entre ronda crasheada y la siguiente
export const DAILY_BONUS_POINTS = 300;
export const DAILY_BONUS_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 horas
export const REFERRAL_REWARD_POINTS = 500;
export const INITIAL_POINTS = 1000;

export interface TombolaBall {
  type: "mult" | "double" | "bomb";
  label: string;
  add?: number; // para type "mult": suma al multiplicador
  mult?: number; // para type "double": multiplica
}

/** Genera una seed secreta de 32 bytes (hex). */
export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

/** Hash público de la seed (sha256 hex). */
export function hashSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

/**
 * Genera la secuencia de bolillas (provably fair) a partir de serverSeed.
 * Determina bombIndex por la hash, y bolillas doradas antes de la bomba.
 */
export function generateBallsSequence(serverSeed: string): {
  balls: TombolaBall[];
  bombIndex: number;
} {
  const hash = hashSeed(serverSeed);
  // 52-bit int de los primeros 13 hex chars
  const h = parseInt(hash.slice(0, 13), 16);

  // 4% de explosión instantánea (bomba en bolilla 0)
  const instantCrash = h % 100 < 4;

  let bombIndex: number;
  if (instantCrash) {
    bombIndex = 0;
  } else {
    // Distribución de cola pesada (estilo crash): r = (h % 10000)/10000
    const r = (h % 10000) / 10000;
    // crashMult mín ~0.99, crece con cola pesada
    const crashMult = 0.99 / (1 - r);
    // cada bolilla dorada aporta ~0.35x en promedio => bombIndex ~ crashMult/0.35
    bombIndex = Math.max(1, Math.floor(crashMult / 0.35));
    bombIndex = Math.min(bombIndex, 40);
  }

  const balls: TombolaBall[] = [];
  for (let i = 0; i < bombIndex; i++) {
    balls.push(generateGoldenBall(hash, i));
  }
  balls.push({ type: "bomb", label: "BOMBA" });
  return { balls, bombIndex };
}

/** Bolilla dorada con efecto aleatorio determinado por la hash + índice. */
function generateGoldenBall(hash: string, index: number): TombolaBall {
  // Usa chars distintos de la hash por índice para derivar el tipo
  const start = (index * 5) % 50;
  const v = parseInt(hash.slice(start, start + 5), 16) % 100;
  if (v < 50) return { type: "mult", label: "+0.2x", add: 0.2 };
  if (v < 75) return { type: "mult", label: "+0.3x", add: 0.3 };
  if (v < 88) return { type: "mult", label: "+0.5x", add: 0.5 };
  if (v < 96) return { type: "double", label: "x1.5", mult: 1.5 };
  return { type: "double", label: "x2", mult: 2 };
}

/** Multiplicador acumulado tras revelar `count` bolillas doradas. */
export function computeMultiplier(balls: TombolaBall[], count: number): number {
  let mult = 1.0;
  for (let i = 0; i < count && i < balls.length; i++) {
    const b = balls[i];
    if (b.type === "mult") mult += b.add ?? 0;
    else if (b.type === "double") mult *= b.mult ?? 1;
    else break; // bomba
  }
  return Math.round(mult * 100) / 100;
}

/** Índice de bolilla actual (reveladas) según timestamp. */
export function computeBallIndex(startedAt: number | null, now: number): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / BALL_INTERVAL_MS));
}

export type RoundPhase = "betting" | "running" | "crashed";

export interface RoundTiming {
  bettingEndsAt: number;
  startedAt: number | null;
  crashedAt: number | null;
}

/** Fase actual de la ronda calculada por timestamp (stateless). */
export function getRoundPhase(
  timing: RoundTiming,
  balls: TombolaBall[],
  bombIndex: number,
  now: number,
): { phase: RoundPhase; ballIndex: number; multiplier: number; bombRevealAt: number | null } {
  if (now < timing.bettingEndsAt) {
    return { phase: "betting", ballIndex: 0, multiplier: 1.0, bombRevealAt: null };
  }
  const startedAt = timing.startedAt ?? timing.bettingEndsAt;
  const ballIndex = computeBallIndex(startedAt, now);
  if (ballIndex >= bombIndex) {
    // bomba revelada en bolilla bombIndex
    const bombRevealAt = startedAt + bombIndex * BALL_INTERVAL_MS;
    return { phase: "crashed", ballIndex: bombIndex, multiplier: computeMultiplier(balls, bombIndex), bombRevealAt };
  }
  return {
    phase: "running",
    ballIndex,
    multiplier: computeMultiplier(balls, ballIndex),
    bombRevealAt: null,
  };
}

/** Parsea ballsSequence (Json) a TombolaBall[]. */
export function parseBalls(raw: unknown): TombolaBall[] {
  if (!Array.isArray(raw)) return [];
  return raw as TombolaBall[];
}

/** Devuelve el bombIndex de una secuencia (índice de la primera bomba). */
export function findBombIndex(balls: TombolaBall[]): number {
  const idx = balls.findIndex((b) => b.type === "bomb");
  return idx === -1 ? balls.length : idx;
}

/** Genera un código de referido corto y único (8 chars). */
export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}
