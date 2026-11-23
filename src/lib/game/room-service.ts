// =============================================================================
//  ROOM SERVICE — Lógica de negocio transaccional de Alserla Bingo
//
//  Mejoras críticas:
//   - AUTO-DETECCIÓN de premios: evaluateRoomWins() revisa todos los cartones
//     cada vez que se revela una bolilla. Pausa auto en 1ra Línea, fin auto en
//     Bingo. No depende del botón del jugador.
//   - MULTIGANANCIA: un cartón puede ganar Línea + Esquinas + Bingo. Las
//     victorias de Línea/Esquinas NO cambian el status del cartón (sigue
//     ACTIVE). Solo Bingo (cartón lleno) lo terminaliza (WON_BINGO).
//   - Co-ganadores: mismo drawIndex => premio dividido con ajuste retroactivo.
//   - Visibilidad: salas públicas (lobby) vs privadas (solo vía inviteToken).
//   - Economía USD (centavos): mínimo $1.00 por cartón.
// =============================================================================
import type { PrismaClient, Room, Ticket } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type ClaimType,
  type PublicRoomState,
  type RoomStatus,
} from "@/lib/bingo/types";
import { generateBallSequence, generateBingo75Card, normalizeGrid } from "@/lib/bingo/engine";
import {
  computeCardProgress,
  hasBingo,
  hasFourCorners,
  hasLine,
} from "@/lib/bingo/patterns";
import { MIN_CARD_PRICE_CENTS } from "@/lib/format";
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
//  CREATE ROOM — solo ADMIN. isPublic + premios configurables (mín $1.00 cartón)
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
    isPublic?: boolean;
  },
): Promise<{ room: Room; token: string }> {
  const cardPrice = opts?.cardPrice ?? Number(process.env.CARD_PRICE ?? 100);
  if (!Number.isInteger(cardPrice) || cardPrice < MIN_CARD_PRICE_CENTS) {
    throw badRequest(`El precio por cartón mínimo es $1.00 USD (${MIN_CARD_PRICE_CENTS} centavos)`);
  }

  const token = await generateRoomToken();
  const room = await db.room.create({
    data: {
      token,
      status: "WAITING",
      gameType: "75",
      hostId: hostUserId,
      isPublic: opts?.isPublic ?? true,
      cardPrice,
      prizeLine: opts?.prizeLine ?? Number(process.env.PRIZE_LINE ?? 500),
      prizeCorners: opts?.prizeCorners ?? Number(process.env.PRIZE_CORNERS ?? 400),
      prizeBingo: opts?.prizeBingo ?? Number(process.env.PRIZE_BINGO ?? 2000),
      intervalSec: opts?.intervalSec ?? Number(process.env.DRAW_INTERVAL_SEC ?? 5),
      currency: "USD",
    },
  });
  await db.roomParticipant.create({
    data: { roomId: room.id, userId: hostUserId },
  });
  return { room, token };
}

// ─────────────────────────────────────────────────────────────────────────────
//  JOIN ROOM — por código corto (públicas) o por inviteToken (privadas)
// ─────────────────────────────────────────────────────────────────────────────
export async function joinRoom(userId: string, roomId: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  await db.roomParticipant
    .create({ data: { roomId: room.id, userId } })
    .catch(() => {
      /* ya existe -> ok */
    });
  return room;
}

export async function joinRoomByInviteToken(userId: string, inviteToken: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { inviteToken } });
  if (!room) throw notFound("Enlace de invitación inválido");
  await db.roomParticipant
    .create({ data: { roomId: room.id, userId } })
    .catch(() => {
      /* ya existe -> ok */
    });
  return room;
}

export async function getRoomByInviteToken(inviteToken: string): Promise<Room | null> {
  return db.room.findUnique({ where: { inviteToken } });
}

// ─────────────────────────────────────────────────────────────────────────────
//  START / RESUME / RESET / SCHEDULE — controles del host (admin)
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
      lastEvalDrawIndex: 0,
    },
  });
}

export async function resumeRoom(hostUserId: string, roomId: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede reanudar");
  if (room.status === "ENDED") throw badRequest("La partida ya terminó");
  if (!room.pausedAt) return room;

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

/** Pausa manual del host (congela el reloj determinístico hasta reanudar). */
export async function pauseRoom(hostUserId: string, roomId: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede pausar");
  if (room.status !== "RUNNING") throw badRequest("La sala no está corriendo");
  if (room.pausedAt) return room;
  return db.room.update({
    where: { id: roomId },
    data: { pausedAt: new Date(), status: "PAUSED" },
  });
}

export async function resetRoom(hostUserId: string, roomId: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede reiniciar");

  await db.$transaction([
    db.prizePayout.deleteMany({ where: { roomId } }),
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
      lastEvalDrawIndex: 0,
      currentRound: room.currentRound + 1,
    },
  });
}

/**
 * ELIMINAR sala — borra la sala y todos sus datos relacionados (claims, draws,
 * tickets, purchases, payouts, participants). Solo el host o admin pueden hacerlo.
 * Útil para limpiar salas terminadas (ENDED) o salas creadas por error.
 */
export async function deleteRoom(userId: string, roomId: string, isAdmin: boolean): Promise<{ ok: true }> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (!isAdmin && room.hostId !== userId) throw forbidden("Solo el anfitrión o admin puede eliminar la sala");

  // Eliminar todo en orden (cascada manual para asegurar limpieza completa)
  await db.$transaction([
    db.prizePayout.deleteMany({ where: { roomId } }),
    db.claim.deleteMany({ where: { roomId } }),
    db.draw.deleteMany({ where: { roomId } }),
    db.ticket.deleteMany({ where: { roomId } }),
    db.purchase.deleteMany({ where: { roomId } }),
    db.roomParticipant.deleteMany({ where: { roomId } }),
    db.room.delete({ where: { id: roomId } }),
  ]);
  return { ok: true };
}

export async function scheduleRoom(hostUserId: string, roomId: string, startAtISO: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede programar");
  const when = new Date(startAtISO);
  if (Number.isNaN(when.getTime())) throw badRequest("Fecha/hora inválida");
  return db.room.update({ where: { id: roomId }, data: { scheduledStartAt: when } });
}

export async function cancelSchedule(hostUserId: string, roomId: string): Promise<Room> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw notFound("Sala no encontrada");
  if (room.hostId !== hostUserId) throw forbidden("Solo el anfitrión puede cancelar");
  return db.room.update({ where: { id: roomId }, data: { scheduledStartAt: null } });
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
    await tx.room.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
    await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });

    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw notFound("Sala no encontrada");
    if (room.status !== "WAITING")
      throw badRequest("La compra solo está permitida antes de iniciar");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");

    const unitPrice = room.cardPrice;
    const total = unitPrice * quantity;
    if (user.balance < total) throw badRequest("Fondos insuficientes");

    const newBalance = await adjustBalance(tx, {
      userId,
      amount: -total,
      type: "PURCHASE",
      roomId,
      referenceType: "Purchase",
      description: `Compra de ${quantity} cartón(es)`,
    });

    const purchase = await tx.purchase.create({
      data: { roomId, userId, quantity, unitPrice, totalCost: total, round: room.currentRound },
    });

    const tickets: Ticket[] = [];
    for (let i = 0; i < quantity; i++) {
      const grid = generateBingo75Card();
      const ticket = await tx.ticket.create({
        data: { roomId, userId, purchaseId: purchase.id, grid, status: "ACTIVE" },
      });
      tickets.push(ticket);
    }
    return { balance: newBalance, tickets };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  CREDIT WIN — núcleo compartido por auto-detección y claim manual.
//  Registra una victoria VÁLIDA si el ticket no la tenía y no es tardía.
//  Multiganancia: Línea/Esquinas NO cambian status; Bingo => WON_BINGO.
// ─────────────────────────────────────────────────────────────────────────────
interface CreditWinResult {
  registered: boolean;
  reason?: string;
  claimId?: string;
  prizeAwarded?: number;
  winnersCount?: number;
  firstInRoom?: boolean;
}

async function creditWin(
  tx: Tx,
  room: Room,
  ticket: Ticket,
  type: ClaimType,
  drawIndex: number,
  drawnSet: Set<number>,
): Promise<CreditWinResult> {
  // ¿Este ticket ya ganó este tipo? (multiganancia: cada tipo independiente)
  const existingForTicket = await tx.claim.findFirst({
    where: { ticketId: ticket.id, type, valid: true },
  });
  if (existingForTicket) return { registered: false, reason: "already_won" };

  // ¿Ya hay un ganador de este tipo en la sala? (firstIdx)
  const existing = await tx.claim.findMany({
    where: { roomId: room.id, type, valid: true },
    orderBy: { drawIndex: "asc" },
  });
  const firstIdx = existing.length ? existing[0].drawIndex : null;

  // Reclamo tardío: el premio ya se ganó en un drawIndex anterior.
  if (firstIdx !== null && drawIndex > firstIdx) {
    return { registered: false, reason: "late" };
  }

  // Crear claim válido
  const claimRow = await tx.claim.create({
    data: {
      roomId: room.id,
      userId: ticket.userId,
      ticketId: ticket.id,
      type,
      valid: true,
      drawIndex,
      prizeAwarded: 0,
    },
  });

  // Bingo => terminaliza el cartón
  if (type === "BINGO") {
    await tx.ticket.update({ where: { id: ticket.id }, data: { status: "WON_BINGO" } });
  }

  // Cohorte de co-ganadores (mismo tipo, mismo drawIndex ganador)
  const winIdx = firstIdx ?? drawIndex;
  const cohort = await tx.claim.findMany({
    where: { roomId: room.id, type, valid: true, drawIndex: winIdx },
  });
  const n = Math.max(1, cohort.length);
  const prizeTotal =
    type === "LINE" ? room.prizeLine : type === "CORNERS" ? room.prizeCorners : room.prizeBingo;
  const perHead = Math.floor(prizeTotal / n);

  // Acreditar/ajustar a cada co-ganador (delta respecto a lo ya acreditado)
  let idx = 0;
  for (const cw of cohort) {
    const delta = perHead - cw.prizeAwarded;
    if (delta !== 0) {
      await adjustBalance(tx, {
        userId: cw.userId,
        amount: delta,
        type: "PRIZE",
        roomId: room.id,
        referenceType: "Claim",
        referenceId: cw.id,
        description: `Premio ${type} (${idx + 1} de ${n})`,
      });
      await tx.claim.update({ where: { id: cw.id }, data: { prizeAwarded: perHead } });
    }
    idx++;
  }

  return {
    registered: true,
    claimId: claimRow.id,
    prizeAwarded: perHead,
    winnersCount: n,
    firstInRoom: firstIdx === null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  EVALUATE ROOM WINS — auto-detección de premios al revelar bolillas.
//  Pausa auto en 1ra Línea, fin auto en Bingo. Idempotente (lastEvalDrawIndex).
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateRoomWins(roomId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.room.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room || room.status === "WAITING" || room.status === "ENDED") return;

    const seq = parseBallSequence(room.ballSequence);
    if (seq.length === 0) return;
    const now = getServerTime();
    const revealedCount = computeRevealedCount(room, now);
    if (revealedCount <= room.lastEvalDrawIndex) return; // sin bolillas nuevas

    const drawn = seq.slice(0, revealedCount);
    const drawnSet = new Set(drawn);
    await ensureDrawsPersisted(tx, roomId, seq, revealedCount);

    // Cartones activos (ACTIVE = en juego, incluye los que ya ganaron Línea/Esquinas)
    const tickets = await tx.ticket.findMany({
      where: { roomId, status: "ACTIVE" },
    });

    let lineTriggeredPause = false;
    let cornersTriggeredPause = false;
    let bingoTriggeredEnd = false;

    for (const ticket of tickets) {
      const grid = normalizeGrid(ticket.grid);

      // Línea
      if (hasLine(grid, drawnSet)) {
        const r = await creditWin(tx, room, ticket, "LINE", revealedCount, drawnSet);
        if (r.registered && r.firstInRoom) lineTriggeredPause = true;
      }
      // Esquinas
      if (hasFourCorners(grid, drawnSet)) {
        const r = await creditWin(tx, room, ticket, "CORNERS", revealedCount, drawnSet);
        if (r.registered && r.firstInRoom) cornersTriggeredPause = true;
      }
      // Bingo
      if (hasBingo(grid, drawnSet)) {
        const r = await creditWin(tx, room, ticket, "BINGO", revealedCount, drawnSet);
        if (r.registered && r.firstInRoom) bingoTriggeredEnd = true;
      }
    }

    // Pausa automática por 1ra Línea o 1ras Esquinas (si la sala estaba corriendo)
    if ((lineTriggeredPause || cornersTriggeredPause) && room.status === "RUNNING") {
      await tx.room.update({
        where: { id: roomId },
        data: { pausedAt: new Date(now), status: "PAUSED" },
      });
    }
    // Fin automático por 1er Bingo
    if (bingoTriggeredEnd) {
      await tx.room.update({
        where: { id: roomId },
        data: { endedAt: new Date(now), status: "ENDED" },
      });
    }

    await tx.room.update({ where: { id: roomId }, data: { lastEvalDrawIndex: revealedCount } });
  }).catch(() => {
    /* la auto-detección es best-effort; no debe romper el /state */
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLAIM (manual) — fallback del jugador. Usa creditWin. Permite multiganancia.
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
  claimId?: string;
}> {
  return db.$transaction(async (tx) => {
    await tx.room.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
    await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });

    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw notFound("Sala no encontrada");
    if (room.status === "WAITING") throw badRequest("El sorteo no ha iniciado");
    if (room.status === "ENDED") throw badRequest("La partida ya terminó");

    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.roomId !== roomId || ticket.userId !== userId) {
      throw forbidden("Cartón inválido");
    }
    // Multiganancia: solo bloquea cartones terminales (Bingo ganado) o cancelados.
    if (ticket.status === "WON_BINGO") throw badRequest("Este cartón ya completó Bingo");
    if (ticket.status === "CANCELLED") throw badRequest("El cartón está cancelado");

    const seq = parseBallSequence(room.ballSequence);
    if (seq.length === 0) throw badRequest("El sorteo no tiene secuencia");
    const now = getServerTime();
    const revealedCount = computeRevealedCount(room, now);
    const drawn = seq.slice(0, revealedCount);
    const drawnSet = new Set(drawn);
    await ensureDrawsPersisted(tx, roomId, seq, revealedCount);

    const grid = normalizeGrid(ticket.grid);
    const patternValid =
      type === "LINE"
        ? hasLine(grid, drawnSet)
        : type === "CORNERS"
          ? hasFourCorners(grid, drawnSet)
          : hasBingo(grid, drawnSet);

    const drawIndex = revealedCount;

    if (!patternValid) {
      // Registrar claim inválido para auditoría
      await tx.claim.create({
        data: {
          roomId,
          userId,
          ticketId,
          type,
          valid: false,
          drawIndex,
          reason: "Patrón no completado con las bolillas cantadas",
        },
      });
      return { valid: false, prizeAwarded: 0, winnersCount: 0, drawIndex, reason: "Patrón no completado con las bolillas cantadas" };
    }

    const result = await creditWin(tx, room, ticket, type, drawIndex, drawnSet);

    if (!result.registered) {
      const reason =
        result.reason === "already_won"
          ? "Este cartón ya ganó este premio"
          : "Reclamo tardío: otro jugador ganó este premio antes";
      await tx.claim.create({
        data: { roomId, userId, ticketId, type, valid: false, drawIndex, reason },
      });
      return { valid: false, prizeAwarded: 0, winnersCount: 0, drawIndex, reason };
    }

    // Pausa (Línea o Esquinas) o fin (Bingo) en el primer ganador del tipo
    if (result.firstInRoom) {
      if ((type === "LINE" || type === "CORNERS") && room.status === "RUNNING") {
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
      prizeAwarded: result.prizeAwarded ?? 0,
      winnersCount: result.winnersCount ?? 1,
      drawIndex,
      reason: null,
      claimId: result.claimId,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC STATE — estado canónico consumido por PWA + SSE (con near-miss)
//  Ejecuta evaluateRoomWins antes de leer para auto-detectar premios.
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicState(roomId: string): Promise<PublicRoomState | null> {
  // Auto-detección best-effort antes de leer el estado.
  await evaluateRoomWins(roomId);

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

  if (revealedCount > 0) {
    await ensureDrawsPersisted(db, roomId, seq, revealedCount).catch(() => {});
  }

  const participants = await db.roomParticipant.findMany({
    where: { roomId },
    include: { user: { select: { id: true, name: true, balance: true } } },
  });

  const tickets = await db.ticket.findMany({
    where: { roomId, status: "ACTIVE" },
    select: { id: true, userId: true, grid: true },
  });

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

  const nearMissCount = Array.from(participantMap.values()).filter((p) => p.nearMiss).length;

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
    prizes: { line: room.prizeLine, corners: room.prizeCorners, bingo: room.prizeBingo },
    currency: room.currency,
    isPublic: room.isPublic,
    inviteToken: room.inviteToken,
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

/** Salas públicas activas para el lobby (saldo > 0 requerido en el frontend). */
export async function listActiveRooms(): Promise<
  Array<{
    id: string;
    token: string;
    status: string;
    hostName: string;
    participants: number;
    currentRound: number;
    cardPrice: number;
    isPublic: boolean;
  }>
> {
  const rooms = await db.room.findMany({
    where: { status: { in: ["WAITING", "RUNNING", "PAUSED"] }, isPublic: true },
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
    cardPrice: r.cardPrice,
    isPublic: r.isPublic,
  }));
}

/** "Mis Salas en Curso": salas donde el usuario es host o participante, activas. */
export async function listMyRooms(userId: string): Promise<
  Array<{
    id: string;
    token: string;
    status: string;
    hostName: string;
    isHost: boolean;
    isPublic: boolean;
    participants: number;
    currentRound: number;
    cardPrice: number;
  }>
> {
  // Salas donde es host
  const hosted = await db.room.findMany({
    where: { hostId: userId, status: { in: ["WAITING", "RUNNING", "PAUSED"] } },
    include: { _count: { select: { participants: true } } },
  });
  // Salas donde es participante (con el host)
  const participating = await db.roomParticipant.findMany({
    where: { userId },
    include: {
      room: {
        include: {
          host: { select: { name: true } },
          _count: { select: { participants: true } },
        },
      },
    },
  });
  const seen = new Set<string>();
  const result: Array<{
    id: string;
    token: string;
    status: string;
    hostName: string;
    isHost: boolean;
    isPublic: boolean;
    participants: number;
    currentRound: number;
    cardPrice: number;
  }> = [];
  for (const r of hosted) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    result.push({
      id: r.id,
      token: r.token,
      status: r.status,
      hostName: "Tú",
      isHost: true,
      isPublic: r.isPublic,
      participants: r._count.participants,
      currentRound: r.currentRound,
      cardPrice: r.cardPrice,
    });
  }
  for (const p of participating) {
    const r = p.room;
    if (seen.has(r.id)) continue;
    if (r.status === "ENDED") continue;
    seen.add(r.id);
    result.push({
      id: r.id,
      token: r.token,
      status: r.status,
      hostName: r.host.name,
      isHost: r.hostId === userId,
      isPublic: r.isPublic,
      participants: r._count.participants,
      currentRound: r.currentRound,
      cardPrice: r.cardPrice,
    });
  }
  return result;
}