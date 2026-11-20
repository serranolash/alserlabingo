// POST /api/rooms — crear sala (SOLO ADMIN: el operador del bingo crea las salas)
// GET  /api/rooms/active — listar salas activas (lobby, todos los usuarios)
import { createRoom, listActiveRooms } from "@/lib/game/room-service";
import { requireAdmin } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireAdmin();
  if (!user) return json({ error: "Solo el administrador puede crear salas" }, 403);

  const body = await readBody<{
    cardPrice?: number;
    prizeLine?: number;
    prizeCorners?: number;
    prizeBingo?: number;
    intervalSec?: number;
    currency?: string;
    isPublic?: boolean;
  }>(request);

  const { room, token } = await createRoom(user.id, {
    cardPrice: body.cardPrice,
    prizeLine: body.prizeLine,
    prizeCorners: body.prizeCorners,
    prizeBingo: body.prizeBingo,
    intervalSec: body.intervalSec,
    currency: body.currency,
    isPublic: body.isPublic,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return json(
    {
      roomId: room.id,
      token,
      inviteToken: room.inviteToken,
      inviteUrl: `${appUrl ? appUrl.replace(/\/+$/, "") : ""}/invite/${room.inviteToken}`,
      hostUserId: user.id,
    },
    201,
  );
});

export const GET = withErrors(async () => {
  const rooms = await listActiveRooms();
  return json({ rooms });
});
