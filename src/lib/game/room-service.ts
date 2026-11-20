// =============================================================================
//  ROOM SERVICE — Lógica de negocio transaccional del Bingo 75
//
//  Corrige TODOS los bugs críticos del repo NestJS original:
//   - userId se extrae de la SESIÓN (auth), nunca del body.
//   - buyCards/claim envueltos en prisma.$transaction con bloqueo de fila
//     (room + user) => cero race conditions, cero doble gasto.
//   - Premios SÍ se acreditan (via adjustBalance + LedgerEntry).
//   - Co-ganadores: mismo drawIndex => premio dividido con ajuste retroactivo
//     para que el total acreditado === floor(prizeTotal / N) * N <= prizeTotal.
//   - Pausa por 1ra Línea => pausedAt (reloj determinístico congelado).
//   - Bingo => endedAt (fin definitivo).
// =============================================================================
import type { PrismaClient, Room, Ticket, User } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type ClaimType,
  type PublicRoomState,
  type RoomStatus,
} from "@/lib/bingo/types";
import { generateBallSequence, generateBingo75Card, normalizeGrid } from "@/lib/bingo/engine";
import { computeCardProgress, validatePattern } from "@/lib/bingo/patterns";
import { adjustBalance } from "./ledger";
import {
  computeRevealedCount,
  ensureDrawsPersisted,
  getServerTime,
  parseBallSequence,
} from "./deterministic";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// ── Errores HTTP tipados para que las routes los traduzcan a status codes ───
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const notFound = (msg: string) => new HttpError(404, msg);
const badRequest = (msg: string) => new HttpError(400, msg);
const forbidden = (msg: string) => new HttpError(403, msg);

// ── Generación de código corto de sala (6 chars, sin caracteres ambiguos) ──
const TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function generateRoomToken(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = Array.from(
      { length: 6 },
      () => TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)],
    ).join("");
    const exists = await db.room.findUnique({
      where: { token: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new Error("No se pudo generar un código de sala único");
}

// ─────────────────────────────────────────────────────────────────────────────
//  CREATE ROOM — el host autenticado crea una sala y se une como participante
// ─────────────────────────────────────────────────────────────────────────────
export async function createRoom(
  hostUserId: string,
  opts?: {
    cardPrice?: number;
    prizeLine?: number;
    prizeCorners?: number;
    prizeBingo?: number;
    intervalSec?: number;
    currency?: string;
  },
): Promise<{ room: Room; token: string }> {
  const token = await generateRoomToken();
  const room = await db.room.create({
    data: {
      token,
      status: "WAITING",
      gameType: "75",
      hostId: hostUserId,
      cardPrice: opts?.cardPrice ?? Number(process.env.CARD_PRICE ?? 100),
      prizeLine: opts?.prizeLine ?? Number(process.env.PRIZE_LINE ?? 100),
      prizeCorners: opts?.prizeCorners ?? Number(process.env.PRIZE_CORNERS ?? 80),
      prizeBingo: opts?.prizeBingo ?? Number(process.env.PRIZE_BINGO ?? 300),
      intervalSec: opts?.intervalSec ?? Number(process.env.DRAW_INTERVAL_SEC ?? 5),
      currency: opts?.currency ?? process.env.DEFAULT_CURRENCY ?? "ARS",
    },
  });
  // Host se une como participante
  await db.roomParticipant.create({
    data: { roomId: room.id, userId: hostUserId },
  });
  return { room, token };
}

// ─────────────────────────────────────────────────────────────────────────────
//  JOIN ROOM — jugador autenticado se une por token (idempotente)
// ─────────────────────────────────────────────────────────────────────────────
export async function joinRoom(
  userId: string,
  token: string,
): Promise<Room> {
  const room = await db.room.findUnique({ where: { token: token.toUpperCase() } });
  if (!room) throw notFound("Sala no encontrada");
  // Idempotente: si ya es participante, no duplica (unique constraint)
  await db.roomParticipant
    .create({ data: { roomId: room.id, userId } })
    .catch(() => {
      /* ya existe -> ok */
    });
  return room;
}

// ─────────────────────────────────────────────────────────────────────────────
//  START ROOM — genera ballSequence + startedAt (motor determinístico ON)
// ─────────────────────────────────────────────────────────────────────────────
export async function startRoom(hostUserId: string, roomId: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede iniciar");
  if (room.status !== "WAITING") throw badRequest("La sala ya fue iniciada");

  const ballSequence = generateBallSequence();
  return db.room.update({
    where: { id: roomId },
    data: {
      status: "RUNNING",
      ballSequence,
      startedAt: new Date(),
      pausedAt: null,
      pausedElapsedMs: 0,
      endedAt: null,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESUME ROOM — descongela el reloj tras una pausa por Línea
// ─────────────────────────────────────────────────────────────────────────────
export async function resumeRoom(hostUserId: string, roomId: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede reanudar");
  if (room.status === "ENDED") throw badRequest("La partida ya terminó");
  if (!room.pausedAt) return room; // ya está corriendo

  const now = getServerTime();
  const addedPause = now - room.pausedAt.getTime();
  return db.room.update({
    where: { id: roomId },
    data: {
      pausedAt: null,
      pausedElapsedMs: room.pausedElapsedMs + addedPause,
      status: "RUNNING",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESET ROOM — limpia para una nueva ronda (preserva participantes)
// ─────────────────────────────────────────────────────────────────────────────
export async function resetRoom(hostUserId: string, roomId: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede reiniciar");

  await db.$transaction([
    db.claim.deleteMany({ where: { roomId } }),
    db.draw.deleteMany({ where: { roomId } }),
    db.ticket.deleteMany({ where: { roomId } }),
    db.purchase.deleteMany({ where: { roomId } }),
  ]);
  return db.room.update({
    where: { id: roomId },
    data: {
      status: "WAITING",
      ballSequence: null,
      startedAt: null,
      pausedAt: null,
      pausedElapsedMs: 0,
      endedAt: null,
      currentRound: room.currentRound + 1,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUY CARDS — transacción atómica: débito + purchase + N tickets
// ─────────────────────────────────────────────────────────────────────────────
export async function buyCards(
  userId: string,
  roomId: string,
  quantity: number,
): Promise<{ balance: number; tickets: Ticket[] }> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw badRequest("La cantidad debe ser entre 1 y 50");
  }
  return db.$transaction(async (tx) => {
    // Bloqueo de fila: serializa transacciones que tocan esta sala y este user.
    await tx.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });
    await tx.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });

    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw notFound("Sala no encontrada");
    if (room.status !== "WAITING")
      throw badRequest("La compra solo está permitida antes de iniciar");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");

    const unitPrice = room.cardPrice;
    const total = unitPrice * quantity;
    if (user.balance < total) throw badRequest("Fondos insuficientes");

    // Débito atómico + ledger
    const newBalance = await adjustBalance(tx, {
      userId,
      amount: -total,
      type: "PURCHASE",
      roomId,
      referenceType: "Purchase",
      description: `Compra de ${quantity} cartón(es) x ${unitPrice}`,
    });

    const purchase = await tx.purchase.create({
      data: {
        roomId,
        userId,
        quantity,
        unitPrice,
        totalCost: total,
        round: room.currentRound,
      },
    });

    const tickets: Ticket[] = [];
    for (let i = 0; i < quantity; i++) {
      const grid = generateBingo75Card();
      const ticket = await tx.ticket.create({
        data: {
          roomId,
          userId,
          purchaseId: purchase.id,
          grid,
          status: "ACTIVE",
        },
      });
      tickets.push(ticket);
    }
    return { balance: newBalance, tickets };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLAIM — validación + acreditación + división entre co-ganadores
// ─────────────────────────────────────────────────────────────────────────────
export async function claim(
  userId: string,
  roomId: string,
  ticketId: string,
  type: ClaimType,
): Promise<{
  valid: boolean;
  prizeAwarded: number;
  winnersCount: number;
  drawIndex: number;
  reason: string | null;
}> {
  return db.$transaction(async (tx) => {
    // Bloqueo de fila room + user => serializa reclamos concurrentes.
    await tx.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });
    await tx.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });

    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw notFound("Sala no encontrada");
    if (room.status === "WAITING") throw badRequest("El sorteo no ha iniciado");
    if (room.status === "ENDED") throw badRequest("La partida ya terminó");

    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.roomId !== roomId || ticket.userId !== userId) {
      throw forbidden("Cartón inválido");
    }
    if (ticket.status !== "ACTIVE") {
      throw badRequest("El cartón ya fue premiado o cancelado");
    }

    // Estado determinístico
    const seq = parseBallSequence(room.ballSequence);
    if (seq.length === 0) throw badRequest("El sorteo no tiene secuencia");
    const now = getServerTime();
    const revealedCount = computeRevealedCount(room, now);
    const drawn = seq.slice(0, revealedCount);
    const drawnSet = new Set(drawn);
    await ensureDrawsPersisted(tx, roomId, seq, revealedCount);

    const grid = normalizeGrid(ticket.grid);
    const patternValid = validatePattern(grid, drawnSet, type);

    // Co-ganadores: claims válidos previos del mismo tipo
    const existing = await tx.claim.findMany({
      where: { roomId, type, valid: true },
      orderBy: { drawIndex: "asc" },
    });
    const firstIdx = existing.length ? existing[0].drawIndex : null;
    const drawIndex = revealedCount;

    // Válido si el patrón se completa Y (es el primero O está en el mismo
    // drawIndex que el primer ganador => co-ganador).
    const valid =
      patternValid && (firstIdx === null || drawIndex === firstIdx);

    let reason: string | null = null;
    if (!valid && !patternValid) reason = "Patrón no completado con las bolillas cantadas";
    if (!valid && patternValid && firstIdx !== null && drawIndex > firstIdx) {
      reason = "Reclamo tardío: otro jugador ganó este premio antes";
    }

    const claimRow = await tx.claim.create({
      data: {
        roomId,
        userId,
        ticketId,
        type,
        valid,
        drawIndex,
        prizeAwarded: 0,
        reason,
      },
    });

    if (!valid) {
      return { valid: false, prizeAwarded: 0, winnersCount: 0, drawIndex, reason };
    }

    // Marcar cartón como ganador
    const ticketStatus =
      type === "LINE"
        ? "WON_LINE"
        : type === "CORNERS"
          ? "WON_CORNERS"
          : "WON_BINGO";
    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: ticketStatus },
    });

    // Cohorte de co-ganadores (mismo tipo, mismo drawIndex ganador)
    const winIdx = firstIdx ?? drawIndex;
    const cohort = await tx.claim.findMany({
      where: { roomId, type, valid: true, drawIndex: winIdx },
    });
    const n = Math.max(1, cohort.length);
    const prizeTotal =
      type === "LINE"
        ? room.prizeLine
        : type === "CORNERS"
          ? room.prizeCorners
          : room.prizeBingo;
    const perHead = Math.floor(prizeTotal / n);

    // Acreditar/ajustar a cada co-ganador (delta respecto a lo ya acreditado)
    for (const cw of cohort) {
      const delta = perHead - cw.prizeAwarded;
      if (delta !== 0) {
        await adjustBalance(tx, {
          userId: cw.userId,
          amount: delta,
          type: "PRIZE",
          roomId,
          referenceType: "Claim",
          referenceId: cw.id,
          description: `Premio ${type} (${cohort.indexOf(cw) + 1} de ${n})`,
        });
        await tx.claim.update({
          where: { id: cw.id },
          data: { prizeAwarded: perHead },
        });
      }
    }

    // Pausa (Línea) o fin (Bingo) en el primer ganador
    if (firstIdx === null) {
      if (type === "LINE") {
        await tx.room.update({
          where: { id: roomId },
          data: { pausedAt: new Date(now), status: "PAUSED" },
        });
      } else if (type === "BINGO") {
        await tx.room.update({
          where: { id: roomId },
          data: { endedAt: new Date(now), status: "ENDED" },
        });
      }
    }

    return {
      valid: true,
      prizeAwarded: perHead,
      winnersCount: n,
      drawIndex,
      reason: null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEDULE / CANCEL — programa auto-inicio (lo dispara un cron externo)
// ─────────────────────────────────────────────────────────────────────────────
export async function scheduleRoom(
  hostUserId: string,
  roomId: string,
  startAtISO: string,
): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede programar");
  const when = new Date(startAtISO);
  if (Number.isNaN(when.getTime())) throw badRequest("Fecha/hora inválida");
  return db.room.update({
    where: { id: roomId },
    data: { scheduledStartAt: when },
  });
}

export async function cancelSchedule(
  hostUserId: string,
  roomId: string,
): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede cancelar");
  return db.room.update({
    where: { id: roomId },
    data: { scheduledStartAt: null },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC STATE — estado canónico consumido por PWA + SSE (con near-miss)
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicState(roomId: string): Promise<PublicRoomState | null> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return null;

  const host = await db.user.findUnique({
    where: { id: room.hostId },
    select: { name: true },
  });

  const seq = parseBallSequence(room.ballSequence);
  const now = getServerTime();
  const revealedCount = computeRevealedCount(room, now);
  const drawn = seq.slice(0, revealedCount);
  const drawnSet = new Set(drawn);

  // Backfill draws de auditoría (best-effort, fuera de transacción)
  if (revealedCount > 0) {
    await ensureDrawsPersisted(db, roomId, seq, revealedCount).catch(() => {
      /* auditoría best-effort */
    });
  }

  const participants = await db.roomParticipant.findMany({
    where: { roomId },
    include: {
      user: { select: { id: true, name: true, balance: true } },
    },
  });

  const tickets = await db.ticket.findMany({
    where: { roomId, status: "ACTIVE" },
    select: { id: true, userId: true, grid: true },
  });

  // near-miss por participante
  const participantMap = new Map<
    string,
    { userId: string; name: string; balance: number; ticketCount: number; nearMiss: boolean }
  >();
  for (const p of participants) {
    participantMap.set(p.userId, {
      userId: p.userId,
      name: p.user.name,
      balance: p.user.balance,
      ticketCount: 0,
      nearMiss: false,
    });
  }
  for (const t of tickets) {
    const entry = participantMap.get(t.userId);
    if (!entry) continue;
    entry.ticketCount += 1;
    const grid = normalizeGrid(t.grid);
    const progress = computeCardProgress(grid, drawnSet);
    if (progress.bestMissing === 1) entry.nearMiss = true;
  }

  const claims = await db.claim.findMany({
    where: { roomId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const nearMissCount = Array.from(participantMap.values()).filter(
    (p) => p.nearMiss,
  ).length;

  return {
    id: room.id,
    token: room.token,
    status: room.status as RoomStatus,
    gameType: room.gameType,
    hostId: room.hostId,
    hostName: host?.name ?? "Anfitrión",
    drawn,
    revealedCount,
    remaining: seq.length - revealedCount,
    serverTime: now,
    startedAt: room.startedAt?.getTime() ?? null,
    pausedAt: room.pausedAt?.getTime() ?? null,
    pausedElapsedMs: room.pausedElapsedMs,
    intervalSec: room.intervalSec,
    currentRound: room.currentRound,
    cardPrice: room.cardPrice,
    prizes: {
      line: room.prizeLine,
      corners: room.prizeCorners,
      bingo: room.prizeBingo,
    },
    currency: room.currency,
    participants: Array.from(participantMap.values()),
    nearMissCount,
    claims: claims.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.user.name,
      ticketId: c.ticketId,
      type: c.type as ClaimType,
      valid: c.valid,
      drawIndex: c.drawIndex,
      prizeAwarded: c.prizeAwarded,
    })),
  };
}

/** Devuelve las salas activas (para lobby en ETAPA 4). */
export async function listActiveRooms(): Promise<
  Array<{ id: string; token: string; status: string; hostName: string; participants: number; currentRound: number }>
> {
  const rooms = await db.room.findMany({
    where: { status: { in: ["WAITING", "RUNNING", "PAUSED"] } },
    include: {
      host: { select: { name: true } },
      _count: { select: { participants: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rooms.map((r) => ({
    id: r.id,
    token: r.token,
    status: r.status,
    hostName: r.host.name,
    participants: r._count.participants,
    currentRound: r.currentRound,
  }));
}
