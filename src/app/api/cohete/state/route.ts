// GET /api/cohete/state — estado completo de El Cohete Criollo
import { getRocketState } from "@/lib/cohete/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const state = await getRocketState(user.id);
  return json({ state });
});
