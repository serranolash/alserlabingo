// POST /api/tombola/daily-bonus — reclamar +300 puntos gratis (cada 12h)
import { claimDailyBonus } from "@/lib/tombola/service";
import { requireUser } from "@/lib/auth/session";
import { json, withErrors } from "@/lib/api";

export const POST = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const result = await claimDailyBonus(user.id);
  return json(result);
});
