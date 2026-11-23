// POST /api/fabrica/sell-production — vender goods acumulados por puntos
import { sellProduction } from "@/lib/fabrica/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const result = await sellProduction(user.id);
  return json(result);
});
