// POST /api/metropoli/place — colocar una pieza en el tablero
import { placePiece } from "@/lib/metropoli/service";
import { requireUser } from "@/lib/auth/session";
import { json, readBody, withErrors } from "@/lib/api";

export const POST = withErrors(async (request: Request) => {
  const user = await requireUser();
  if (!user) return json({ error: "No autenticado" }, 401);
  const body = await readBody<{ row?: number; col?: number; pieceIndex?: number }>(request);
  const result = await placePiece(user.id, Number(body.row ?? -1), Number(body.col ?? -1), Number(body.pieceIndex ?? -1));
  return json(result);
});
