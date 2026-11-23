"use client";
// Metrópoli Express — constructor de ciudades por turnos (5 min).
// Tablero 6×6 interactivo, 3 planos por turno, sinergias visuales, score en vivo,
// ranking entre jugadores, vibración y estado "Sin puntos".
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Building2, Gift, Grid3x3, Timer, Trophy, Zap } from "lucide-react";
import { GRID_SIZE, PIECE_SPECS, type PieceType } from "@/lib/metropoli/engine";

interface MetropoliState {
  game: {
    id: string; status: string; currentTurn: number;
    turnEndsAt: number | null; gameEndsAt: number | null;
    prizePool: number; secondsLeft: number; isFinished: boolean;
    winnerName: string | null;
  } | null;
  myBoard: (string | null)[][];
  myScore: number;
  placedThisTurn: boolean;
  currentPlans: PieceType[];
  players: Array<{ userId: string; name: string; score: number; placed: boolean }>;
  points: number;
  pendingGameId: string | null;
}

export function MetropoliView() {
  const { user, setView, refreshPoints } = useApp();
  const [state, setState] = useState<MetropoliState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState(0);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const prevTurnRef = useRef(-1);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ state: MetropoliState }>("/api/metropoli/state");
      setState(d.state);
      if (d.state) refreshPoints(d.state.points);
      // Detectar cambio de turno
      if (d.state?.game && d.state.game.currentTurn !== prevTurnRef.current) {
        if (prevTurnRef.current >= 0) {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(50);
        }
        prevTurnRef.current = d.state.game.currentTurn;
      }
    } catch { /* */ } finally { setLoading(false); }
  }, [refreshPoints]);

  useEffect(() => {
    load();
    const id = setInterval(load, 1000);
    return () => clearInterval(id);
  }, [load]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/metropoli/create", { method: "POST" });
      toast.success("¡Partida creada! Esperando jugadores...");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  };

  const handleJoin = async (gameId: string) => {
    setBusy(true);
    try {
      await apiFetch("/api/metropoli/join", { method: "POST", body: JSON.stringify({ gameId }) });
      toast.success("Te uniste a la partida");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  };

  const handlePlace = async (row: number, col: number) => {
    setBusy(true);
    try {
      await apiFetch("/api/metropoli/place", {
        method: "POST",
        body: JSON.stringify({ row, col, pieceIndex: selectedPiece }),
      });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  };

  const handleDaily = async () => {
    setBusy(true);
    try {
      const d = await apiFetch<{ points: number; awarded: number }>("/api/tombola/daily-bonus", { method: "POST" });
      refreshPoints(d.points);
      toast.success(`¡+${d.awarded} puntos gratis!`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  };

  if (!user) return <div className="py-20 text-center text-sm text-muted-foreground">Inicia sesión.</div>;

  const g = state?.game;
  const points = state?.points ?? user.points ?? 0;
  const board = state?.myBoard ?? [];
  const plans = state?.currentPlans ?? [];
  const players = state?.players ?? [];
  const isPlaying = g?.status === "playing";
  const isWaiting = g?.status === "waiting";
  const isFinished = g?.isFinished;

  return (
    <div className="felt-bg min-h-[calc(100vh-3.5rem)] pb-6">
      <div className="mx-auto max-w-md space-y-3 px-3 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setView("juegos")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Juegos
          </button>
          <div className="flex items-center gap-2">
            <Badge className="bg-gold text-[#3a1d05] gap-1"><Zap className="h-3 w-3" /> {points} pts</Badge>
            {state?.points === 0 && state?.game?.status !== "playing" && (
              <Button size="sm" onClick={handleDaily} disabled={busy} className="gap-1 h-8 bg-emerald-600 text-white">
                <Gift className="h-3.5 w-3.5" /> +300
              </Button>
            )}
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black text-gold flex items-center justify-center gap-1.5">
            <Building2 className="h-6 w-6 text-cyan-400" /> Metrópoli Express
          </h1>
          <p className="text-xs text-muted-foreground">Construye tu ciudad en 5 min · Sinergias y planos</p>
        </div>

        {/* Sin partida: crear o unirse */}
        {!g && (
          <Card className="border-cyan-500/30 bg-card/80">
            <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
              <Grid3x3 className="h-12 w-12 text-cyan-400" />
              <div className="text-base font-bold">¿Listo para construir?</div>
              <div className="text-sm text-muted-foreground">
                Entra con {50} pts · 12 turnos de 15s · Gana el de mejor ciudad
              </div>
              {state?.pendingGameId && (
                <Button onClick={() => handleJoin(state.pendingGameId!)} disabled={busy || points < 50} className="w-full gap-2 bg-cyan-600 text-white">
                  Unirse a partida ({state.pendingGameId.slice(-6)})
                </Button>
              )}
              <Button onClick={handleCreate} disabled={busy || points < 50} className="w-full gap-2 bg-cyan-600 text-white">
                <Building2 className="h-5 w-5" /> Crear partida (-50 pts)
              </Button>
              {points === 0 && (
                <div className="w-full">
                  <Button onClick={handleDaily} disabled={busy} className="w-full gap-2 bg-emerald-600 text-white">
                    <Gift className="h-5 w-5" /> Reclamar +300 puntos gratis
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Esperando jugadores */}
        {isWaiting && (
          <Card className="border-cyan-500/30 bg-card/80">
            <CardContent className="py-6 text-center">
              <Timer className="mx-auto mb-2 h-8 w-8 text-cyan-400" />
              <div className="text-base font-bold text-cyan-400">Esperando jugadores...</div>
              <div className="text-sm text-muted-foreground mt-1">{players.length} jugador(s) · Comienza en cuanto haya 2+</div>
            </CardContent>
          </Card>
        )}

        {/* Jugando: tablero + planos */}
        {isPlaying && (
          <>
            {/* Info del turno */}
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-bold">Turno {g!.currentTurn + 1}/12</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-gold">{g!.secondsLeft}s</span>
              </div>
            </div>

            {/* Planos del turno */}
            <div className="flex items-center justify-center gap-3">
              {plans.map((p, i) => {
                const spec = PIECE_SPECS[p];
                if (!spec) return null;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedPiece(i)}
                    disabled={state?.placedThisTurn}
                    className={`flex flex-col items-center rounded-xl border-2 p-2 transition-all ${
                      selectedPiece === i ? "border-gold scale-110" : "border-border/40"
                    } ${state?.placedThisTurn ? "opacity-40" : ""}`}
                    style={{ background: `${spec.color}22` }}
                  >
                    <span className="text-3xl">{spec.emoji}</span>
                    <span className="text-xs font-bold" style={{ color: spec.color }}>{spec.label}</span>
                    <span className="text-[0.6rem] text-muted-foreground">{spec.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Tablero 6×6 */}
            <div className="mx-auto w-fit">
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
                {board.map((row, r) =>
                  row.map((cell, c) => {
                    const spec = cell ? PIECE_SPECS[cell as PieceType] : null;
                    const isHover = hoverCell?.[0] === r && hoverCell?.[1] === c;
                    return (
                      <button
                        key={`${r}-${c}`}
                        onClick={() => !cell && !state?.placedThisTurn && handlePlace(r, c)}
                        onMouseEnter={() => setHoverCell([r, c])}
                        onMouseLeave={() => setHoverCell(null)}
                        disabled={!!cell || !!state?.placedThisTurn || busy}
                        className={`flex h-12 w-12 items-center justify-center rounded-md border text-2xl transition-all sm:h-14 sm:w-14 ${
                          cell
                            ? "border-transparent"
                            : isHover
                              ? "border-gold bg-gold/20 scale-105"
                              : "border-border/30 bg-secondary/20 hover:border-gold/50"
                        }`}
                        style={spec ? { background: `${spec.color}33` } : {}}
                      >
                        {spec?.emoji ?? ""}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>

            {/* Score en vivo */}
            <div className="flex items-center justify-between rounded-lg bg-gold/10 px-3 py-2">
              <span className="text-sm font-bold text-gold">🏠 Tu ciudad</span>
              <span className="text-2xl font-black text-gold">{state?.myScore ?? 0} pts</span>
            </div>

            {state?.placedThisTurn && (
              <div className="text-center text-sm text-muted-foreground">
                ✓ Pieza colocada · Espera al próximo turno...
              </div>
            )}

            {/* Prize pool */}
            <div className="text-center text-xs text-muted-foreground">
              🏆 Premio: {g!.prizePool} pts al ganador
            </div>
          </>
        )}

        {/* Resultado final */}
        {isFinished && (
          <Card className={g?.winnerName === user.name ? "border-emerald-600/40 bg-emerald-600/10" : "border-cyan-500/30 bg-card/80"}>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <Trophy className="h-12 w-12 text-gold" />
              <div className="text-xl font-black text-gold">
                {g?.winnerName === user.name ? "¡GANASTE!" : `Ganador: ${g?.winnerName}`}
              </div>
              <div className="text-sm text-muted-foreground">
                Tu score: {state?.myScore ?? 0} · Premio: {g?.prizePool ?? 0} pts
              </div>
              <Button onClick={handleCreate} disabled={busy || points < 50} className="gap-2 bg-cyan-600 text-white">
                <Building2 className="h-5 w-5" /> Nueva partida
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Ranking de jugadores */}
        {players.length > 0 && (
          <Card className="bg-card/80">
            <CardContent className="py-3">
              <div className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Trophy className="h-3.5 w-3.5" /> Jugadores
              </div>
              <div className="space-y-1">
                {players.map((p, i) => (
                  <div key={p.userId} className="flex items-center justify-between text-xs">
                    <span><b className="text-gold">{i + 1}.</b> {p.name} {p.userId === user.id && "(tú)"}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-bold">{p.score}</span>
                      {p.placed ? <Badge className="bg-emerald-600 text-white text-[0.6rem]">✓</Badge> : isPlaying ? <Badge variant="secondary" className="text-[0.6rem]">...</Badge> : null}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sin puntos */}
        {points === 0 && !isPlaying && (
          <Card className="border-emerald-600/40 bg-emerald-600/10">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <Gift className="h-10 w-10 text-emerald-400" />
              <div className="text-base font-bold text-emerald-400">¡Sin puntos!</div>
              <Button onClick={handleDaily} disabled={busy} className="gap-2 bg-emerald-600 text-white h-12">
                <Gift className="h-5 w-5" /> Reclamar +300 gratis
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
