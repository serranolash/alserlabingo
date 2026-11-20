// GET /api/rooms/[roomId]/events — SSE (Server-Sent Events) serverless-compatible
//
// Envía snapshots del estado público cada ~1.5s. El cliente usa EventSource
// que auto-reconecta al cortar el stream (típico en serverless). Combinado
// con el reloj determinístico del cliente, da experiencia en tiempo real
// sin timers en el servidor.
import { getPublicState } from "@/lib/game/room-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = async () => {
        const state = await getPublicState(roomId);
        if (!state) {
          controller.close();
          return false;
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(state)}\n\n`),
        );
        return true;
      };

      const ok = await send().catch(() => false);
      if (!ok) return;

      const interval = setInterval(async () => {
        const alive = await send().catch(() => false);
        if (!alive) {
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            /* ya cerrado */
          }
        }
      }, 1500);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
