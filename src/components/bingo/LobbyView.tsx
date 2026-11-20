"use client";
// Lobby: salas activas (visibles solo si saldo > 0), crear sala (ADMIN, USD,
// pública/privada) y unirse por código o enlace. Economía en USD.
import { useEffect, useState } from "react";
import { apiFetch, useApp } from "@/lib/store";
import { formatUSDShort, dollarsToCents, MIN_CARD_PRICE_CENTS } from "@/lib/format";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowRight, Plus, Users, Wallet } from "lucide-react";

interface ActiveRoom {
  id: string;
  token: string;
  status: string;
  hostName: string;
  participants: number;
  currentRound: number;
  cardPrice: number;
  isPublic: boolean;
}

export function LobbyView() {
  const { openRoom, user, setView } = useApp();
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinToken, setJoinToken] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Config de nueva sala (en dólares — se convierten a centavos al enviar)
  const [cardPriceUsd, setCardPriceUsd] = useState(1);
  const [prizeLineUsd, setPrizeLineUsd] = useState(5);
  const [prizeCornersUsd, setPrizeCornersUsd] = useState(4);
  const [prizeBingoUsd, setPrizeBingoUsd] = useState(20);
  const [intervalSec, setIntervalSec] = useState(5);
  const [isPublic, setIsPublic] = useState(true);
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
    const raw = joinToken.trim();
    if (!raw) return;
    try {
      let room: { id: string; token: string };
      // Detectar enlace de invitación (/invite/TOKEN) vs código corto
      const inviteMatch = raw.match(/\/invite\/([^/?#]+)/i);
      if (inviteMatch) {
        const d = await apiFetch<{ room: { id: string; token: string } }>(
          `/api/rooms/by-invite/${inviteMatch[1]}`,
        );
        room = d.room;
      } else {
        const d = await apiFetch<{ room: { id: string; token: string } }>(
          `/api/rooms/by-token/${raw.toUpperCase()}`,
        );
        room = d.room;
      }
      await apiFetch(`/api/rooms/${room.id}/join`, { method: "POST" });
      toast.success(`Unido a la sala ${room.token}`);
      openRoom(room.id, room.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sala no encontrada");
    }
  };

  const handleCreate = async () => {
    const cardPrice = dollarsToCents(cardPriceUsd);
    if (cardPrice < MIN_CARD_PRICE_CENTS) {
      toast.error("El precio mínimo por cartón es $1.00 USD");
      return;
    }
    setCreating(true);
    try {
      const d = await apiFetch<{ roomId: string; token: string }>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          cardPrice,
          prizeLine: dollarsToCents(prizeLineUsd),
          prizeCorners: dollarsToCents(prizeCornersUsd),
          prizeBingo: dollarsToCents(prizeBingoUsd),
          intervalSec,
          isPublic,
        }),
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

  const hasBalance = (user?.balance ?? 0) > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      {/* Acciones rápidas */}
      <div className={`grid grid-cols-1 gap-3 ${user?.role === "ADMIN" ? "sm:grid-cols-2" : ""}`}>
        {user?.role === "ADMIN" && (
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
                  <DialogTitle>Configurar nueva sala (USD)</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Precio cartón (USD)</Label>
                    <Input type="number" min={1} step={0.5} value={cardPriceUsd} onChange={(e) => setCardPriceUsd(Number(e.target.value))} />
                    <span className="text-[0.65rem] text-muted-foreground">Mín. $1.00</span>
                  </div>
                  <div className="space-y-1">
                    <Label>Intervalo (seg)</Label>
                    <Input type="number" min={1} value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Premio Línea (USD)</Label>
                    <Input type="number" min={0} step={0.5} value={prizeLineUsd} onChange={(e) => setPrizeLineUsd(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Premio Esquinas (USD)</Label>
                    <Input type="number" min={0} step={0.5} value={prizeCornersUsd} onChange={(e) => setPrizeCornersUsd(Number(e.target.value))} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Premio Bingo (USD)</Label>
                    <Input type="number" min={0} step={1} value={prizeBingoUsd} onChange={(e) => setPrizeBingoUsd(Number(e.target.value))} />
                  </div>
                  <div className="col-span-2 flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">Sala pública</div>
                      <div className="text-[0.65rem] text-muted-foreground">
                        {isPublic ? "Visible en el lobby" : "Solo accesible por enlace de invitación"}
                      </div>
                    </div>
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                  </div>
                </div>
                <Button onClick={handleCreate} disabled={creating} className="mt-2 w-full">
                  {creating ? "Creando…" : "Crear y abrir sala"}
                </Button>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
        )}

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRight className="h-4 w-4 text-gold" /> Unirse con código o enlace
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Input
                value={joinToken}
                onChange={(e) => setJoinToken(e.target.value)}
                placeholder="Pega el enlace de invitación o el código (EJ: ABC123)"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="text-sm"
              />
              <Button onClick={handleJoin} className="w-full">Unirse a la sala</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Salas activas — solo visibles si saldo > 0 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">Salas activas</h2>
          <button onClick={refresh} className="text-xs text-muted-foreground hover:text-foreground">
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>
        {!hasBalance ? (
          <Card className="border-gold/40 bg-gold/5">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <Wallet className="h-8 w-8 text-gold" />
              <div className="text-sm">
                <div className="font-bold text-gold">Saldo insuficiente</div>
                <div className="mt-1 text-muted-foreground">
                  Recarga saldo para ver y entrar a las salas activas.
                </div>
              </div>
              <Button onClick={() => setView("wallet")} size="sm">Recargar ahora</Button>
            </CardContent>
          </Card>
        ) : rooms.length === 0 ? (
          <Card className="border-dashed border-border/40 bg-card/50">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No hay salas públicas activas{user?.role === "ADMIN" ? ". Crea una nueva." : " en este momento."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rooms.map((r) => {
              const canAfford = (user?.balance ?? 0) >= r.cardPrice;
              return (
                <Card key={r.id} className="border-border/60 bg-card/80">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-gold">{r.token}</span>
                        <Badge variant="secondary" className="text-[0.6rem]">
                          {statusLabel(r.status)}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {r.participants}
                        </span>
                        <span>Cartón: {formatUSDShort(r.cardPrice)}</span>
                        <span>Ronda {r.currentRound}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={!canAfford}
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/rooms/${r.id}/join`, { method: "POST" });
                          openRoom(r.id, r.token);
                        } catch {
                          openRoom(r.id, r.token);
                        }
                      }}
                    >
                      {canAfford ? "Entrar" : "Sin saldo"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {user?.role === "PLAYER" && (
        <p className="text-center text-[0.7rem] text-muted-foreground">
          Pídele el código o enlace de sala al organizador para unirte a una partida.
        </p>
      )}
    </div>
  );
}
