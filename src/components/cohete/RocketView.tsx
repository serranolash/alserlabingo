"use client";
// El Cohete Criollo — vista del juego. Cohete SVG que asciende por un cielo
// estrellado animado (canvas), estela de chispas, paracaídas al saltar,
// explosión de fuegos artificiales, audio Web Audio API + vibración háptica.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Gift, MessageCircle, Rocket, TrendingUp, Zap } from "lucide-react";

interface RocketState {
  round: {
    id: string;
    seedHash: string;
    serverSeed: string | null;
    phase: "betting" | "flying" | "crashed";
    crashMultiplier: number;
    bettingEndsAt: number;
    startedAt: number;
    crashedAt: number | null;
    currentMult: number;
    nextRoundIn: number | null;
  } | null;
  myBet: {
    id: string;
    pointsWagered: number;
    autoCashoutAt: number | null;
    status: string;
    cashoutMultiplier: number | null;
    pointsWon: number;
    currentMult: number;
    potentialWin: number;
  } | null;
  bets: Array<{ userId: string; name: string; pointsWagered: number; status: string; cashoutMultiplier: number | null; pointsWon: number }>;
  points: number;
  canClaimDaily: boolean;
  nextDailyIn: number | null;
  recentFlights: Array<{ crashMultiplier: number }>;
}

export function RocketView() {
  const { user, setView, refreshPoints } = useApp();
  const [state, setState] = useState<RocketState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [betAmt, setBetAmt] = useState(100);
  const [autoCashout, setAutoCashout] = useState<number | "">("");
  const [jumpedNames, setJumpedNames] = useState<Array<{ name: string; pts: number; mult: number }>>([]);
  const [showExplosion, setShowExplosion] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevPhaseRef = useRef("");
  const prevBetCountRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Array<{ x: number; y: number; z: number; size: number }>>([]);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ state: RocketState }>("/api/cohete/state");
      setState(d.state);
      if (d.state) refreshPoints(d.state.points);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [refreshPoints]);

  useEffect(() => {
    load();
    const id = setInterval(load, 500);
    return () => clearInterval(id);
  }, [load]);

  // Detectar nuevos saltos para mostrar paracaídas
  useEffect(() => {
    if (!state?.bets) return;
    const jumped = state.bets.filter((b) => b.status === "jumped");
    if (jumped.length > prevBetCountRef.current) {
      const newJumps = jumped.slice(prevBetCountRef.current);
      newJumps.forEach((b) => {
        if (b.cashoutMultiplier) {
          setJumpedNames((prev) => [...prev, { name: b.name, pts: b.pointsWon, mult: b.cashoutMultiplier! }]);
          playParachute();
          setTimeout(() => setJumpedNames((prev) => prev.filter((j) => j.name !== b.name || j.pts !== b.pointsWon)), 3000);
        }
      });
    }
    prevBetCountRef.current = jumped.length;
  }, [state?.bets]);

  // Detectar transición a crashed -> explosión
  useEffect(() => {
    if (!state?.round) return;
    if (state.round.phase === "crashed" && prevPhaseRef.current !== "crashed") {
      setShowExplosion(true);
      playExplosion();
      vibrate(200);
      setTimeout(() => setShowExplosion(false), 2500);
    }
    prevPhaseRef.current = state.round.phase;
  }, [state?.round?.phase]);

  // Canvas: cielo estrellado animado
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Inicializar estrellas
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 60; i++) {
        starsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          z: Math.random() * 0.8 + 0.2,
          size: Math.random() * 2 + 0.5,
        });
      }
    }

    let raf = 0;
    const render = () => {
      const mult = state?.round?.currentMult ?? 1;
      const speed = Math.min(3, mult * 0.15);
      ctx.fillStyle = "rgb(8, 12, 24)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      starsRef.current.forEach((s) => {
        s.y += s.z * speed;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
        ctx.fillStyle = `rgba(255,255,255,${s.z})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      });
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [state?.round?.currentMult]);

  // Audio helpers
  const ensureAudio = () => {
    if (!audioCtxRef.current && typeof window !== "undefined" && "AudioContext" in window) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };
  const playWhistle = () => {
    const ctx = ensureAudio(); if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.setValueAtTime(400, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(); o.stop(ctx.currentTime + 0.3);
  };
  const playParachute = () => {
    const ctx = ensureAudio(); if (!ctx) return;
    [800, 1100, 1400].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = f;
      g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.06 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.18);
      o.start(ctx.currentTime + i * 0.06); o.stop(ctx.currentTime + i * 0.06 + 0.18);
    });
  };
  const playExplosion = () => {
    const ctx = ensureAudio(); if (!ctx) return;
    // Boom
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = "sawtooth";
    o.frequency.setValueAtTime(150, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.6);
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.start(); o.stop(ctx.currentTime + 0.6);
    // Fuegos artificiales (chispas)
    for (let i = 0; i < 8; i++) {
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.frequency.value = 2000 + Math.random() * 2000;
      g2.gain.setValueAtTime(0.001, ctx.currentTime + 0.2 + i * 0.08);
      g2.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.2 + i * 0.08 + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2 + i * 0.08 + 0.1);
      o2.start(ctx.currentTime + 0.2 + i * 0.08); o2.stop(ctx.currentTime + 0.2 + i * 0.08 + 0.1);
    }
  };
  const vibrate = (p: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) { try { navigator.vibrate(p); } catch {} }
  };

  const handleBet = async () => {
    setBusy(true);
    try {
      const auto = autoCashout === "" ? undefined : Number(autoCashout);
      const d = await apiFetch<{ points: number }>("/api/cohete/bet", {
        method: "POST", body: JSON.stringify({ points: betAmt, autoCashoutAt: auto }),
      });
      refreshPoints(d.points);
      toast.success(`¡Apuesta de ${betAmt} pts lista!`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  };

  const handleJump = async () => {
    setBusy(true);
    try {
      const d = await apiFetch<{ won: number; multiplier: number; points: number }>("/api/cohete/jump", { method: "POST" });
      refreshPoints(d.points);
      playParachute();
      vibrate([60, 40, 100]);
      toast.success(`¡Saltaste en ${d.multiplier.toFixed(2)}x! +${d.won} pts`);
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

  if (!user) return <div className="py-20 text-center text-sm text-muted-foreground">Inicia sesión para jugar.</div>;

  const round = state?.round;
  const phase = round?.phase ?? "betting";
  const mult = round?.currentMult ?? 1.0;
  const myBet = state?.myBet;
  const points = state?.points ?? user.points ?? 0;

  // Color del cohete según multiplicador
  const rocketColor = mult >= 5 ? "#ef4444" : mult >= 2.5 ? "#f97316" : mult >= 1.5 ? "#f59e0b" : "#fbbf24";
  // Posición del cohete (asciende con el multiplicador)
  const riseY = Math.min(75, Math.max(0, (mult - 1) * 12));
  // Curva luminosa (trayectoria)
  const curvePath = `M 50,${280 - riseY * 2.5} Q ${50 + riseY * 1.2},${280 - riseY * 2.5 - riseY * 0.8} ${50 + riseY * 2},${280 - riseY * 3.5}`;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#080c18] pb-6">
      <div className="mx-auto max-w-md space-y-3 px-3 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setView("lobby")} className="flex items-center gap-1 text-sm text-white/60 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          <div className="flex items-center gap-2">
            <Badge className="bg-gold text-[#3a1d05] gap-1"><Zap className="h-3 w-3" /> {points} pts</Badge>
            {state?.canClaimDaily && (
              <Button size="sm" onClick={handleDaily} disabled={busy} className="gap-1 h-8 bg-emerald-600 text-white">
                <Gift className="h-3.5 w-3.5" /> +300
              </Button>
            )}
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black text-white flex items-center justify-center gap-1.5">
            <Rocket className="h-6 w-6 text-orange-400" /> El Cohete Criollo
          </h1>
          <p className="text-xs text-white/40">Salta antes de que explote 🚀💥</p>
        </div>

        {/* Historial de vuelos */}
        {state && state.recentFlights.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {state.recentFlights.slice(0, 10).map((f, i) => (
              <span key={i} className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${
                f.crashMultiplier >= 3 ? "bg-red-600/30 text-red-400" : f.crashMultiplier >= 1.5 ? "bg-orange-600/30 text-orange-400" : "bg-white/10 text-white/40"
              }`}>
                {f.crashMultiplier.toFixed(2)}x
              </span>
            ))}
          </div>
        )}

        {/* Escenario principal: cielo estrellado + cohete */}
        <div className="relative h-72 overflow-hidden rounded-xl border border-white/10">
          {/* Canvas de estrellas en movimiento */}
          <canvas ref={canvasRef} width={400} height={288} className="absolute inset-0 h-full w-full" />

          {/* Curva luminosa de trayectoria */}
          {phase !== "betting" && (
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 288" preserveAspectRatio="none">
              <path d={curvePath} fill="none" stroke={rocketColor} strokeWidth="2" opacity="0.4" strokeDasharray="4 4" />
              <path d={curvePath} fill="none" stroke={rocketColor} strokeWidth="1" opacity="0.8" />
            </svg>
          )}

          {/* Estela de chispas (durante el vuelo) */}
          {phase === "flying" && (
            <div className="absolute" style={{ left: `${10 + riseY * 0.5}%`, bottom: `${riseY}%` }}>
              <div className="relative">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: `${3 + Math.random() * 4}px`,
                      height: `${3 + Math.random() * 4}px`,
                      left: `${Math.random() * 30 - 15}px`,
                      bottom: `${-10 - Math.random() * 20}px`,
                      background: rocketColor,
                      opacity: 0.8 - Math.random() * 0.4,
                      boxShadow: `0 0 6px ${rocketColor}`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Cohete SVG */}
          <div
            className="absolute left-[10%] transition-all duration-300"
            style={{ bottom: `${riseY}%` }}
          >
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M24 4 L30 20 L24 16 L18 20 Z" fill={rocketColor} />
              <rect x="20" y="16" width="8" height="16" rx="4" fill={rocketColor} />
              <path d="M18 28 L14 36 L20 32 Z" fill="#f97316" />
              <path d="M30 28 L34 36 L28 32 Z" fill="#f97316" />
              <circle cx="24" cy="22" r="3" fill="#fff" opacity="0.9" />
              {/* Llama */}
              {phase === "flying" && (
                <path d="M22 32 L24 44 L26 32 Z" fill="#fbbf24" opacity="0.8" />
              )}
            </svg>
          </div>

          {/* Paracaídas de jugadores que saltaron */}
          {jumpedNames.map((j, i) => (
            <div
              key={i}
              className="absolute flex flex-col items-center"
              style={{
                left: `${20 + i * 15}%`,
                bottom: `${20 + Math.random() * 30}%`,
                animation: "fall 3s ease-in forwards",
              }}
            >
              <span className="text-xs font-bold text-emerald-400">🪂 {j.name}</span>
              <span className="text-[0.6rem] text-white/60">+{j.pts} pts @ {j.mult.toFixed(2)}x</span>
            </div>
          ))}

          {/* Explosión de fuegos artificiales */}
          {showExplosion && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-6xl">🎆💥🎆</div>
            </div>
          )}

          {/* Multiplicador / estado superpuesto */}
          <div className="absolute inset-x-0 top-3 text-center">
            {phase === "betting" && (
              <>
                <div className="text-lg font-black text-white">¡Apuesta ahora!</div>
                <div className="text-sm text-white/50">Despegue en {Math.max(0, Math.ceil(((round?.bettingEndsAt ?? Date.now()) - Date.now()) / 1000))}s</div>
              </>
            )}
            {phase === "flying" && (
              <div className="text-4xl font-black tabular-nums" style={{ color: rocketColor, textShadow: `0 0 20px ${rocketColor}` }}>
                {mult.toFixed(2)}x
              </div>
            )}
            {phase === "crashed" && (
              <>
                <div className="text-2xl font-black text-red-500">¡EXPLOTÓ EN {round?.crashMultiplier.toFixed(2)}x!</div>
                {round?.nextRoundIn !== null && (
                  <div className="text-sm text-white/50">Próximo vuelo en {Math.ceil((round?.nextRoundIn ?? 0) / 1000)}s</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Estado: Sin puntos — reclamar bono diario */}
        {points === 0 && (
          <Card className="border-emerald-600/40 bg-emerald-600/10">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <Gift className="h-10 w-10 text-emerald-400" />
              <div className="text-base font-bold text-emerald-400">¡Te quedaste sin puntos!</div>
              <div className="text-sm text-white/60">
                {state?.canClaimDaily
                  ? "Reclama tu bono diario gratis de +300 puntos para seguir jugando."
                  : `Próximo bono en ${Math.ceil((state?.nextDailyIn ?? 0) / 60000)} min. ¡O invita amigos por WhatsApp para ganar +500!`}
              </div>
              {state?.canClaimDaily && (
                <Button onClick={handleDaily} disabled={busy} className="gap-2 bg-emerald-600 text-white h-12 text-base">
                  <Gift className="h-5 w-5" /> Reclamar +300 puntos gratis
                </Button>
              )}
              <Button onClick={() => {
                const url = `${window.location.origin}/?ref=${user?.id ?? ""}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(`🚀 ¡Juega El Cohete Criollo GRATIS en Alserla Bingo! ${url}`)}`, "_blank");
              }} className="gap-2 bg-emerald-600/80 text-white h-10 text-sm">
                <MessageCircle className="h-4 w-4" /> Invitar amigos (+500 pts)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Controles de apuesta */}
        {round && phase === "betting" && (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="space-y-3 py-4">
              {!myBet || myBet.status !== "active" ? (
                <>
                  <div className="text-center text-sm font-bold text-white">Elige tu apuesta</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[50, 100, 250, 500].map((v) => (
                      <button key={v} onClick={() => setBetAmt(v)}
                        className={`rounded-lg py-2 text-sm font-bold ${betAmt === v ? "bg-orange-500 text-white" : "bg-white/10 text-white/60"}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">Auto-salto en:</span>
                    <input
                      type="number" min={1.01} max={100} step={0.1}
                      value={autoCashout}
                      onChange={(e) => setAutoCashout(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="ej. 2.00"
                      className="h-9 w-24 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
                    />
                    <span className="text-xs text-white/50">x (opcional)</span>
                  </div>
                  <Button onClick={handleBet} disabled={busy || points < betAmt} className="w-full h-12 text-base font-bold bg-orange-500 hover:bg-orange-600">
                    {busy ? "…" : `🚀 Apostar ${betAmt} pts`}
                  </Button>
                </>
              ) : (
                <div className="text-center text-sm">
                  <div className="font-bold text-orange-400">¡Apostaste {myBet.pointsWagered} pts! {myBet.autoCashoutAt && `(auto-salto @ ${myBet.autoCashoutAt}x)`}</div>
                  <div className="text-xs text-white/40">Esperando el despegue…</div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Botón SALTO gigante */}
        {round && phase === "flying" && myBet?.status === "active" && (
          <button
            onClick={handleJump}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 py-6 text-center text-white shadow-xl active:scale-95"
            style={{ animation: "retireUrgency 0.9s ease-out infinite" }}
          >
            <div className="text-2xl font-black">🪂 ¡SALTAR AHORA!</div>
            <div className="text-lg font-bold">{myBet.potentialWin} pts @ {myBet.currentMult.toFixed(2)}x</div>
          </button>
        )}

        {/* Mi resultado */}
        {myBet && (myBet.status === "jumped" || myBet.status === "crashed") && (
          <Card className={myBet.status === "jumped" ? "border-emerald-600/40 bg-emerald-600/5" : "border-red-600/40 bg-red-600/5"}>
            <CardContent className="py-3 text-center">
              {myBet.status === "jumped" ? (
                <div className="text-emerald-400">🪂 Saltaste en {myBet.cashoutMultiplier?.toFixed(2)}x · <b>+{myBet.pointsWon} pts</b></div>
              ) : (
                <div className="text-red-400">💥 El cohete explotó · perdiste {myBet.pointsWagered} pts</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prueba social */}
        {state && state.bets.length > 0 && (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="py-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">En este vuelo</div>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {state.bets.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate text-white/80">{b.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-white/40">{b.pointsWagered} pts</span>
                      {b.status === "jumped" && <Badge className="bg-emerald-600 text-white text-[0.6rem]">{b.cashoutMultiplier?.toFixed(2)}x</Badge>}
                      {b.status === "crashed" && <Badge variant="destructive" className="text-[0.6rem]">💥</Badge>}
                      {b.status === "active" && <Badge className="bg-orange-600 text-white text-[0.6rem]">🚀 volando</Badge>}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Share WhatsApp */}
        <Button
          onClick={() => {
            const url = `${window.location.origin}/?ref=${user?.id ?? ""}`;
            const msg = `🚀 ¡Estoy jugando El Cohete Criollo en Alserla Bingo! Salta antes de que explote. Juega GRATIS: ${url}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
          }}
          className="w-full h-12 gap-2 bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
        >
          <MessageCircle className="h-5 w-5" /> 📲 Retar amigos por WhatsApp
        </Button>
      </div>

      <style>{`
        @keyframes fall {
          0% { transform: translateY(-40px); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateY(120px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
