// =============================================================================
//  TRANSFERENCIAS MANUALES (Internacional) — recarga por transferencia
//
//  Flujo:
//   1. Usuario registra solicitud: monto, método/país, referencia, nota.
//   2. Admin (rol ADMIN) aprueba o rechaza desde el panel.
//   3. Al aprobar: processApprovedPayment(MANUAL_TRANSFER, externalId=`transfer_<id>`)
//      acredita de forma idempotente + vincula la TransferRequest con el
//      PaymentTransaction creado.
//
//  externalId = `transfer_<id>` garantiza unicidad: aprobar dos veces la misma
//  solicitud no duplica el crédito (processApprovedPayment detecta el APPROVED).
// =============================================================================
import { db } from "@/lib/db";
import { HttpError } from "@/lib/game/room-service";
import { processApprovedPayment } from "./recharge";

const notFound = (msg: string) => new HttpError(404, msg);
const badRequest = (msg: string) => new HttpError(400, msg);

export interface TransferInput {
  amount: number;
  paymentMethod: string;
  country?: string;
  referenceNumber: string;
  note?: string;
}

/** Usuario crea una solicitud de recarga por transferencia. */
export async function requestTransfer(userId: string, input: TransferInput) {
  const amount = Math.round(Number(input.amount));
  if (!Number.isInteger(amount) || amount <= 0) {
    throw badRequest("El monto debe ser un entero positivo");
  }
  if (!input.paymentMethod?.trim()) throw badRequest("Método de pago requerido");
  if (!input.referenceNumber?.trim())
    throw badRequest("Número de referencia requerido");

  return db.transferRequest.create({
    data: {
      userId,
      amount,
      paymentMethod: input.paymentMethod.trim(),
      country: input.country?.trim() || null,
      referenceNumber: input.referenceNumber.trim(),
      note: input.note?.trim() || null,
      status: "PENDING",
    },
  });
}

/** Lista las solicitudes de un usuario. */
export async function listUserTransfers(userId: string) {
  return db.transferRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Lista solicitudes pendientes (panel admin). */
export async function listPendingTransfers() {
  return db.transferRequest.findMany({
    where: { status: "PENDING" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Lista todas las solicitudes con filtros opcionales (panel admin). */
export async function listAllTransfers(status?: string) {
  return db.transferRequest.findMany({
    where: status ? { status } : undefined,
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Admin aprueba: acredita atómicamente + vincula PaymentTransaction. */
export async function approveTransfer(adminId: string, transferId: string) {
  return db.$transaction(async (tx) => {
    const transfer = await tx.transferRequest.findUnique({
      where: { id: transferId },
    });
    if (!transfer) throw notFound("Solicitud no encontrada");

    // Idempotencia de alto nivel: si ya fue aprobada, retorna éxito sin
    // re-acreditar (la capa PaymentTransaction unique es el seguro final).
    if (transfer.status === "APPROVED") {
      const user = await tx.user.findUnique({ where: { id: transfer.userId } });
      return {
        transfer,
        credited: false,
        alreadyProcessed: true,
        balance: user?.balance ?? 0,
      };
    }
    if (transfer.status === "REJECTED") {
      throw badRequest("La solicitud fue rechazada y no puede aprobarse");
    }

    const externalId = `transfer_${transfer.id}`;
    // Idempotencia: ¿ya hay un PaymentTransaction aprobado para esta transferencia?
    const existingPayment = await tx.paymentTransaction.findUnique({
      where: { provider_externalId: { provider: "MANUAL_TRANSFER", externalId } },
    });

    if (existingPayment && existingPayment.status === "APPROVED") {
      // Ya acreditada (ej. doble click del admin) — solo actualizamos la transfer.
      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: {
          status: "APPROVED",
          reviewedById: adminId,
          reviewedAt: new Date(),
          paymentTransactionId: existingPayment.id,
        },
      });
      return { transfer: updated, credited: false, alreadyProcessed: true };
    }

    // Bloquea al usuario y acredita.
    await tx.user.update({
      where: { id: transfer.userId },
      data: { updatedAt: new Date() },
    });

    // Crea el PaymentTransaction APPROVED dentro de la misma tx.
    const payment = existingPayment
      ? await tx.paymentTransaction.update({
          where: { id: existingPayment.id },
          data: { status: "APPROVED", amount: transfer.amount, processedAt: new Date() },
        })
      : await tx.paymentTransaction.create({
          data: {
            userId: transfer.userId,
            provider: "MANUAL_TRANSFER",
            externalId,
            amount: transfer.amount,
            status: "APPROVED",
            raw: {
              paymentMethod: transfer.paymentMethod,
              country: transfer.country,
              referenceNumber: transfer.referenceNumber,
              note: transfer.note,
              transferRequestId: transfer.id,
            },
            processedAt: new Date(),
          },
        });

    // Crédito + ledger (reusa el helper transaccional pero inline para misma tx).
    const { adjustBalance } = await import("@/lib/game/ledger");
    const newBalance = await adjustBalance(tx, {
      userId: transfer.userId,
      amount: transfer.amount,
      type: "RECHARGE",
      referenceType: "PaymentTransaction",
      referenceId: payment.id,
      description: `Recarga por transferencia (${transfer.paymentMethod})`,
    });

    const updated = await tx.transferRequest.update({
      where: { id: transferId },
      data: {
        status: "APPROVED",
        reviewedById: adminId,
        reviewedAt: new Date(),
        paymentTransactionId: payment.id,
      },
    });

    return { transfer: updated, credited: true, balance: newBalance };
  });
}

/** Admin rechaza una solicitud. */
export async function rejectTransfer(adminId: string, transferId: string, reason?: string) {
  const transfer = await db.transferRequest.findUnique({
    where: { id: transferId },
  });
  if (!transfer) throw notFound("Solicitud no encontrada");
  if (transfer.status !== "PENDING") {
    throw badRequest(`La solicitud ya fue ${transfer.status.toLowerCase()}`);
  }
  return db.transferRequest.update({
    where: { id: transferId },
    data: {
      status: "REJECTED",
      reviewedById: adminId,
      reviewedAt: new Date(),
      note: reason ? `${transfer.note ?? ""}\n[Rechazo] ${reason}`.trim() : transfer.note,
    },
  });
}
