// POST /api/rooms/[roomId]/delete — eliminar sala (host o admin)
// Borra la sala y todos sus datos: claims, draws, tickets, purchases, payouts, participants.
import { deleteRoom } from "@/lib/game/room-service";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (_request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    // Verificar si es admin (para permitir eliminar cualquier sala)
    const admin = await requireAdmin();
    const isAdmin = admin?.role === "ADMIN";
    await deleteRoom(user.id, roomId, isAdmin);
    return json({ ok: true });
  },
);