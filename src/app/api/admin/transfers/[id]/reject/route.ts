// POST /api/admin/transfers/[id]/reject — rechazar solicitud
import { rejectTransfer } from "@/lib/payments/transfers";
import { requireAdmin } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    if (!admin) return json({ error: "Acceso denegado (solo ADMIN)" }, 403);
    const { id } = await params;
    const body = await readBody<{ reason?: string }>(request);
    const transfer = await rejectTransfer(admin.id, id, body.reason);
    return json({ transfer });
  },
);
