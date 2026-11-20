// =============================================================================
//  MERCADOPAGO — Checkout Pro (Preferencia) + verificación de webhook
//
//  Flujo:
//   1. POST /api/payments/mercadopago/preference { amount }
//      -> createPreference(): crea preferencia con external_reference = userId,
//         devuelve init_point (URL de checkout).
//   2. Usuario paga en MP (Checkout Pro).
//   3. MP notifica a POST /api/webhooks/mercadopago { type, data: { id } }
//      -> verifyWebhookSignature() valida el header x-signature (HMAC-SHA256).
//      -> getPayment(id) consulta el pago a MP (fuente de verdad, no confía
//         en el payload del webhook).
//      -> si status === 'approved', processApprovedPayment() acredita.
//
//  Si MERCADOPAGO_ACCESS_TOKEN no está configurado, createPreference devuelve
//  un error claro (no se simula). En producción se configura con credenciales
//  reales de https://www.mercadopago.com.ar/developers/.
// =============================================================================
import { createHmac } from "node:crypto";
import { processApprovedPayment } from "./recharge";

const MP_BASE = "https://api.mercadopago.com";
const PREFERENCES_URL = `${MP_BASE}/checkout/preferences`;
const PAYMENTS_URL = `${MP_BASE}/v1/payments`;

function accessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
  if (!token) {
    throw new Error(
      "MercadoPago no configurado: define MERCADOPAGO_ACCESS_TOKEN en .env",
    );
  }
  return token;
}

function isConfigured(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

export interface PreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
}

/**
 * Crea una preferencia de pago Checkout Pro.
 * `external_reference = userId` viaja hasta el webhook para saber a quién acreditar.
 */
export async function createPreference(
  userId: string,
  amount: number,
): Promise<PreferenceResult> {
  const token = accessToken();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const body = {
    items: [
      {
        id: "credits",
        title: `Recarga de ${amount} créditos — Alserla Bingo`,
        description: "Créditos para cartones de Alserla Bingo",
        quantity: 1,
        unit_price: amount,
        currency_id: process.env.DEFAULT_CURRENCY ?? "ARS",
      },
    ],
    external_reference: userId,
    back_urls: {
      success: `${appUrl}/?payment=success`,
      failure: `${appUrl}/?payment=failure`,
      pending: `${appUrl}/?payment=pending`,
    },
    auto_return: "approved",
    notification_url: `${appUrl}/api/webhooks/mercadopago`,
    statement_descriptor: "ALSERLA",
  };

  const res = await fetch(PREFERENCES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MercadoPago preference error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    init_point: string;
    sandbox_init_point?: string;
  };
  return {
    preferenceId: data.id,
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point,
  };
}

export interface MPPayment {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  external_reference?: string;
  payment_method_id?: string;
  date_created?: string;
  date_approved?: string;
}

/** Consulta el pago a MP (fuente autoritativa — no confía en el payload webhook). */
export async function getPayment(paymentId: string | number): Promise<MPPayment | null> {
  const token = accessToken();
  const res = await fetch(`${PAYMENTS_URL}/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as MPPayment;
}

/**
 * Verifica la firma del webhook de MercadoPago (header x-signature).
 * Formato MP: header "ts=<ts>,v1=<hex>"; manifest "id:<dataId>;request-id:<reqId>;ts:<ts>;".
 * Devuelve true si el secret no está configurado (modo dev); en producción
 * debe configurarse MERCADOPAGO_WEBHOOK_SECRET.
 */
export function verifyWebhookSignature(
  headers: Headers,
  dataId: string,
): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  // Modo dev: sin secret => acepta (la consulta getPayment es igualmente autoritativa).
  if (!secret) return true;

  const signatureHeader = headers.get("x-signature") ?? "";
  const requestId = headers.get("x-request-id") ?? "";
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, ...v] = kv.split("=");
      return [k.trim(), v.join("=").trim()];
    }),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const computed = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");
  // Comparación de tiempo constante.
  if (computed.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

/** Procesa una notificación de pago: consulta MP y acredita si está aprobado. */
export async function processPaymentNotification(
  paymentId: string | number,
): Promise<{ skipped: boolean; status?: string; credited?: boolean; balance?: number }> {
  const payment = await getPayment(paymentId);
  if (!payment) return { skipped: true };
  if (payment.status !== "approved") {
    return { skipped: true, status: payment.status };
  }
  const userId = payment.external_reference;
  if (!userId) {
    return { skipped: true, status: "missing_external_reference" };
  }
  const amount = Math.round(Number(payment.transaction_amount ?? 0));
  if (amount <= 0) return { skipped: true, status: "invalid_amount" };

  const result = await processApprovedPayment({
    userId,
    amount,
    provider: "MERCADOPAGO",
    externalId: String(payment.id),
    raw: payment,
    description: `Recarga MercadoPago (pago ${payment.id})`,
  });
  return {
    skipped: false,
    status: "approved",
    credited: result.credited,
    balance: result.balance,
  };
}

export { isConfigured as isMercadoPagoConfigured };
