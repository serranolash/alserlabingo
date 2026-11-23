// POST /api/auth/register — registro simple para adultos mayores.
// Acepta Nombre + (Teléfono O Usuario O Email) + PIN/clave (mín 4).
// Email opcional: si no se ingresa, no se guarda (login por teléfono/usuario).
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { maybeBootstrapAdmin, requireUser, setSessionCookie } from "@/lib/auth/session";
import { WELCOME_BONUS_CENTS } from "@/lib/format";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const existing = await requireUser();
  if (existing) return json({ user: publicUser(existing) });

  const body = await readBody<{
    name?: string;
    phone?: string;
    username?: string;
    email?: string;
    password?: string;
    remember?: boolean;
  }>(request);

  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim() || null;
  const username = String(body.username ?? "").trim() || null;
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const password = String(body.password ?? "");
  const remember = body.remember !== false; // activado por defecto

  if (!name) return json({ error: "Ingresa tu nombre y apellido" }, 400);
  if (password.length < 4)
    return json({ error: "Crea una clave de al menos 4 números" }, 400);
  if (!phone && !username && !email)
    return json({ error: "Ingresa tu número de celular o un usuario" }, 400);

  // Validar duplicados
  if (email) {
    const dup = await db.user.findUnique({ where: { email } });
    if (dup) return json({ error: "Ya existe una cuenta con ese email" }, 409);
  }
  if (phone) {
    const dup = await db.user.findUnique({ where: { phone } });
    if (dup) return json({ error: "Ya existe una cuenta con ese número de celular" }, 409);
  }
  if (username) {
    const dup = await db.user.findUnique({ where: { username } });
    if (dup) return json({ error: "Ese usuario ya está en uso" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const role = maybeBootstrapAdmin(email) ? "ADMIN" : "PLAYER";

  const user = await db.user.create({
    data: { email, phone, username, name, passwordHash, role, balance: WELCOME_BONUS_CENTS },
  });

  await setSessionCookie({ sub: user.id, email: user.email, role: user.role, remember });
  return json({ user: publicUser(user) }, 201);
});

/** Quita passwordHash de la respuesta e incluye los identificadores. */
function publicUser(u: {
  id: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  name: string;
  role: string;
  balance: number;
  points: number;
}) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    username: u.username,
    name: u.name,
    role: u.role as "PLAYER" | "HOST" | "ADMIN",
    balance: u.balance,
    points: u.points,
  };
}
