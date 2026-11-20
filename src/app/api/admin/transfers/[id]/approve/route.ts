// POST /api/admin/transfers/[id]/approve — acreditar recarga por transferencia
import { approveTransfer } from "@/lib/payments/transfers";
import { requireAdmin } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    if (!admin) return json({ error: "Acceso denegado (solo ADMIN)" }, 403);
    const { id } = await params;
    const result = await approveTransfer(admin.id, id);
    return json({
      transfer: result.transfer,
      credited: result.credited,
      alreadyProcessed: result.alreadyProcessed,
      balance: "balance" in result ? result.balance : undefined,
    });
  },
);
