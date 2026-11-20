"use client";
// Barra superior: logo, saldo del usuario y logout.
import { LogOut, Wallet } from "lucide-react";
import { apiFetch, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, setUser, setView } = useApp();
  if (!user) return null;

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setUser(null);
    setView("lobby");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-card/80 backdrop-blur pt-safe">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-sm font-black text-[#3a1d05]">
            75
          </div>
          <span className="font-black tracking-tight text-gold">Alserla</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("wallet")}
            className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1.5 text-sm font-bold hover:bg-secondary"
          >
            <Wallet className="h-4 w-4 text-gold" />
            <span>{user.balance}</span>
            <span className="text-muted-foreground">cr.</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="h-9 w-9"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
