// =============================================================================
//  Gestión de sesión — cookie HTTP-only + helpers de autorización
//
//  NINGÚN endpoint confía en un userId enviado en el body. La identidad se
//  extrae SIEMPRE de la sesión JWT (cookie HTTP-only).
//  - requireUser(): usuario autenticado o null (401)
//  - requireAdmin(): usuario con rol ADMIN o null (403)
//  - El check de host se hace en room-service: room.hostId === user.id
//
//  "Recordar mi cuenta": si remember=true, la cookie dura 30 días;
//  si no, dura la sesión del navegador (se borra al cerrar).
// =============================================================================
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { signSession, verifySession } from "./jwt";

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "alserla_session";
const REMEMBER_TTL_SEC = Number(process.env.AUTH_REMEMBER_TTL_SEC ?? 2592000); // 30 días
const SESSION_TTL_SEC = Number(process.env.AUTH_SESSION_TTL_SEC ?? 86400); // 1 día si no recuerda

/** Crea la cookie de sesión tras un login/registro exitoso. */
export async function setSessionCookie(payload: {
  sub: string;
  email: string | null;
  role: string;
  remember?: boolean;
}): Promise<void> {
  const token = await signSession({
    sub: payload.sub,
    email: payload.email ?? "",
    role: payload.role,
  });
  const isProd = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: payload.remember ? REMEMBER_TTL_SEC : SESSION_TTL_SEC,
  });
}

/** Elimina la cookie de sesión (logout). */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Devuelve el payload de sesión (sin tocar la BD). */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Devuelve el usuario autenticado (registro completo de la BD) o null. */
export async function getCurrentUser(): Promise<User | null> {
  const payload = await getSession();
  if (!payload) return null;
  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      phone: true,
      username: true,
      name: true,
      role: true,
      balance: true,
      points: true,
      passwordHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return user ?? null;
}

/** Requiere usuario autenticado. Devuelve el usuario o null (caller debe 401). */
export async function requireUser(): Promise<User | null> {
  return getCurrentUser();
}

/** Requiere usuario con rol ADMIN. Devuelve el usuario o null (403). */
export async function requireAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") return null;
  return user;
}

/** Promueve a ADMIN si el email coincide con ADMIN_BOOTSTRAP_EMAIL. */
export function maybeBootstrapAdmin(email: string | null): boolean {
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  return Boolean(email && adminEmail && email.toLowerCase() === adminEmail.toLowerCase());
}
