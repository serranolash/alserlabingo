// GET /api/rooms/active — listar salas activas para el lobby
import { listActiveRooms } from "@/lib/game/room-service";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const rooms = await listActiveRooms();
  return json({ rooms });
});
