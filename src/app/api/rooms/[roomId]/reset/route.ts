// POST /api/rooms/[roomId]/reset — reiniciar sala para nueva ronda (host)
import { resetRoom } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (_request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    const room = await resetRoom(user.id, roomId);
    return json({ ok: true, status: room.status, currentRound: room.currentRound });
  },
);
