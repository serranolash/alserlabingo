// GET /api/rooms/[roomId]/tickets — cartones del usuario + victorias por tipo
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(
  async (_request: Request, { params }: { params: Promise<{ roomId: string }> }) => {
    const user = await requireUser();
    if (!user) return json({ error: "No autenticado" }, 401);
    const { roomId } = await params;
    const tickets = await db.ticket.findMany({
      where: { roomId, userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        grid: true,
        status: true,
        createdAt: true,
        purchase: { select: { id: true, quantity: true, unitPrice: true, totalCost: true } },
        claims: {
          where: { valid: true },
          select: { id: true, type: true, prizeAwarded: true, drawIndex: true },
        },
      },
    });
    return json({ tickets });
  },
);
