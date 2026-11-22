// GET  /api/admin/rooms — lista todas las salas con stats
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const admin = await requireAdmin();
  if (!admin) return json({ error: "Acceso denegado (solo ADMIN)" }, 403);
  const rooms = await db.room.findMany({
    include: {
      host: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          participants: true,
          tickets: true,
          claims: true,
          draws: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json({
    rooms: rooms.map((r) => ({
      id: r.id,
      token: r.token,
      inviteToken: r.inviteToken,
      isPublic: r.isPublic,
      status: r.status,
      hostName: r.host.name,
      hostEmail: r.host.email,
      currentRound: r.currentRound,
      cardPrice: r.cardPrice,
      prizeLine: r.prizeLine,
      prizeCorners: r.prizeCorners,
      prizeBingo: r.prizeBingo,
      currency: r.currency,
      intervalSec: r.intervalSec,
      participants: r._count.participants,
      tickets: r._count.tickets,
      claims: r._count.claims,
      draws: r._count.draws,
      createdAt: r.createdAt,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    })),
  });
});
