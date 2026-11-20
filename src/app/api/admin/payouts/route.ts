// GET /api/admin/payouts — lista retiros de ganadores (filtro ?status=PENDING)
import { listAllPayouts, listPendingPayouts } from "@/lib/payments/payouts";
import { requireAdmin } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async (request: Request) => {
  const admin = await requireAdmin();
  if (!admin) return json({ error: "Acceso denegado (solo ADMIN)" }, 403);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const payouts = status === "PENDING" ? await listPendingPayouts() : await listAllPayouts(status);
  return json({ payouts });
});
