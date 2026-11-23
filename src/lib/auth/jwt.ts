// =============================================================================
//  JWT de sesión (jose — edge-compatible, Web Crypto API)
//  El token viaja en una cookie HTTP-only; nunca se expone al JS del cliente.
// =============================================================================
import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_JWT_SECRET ?? "dev-insecure-secret-change-me-please",
);
const ISSUER = process.env.AUTH_JWT_ISSUER ?? "alserla-bingo";
const TTL_SEC = Number(process.env.AUTH_SESSION_TTL_SEC ?? 604800); // 7 días

export interface SessionPayload {
  sub: string; // user id
  email: string;
  role: string;
}

/** Firma un token JWT con la identidad del usuario. */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SEC}s`)
    .sign(SECRET);
}

/** Verifica un token JWT. Devuelve el payload o null si es inválido/expirado. */
export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      role: String(payload.role ?? "PLAYER"),
    };
  } catch {
    return null;
  }
}
