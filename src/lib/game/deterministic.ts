// =============================================================================
//  MOTOR DE SORTEO DETERMINÍSTICO STATELESS (CERO timers en RAM)
//
//  Las bolillas reveladas se CALCULAN a partir del reloj, no se guardan en
//  memoria ni se disparan con setInterval:
//
//     effectiveNow  = pausedAt ?? endedAt ?? serverNow
//     elapsedMs     = effectiveNow - startedAt - pausedElapsedMs
//     revealedCount = clamp( floor(elapsedMs / (intervalSec*1000)), 0, 75 )
//     drawnNumbers  = ballSequence.slice(0, revealedCount)
//
//  - start: genera ballSequence (permutación 1..75) + startedAt = now.
//  - 1ra Línea: pausedAt = now (congela el reloj => revealedCount se clava).
//  - resume: pausedElapsedMs += (now - pausedAt); pausedAt = null.
//  - Bingo: endedAt = now (congela definitivamente).
//
//  Sobrevive reinicios del proceso, es multi-instancia y serverless-safe.
// =============================================================================
import type { Room } from "@prisma/client";
import { MAX_BALL } from "@/lib/bingo/constants";

/** Tiempo de servidor actual (ms epoch). */
export function getServerTime(): number {
  return Date.now();
}

/** Normaliza ballSequence (Json) a number[]. */
export function parseBallSequence(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_BALL);
}

/**
 * Calcula cuántas bolillas están reveladas en este instante.
 * Pure function: no toca la BD, no depende de timers.
 */
export function computeRevealedCount(room: {
  ballSequence: unknown;
  startedAt: Date | null;
  pausedAt: Date | null;
  pausedElapsedMs: number;
  intervalSec: number;
  endedAt: Date | null;
  status: string;
}, now: number = getServerTime()): number {
  const seq = parseBallSequence(room.ballSequence);
  if (seq.length === 0 || !room.startedAt || room.status === "WAITING") {
    return 0;
  }
  const intervalMs = Math.max(1, room.intervalSec) * 1000;
  // El reloj se congela en pausedAt (pausa por Línea) o endedAt (fin por Bingo).
  const freezePoint = room.pausedAt ?? room.endedAt;
  const effectiveNow = freezePoint ? freezePoint.getTime() : now;
  const elapsedMs =
    effectiveNow - room.startedAt.getTime() - room.pausedElapsedMs;
  if (elapsedMs <= 0) return 0;
  const count = Math.floor(elapsedMs / intervalMs);
  return Math.max(0, Math.min(count, seq.length));
}

/** Bolillas reveladas hasta ahora (slice del permuto). */
export function getDrawnNumbers(
  room: Parameters<typeof computeRevealedCount>[0],
  now: number = getServerTime(),
): number[] {
  const seq = parseBallSequence(room.ballSequence);
  const count = computeRevealedCount(room, now);
  return seq.slice(0, count);
}

/**
 * Persiste (idempotente) las bolillas reveladas en la tabla Draw para auditoría.
 * Inserta una a una ignorando violaciones de unicidad (P2002) => seguro bajo
 * concurrencia entre getPublicState y claim sin depender de skipDuplicates.
 */
export async function ensureDrawsPersisted(
  tx: Parameters<Parameters<typeof import("@/lib/db").db.$transaction>[0]>[0],
  roomId: string,
  ballSequence: number[],
  revealedCount: number,
): Promise<void> {
  if (revealedCount <= 0) return;
  const existing = await tx.draw.count({ where: { roomId } });
  if (existing >= revealedCount) return;
  for (let i = existing; i < revealedCount; i++) {
    try {
      await tx.draw.create({
        data: { roomId, number: ballSequence[i], order: i + 1 },
      });
    } catch (err) {
      // P2002 = violación de constraint único => otra transacción la insertó.
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code === "P2002";
  }
  return false;
}

/** Resumen de reloj para el cliente (sincroniza su reloj local). */
export function clockSnapshot(room: {
  startedAt: Date | null;
  pausedAt: Date | null;
  endedAt: Date | null;
  pausedElapsedMs: number;
  intervalSec: number;
}) {
  return {
    serverTime: getServerTime(),
    startedAt: room.startedAt?.getTime() ?? null,
    pausedAt: room.pausedAt?.getTime() ?? null,
    endedAt: room.endedAt?.getTime() ?? null,
    pausedElapsedMs: room.pausedElapsedMs,
    intervalSec: room.intervalSec,
  };
}
