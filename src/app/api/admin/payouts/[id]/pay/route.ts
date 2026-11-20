// POST /api/admin/payouts/[id]/pay — marcar retiro como pagado (con comprobante)
import { markPayoutPaid } from "@/lib/payments/payouts";
import { requireAdmin } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    if (!admin) return json({ error: "Acceso denegado (solo ADMIN)" }, 403);
    const { id } = await params;
    const body = await readBody<{ adminNote?: string }>(request);
    if (!body.adminNote?.trim()) {
      return json({ error: "Comprobante / ID de transacción requerido" }, 400);
    }
    const payout = await markPayoutPaid(admin.id, id, body.adminNote.trim());
    return json({ payout });
  },
);
