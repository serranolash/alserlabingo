// =============================================================================
//  Hashing de contraseñas (bcryptjs — puro JS, sin dependencias nativas)
// =============================================================================
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Hashea una contraseña en texto plano. */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres");
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Verifica una contraseña contra su hash. */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
