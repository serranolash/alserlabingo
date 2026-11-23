// GET /api/tombola/state — estado completo de La Tómbola (ronda actual, mi apuesta,
// prueba social, ranking, bonus diario, código de referido). Auto-gestiona rondas.
import { getTombolaState } from "@/lib/tombola/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const state = await getTombolaState(user.id);
  return json({ state });
});
