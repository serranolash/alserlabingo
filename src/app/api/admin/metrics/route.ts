// GET /api/admin/metrics — dashboard: usuarios, salas, recaudación, pendientes
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const admin = await requireAdmin();
  if (!admin) return json({ error: "Acceso denegado (solo ADMIN)" }, 403);

  const [totalUsers, usersByRole, roomsByStatus, pendingTransfers, aggBalance, aggRevenue, recentWins, roomsAgg] =
    await Promise.all([
      db.user.count(),
      db.user.groupBy({ by: ["role"], _count: true }),
      db.room.groupBy({ by: ["status"], _count: true }),
      db.transferRequest.count({ where: { status: "PENDING" } }),
      db.user.aggregate({ _sum: { balance: true } }),
      db.paymentTransaction.aggregate({
        where: { status: "APPROVED" },
        _sum: { amount: true },
      }),
      db.claim.findMany({
        where: { valid: true },
        include: { user: { select: { name: true } }, room: { select: { token: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.room.aggregate({
        _count: true,
        _sum: { prizeLine: true, prizeCorners: true, prizeBingo: true },
      }),
    ]);

  const roleMap = Object.fromEntries(usersByRole.map((r) => [r.role, r._count]));
  const statusMap = Object.fromEntries(roomsByStatus.map((r) => [r.status, r._count]));

  return json({
    users: {
      total: totalUsers,
      players: roleMap["PLAYER"] ?? 0,
      hosts: roleMap["HOST"] ?? 0,
      admins: roleMap["ADMIN"] ?? 0,
    },
    rooms: {
      total: roomsAgg._count,
      waiting: statusMap["WAITING"] ?? 0,
      running: statusMap["RUNNING"] ?? 0,
      paused: statusMap["PAUSED"] ?? 0,
      ended: statusMap["ENDED"] ?? 0,
    },
    economy: {
      creditsInCirculation: aggBalance._sum.balance ?? 0,
      totalRecharges: aggRevenue._sum.amount ?? 0,
      pendingTransfers,
    },
    recentWins: recentWins.map((c) => ({
      id: c.id,
      userName: c.user.name,
      roomToken: c.room.token,
      type: c.type,
      prizeAwarded: c.prizeAwarded,
      drawIndex: c.drawIndex,
      at: c.createdAt,
    })),
  });
});
