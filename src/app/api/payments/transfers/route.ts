// POST /api/payments/transfers — usuario registra solicitud de recarga por transferencia
// GET  /api/payments/transfers — lista las solicitudes del usuario
import { requestTransfer, listUserTransfers } from "@/lib/payments/transfers";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{
    amount?: number;
    paymentMethod?: string;
    country?: string;
    referenceNumber?: string;
    note?: string;
  }>(request);
  const transfer = await requestTransfer(user.id, {
    amount: Number(body.amount ?? 0),
    paymentMethod: body.paymentMethod,
    country: body.country,
    referenceNumber: body.referenceNumber,
    note: body.note,
  });
  return json({ transfer }, 201);
});

export const GET = withErrors(async () => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const transfers = await listUserTransfers(user.id);
  return json({ transfers });
});
