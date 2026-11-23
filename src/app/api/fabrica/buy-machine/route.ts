// POST /api/fabrica/buy-machine — comprar una máquina
import { buyMachine } from "@/lib/fabrica/service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{ machineType?: string }>(request);
  if (!body.machineType) return json({ error: "machineType requerido" }, 400);
  const result = await buyMachine(user.id, body.machineType);
  return json(result);
});
