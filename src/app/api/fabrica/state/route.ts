// GET /api/fabrica/state — estado de La Fábrica Loca (procesa producción pendiente)
import { getFactoryState } from "@/lib/fabrica/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const GET = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const state = await getFactoryState(user.id);
  return json({ state });
});
