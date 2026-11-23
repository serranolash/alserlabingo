"use client";
// La Fábrica Loca — tycoon persistente de puntos.
// Cintas transportadoras animadas, máquinas con engranajes, contador de goods,
// incendio, comprar máquinas, vender producción, reparar averías, estado "Sin puntos".
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Factory, Flame, Gift, Package, Wrench, Zap } from "lucide-react";

interface MachineSpec {
  type: string; label: string; emoji: string; cost: number;
  production: number; breakChance: number; repairCost: number; color: string;
}
interface FactoryMachine {
  id: string; machineType: string; label: string; emoji: string;
  color: string; broken: boolean; production: number;
}
interface FactoryState {
  factory: {
    id: string; accumulatedGoods: number; totalSold: number;
    machineCount: number; brokenCount: number; activeCount: number;
    productionPerTurn: number; potentialPoints: number;
    turnsPending: number; nextTurnIn: number;
  } | null;
  machines: FactoryMachine[];
  catalog: MachineSpec[];
  points: number;
  canClaimDaily: boolean;
  lastFire: boolean;
}

export function FactoryView() {
  const { user, setView, refreshPoints } = useApp();
  const [state, setState] = useState<FactoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fireFlash, setFireFlash] = useState(false);
  const prevFireRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ state: FactoryState }>("/api/fabrica/state");
      setState(d.state);
      if (d.state) refreshPoints(d.state.points);
      if (d.state?.lastFire && !prevFireRef.current) {
        setFireFlash(true);
        setTimeout(() => setFireFlash(false), 2000);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(200);
      }
      prevFireRef.current = d.state?.lastFire ?? false;
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [refreshPoints]);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  const handleBuy = async (type: string) => {
    setBusy(true);
    try {
      const d = await apiFetch<{ points: number; machineSpec: MachineSpec }>("/api/fabrica/buy-machine", {
        method: "POST", body: JSON.stringify({ machineType: type }),
      });
      refreshPoints(d.points);
      toast.success(`¡${d.machineSpec.emoji} ${d.machineSpec.label} comprada!`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  };

  const handleSell = async () => {
    setBusy(true);
    try {
      const d = await apiFetch<{ points: number; sold: number }>("/api/fabrica/sell-production", { method: "POST" });
      refreshPoints(d.points);
      toast.success(`¡Vendiste producción por +${d.sold} pts!`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  };

  const handleRepair = async (machineId: string) => {
    setBusy(true);
    try {
      const d = await apiFetch<{ points: number }>("/api/fabrica/repair-machine", {
        method: "POST", body: JSON.stringify({ machineId }),
      });
      refreshPoints(d.points);
      toast.success("¡Máquina reparada!");
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

  const f = state?.factory;
  const points = state?.points ?? user.points ?? 0;
  const machines = state?.machines ?? [];
  const catalog = state?.catalog ?? [];

  return (
    <div className="felt-bg min-h-[calc(100vh-3.5rem)] pb-6">
      <div className="mx-auto max-w-md space-y-3 px-3 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setView("lobby")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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
          <h1 className="text-2xl font-black text-gold flex items-center justify-center gap-1.5">
            <Factory className="h-6 w-6 text-orange-400" /> La Fábrica Loca
          </h1>
          <p className="text-xs text-muted-foreground">Compra máquinas · Produce goods · Vende por puntos</p>
        </div>

        {/* Flash de incendio */}
        {fireFlash && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-600/30 pointer-events-none">
            <div className="text-6xl">🔥🏭🔥</div>
          </div>
        )}

        {/* Panel de fábrica: goods acumulados + producción */}
        <Card className="border-orange-500/30 bg-card/80">
          <CardContent className="space-y-3 py-4">
            {/* Goods acumulados + cinta transportadora */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-400" />
                <div>
                  <div className="text-2xl font-black text-orange-400 tabular-nums">{f?.accumulatedGoods ?? 0}</div>
                  <div className="text-[0.65rem] text-muted-foreground">goods acumulados</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gold">= {f?.potentialPoints ?? 0} pts</div>
                <div className="text-[0.65rem] text-muted-foreground">al vender</div>
              </div>
            </div>

            {/* Cinta transportadora animada */}
            <div className="relative h-8 overflow-hidden rounded-md bg-secondary/30">
              <div className="absolute inset-0 flex items-center">
                {machines.length > 0 ? (
                  <div className="flex gap-1 whitespace-nowrap" style={{ animation: "belt 8s linear infinite" }}>
                    {Array.from({ length: 20 }).map((_, i) => (
                      <span key={i} className="text-lg">📦</span>
                    ))}
                  </div>
                ) : (
                  <span className="mx-auto text-xs text-muted-foreground">Compra máquinas para empezar a producir</span>
                )}
              </div>
            </div>

            {/* Stats de fábrica */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary/30 p-2">
                <div className="text-lg font-bold text-emerald-400">{f?.activeCount ?? 0}</div>
                <div className="text-[0.6rem] text-muted-foreground">activas</div>
              </div>
              <div className="rounded-lg bg-secondary/30 p-2">
                <div className="text-lg font-bold text-red-400">{f?.brokenCount ?? 0}</div>
                <div className="text-[0.6rem] text-muted-foreground">averiadas</div>
              </div>
              <div className="rounded-lg bg-secondary/30 p-2">
                <div className="text-lg font-bold text-gold">{f?.productionPerTurn ?? 0}</div>
                <div className="text-[0.6rem] text-muted-foreground">goods/turno</div>
              </div>
            </div>

            {/* Próximo turno countdown */}
            {f && f.machineCount > 0 && (
              <div className="text-center text-xs text-muted-foreground">
                Próximo turno en {Math.ceil((f.nextTurnIn || 0) / 1000)}s · Cada 30s tus máquinas producen
              </div>
            )}

            {/* Botón VENDER producción */}
            <Button
              onClick={handleSell}
              disabled={busy || (f?.potentialPoints ?? 0) <= 0}
              className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700"
            >
              {busy ? "…" : `💰 Vender producción (${f?.potentialPoints ?? 0} pts)`}
            </Button>
          </CardContent>
        </Card>

        {/* Estado: Sin puntos */}
        {points === 0 && (
          <Card className="border-emerald-600/40 bg-emerald-600/10">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <Gift className="h-10 w-10 text-emerald-400" />
              <div className="text-base font-bold text-emerald-400">¡Te quedaste sin puntos!</div>
              <div className="text-sm text-muted-foreground">
                {state?.canClaimDaily
                  ? "Reclama tu bono diario gratis de +300 puntos para comprar máquinas."
                  : "Invita amigos por WhatsApp para ganar +500 puntos."}
              </div>
              {state?.canClaimDaily && (
                <Button onClick={handleDaily} disabled={busy} className="gap-2 bg-emerald-600 text-white h-12 text-base">
                  <Gift className="h-5 w-5" /> Reclamar +300 puntos gratis
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Máquinas instaladas */}
        {machines.length > 0 && (
          <Card className="bg-card/80">
            <CardContent className="py-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Tus Máquinas</div>
              <div className="grid grid-cols-2 gap-2">
                {machines.map((m) => (
                  <div
                    key={m.id}
                    className={`relative rounded-lg border p-2 ${m.broken ? "border-red-600/40 bg-red-600/10" : "border-border/40 bg-secondary/20"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xl" style={{ filter: m.broken ? "grayscale(1) opacity(0.5)" : "none" }}>
                        {m.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold" style={{ color: m.broken ? "#ef4444" : m.color }}>
                          {m.label}
                        </div>
                        <div className="text-[0.6rem] text-muted-foreground">
                          {m.broken ? "⚠️ Averiada" : `+${m.production} goods/turno`}
                        </div>
                      </div>
                    </div>
                    {/* Engranajes giratorios (solo si activa) */}
                    {!m.broken && (
                      <div className="absolute right-1 top-1 text-xs opacity-40" style={{ animation: "spin 2s linear infinite" }}>⚙️</div>
                    )}
                    {m.broken && (
                      <Button
                        size="sm"
                        onClick={() => handleRepair(m.id)}
                        disabled={busy}
                        className="mt-1.5 h-7 w-full gap-1 text-[0.65rem] bg-orange-600 text-white"
                      >
                        <Wrench className="h-3 w-3" /> Reparar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Catálogo: comprar máquinas */}
        <Card className="bg-card/80">
          <CardContent className="py-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gold">Comprar Máquinas</div>
            <div className="space-y-2">
              {catalog.map((spec) => (
                <button
                  key={spec.type}
                  onClick={() => handleBuy(spec.type)}
                  disabled={busy || points < spec.cost}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/40 bg-secondary/20 p-2.5 text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{spec.emoji}</span>
                    <div>
                      <div className="text-sm font-bold" style={{ color: spec.color }}>{spec.label}</div>
                      <div className="text-[0.65rem] text-muted-foreground">
                        +{spec.production} goods/turno · {(spec.breakChance * 100).toFixed(0)}% avería · 🔧 {spec.repairCost} pts
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-lg bg-gold px-2.5 py-1 text-sm font-black text-[#3a1d05]">
                    {spec.cost} pts
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Total vendido históricamente */}
        {f && f.totalSold > 0 && (
          <div className="text-center text-xs text-muted-foreground">
            📊 Total vendido históricamente: {f.totalSold} goods = {Math.floor(f.totalSold / 10)} pts
          </div>
        )}
      </div>

      <style>{`
        @keyframes belt {
          0% { transform: translateX(0); }
          100% { transform: translateX(-200px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
