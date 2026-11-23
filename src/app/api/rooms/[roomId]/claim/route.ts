// POST /api/rooms/[roomId]/claim — reclamar premio (transaccional, co-ganadores)
import { claim } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    const body = await readBody<{ ticketId?: string; type?: string }>(request);
    const ticketId = String(body.ticketId ?? "");
    const type = String(body.type ?? "").toUpperCase() as "LINE" | "CORNERS" | "BINGO";
    if (!ticketId) return json({ error: "ticketId requerido" }, 400);
    if (!["LINE", "CORNERS", "BINGO"].includes(type))
      return json({ error: "type debe ser LINE, CORNERS o BINGO" }, 400);

    const result = await claim(user.id, roomId, ticketId, type);
    return json(result);
  },
);
