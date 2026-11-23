// POST /api/metropoli/join — unirse a una partida existente
import { joinGame } from "@/lib/metropoli/service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{ gameId?: string }>(request);
  if (!body.gameId) return json({ error: "gameId requerido" }, 400);
  const result = await joinGame(user.id, body.gameId);
  return json(result);
});
