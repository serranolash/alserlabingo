// GET /api/rooms/mine — "Mis Salas en Curso" (host o participante, status activo)
import { listMyRooms } from "@/lib/game/room-service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const rooms = await listMyRooms(user.id);
  return json({ rooms });
});
