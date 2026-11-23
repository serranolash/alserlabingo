// POST /api/metropoli/create — crear o unirse a una partida
import { createGame } from "@/lib/metropoli/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const result = await createGame(user.id);
  return json(result, 201);
});
