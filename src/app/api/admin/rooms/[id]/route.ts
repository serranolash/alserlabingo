// PATCH /api/admin/rooms/[id] — configurar premios/precio/intervalo de una sala
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const PATCH = withErrors(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    if (!admin) return json({ error: "Acceso denegado (solo ADMIN)" }, 403);
    const { id } = await params;
    const body = await readBody<{
      cardPrice?: number;
      prizeLine?: number;
      prizeCorners?: number;
      prizeBingo?: number;
      intervalSec?: number;
      currency?: string;
    }>(request);

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      if (k === "currency") {
        data[k] = String(v);
      } else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) {
          return json({ error: `${k} debe ser entero >= 0` }, 400);
        }
        data[k] = n;
      }
    }

    const room = await db.room.update({
      where: { id },
      data,
      select: {
        id: true,
        cardPrice: true,
        prizeLine: true,
        prizeCorners: true,
        prizeBingo: true,
        intervalSec: true,
        currency: true,
      },
    });
    return json({ room });
  },
);
