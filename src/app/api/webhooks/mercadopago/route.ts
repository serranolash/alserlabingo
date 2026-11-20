// POST /api/webhooks/mercadopago — receptor idempotente (verifica + consulta + acredita)
// GET  — verificación de URL (challenge de MercadoPago al configurar el webhook)
import { verifyWebhookSignature, processPaymentNotification } from "@/lib/payments/mercadopago";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

// Verificación inicial de la URL (MP envía GET al registrar el webhook).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("hub.challenge");
  if (challenge) return json({ hub_challenge: challenge });
  return json({ ok: true });
}

export async function POST(request: Request) {
  let body: { type?: string; data?: { id?: string | number } } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "body inválido" }, 400);
  }

  // MP envía notificaciones de varios tipos; solo procesamos "payment".
  if (body.type !== "payment") {
    return json({ ok: true, ignored: body.type });
  }

  const dataId = body.data?.id;
  if (!dataId) return json({ error: "data.id faltante" }, 400);

  // Verificación de firma (HMAC-SHA256). Si no hay secret configurado, acepta
  // en modo dev — la consulta getPayment() es igualmente autoritativa.
  if (!verifyWebhookSignature(request.headers, String(dataId))) {
    return json({ error: "firma inválida" }, 401);
  }

  try {
    const result = await processPaymentNotification(dataId);
    return json({ ok: true, ...result });
  } catch (err) {
    // Devuelve 500 para que MP reintente; registra el error.
    const message = err instanceof Error ? err.message : "error interno";
    return json({ error: message }, 500);
  }
}
