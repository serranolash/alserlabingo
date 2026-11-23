// GET /api/wallet — saldo + historial ledger reciente del usuario
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);

  const [ledger, stats] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.ledgerEntry.aggregate({
      where: { userId: user.id },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return json({
    balance: user.balance,
    ledger,
    totalMovements: stats._count,
  });
});
