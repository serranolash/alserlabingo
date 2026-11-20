// =============================================================================
//  LEDGER — Mutaciones atómicas de balance con auditoría append-only
//
//  Toda variación de saldo pasa por adjustBalance(), que dentro de una
//  transacción Prisma: (1) incrementa/decrementa User.balance y (2) crea un
//  LedgerEntry con el snapshot post-movimiento. Resuelve el bug crítico del
//  repo original donde los premios se broadcasteaban pero NUNCA se acreditaban.
//
//  Reutilizado por: buyCards (débito), claim (crédito premio), payments
//  (crédito recarga) y admin (ajustes).
// =============================================================================
import type { PrismaClient } from "@prisma/client";
import type { LedgerType } from "@/lib/bingo/types";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

interface AdjustParams {
  userId: string;
  /** Delta con signo: positivo=crédito, negativo=débito. */
  amount: number;
  type: LedgerType;
  roomId?: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

/**
 * Ajusta el saldo del usuario dentro de una transacción y registra el ledger.
 * Devuelve el nuevo balance. Lanza si el usuario no existe o (en débito) no
 * tiene saldo suficiente.
 */
export async function adjustBalance(
  tx: Tx,
  params: AdjustParams,
): Promise<number> {
  const { userId, amount, type, roomId, referenceType, referenceId, description } =
    params;
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error("El monto debe ser un entero distinto de cero");
  }

  // Bloqueo optimista: leemos el saldo actual dentro de la tx.
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuario no encontrado");

  const newBalance = user.balance + amount;
  if (newBalance < 0) {
    throw new Error("Saldo insuficiente");
  }

  const updated = await tx.user.update({
    where: { id: userId },
    data: { balance: { increment: amount } },
  });

  await tx.ledgerEntry.create({
    data: {
      userId,
      type,
      amount,
      balanceAfter: updated.balance,
      roomId: roomId ?? null,
      referenceType: referenceType ?? null,
      referenceId: referenceId ?? null,
      description: description ?? null,
    },
  });

  return updated.balance;
}
