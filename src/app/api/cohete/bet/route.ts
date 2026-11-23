// POST /api/cohete/bet — apostar puntos en el cohete (con auto-salto opcional)
import { placeBet } from "@/lib/cohete/service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{ points?: number; autoCashoutAt?: number }>(request);
  const result = await placeBet(user.id, Number(body.points ?? 0), body.autoCashoutAt);
  return json(result);
});
