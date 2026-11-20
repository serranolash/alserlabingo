// =============================================================================
//  BINGO 75 — Contratos compartidos (cliente + servidor)
//  Estos tipos espejan los "enum-like" String del schema Prisma y se usan en
//  TODO el stack: API routes, servicios, componentes PWA y mini-service RT.
//  Un único módulo de validación de patrones los consumirá en Etapa 2.
// =============================================================================

// ── Cartón ────────────────────────────────────────────────────────────────
/** Grilla 5x5. La celda central grid[2][2] === null (centro libre). */
export type Grid = (number | null)[][];

/** Conjunto de bolillas ya reveladas (lookup O(1)). */
export type DrawnSet = Set<number>;

// ── Tipos de premio (Claim.type) ───────────────────────────────────────────
export type ClaimType = "LINE" | "CORNERS" | "BINGO";

// ── Estados de sala (Room.status) ──────────────────────────────────────────
//  WAITING  -> compra de cartones, anfitrión aún no inicia
//  RUNNING  -> reloj determinístico activo (pausedAt = null)
//  PAUSED   -> reloj congelado tras 1ra Línea (pausedAt != null)
//  ENDED    -> partida finalizada (Bingo cantado o bolillas agotadas)
export type RoomStatus = "WAITING" | "RUNNING" | "PAUSED" | "ENDED";

// ── Estados de cartón (Ticket.status) ──────────────────────────────────────
export type TicketStatus =
  | "ACTIVE"
  | "WON_LINE"
  | "WON_CORNERS"
  | "WON_BINGO"
  | "CANCELLED";

// ── Roles de usuario (User.role) ────────────────────────────────────────────
export type UserRole = "PLAYER" | "HOST" | "ADMIN";

// ── Pagos ──────────────────────────────────────────────────────────────────
export type PaymentProvider = "MERCADOPAGO" | "MANUAL_TRANSFER";
export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "FAILED";
export type TransferStatus = "PENDING" | "APPROVED" | "REJECTED";

// ── Ledger (auditoría de balance) ──────────────────────────────────────────
export type LedgerType =
  | "PURCHASE"
  | "PRIZE"
  | "RECHARGE"
  | "REFUND"
  | "ADMIN_ADJUST";

// ── Detector "a 1 bolilla" (near-miss) ─────────────────────────────────────
/** Qué tipo de victoria está a 1 número de completarse. */
export type NearMissKind = "LINE" | "CORNERS" | "BINGO";

/** Resultado del análisis de cercanía para un cartón. */
export interface NearMissResult {
  kind: NearMissKind;
  /** Cuántas bolillas faltan para completar el patrón (1 = near-miss). */
  missing: number;
  /** Índices [row,col] de las celdas que faltan marcar. */
  missingCells: Array<[number, number]>;
}

// ── Estado público de sala (consumido por PWA + SSE) ───────────────────────
export interface PublicRoomState {
  id: string;
  token: string;
  status: RoomStatus;
  gameType: string;
  hostId: string;
  hostName: string;
  /** Bolillas reveladas hasta ahora (calculadas, no persistidas en RAM). */
  drawn: number[];
  /** Índice de revelado actual (drawn.length). */
  revealedCount: number;
  /** Cuántas bolillas restan en el permuto. */
  remaining: number;
  /** Timestamp server para sincronizar el reloj del cliente. */
  serverTime: number;
  startedAt: number | null;
  pausedAt: number | null;
  pausedElapsedMs: number;
  intervalSec: number;
  currentRound: number;
  cardPrice: number;
  prizes: { line: number; corners: number; bingo: number };
  currency: string;
  participants: Array<{
    userId: string;
    name: string;
    balance: number;
    ticketCount: number;
    nearMiss: boolean;
  }>;
  /** Conteo de participantes a 1 bolilla de ganar (termómetro de tensión). */
  nearMissCount: number;
  claims: Array<{
    id: string;
    userId: string;
    userName: string;
    ticketId: string | null;
    type: ClaimType;
    valid: boolean;
    drawIndex: number;
    prizeAwarded: number;
  }>;
}
