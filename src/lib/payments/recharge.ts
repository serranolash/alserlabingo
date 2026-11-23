// =============================================================================
//  RECHARGE — Acreditación idempotente compartida por MercadoPago y admin
//
//  processApprovedPayment() es la ÚNICA puerta para acreditar saldo por recarga:
//   1. Bloquea la fila del usuario (serializa recargas concurrentes).
//   2. Busca un PaymentTransaction existente por [provider, externalId].
//      Si ya está APPROVED => retorna "ya procesado" (idempotente, sin doble crédito).
//   3. Crea/actualiza el PaymentTransaction a APPROVED.
//   4. adjustBalance(+amount) + LedgerEntry(RECHARGE) dentro de la misma tx.
//
//  La restricción @@unique([provider, externalId]) del schema garantiza que
//  un mismo pago externo NUNCA se acredite dos veces, incluso si el webhook
//  de MercadoPago se dispara múltiples veces.
// =============================================================================
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { adjustBalance } from "@/lib/game/ledger";
import type { PaymentProvider } from "@/lib/bingo/types";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface ApprovedPaymentInput {
  userId: string;
  amount: number;
  provider: PaymentProvider;
  /** Identificador externo único (MP payment id, o `transfer_<id>` para manuales). */
  externalId: string;
  raw?: unknown;
  description?: string;
}

export interface RechargeResult {
  credited: boolean;
  alreadyProcessed: boolean;
  balance: number;
  paymentTransactionId: string;
}

export async function processApprovedPayment(
  input: ApprovedPaymentInput,
): Promise<RechargeResult> {
  const { userId, amount, provider, externalId, raw, description } = input;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("El monto debe ser un entero positivo");
  }
  if (!externalId) {
    throw new Error("externalId requerido para idempotencia");
  }

  return db.$transaction(async (tx) => {
    // Bloqueo de fila del usuario.
    await tx.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });

    // Idempotencia: ¿ya se acreditó este pago externo?
    const existing = await tx.paymentTransaction.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    if (existing && existing.status === "APPROVED") {
      const user = await tx.user.findUnique({ where: { id: userId } });
      return {
        credited: false,
        alreadyProcessed: true,
        balance: user?.balance ?? 0,
        paymentTransactionId: existing.id,
      };
    }

    // Crea o actualiza el PaymentTransaction a APPROVED.
    const payment = existing
      ? await tx.paymentTransaction.update({
          where: { id: existing.id },
          data: {
            status: "APPROVED",
            amount,
            raw: raw ?? existing.raw,
            processedAt: new Date(),
          },
        })
      : await tx.paymentTransaction.create({
          data: {
            userId,
            provider,
            externalId,
            amount,
            status: "APPROVED",
            raw,
            processedAt: new Date(),
          },
        });

    // Crédito atómico + ledger.
    const newBalance = await adjustBalance(tx, {
      userId,
      amount,
      type: "RECHARGE",
      referenceType: "PaymentTransaction",
      referenceId: payment.id,
      description: description ?? `Recarga ${provider}`,
    });

    return {
      credited: true,
      alreadyProcessed: false,
      balance: newBalance,
      paymentTransactionId: payment.id,
    };
  });
}
