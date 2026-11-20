// POST /api/auth/login — login con email + password (set cookie JWT HTTP-only)
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const body = await readBody<{ email?: string; password?: string }>(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) return json({ error: "Email y contraseña requeridos" }, 400);

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return json({ error: "Credenciales inválidas" }, 401);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return json({ error: "Credenciales inválidas" }, 401);

  await setSessionCookie({ sub: user.id, email: user.email, role: user.role });
  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "PLAYER" | "HOST" | "ADMIN",
      balance: user.balance,
    },
  });
});
