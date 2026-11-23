// GET /api/metropoli/state — estado de la partida actual
import { getMetropoliState } from "@/lib/metropoli/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const state = await getMetropoliState(user.id);
  return json({ state });
});
