// POST /api/rooms/[roomId]/schedule — programar auto-inicio (host)
import { cancelSchedule, scheduleRoom } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    const body = await readBody<{ startAt?: string; cancel?: boolean }>(request);

    if (body.cancel) {
      const room = await cancelSchedule(user.id, roomId);
      return json({ ok: true, scheduledStartAt: room.scheduledStartAt });
    }

    if (!body.startAt) return json({ error: "startAt requerido (ISO)" }, 400);
    const room = await scheduleRoom(user.id, roomId, body.startAt);
    return json({ ok: true, scheduledStartAt: room.scheduledStartAt });
  },
);
