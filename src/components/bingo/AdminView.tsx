"use client";
// Panel de administración: métricas, transferencias pendientes y salas.
import { useCallback, useEffect, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

interface Metrics {
  users: { total: number; players: number; hosts: number; admins: number };
  rooms: { total: number; waiting: number; running: number; paused: number; ended: number };
  economy: { creditsInCirculation: number; totalRecharges: number; pendingTransfers: number };
  recentWins: Array<{ id: string; userName: string; roomToken: string; type: string; prizeAwarded: number; at: string }>;
}

interface TransferRow {
  id: string;
  amount: number;
  paymentMethod: string;
  country: string | null;
  referenceNumber: string;
  note: string | null;
  status: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface AdminRoom {
  id: string;
  token: string;
  status: string;
  hostName: string;
  currentRound: number;
  cardPrice: number;
  prizeLine: number;
  prizeCorners: number;
  prizeBingo: number;
  participants: number;
  tickets: number;
}

export function AdminView() {
  const { user } = useApp();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);

  const loadAll = useCallback(async () => {
    try {
      const [m, t, r] = await Promise.all([
        apiFetch<Metrics>("/api/admin/metrics"),
        apiFetch<{ transfers: TransferRow[] }>("/api/admin/transfers?status=PENDING"),
        apiFetch<{ rooms: AdminRoom[] }>("/api/admin/rooms"),
      ]);
      setMetrics(m);
      setTransfers(t.transfers);
      setRooms(r.rooms);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    const id = setInterval(loadAll, 8000);
    return () => clearInterval(id);
  }, [loadAll]);

  if (user?.role !== "ADMIN") {
    return <div className="py-20 text-center text-sm text-muted-foreground">Acceso denegado</div>;
  }

  const approve = async (id: string) => {
    try {
      const d = await apiFetch<{ credited: boolean; balance?: number; alreadyProcessed?: boolean }>(
        `/api/admin/transfers/${id}/approve`,
        { method: "POST" },
      );
      toast.success(d.credited ? "Transferencia acreditada" : "Ya estaba procesada");
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const reject = async (id: string) => {
    try {
      await apiFetch(`/api/admin/transfers/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: "Rechazado por admin" }) });
      toast.success("Transferencia rechazada");
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <h1 className="flex items-center gap-2 text-xl font-black">
        <span className="rounded bg-gold px-2 py-0.5 text-sm text-[#3a1d05]">ADMIN</span>
        Panel de control
      </h1>

      <Tabs defaultValue="metrics">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="transfers">Transferencias{transfers.length > 0 ? ` (${transfers.length})` : ""}</TabsTrigger>
          <TabsTrigger value="rooms">Salas</TabsTrigger>
        </TabsList>

        {/* Métricas */}
        <TabsContent value="metrics" className="space-y-3">
          {metrics ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Usuarios" value={metrics.users.total} sub={`${metrics.users.players} jugadores`} />
                <Stat label="Salas" value={metrics.rooms.total} sub={`${metrics.rooms.running} activas`} />
                <Stat label="Créditos" value={metrics.economy.creditsInCirculation} sub="en circulación" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Recaudación" value={metrics.economy.totalRecharges} sub="total recargas" />
                <Stat label="Pendientes" value={metrics.economy.pendingTransfers} sub="transferencias" />
                <Stat label="Finalizadas" value={metrics.rooms.ended} sub="salas" />
              </div>
              <Card className="border-border/60 bg-card/80">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Últimos premios cantados</CardTitle></CardHeader>
                <CardContent>
                  {metrics.recentWins.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">Sin premios aún</div>
                  ) : (
                    <div className="space-y-1">
                      {metrics.recentWins.map((w) => (
                        <div key={w.id} className="flex items-center justify-between text-sm">
                          <span>{w.userName} · <Badge variant="secondary" className="text-[0.6rem]">{w.type}</Badge> · {w.roomToken}</span>
                          <span className="font-bold text-gold">+{w.prizeAwarded}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">Cargando…</div>
          )}
        </TabsContent>

        {/* Transferencias */}
        <TabsContent value="transfers" className="space-y-2">
          {transfers.length === 0 ? (
            <Card className="border-dashed border-border/40"><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin transferencias pendientes</CardContent></Card>
          ) : (
            transfers.map((t) => (
              <Card key={t.id} className="border-border/60 bg-card/80">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gold">+{t.amount} cr.</span>
                        <Badge variant="outline" className="text-[0.6rem]">{t.paymentMethod}</Badge>
                        {t.country && <span className="text-xs text-muted-foreground">{t.country}</span>}
                      </div>
                      <div className="mt-1 text-sm">{t.user.name} <span className="text-muted-foreground">({t.user.email})</span></div>
                      <div className="text-xs text-muted-foreground">Ref: {t.referenceNumber}</div>
                      {t.note && <div className="text-xs text-muted-foreground">Nota: {t.note}</div>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" onClick={() => approve(t.id)} className="gap-1 h-8">
                        <Check className="h-3.5 w-3.5" /> Aprobar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject(t.id)} className="gap-1 h-8">
                        <X className="h-3.5 w-3.5" /> Rechazar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Salas */}
        <TabsContent value="rooms" className="space-y-2">
          {rooms.length === 0 ? (
            <Card className="border-dashed border-border/40"><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin salas</CardContent></Card>
          ) : (
            rooms.map((r) => <AdminRoomRow key={r.id} room={r} onSaved={loadAll} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="p-3">
        <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-black tabular-nums text-gold">{value}</div>
        <div className="text-[0.65rem] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function AdminRoomRow({ room, onSaved }: { room: AdminRoom; onSaved: () => void }) {
  const [cardPrice, setCardPrice] = useState(room.cardPrice);
  const [prizeLine, setPrizeLine] = useState(room.prizeLine);
  const [prizeCorners, setPrizeCorners] = useState(room.prizeCorners);
  const [prizeBingo, setPrizeBingo] = useState(room.prizeBingo);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify({ cardPrice, prizeLine, prizeCorners, prizeBingo }),
      });
      toast.success(`Sala ${room.token} actualizada`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = (s: string) =>
    s === "WAITING" ? "Esperando" : s === "RUNNING" ? "En juego" : s === "PAUSED" ? "Pausada" : s === "ENDED" ? "Finalizada" : s;

  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-gold">{room.token}</span>
            <Badge variant="secondary" className="text-[0.6rem]">{statusLabel(room.status)}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{room.participants} jug · {room.tickets} cartones · ronda {room.currentRound}</span>
        </div>
        <div className="text-xs text-muted-foreground">Anfitrión: {room.hostName}</div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <div><Label className="text-[0.6rem]">Cartón</Label><Input type="number" value={cardPrice} onChange={(e) => setCardPrice(Number(e.target.value))} className="h-8 text-sm" /></div>
          <div><Label className="text-[0.6rem]">Línea</Label><Input type="number" value={prizeLine} onChange={(e) => setPrizeLine(Number(e.target.value))} className="h-8 text-sm" /></div>
          <div><Label className="text-[0.6rem]">Esquinas</Label><Input type="number" value={prizeCorners} onChange={(e) => setPrizeCorners(Number(e.target.value))} className="h-8 text-sm" /></div>
          <div><Label className="text-[0.6rem]">Bingo</Label><Input type="number" value={prizeBingo} onChange={(e) => setPrizeBingo(Number(e.target.value))} className="h-8 text-sm" /></div>
        </div>
        <Button size="sm" onClick={save} disabled={saving} className="mt-2">Guardar</Button>
      </CardContent>
    </Card>
  );
}
