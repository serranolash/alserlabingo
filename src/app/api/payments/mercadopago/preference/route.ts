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
  const amountCents = Math.round(Number(body.amount ?? 0));
  if (!Number.isInteger(amountCents) || amountCents < 100) {
    return json({ error: "Monto inválido (mínimo $1.00 USD = 100 centavos)" }, 400);
  }
  const pref = await createPreference(user.id, amountCents);
  return json({ ...pref, amountCents });
});
