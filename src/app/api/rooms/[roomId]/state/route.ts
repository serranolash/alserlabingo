// GET /api/rooms/[roomId]/state — estado público de la sala (polling)
import { getPublicState } from "@/lib/game/room-service";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(
  async (_request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const { roomId } = await params;
    const state = await getPublicState(roomId);
    if (!state) return json({ error: "Sala no encontrada" }, 404);
    return json({ state });
  },
);
