"use client";
// AppShell: orquesta auth + vistas. Layout móvil: header fijo, main scrollable,
// nav inferior — el footer pega al fondo sin superponer contenido.
import { useEffect } from "react";
import { useApp, apiFetch } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { AuthView } from "./AuthView";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { LobbyView } from "./LobbyView";
import { RoomView } from "./RoomView";
import { WalletView } from "./WalletView";
import { AdminView } from "./AdminView";
import { TombolaView } from "@/components/tombola/TombolaView";
import { RocketView } from "@/components/cohete/RocketView";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AppShell() {
  const { authReady } = useAuth(); // dispara el fetch inicial /api/auth/me
  const { user, view, openRoom, roomId } = useApp();

  // Deep-link ?room=TOKEN (código), ?invite=TOKEN (enlace privado) y feedback de pago
  useEffect(() => {
    if (!user) return;
    const url = new URL(window.location.href);
    const inviteToken = url.searchParams.get("invite");
    const roomToken = url.searchParams.get("room");
    if (inviteToken || roomToken) {
      (async () => {
        try {
          if (inviteToken) {
            const d = await apiFetch<{ room: { id: string; token: string } }>(
              `/api/rooms/by-invite/${inviteToken}`,
            );
            await apiFetch(`/api/rooms/${d.room.id}/join`, { method: "POST" }).catch(() => {});
            openRoom(d.room.id, d.room.token);
          } else if (roomToken) {
            const d = await apiFetch<{ room: { id: string; token: string } }>(
              `/api/rooms/by-token/${roomToken.toUpperCase()}`,
            );
            await apiFetch(`/api/rooms/${d.room.id}/join`, { method: "POST" }).catch(() => {});
            openRoom(d.room.id, d.room.token);
          }
        } catch {
          toast.error("Sala no encontrada");
        }
        window.history.replaceState({}, "", "/");
      })();
    }
    const payment = url.searchParams.get("payment");
    if (payment === "success") toast.success("¡Pago procesado! Créditos acreditados.");
    if (payment === "failure") toast.error("El pago fue rechazado.");
    if (payment === "pending") toast.info("Pago pendiente de procesar.");
    if (payment) window.history.replaceState({}, "", "/");
  }, [user, openRoom]);

  if (!authReady) {
    return (
      <div className="felt-bg flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <AuthView />;

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">
        {view === "lobby" && <LobbyView />}
        {view === "room" && <RoomView key={roomId ?? "none"} />}
        {view === "wallet" && <WalletView />}
        {view === "admin" && <AdminView />}
        {view === "tombola" && <TombolaView />}
        {view === "cohete" && <RocketView />}
      </main>
      <BottomNav />
    </div>
  );
}
