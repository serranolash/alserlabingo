// POST /api/rooms/[roomId]/pause — pausa manual del sorteo (host)
import { pauseRoom } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (_request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    const room = await pauseRoom(user.id, roomId);
    return json({ paused: true, status: room.status });
  },
);
