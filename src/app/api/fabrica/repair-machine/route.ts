// POST /api/fabrica/repair-machine — reparar una máquina averiada
import { repairMachine } from "@/lib/fabrica/service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{ machineId?: string }>(request);
  if (!body.machineId) return json({ error: "machineId requerido" }, 400);
  const result = await repairMachine(user.id, body.machineId);
  return json(result);
});
