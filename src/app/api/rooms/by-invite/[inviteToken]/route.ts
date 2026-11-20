// GET /api/rooms/by-invite/[inviteToken] — resolver sala por enlace de invitación
import { getRoomByInviteToken } from "@/lib/game/room-service";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(
  async (_request: Request, { params }: { params: Promise<{ inviteToken: string }> }) => {
    const { inviteToken } = await params;
    const room = await getRoomByInviteToken(inviteToken);
    if (!room) return json({ error: "Enlace de invitación inválido" }, 404);
    return json({
      room: {
        id: room.id,
        token: room.token,
        status: room.status,
        hostId: room.hostId,
        currentRound: room.currentRound,
        cardPrice: room.cardPrice,
        prizeLine: room.prizeLine,
        prizeCorners: room.prizeCorners,
        prizeBingo: room.prizeBingo,
        currency: room.currency,
        intervalSec: room.intervalSec,
        isPublic: room.isPublic,
      },
    });
  },
);
