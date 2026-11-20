// POST /api/rooms/[roomId]/resume — reanudar sorteo tras pausa por Línea (host)
import { resumeRoom } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (_request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    const room = await resumeRoom(user.id, roomId);
    return json({ resumed: !room.pausedAt, status: room.status });
  },
);
