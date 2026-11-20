"use client";
// Sala de juego en vivo: bolillero con voz, termómetro de tensión, cartones
// auto-ordenados por cercanía de victoria, claims, controles de host y re-compra.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { useRoomSSE } from "@/hooks/use-room-sse";
import { useDeterministicClock } from "@/hooks/use-deterministic-clock";
import { useVoice } from "@/hooks/use-voice";
import { useHaptics } from "@/hooks/use-haptics";
import { letterForBall } from "@/lib/bingo/constants";
import { computeCardProgress } from "@/lib/bingo/patterns";
import { normalizeGrid } from "@/lib/bingo/engine";
import type { PublicRoomState } from "@/lib/bingo/types";
import { BingoCard } from "./BingoCard";
import { Confetti } from "./Confetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  Loader2,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

interface MyTicket {
  id: string;
  grid: unknown;
  status: "ACTIVE" | "WON_LINE" | "WON_CORNERS" | "WON_BINGO" | "CANCELLED";
  purchase?: { quantity: number; unitPrice: number; totalCost: number } | null;
}

export function RoomView() {
  const { roomId, roomToken, closeRoom, user, refreshBalance } = useApp();
  const { state, loading, error } = useRoomSSE(roomId);
  const { speak, enabled: voiceEnabled, toggle: toggleVoice, supported: voiceSupported } = useVoice();
  const { vibrate } = useHaptics();
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [buyQty, setBuyQty] = useState(2);
  const [busy, setBusy] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);

  const clock = useDeterministicClock(
    state
      ? {
          startedAt: state.startedAt,
          pausedAt: state.pausedAt,
          endedAt: null,
          pausedElapsedMs: state.pausedElapsedMs,
          intervalSec: state.intervalSec,
          serverTime: state.serverTime,
        }
      : null,
  );

  // Cargar cartones del usuario al entrar / refrescar tras compra
  const loadTickets = useCallback(async () => {
    if (!roomId) return;
    try {
      const d = await apiFetch<{ tickets: MyTicket[] }>(`/api/rooms/${roomId}/tickets`);
      setTickets(d.tickets);
    } catch {
      /* ignore */
    }
  }, [roomId]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Refrescar cartones cuando cambia el estado (para actualizar status tras claim)
  useEffect(() => {
    if (state) loadTickets();
  }, [state?.status, state?.revealedCount, state, loadTickets]);

  const drawnSet = useMemo(() => new Set(state?.drawn ?? []), [state?.drawn]);
  const lastBuyQty = tickets.findLast?.((t) => t.purchase)?.purchase?.quantity ?? buyQty;

  // Detección de bolilla nueva → voz + háptica
  const prevDrawnRef = useRef<number[]>([]);
  useEffect(() => {
    if (!state) return;
    const prev = prevDrawnRef.current;
    const curr = state.drawn;
    if (curr.length > prev.length) {
      const newBall = curr[curr.length - 1];
      const letter = letterForBall(newBall);
      if (letter) {
        speak(`${letter}, ${newBall}`, { rate: 0.9, pitch: 1.1 });
        vibrate(45);
      }
    }
    prevDrawnRef.current = curr;
  }, [state?.drawn, speak, vibrate]);

  // Detección de victoria propia → confeti + háptica larga
  const prevMyWinsRef = useRef(0);
  useEffect(() => {
    if (!state || !user) return;
    const myValidClaims = state.claims.filter(
      (c) => c.userId === user.id && c.valid,
    ).length;
    if (myValidClaims > prevMyWinsRef.current) {
      setConfettiKey((k) => k + 1);
      vibrate([120, 60, 120, 60, 200]);
      speak("¡Felicitaciones! Ganaste", { rate: 1 });
    }
    prevMyWinsRef.current = myValidClaims;
  }, [state?.claims, user, vibrate, speak]);

  // Poll instantáneo cuando el reloj predice una bolilla que el SSE aún no entregó
  const lastPolledRevealedRef = useRef(0);
  useEffect(() => {
    if (!state || !roomId) return;
    if (clock.revealedCount > state.revealedCount && clock.revealedCount > lastPolledRevealedRef.current) {
      lastPolledRevealedRef.current = clock.revealedCount;
      apiFetch<{ state: PublicRoomState }>(`/api/rooms/${roomId}/state`).catch(() => {});
    }
  }, [clock.revealedCount, state?.revealedCount, roomId]);

  // Acciones
  const handleBuy = async (qty: number) => {
    if (!roomId) return;
    setBusy(true);
    try {
      const d = await apiFetch<{ balance: number }>(`/api/rooms/${roomId}/buy`, {
        method: "POST",
        body: JSON.stringify({ quantity: qty }),
      });
      refreshBalance(d.balance);
      await loadTickets();
      toast.success(`${qty} cartón(es) comprado(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al comprar");
    } finally {
      setBusy(false);
    }
  };

  const handleClaim = async (ticketId: string, type: "LINE" | "CORNERS" | "BINGO") => {
    if (!roomId) return;
    try {
      const d = await apiFetch<{ valid: boolean; prizeAwarded: number; reason: string | null }>(
        `/api/rooms/${roomId}/claim`,
        { method: "POST", body: JSON.stringify({ ticketId, type }) },
      );
      if (d.valid) {
        toast.success(`¡${type === "LINE" ? "Línea" : type === "CORNERS" ? "Esquinas" : "Bingo"} válida! +${d.prizeAwarded} créditos`);
        const me = await apiFetch<{ user: { balance: number } | null }>("/api/auth/me");
        if (me.user) refreshBalance(me.user.balance);
      } else {
        toast.error(d.reason ?? "Reclamo inválido");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reclamar");
    }
  };

  const hostAction = async (action: "start" | "resume" | "reset") => {
    if (!roomId) return;
    try {
      await apiFetch(`/api/rooms/${roomId}/${action}`, { method: "POST" });
      toast.success(action === "start" ? "Sorteo iniciado" : action === "resume" ? "Sorteo reanudado" : "Sala reiniciada");
      await loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  // Cartones ordenados por cercanía de victoria (ganadores primero, luego a 1 bolilla…)
  const sortedTickets = useMemo(() => {
    return [...tickets]
      .map((t) => {
        const grid = normalizeGrid(t.grid);
        const progress = computeCardProgress(grid, drawnSet);
        const won = t.status.startsWith("WON_") ? 0 : progress.bestMissing || 99;
        return { ticket: t, sortKey: won };
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((x) => x.ticket);
  }, [tickets, drawnSet]);

  if (!roomId) return null;

  const isHost = state && user && state.hostId === user.id;
  const currentBall = state?.drawn?.[state.drawn.length - 1] ?? null;
  const currentLetter = currentBall ? letterForBall(currentBall) : null;
  const secsToNext = clock.msToNext !== null ? Math.ceil(clock.msToNext / 1000) : null;

  return (
    <div className="felt-bg min-h-[calc(100vh-3.5rem)] pb-4">
      {confettiKey > 0 && <Confetti key={confettiKey} />}

      <div className="mx-auto max-w-3xl space-y-4 px-3 py-4">
        {/* Barra de sala */}
        <div className="flex items-center justify-between">
          <button onClick={closeRoom} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Salir
          </button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono font-black text-gold">{roomToken}</Badge>
            {voiceSupported && (
              <button
                onClick={toggleVoice}
                className={`rounded-md p-1.5 ${voiceEnabled ? "text-gold" : "text-muted-foreground"}`}
                aria-label="Locutor de voz"
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {loading && !state ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : state ? (
          <>
            {/* Bolillero */}
            <div className="rounded-2xl border border-border/40 bg-card/80 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Bolilla actual</div>
                  {currentBall !== null && currentLetter ? (
                    <div className="mt-1 flex items-center gap-3">
                      <div
                        key={currentBall}
                        className={`ball-pop flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black shadow-lg ball-${currentLetter}`}
                      >
                        {currentBall}
                      </div>
                      <div>
                        <div className="text-3xl font-black text-gold">{currentLetter}</div>
                        <div className="text-xs text-muted-foreground">Revelada #{state.revealedCount}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-muted-foreground">
                      {state.status === "WAITING" ? "Esperando inicio del sorteo…" : "—"}
                    </div>
                  )}
                </div>

                {/* Countdown + termómetro */}
                <div className="text-right">
                  {state.status === "RUNNING" && secsToNext !== null && secsToNext > 0 ? (
                    <>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Próxima en</div>
                      <div className="text-2xl font-black tabular-nums text-gold">{secsToNext}s</div>
                    </>
                  ) : state.status === "PAUSED" ? (
                    <Badge className="bg-amber-500/20 text-amber-300">Pausada</Badge>
                  ) : state.status === "ENDED" ? (
                    <Badge variant="destructive">Finalizada</Badge>
                  ) : null}
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3 text-gold" />
                    {state.nearMissCount} a 1 bolilla
                  </div>
                </div>
              </div>

              {/* Historial de bolillas */}
              {state.drawn.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {state.drawn.slice(-20).map((n, i) => {
                    const l = letterForBall(n);
                    return (
                      <div
                        key={`${n}-${i}`}
                        className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold ball-${l} ${
                          i === state.drawn.slice(-20).length - 1 ? "ring-2 ring-gold" : ""
                        }`}
                      >
                        {l}-{n}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Controles de host */}
            {isHost && (
              <div className="flex flex-wrap gap-2 rounded-xl border border-border/40 bg-card/60 p-2">
                {state.status === "WAITING" && (
                  <Button onClick={() => hostAction("start")} size="sm" className="gap-1">
                    <Play className="h-4 w-4" /> Iniciar sorteo
                  </Button>
                )}
                {state.status === "PAUSED" && (
                  <Button onClick={() => hostAction("resume")} size="sm" className="gap-1">
                    <Play className="h-4 w-4" /> Reanudar
                  </Button>
                )}
                {(state.status === "ENDED" || state.status === "RUNNING" || state.status === "PAUSED") && (
                  <Button onClick={() => hostAction("reset")} size="sm" variant="outline" className="gap-1">
                    <RotateCcw className="h-4 w-4" /> Reiniciar ronda
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <Bell className="h-3 w-3" /> {state.participants.length} jugadores
                </div>
              </div>
            )}

            {/* Compra de cartones */}
            {state.status === "WAITING" && (
              <div className="rounded-xl border border-border/40 bg-card/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-bold">Comprar cartones</div>
                    <div className="text-xs text-muted-foreground">
                      {state.cardPrice} cr. c/u · Premios: Línea {state.prizes.line} · Esquinas {state.prizes.corners} · Bingo {state.prizes.bingo}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {[1, 2, 4, 6].map((q) => (
                    <button
                      key={q}
                      onClick={() => setBuyQty(q)}
                      className={`rounded-md px-3 py-1.5 text-sm font-bold ${
                        buyQty === q ? "bg-primary text-primary-foreground" : "bg-secondary/60"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                  <Button onClick={() => handleBuy(buyQty)} disabled={busy} className="ml-auto" size="sm">
                    {busy ? "…" : `Comprar ${buyQty} (${buyQty * state.cardPrice})`}
                  </Button>
                </div>
              </div>
            )}

            {/* Re-compra 1 toque tras finalizar */}
            {state.status === "ENDED" && (
              <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-center">
                <div className="text-sm font-bold text-gold">Partida finalizada · Ronda {state.currentRound}</div>
                {isHost ? (
                  <Button onClick={() => hostAction("reset")} size="sm" className="mt-2 gap-1">
                    <RotateCcw className="h-4 w-4" /> Reiniciar y abrir nueva ronda
                  </Button>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Esperando que el anfitrión reinicie… podrás re-comprar en 1 toque.
                  </div>
                )}
              </div>
            )}
            {state.status === "WAITING" && tickets.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Re-compra rápida</span>
                <Button
                  onClick={() => handleBuy(lastBuyQty)}
                  disabled={busy}
                  size="sm"
                  variant="outline"
                >
                  Repetir {lastBuyQty} cartón(es)
                </Button>
              </div>
            )}

            {/* Cartones del jugador */}
            {sortedTickets.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">Tus cartones ({sortedTickets.length})</h3>
                  <span className="text-[0.7rem] text-muted-foreground">Ordenados por cercanía</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {sortedTickets.map((t, i) => (
                    <BingoCard
                      key={t.id}
                      grid={t.grid}
                      drawn={drawnSet}
                      status={t.status}
                      index={i}
                      claimable={state.status === "RUNNING" || state.status === "PAUSED"}
                      onClaim={(type) => handleClaim(t.id, type)}
                    />
                  ))}
                </div>
              </div>
            ) : state.status !== "WAITING" ? (
              <div className="rounded-xl border border-dashed border-border/40 bg-card/50 p-6 text-center text-sm text-muted-foreground">
                No tienes cartones en esta partida. {state.status === "ENDED" && "Espera a la próxima ronda."}
              </div>
            ) : null}

            {/* Premios cantados (claims válidos) */}
            {state.claims.filter((c) => c.valid).length > 0 && (
              <div className="rounded-xl border border-gold/30 bg-card/60 p-3">
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gold">Premios cantados</div>
                <div className="space-y-1">
                  {state.claims.filter((c) => c.valid).slice(0, 8).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span>{c.userName} — {c.type === "LINE" ? "Línea" : c.type === "CORNERS" ? "Esquinas" : "Bingo"}</span>
                      <Badge variant="secondary" className="text-gold">+{c.prizeAwarded}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : error ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>
        ) : null}
      </div>
    </div>
  );
}
