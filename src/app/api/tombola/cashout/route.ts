// POST /api/tombola/cashout — retirar la apuesta activa (fase running, antes de la bomba)
import { cashout } from "@/lib/tombola/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const result = await cashout(user.id);
  return json(result);
});
