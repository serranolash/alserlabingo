// =============================================================================
//  PAYOUTS — solicitudes de cobro de premio (retiro de ganancias).
//
//  Flujo:
//   1. El jugador gana (auto-detección o claim manual) => se acredita el premio.
//   2. Se abre el Modal de Cobro; el jugador ingresa datos de recepción.
//   3. requestPayout(): crea PrizePayout(PENDING) + debita el monto (reserva)
//      vía LedgerEntry(PAYOUT) para que no se doble-gaste mientras se paga.
//   4. Admin marca PAID con comprobante (markPayoutPaid) — sin cambio de saldo
//      (ya reservado).
// =============================================================================
import { db } from "@/lib/db";
import { HttpError } from "@/lib/game/room-service";
import { adjustBalance } from "@/lib/game/ledger";

const notFound = (msg: string) => new HttpError(404, msg);
const badRequest = (msg: string) => new HttpError(400, msg);

export interface PayoutInput {
  claimId: string;
  country: "AR" | "INTERNACIONAL";
  method: string;
  accountData: Record<string, unknown>;
  notes?: string;
}

/** Crea una solicitud de retiro asociada a un claim válido del usuario. */
export async function requestPayout(userId: string, input: PayoutInput) {
  const claim = await db.claim.findUnique({
    where: { id: input.claimId },
    include: { room: { select: { id: true } } },
  });
  if (!claim) throw notFound("Premio no encontrado");
  if (claim.userId !== userId) throw new HttpError(403, "No es tu premio");
  if (!claim.valid) throw badRequest("El premio no es válido");
  if (claim.prizeAwarded <= 0) throw badRequest("El premio no tiene monto");

  // Idempotencia: ¿ya existe retiro para este claim?
  const existing = await db.prizePayout.findUnique({
    where: { claimId: input.claimId },
  });
  if (existing) {
    throw badRequest(
      existing.status === "PAID"
        ? "Este premio ya fue pagado"
        : "Ya tienes una solicitud de cobro pendiente para este premio",
    );
  }

  return db.$transaction(async (tx) => {
    // Bloquea al usuario (serializa retiros concurrentes).
    await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");
    if (user.balance < claim.prizeAwarded) {
      throw badRequest("Saldo insuficiente para retirar (gastaste el premio)");
    }

    // Reserva el monto (débito).
    const newBalance = await adjustBalance(tx, {
      userId,
      amount: -claim.prizeAwarded,
      type: "PAYOUT",
      roomId: claim.roomId,
      referenceType: "PrizePayout",
      description: `Retiro de premio (${claim.type})`,
    });

    const payout = await tx.prizePayout.create({
      data: {
        userId,
        roomId: claim.roomId,
        claimId: claim.id,
        amount: claim.prizeAwarded,
        status: "PENDING",
        country: input.country,
        method: input.method,
        accountData: input.accountData,
        notes: input.notes ?? null,
      },
    });

    return { payout, newBalance };
  });
}

/** Lista los retiros del usuario. */
export async function listUserPayouts(userId: string) {
  return db.prizePayout.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Lista retiros pendientes (panel admin). */
export async function listPendingPayouts() {
  return db.prizePayout.findMany({
    where: { status: "PENDING" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Lista todos los retiros (panel admin). */
export async function listAllPayouts(status?: string) {
  return db.prizePayout.findMany({
    where: status ? { status } : undefined,
    include: {
      user: { select: { id: true, name: true, email: true } },
      paidBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Admin marca un retiro como pagado (adjunta comprobante/ID de transacción). */
export async function markPayoutPaid(
  adminId: string,
  payoutId: string,
  adminNote: string,
) {
  const payout = await db.prizePayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw notFound("Retiro no encontrado");
  if (payout.status === "PAID") {
    throw badRequest("Este retiro ya fue marcado como pagado");
  }
  return db.prizePayout.update({
    where: { id: payoutId },
    data: {
      status: "PAID",
      adminNote: adminNote || null,
      paidById: adminId,
      paidAt: new Date(),
    },
  });
}
