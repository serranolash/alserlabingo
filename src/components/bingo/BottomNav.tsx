"use client";
// Navegación inferior sticky (footer). Lobby · Sala · Billetera · Admin.
import { Flame, Gamepad2, Home, Rocket, ShieldCheck, Wallet } from "lucide-react";
import { useApp, type AppView } from "@/lib/store";

interface NavItem {
  view: AppView;
  label: string;
  icon: React.ReactNode;
  show: boolean;
}

export function BottomNav() {
  const { user, view, setView, roomId } = useApp();
  if (!user) return null;

  const items: NavItem[] = [
    { view: "lobby", label: "Lobby", icon: <Home className="h-5 w-5" />, show: true },
    { view: "tombola", label: "Tómbola", icon: <Flame className="h-5 w-5" />, show: true },
    { view: "cohete", label: "Cohete", icon: <Rocket className="h-5 w-5" />, show: true },
    { view: "room", label: "Sala", icon: <Gamepad2 className="h-5 w-5" />, show: Boolean(roomId) },
    { view: "wallet", label: "Billetera", icon: <Wallet className="h-5 w-5" />, show: true },
    { view: "admin", label: "Admin", icon: <ShieldCheck className="h-5 w-5" />, show: user.role === "ADMIN" },
  ];

  const visible = items.filter((i) => i.show);

  return (
    <footer className="sticky bottom-0 z-40 mt-auto border-t border-border/40 bg-card/90 backdrop-blur pb-safe">
      <nav className="mx-auto flex max-w-3xl items-stretch">
        {visible.map((item) => {
          const active = view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold transition-colors ${
                active ? "text-gold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>
    </footer>
  );
}
