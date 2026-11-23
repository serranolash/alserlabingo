"use client";
// Reloj determinístico del cliente — predice cuántas bolillas están reveladas
// y cuándo sale la próxima, usando el reloj del servidor como referencia.
// Permite mostrar countdown y disparar un poll justo cuando debe salir una
// bolilla nueva (experiencia en tiempo real sin timers en el servidor).
import { useEffect, useRef, useState } from "react";

export interface ClockFields {
  startedAt: number | null;
  pausedAt: number | null;
  endedAt: number | null;
  pausedElapsedMs: number;
  intervalSec: number;
  serverTime: number;
}

export function useDeterministicClock(clock: ClockFields | null) {
  const [, setTick] = useState(0);
  const captureRef = useRef<{ serverTime: number; clientTime: number }>({
    serverTime: 0,
    clientTime: 0,
  });

  // Re-captura el offset servidor/cliente cada vez que llega un serverTime nuevo.
  if (clock && clock.serverTime !== captureRef.current.serverTime) {
    captureRef.current = { serverTime: clock.serverTime, clientTime: Date.now() };
  }

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  if (!clock || !clock.startedAt) {
    return { revealedCount: 0, msToNext: null, serverNow: Date.now(), running: false };
  }

  const now = Date.now();
  const serverNow = clock.serverTime + (now - captureRef.current.clientTime);
  const freeze = clock.pausedAt ?? clock.endedAt;
  const effectiveNow = freeze ?? serverNow;
  const elapsedMs = effectiveNow - clock.startedAt - clock.pausedElapsedMs;
  const intervalMs = Math.max(1, clock.intervalSec) * 1000;
  const revealedCount = Math.max(0, Math.floor(elapsedMs / intervalMs));
  const nextRevealMs =
    (revealedCount + 1) * intervalMs + clock.startedAt + clock.pausedElapsedMs;
  const msToNext = Math.max(0, nextRevealMs - effectiveNow);
  const running = !freeze;

  return { revealedCount, msToNext, serverNow, running };
}
