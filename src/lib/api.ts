// =============================================================================
//  Helpers para API routes (App Router) — respuestas JSON + manejo de errores
// =============================================================================
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/game/room-service";

/** Respuesta JSON con status code. */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Convierte un error (HttpError o genérico) en una respuesta JSON. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return json({ error: err.message }, err.status);
  }
  const message =
    err instanceof Error ? err.message : "Error interno del servidor";
  return json({ error: message }, 500);
}

/** Envuelve un handler asíncrono capturando errores automáticamente. */
export function withErrors<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Lee el cuerpo JSON de un Request de forma segura. */
export async function readBody<T = Record<string, unknown>>(
  request: Request,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
