"use client";
// La Tómbola Caliente — juego gratuito de puntos. Motor determinístico stateless.
// Tómbola animada (dorada→naranja→rojo), multiplicador en vivo, RETIRAR gigante,
// prueba social, ranking semanal, bonus diario, share WhatsApp, audio + vibración.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TombolaStage } from "./TombolaStage";
import {
  ArrowLeft,
  Gift,
  MessageCircle,
  TrendingUp,
  Zap,
} from "lucide-react";

interface TombolaBall {
  type: "mult" | "double" | "bomb";
  label: string;
}
interface TombolaState {
  round: {
    id: string;
    seedHash: string;
    serverSeed: string | null;
    phase: "betting" | "running" | "crashed";
    bettingEndsAt: number;
    startedAt: number;
    crashedAt: number | null;
    ballIndex: number;
    multiplier: number;
    bombIndex: number;
    revealedBalls: TombolaBall[];
    nextRoundIn: number | null;
  } | null;
  myBet: {
    id: string;
    pointsWagered: number;
    status: string;
    cashoutMultiplier: number | null;
    pointsWon: number;
    currentMultiplier: number;
    potentialWin: number;
  } | null;
  bets: Array<{ userId: string; name: string; pointsWagered: number; status: string; cashoutMultiplier: number | null; pointsWon: number }>;
  points: number;
  canClaimDaily: boolean;
  nextDailyIn: number | null;
  weeklyRanking: Array<{ userId: string; name: string; points: number }>;
  referralCode: string | null;
  recentRounds: Array<{ multiplier: number; bombIndex: number }>;
}

export function TombolaView() {
  const { user, setView, refreshPoints } = useApp();
  const [state, setState] = useState<TombolaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [betAmt, setBetAmt] = useState(100);
  const [justCashedOut, setJustCashedOut] = useState(false);
  const [justCrashed, setJustCrashed] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevBallIndexRef = useRef(0);
  const prevPhaseRef = useRef<string>("");

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ state: TombolaState }>("/api/tombola/state");
      setState(d.state);
      if (d.state) refreshPoints(d.state.points);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [refreshPoints]);

  useEffect(() => {
    load();
    const id = setInterval(load, 800);
    return () => clearInterval(id);
  }, [load]);

  // Audio + vibración en eventos de bolilla/fase
  useEffect(() => {
    if (!state?.round) return;
    const phase = state.round.phase;
    const ballIndex = state.round.ballIndex;

    // Nueva bolilla en running
    if (phase === "running" && ballIndex > prevBallIndexRef.current) {
      playTic();
      vibrate(30);
    }
    // Transición a crashed
    if (phase === "crashed" && prevPhaseRef.current !== "crashed") {
      playExplosion();
      vibrate([100, 50, 200]);
      setJustCrashed(true);
      setTimeout(() => setJustCrashed(false), 700);
    }
    prevBallIndexRef.current = ballIndex;
    prevPhaseRef.current = phase;
  }, [state?.round?.phase, state?.round?.ballIndex]);

  const ensureAudio = () => {
    if (!audioCtxRef.current && typeof window !== "undefined" && "AudioContext" in window) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };
  const playTic = () => {
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    o.start(); o.stop(ctx.currentTime + 0.1);
  };
  const playCoin = () => {
    const ctx = ensureAudio();
    if (!ctx) return;
    [1200, 1600].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.08 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.2);
      o.start(ctx.currentTime + i * 0.08); o.stop(ctx.currentTime + i * 0.08 + 0.2);
    });
  };
  const playExplosion = () => {
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sawtooth";
    o.frequency.setValueAtTime(200, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.5);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5);
  };
  const vibrate = (p: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(p); } catch { /* */ }
    }
  };

  const handleBet = async () => {
    setBusy(true);
    try {
      const d = await apiFetch<{ points: number }>("/api/tombola/bet", {
        method: "POST", body: JSON.stringify({ points: betAmt }),
      });
      refreshPoints(d.points);
      toast.success(`Apostaste ${betAmt} puntos`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  };

  const handleCashout = async () => {
    setBusy(true);
    try {
      const d = await apiFetch<{ won: number; multiplier: number; points: number }>("/api/tombola/cashout", { method: "POST" });
      refreshPoints(d.points);
      playCoin();
      vibrate([60, 40, 60, 40, 120]);
      setJustCashedOut(true);
      setTimeout(() => setJustCashedOut(false), 1200);
      toast.success(`¡Retiraste en ${d.multiplier.toFixed(2)}x! +${d.won} puntos`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  };

  const handleDaily = async () => {
    setBusy(true);
    try {
      const d = await apiFetch<{ points: number; awarded: number }>("/api/tombola/daily-bonus", { method: "POST" });
      refreshPoints(d.points);
      toast.success(`¡+${d.awarded} puntos gratis!`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  };

  const shareWhatsApp = () => {
    if (!state?.referralCode) return;
    const url = `${window.location.origin}/?ref=${state.referralCode}`;
    const msg = `🔥 ¡Estoy jugando La Tómbola Caliente en Alserla Bingo! Juega GRATIS y gana puntos. ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (!user) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Inicia sesión para jugar.</div>;
  }

  const round = state?.round;
  const phase = round?.phase ?? "betting";
  const multiplier = round?.multiplier ?? 1.0;
  const myBet = state?.myBet;
  const points = state?.points ?? user.points ?? 0;

  return (
    <div className="felt-bg min-h-[calc(100vh-3.5rem)] pb-6">
      <div className="mx-auto max-w-md space-y-4 px-3 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setView("lobby")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          <div className="flex items-center gap-2">
            <Badge className="bg-gold text-[#3a1d05] gap-1">
              <Zap className="h-3 w-3" /> {points} pts
            </Badge>
            {state?.canClaimDaily && (
              <Button size="sm" onClick={handleDaily} disabled={busy} className="gap-1 h-8 bg-emerald-600 text-white">
                <Gift className="h-3.5 w-3.5" /> +300
              </Button>
            )}
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black text-gold flex items-center justify-center gap-1.5">
            🔥 La Tómbola Caliente
          </h1>
          <p className="text-xs text-muted-foreground">Juega GRATIS · Retira antes de la BOMBA</p>
        </div>

        {/* Historial de rondas recientes (multiplicadores de crash) */}
        {state && state.recentRounds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {state.recentRounds.slice(0, 12).map((r, i) => (
              <span
                key={i}
                className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold ${
                  r.multiplier >= 3 ? "bg-red-600/30 text-red-400" : r.multiplier >= 1.5 ? "bg-orange-600/30 text-orange-400" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {r.multiplier.toFixed(2)}x
              </span>
            ))}
          </div>
        )}

        {/* Escenario visual premium de La Tómbola */}
        {loading ? (
          <div className="flex h-80 items-center justify-center rounded-xl border border-gold/20 bg-card/60 text-muted-foreground">Cargando…</div>
        ) : round ? (
          <TombolaStage
            phase={round.phase}
            multiplier={round.multiplier}
            ballIndex={round.ballIndex}
            bettingEndsAt={round.bettingEndsAt}
            nextRoundIn={round.nextRoundIn}
            justCashedOut={justCashedOut}
            justCrashed={justCrashed}
          />
        ) : null}

        {/* Bolillas reveladas */}
        {round && round.revealedBalls.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1">
            {round.revealedBalls.map((b, i) => (
              <span
                key={i}
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  b.type === "bomb"
                    ? "bg-red-600 text-white"
                    : b.type === "double"
                      ? "bg-purple-500 text-white"
                      : "bg-gold text-[#3a1d05]"
                }`}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Controles de apuesta / retiro */}
        {round && phase === "betting" && (
          <Card className="bg-card/80">
            <CardContent className="space-y-3 py-4">
              {!myBet || myBet.status !== "active" ? (
                <>
                  <div className="text-center text-sm font-bold">Elige tu apuesta</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[50, 100, 250, 500].map((v) => (
                      <button
                        key={v}
                        onClick={() => setBetAmt(v)}
                        className={`rounded-lg py-2 text-sm font-bold ${betAmt === v ? "bg-gold text-[#3a1d05]" : "bg-secondary/60"}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <Button onClick={handleBet} disabled={busy || points < betAmt} className="w-full h-12 text-base font-bold">
                    {busy ? "…" : `Apostar ${betAmt} puntos`}
                  </Button>
                </>
              ) : (
                <div className="text-center text-sm">
                  <div className="font-bold text-gold">Apostaste {myBet.pointsWagered} pts</div>
                  <div className="text-xs text-muted-foreground">Esperando que inicie el sorteo…</div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* RETIRAR gigante — pulso urgente que se acelera con el multiplicador */}
        {round && phase === "running" && myBet?.status === "active" && (
          <button
            onClick={handleCashout}
            disabled={busy}
            className={`retire-urgent w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 py-6 text-center text-white shadow-xl active:scale-95 ${multiplier >= 3 ? "ring-4 ring-red-500/40" : ""}`}
          >
            <div className="text-2xl font-black">¡RETIRAR PUNTOS!</div>
            <div className="text-lg font-bold">{myBet.potentialWin} pts @ {myBet.currentMultiplier.toFixed(2)}x</div>
          </button>
        )}

        {/* Mi resultado */}
        {myBet && (myBet.status === "cashed_out" || myBet.status === "busted") && (
          <Card className={myBet.status === "cashed_out" ? "border-emerald-600/40 bg-emerald-600/5" : "border-red-600/40 bg-red-600/5"}>
            <CardContent className="py-3 text-center">
              {myBet.status === "cashed_out" ? (
                <div className="text-emerald-400">
                  ✅ Retiraste en {myBet.cashoutMultiplier?.toFixed(2)}x · <b>+{myBet.pointsWon} pts</b>
                </div>
              ) : (
                <div className="text-red-400">💥 BOMBA · perdiste {myBet.pointsWagered} pts</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bonus diario (si no está disponible, mostrar countdown) */}
        {state && !state.canClaimDaily && state.nextDailyIn !== null && (
          <div className="text-center text-xs text-muted-foreground">
            Próximo bonus gratis en {Math.ceil(state.nextDailyIn / 60000)} min
          </div>
        )}

        {/* Prueba social */}
        {state && state.bets.length > 0 && (
          <Card className="bg-card/80">
            <CardContent className="py-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">En esta ronda</div>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {state.bets.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate">{b.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">{b.pointsWagered} pts</span>
                      {b.status === "cashed_out" && <Badge className="bg-emerald-600 text-white text-[0.6rem]">{b.cashoutMultiplier?.toFixed(2)}x</Badge>}
                      {b.status === "busted" && <Badge variant="destructive" className="text-[0.6rem]">💥</Badge>}
                      {b.status === "active" && <Badge variant="secondary" className="text-[0.6rem]">en juego</Badge>}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ranking semanal + share */}
        <div className="grid grid-cols-1 gap-3">
          <Card className="bg-card/80">
            <CardContent className="py-3">
              <div className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-gold">
                <TrendingUp className="h-3.5 w-3.5" /> Top 10 de la Semana
              </div>
              {state && state.weeklyRanking.length > 0 ? (
                <div className="space-y-1">
                  {state.weeklyRanking.map((r, i) => (
                    <div key={r.userId} className="flex items-center justify-between text-xs">
                      <span><b className="text-gold">{i + 1}.</b> {r.name}</span>
                      <span className="font-bold">{r.points} pts</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-xs text-muted-foreground">Sé el primero esta semana</div>
              )}
            </CardContent>
          </Card>

          <Button onClick={shareWhatsApp} className="h-12 gap-2 bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700">
            <MessageCircle className="h-5 w-5" /> 📲 Retar amigos por WhatsApp
          </Button>
        </div>

        {/* Verificación provably fair */}
        {round?.serverSeed && (
          <div className="rounded-lg bg-secondary/30 p-2 text-center text-[0.65rem] text-muted-foreground">
            Seed: <span className="font-mono">{round.serverSeed.slice(0, 16)}…</span> · Hash: <span className="font-mono">{round.seedHash.slice(0, 16)}…</span>
            <div>Verificable: SHA-256(seed) = hash</div>
          </div>
        )}
      </div>
    </div>
  );
}
