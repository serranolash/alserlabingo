// POST /api/tombola/bet — apostar puntos en la ronda actual (fase betting)
import { placeBet } from "@/lib/tombola/service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{ points?: number }>(request);
  const points = Number(body.points ?? 0);
  const result = await placeBet(user.id, points);
  return json(result);
});
