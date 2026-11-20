// POST /api/rooms/[roomId]/start — iniciar sorteo (host)
import { startRoom } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (_request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    await startRoom(user.id, roomId);
    return json({ started: true });
  },
);
