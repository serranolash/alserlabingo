// POST /api/rooms/[roomId]/buy — comprar cartones (transaccional)
import { buyCards } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(
  async (request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    const body = await readBody<{ quantity?: number }>(request);
    const quantity = Number(body.quantity ?? 1);
    const result = await buyCards(user.id, roomId, quantity);
    return json({
      balance: result.balance,
      tickets: result.tickets.map((t) => ({
        id: t.id,
        grid: t.grid,
        status: t.status,
      })),
    });
  },
);
