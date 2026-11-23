"use client";
// Hook SSE: conecta a /api/rooms/[roomId]/events y mantiene el estado público.
import { useEffect, useRef, useState } from "react";
import type { PublicRoomState } from "@/lib/bingo/types";

export function useRoomSSE(roomId: string | null) {
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastDrawnRef = useRef<number[]>([]);

  useEffect(() => {
    if (!roomId) return;
    lastDrawnRef.current = [];

    const es = new EventSource(`/api/rooms/${roomId}/events`);
    es.onmessage = (e) => {
      try {
        const s = JSON.parse(e.data) as PublicRoomState;
        setState(s);
        setLoading(false);
        setError(null);
      } catch {
        /* ignora snapshots parciales */
      }
    };
    es.onerror = () => {
      setError("Reconectando…");
      // EventSource auto-reconecta; no cerramos.
    };

    return () => es.close();
  }, [roomId]);

  return { state, loading, error };
}
