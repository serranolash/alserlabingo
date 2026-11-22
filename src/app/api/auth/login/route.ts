// POST /api/auth/login — login por email, teléfono o usuario + PIN/clave.
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const body = await readBody<{
    identifier?: string; // email, teléfono o usuario
    password?: string;
    remember?: boolean;
  }>(request);

  const identifier = String(body.identifier ?? "").trim();
  const password = String(body.password ?? "");
  const remember = body.remember !== false;

  if (!identifier || !password)
    return json({ error: "Ingresa tu celular/usuario y tu clave" }, 400);

  // Buscar por email, teléfono o usuario (normaliza email a minúsculas)
  const lower = identifier.toLowerCase();
  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: lower },
        { phone: identifier },
        { username: lower },
      ],
    },
  });

  if (!user || !user.passwordHash) {
    return json({ error: "Cuenta o clave incorrecta" }, 401);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return json({ error: "Cuenta o clave incorrecta" }, 401);

  await setSessionCookie({ sub: user.id, email: user.email, role: user.role, remember });
  return json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      name: user.name,
      role: user.role as "PLAYER" | "HOST" | "ADMIN",
      balance: user.balance,
    },
  });
});
