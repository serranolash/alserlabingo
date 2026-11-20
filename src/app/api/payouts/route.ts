// POST /api/payouts — solicitar cobro de premio (retiro de ganancias)
// GET  /api/payouts — listar retiros del usuario
import { requestPayout, listUserPayouts } from "@/lib/payments/payouts";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{
    claimId?: string;
    country?: string;
    method?: string;
    accountData?: Record<string, unknown>;
    notes?: string;
  }>(request);

  if (!body.claimId) return json({ error: "claimId requerido" }, 400);
  if (body.country !== "AR" && body.country !== "INTERNACIONAL") {
    return json({ error: "country debe ser AR o INTERNACIONAL" }, 400);
  }
  if (!body.method) return json({ error: "method requerido" }, 400);
  if (!body.accountData || typeof body.accountData !== "object") {
    return json({ error: "accountData requerido" }, 400);
  }

  const { payout, newBalance } = await requestPayout(user.id, {
    claimId: body.claimId,
    country: body.country,
    method: body.method,
    accountData: body.accountData,
    notes: body.notes,
  });
  return json({ payout, balance: newBalance }, 201);
});

export const GET = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const payouts = await listUserPayouts(user.id);
  return json({ payouts });
});
