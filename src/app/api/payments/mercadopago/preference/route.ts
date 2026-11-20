// POST /api/payments/mercadopago/preference — crear preferencia Checkout Pro
import { createPreference, isMercadoPagoConfigured } from "@/lib/payments/mercadopago";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  if (!isMercadoPagoConfigured()) {
    return json(
      { error: "MercadoPago no configurado. Usa recarga por transferencia.", configured: false },
      503,
    );
  }
  const body = await readBody<{ amount?: number }>(request);
  const amount = Math.round(Number(body.amount ?? 0));
  if (!Number.isInteger(amount) || amount < 1) {
    return json({ error: "Monto inválido (debe ser entero positivo)" }, 400);
  }
  const pref = await createPreference(user.id, amount);
  return json({ ...pref, amount });
});
