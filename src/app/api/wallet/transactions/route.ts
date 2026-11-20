// GET /api/wallet/transactions — historial de recargas (pagos + transferencias)
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);

  const [payments, transfers] = await Promise.all([
    db.paymentTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        provider: true,
        externalId: true,
        amount: true,
        status: true,
        processedAt: true,
        createdAt: true,
      },
    }),
    db.transferRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return json({ payments, transfers });
});
