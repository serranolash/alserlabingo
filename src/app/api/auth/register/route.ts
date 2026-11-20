// POST /api/auth/register — registro con email + password (sesión JWT cookie)
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { maybeBootstrapAdmin, requireUser, setSessionCookie } from "@/lib/auth/session";
import { WELCOME_BONUS_CENTS } from "@/lib/format";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  // Si ya hay sesión, la devolvemos (no forzamos logout).
  const existing = await requireUser();
  if (existing) return json({ user: publicUser(existing) });

  const body = await readBody<{ email?: string; name?: string; password?: string }>(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !email.includes("@")) return json({ error: "Email inválido" }, 400);
  if (!name) return json({ error: "Nombre requerido" }, 400);
  if (password.length < 6)
    return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);

  const dup = await db.user.findUnique({ where: { email } });
  if (dup) return json({ error: "Ya existe una cuenta con ese email" }, 409);

  const passwordHash = await hashPassword(password);
  const role = maybeBootstrapAdmin(email) ? "ADMIN" : "PLAYER";

  const user = await db.user.create({
    data: { email, name, passwordHash, role, balance: WELCOME_BONUS_CENTS },
  });

  await setSessionCookie({ sub: user.id, email: user.email, role: user.role });
  return json({ user: publicUser(user) }, 201);
});

/** Quita passwordHash de la respuesta. */
function publicUser(u: {
  id: string;
  email: string;
  name: string;
  role: string;
  balance: number;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as "PLAYER" | "HOST" | "ADMIN",
    balance: u.balance,
  };
}
