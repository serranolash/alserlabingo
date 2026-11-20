// GET /api/rooms/by-token/[token] — resolver sala por código de invitación
import { db } from "@/lib/db";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async (_request: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const room = await db.room.findUnique({
    where: { token: token.toUpperCase() },
    select: {
      id: true,
      token: true,
      status: true,
      gameType: true,
      hostId: true,
      currentRound: true,
      cardPrice: true,
      prizeLine: true,
      prizeCorners: true,
      prizeBingo: true,
      currency: true,
      intervalSec: true,
    },
  });
  if (!room) return json({ error: "Sala no encontrada" }, 404);
  return json({ room });
});
