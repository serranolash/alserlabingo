"use client";
// Lobby: salas activas, crear sala (con config de premios) y unirse por código.
import { useEffect, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowRight, Plus, Users } from "lucide-react";

interface ActiveRoom {
  id: string;
  token: string;
  status: string;
  hostName: string;
  participants: number;
  currentRound: number;
}

export function LobbyView() {
  const { openRoom, user } = useApp();
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinToken, setJoinToken] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Config de nueva sala
  const [cardPrice, setCardPrice] = useState(100);
  const [prizeLine, setPrizeLine] = useState(100);
  const [prizeCorners, setPrizeCorners] = useState(80);
  const [prizeBingo, setPrizeBingo] = useState(300);
  const [intervalSec, setIntervalSec] = useState(5);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ rooms: ActiveRoom[] }>("/api/rooms/active");
      setRooms(d.rooms);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const handleJoin = async () => {
    const token = joinToken.trim().toUpperCase();
    if (!token) return;
    try {
      const d = await apiFetch<{ room: { id: string; token: string } }>(
        `/api/rooms/by-token/${token}`,
      );
      await apiFetch(`/api/rooms/${d.room.id}/join`, { method: "POST" });
      toast.success(`Unido a la sala ${token}`);
      openRoom(d.room.id, d.room.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sala no encontrada");
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const d = await apiFetch<{ roomId: string; token: string }>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ cardPrice, prizeLine, prizeCorners, prizeBingo, intervalSec }),
      });
      toast.success(`Sala ${d.token} creada`);
      setCreateOpen(false);
      openRoom(d.roomId, d.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear la sala");
    } finally {
      setCreating(false);
    }
  };

  const statusLabel = (s: string) =>
    s === "WAITING" ? "Esperando" : s === "RUNNING" ? "En juego" : s === "PAUSED" ? "Pausada" : s;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      {/* Acciones rápidas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-gold" /> Crear sala
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="w-full">Nueva sala de Bingo</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Configurar nueva sala</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Precio cartón</Label>
                    <Input type="number" value={cardPrice} onChange={(e) => setCardPrice(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Intervalo (seg)</Label>
                    <Input type="number" value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Premio Línea</Label>
                    <Input type="number" value={prizeLine} onChange={(e) => setPrizeLine(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Premio Esquinas</Label>
                    <Input type="number" value={prizeCorners} onChange={(e) => setPrizeCorners(Number(e.target.value))} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Premio Bingo</Label>
                    <Input type="number" value={prizeBingo} onChange={(e) => setPrizeBingo(Number(e.target.value))} />
                  </div>
                </div>
                <Button onClick={handleCreate} disabled={creating} className="mt-2 w-full">
                  {creating ? "Creando…" : "Crear y abrir sala"}
                </Button>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRight className="h-4 w-4 text-gold" /> Unirse con código
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={joinToken}
                onChange={(e) => setJoinToken(e.target.value.toUpperCase())}
                placeholder="EJ: ABC123"
                maxLength={6}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="font-mono uppercase"
              />
              <Button onClick={handleJoin}>Unirse</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Salas activas */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">Salas activas</h2>
          <button onClick={refresh} className="text-xs text-muted-foreground hover:text-foreground">
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>
        {rooms.length === 0 ? (
          <Card className="border-dashed border-border/40 bg-card/50">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No hay salas activas. ¡Crea la primera!
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rooms.map((r) => (
              <Card key={r.id} className="border-border/60 bg-card/80">
                <CardContent className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-gold">{r.token}</span>
                      <Badge variant="secondary" className="text-[0.6rem]">
                        {statusLabel(r.status)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {r.participants}
                      </span>
                      <span>Anfitrión: {r.hostName}</span>
                      <span>Ronda {r.currentRound}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await apiFetch(`/api/rooms/${r.id}/join`, { method: "POST" });
                        openRoom(r.id, r.token);
                      } catch {
                        openRoom(r.id, r.token);
                      }
                    }}
                  >
                    Entrar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {user?.role === "PLAYER" && (
        <p className="text-center text-[0.7rem] text-muted-foreground">
          ¿Quieres ser anfitrión? Crea una sala y invita a tus amigos con el código.
        </p>
      )}
    </div>
  );
}
