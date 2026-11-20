// GET /api/admin/transfers — lista solicitudes (filtro ?status=PENDING opcional)
import { listAllTransfers, listPendingTransfers } from "@/lib/payments/transfers";
import { requireAdmin } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async (request: Request) => {
  const admin = await requireAdmin();
  if (!admin) return json({ error: "Acceso denegado (solo ADMIN)" }, 403);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const transfers =
    status === "PENDING" ? await listPendingTransfers() : await listAllTransfers(status);
  return json({ transfers });
});
