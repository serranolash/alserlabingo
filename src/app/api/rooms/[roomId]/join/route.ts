// POST /api/rooms/[roomId]/join — unirse a una sala por id (jugador autenticado)
import { joinRoom } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (_request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    const room = await joinRoom(user.id, roomId);
    return json({ roomId: room.id, status: room.status });
  },
);
