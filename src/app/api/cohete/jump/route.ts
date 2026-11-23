// POST /api/cohete/jump — saltar del cohete (cashout antes de la explosión)
import { jump } from "@/lib/cohete/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const result = await jump(user.id);
  return json(result);
});
