// GET /api/auth/me — usuario autenticado actual
import { requireUser } from "@/lib/auth/session";
import { json } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (!user) return json({ user: null }, 401);
  return json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      name: user.name,
      role: user.role as "PLAYER" | "HOST" | "ADMIN",
      balance: user.balance,
      points: user.points,
    },
  });
}
