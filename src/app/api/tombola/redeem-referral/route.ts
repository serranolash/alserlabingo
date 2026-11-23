// POST /api/tombola/redeem-referral — redimir código de referido (+500 al invitador)
import { redeemReferral } from "@/lib/tombola/service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{ code?: string }>(request);
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return json({ error: "Código requerido" }, 400);
  const result = await redeemReferral(user.id, code);
  return json(result);
});
