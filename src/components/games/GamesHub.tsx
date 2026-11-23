"use client";
// GamesHub — sala de juegos recreativos. Unifica Tómbola, Cohete, Fábrica y Metrópoli
// en un solo acceso desde el BottomNav. Cada juego es una tarjeta con banner.
import { useApp, type AppView } from "@/lib/store";
import { ArrowLeft, Factory, Flame, Rocket, Building2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface GameCard {
  view: AppView;
  title: string;
  desc: string;
  emoji: string;
  icon: React.ReactNode;
  gradient: string;
  borderColor: string;
}

const GAMES: GameCard[] = [
  {
    view: "tombola",
    title: "La Tómbola Caliente",
    desc: "Retira antes de la BOMBA · Multiplicador con bolillas",
    emoji: "🔥",
    icon: <Flame className="h-6 w-6" />,
    gradient: "from-orange-600/20 to-amber-600/20",
    borderColor: "border-orange-500/40",
  },
  {
    view: "cohete",
    title: "El Cohete Criollo",
    desc: "Salta antes de que explote · Multiplicador exponencial",
    emoji: "🚀",
    icon: <Rocket className="h-6 w-6" />,
    gradient: "from-purple-600/20 to-blue-600/20",
    borderColor: "border-purple-500/40",
  },
  {
    view: "fabrica",
    title: "La Fábrica Loca",
    desc: "Compra máquinas · Produce goods · Vende por puntos",
    emoji: "🏭",
    icon: <Factory className="h-6 w-6" />,
    gradient: "from-orange-600/20 to-yellow-600/20",
    borderColor: "border-orange-600/40",
  },
  {
    view: "metropoli",
    title: "Metrópoli Express",
    desc: "Construye tu ciudad en 5 min · Sinergias y planos",
    emoji: "🏙️",
    icon: <Building2 className="h-6 w-6" />,
    gradient: "from-cyan-600/20 to-teal-600/20",
    borderColor: "border-cyan-500/40",
  },
];

export function GamesHub() {
  const { setView, user } = useApp();
  const points = user?.points ?? 0;

  return (
    <div className="felt-bg min-h-[calc(100vh-3.5rem)] pb-6">
      <div className="mx-auto max-w-md space-y-4 px-3 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setView("lobby")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Lobby
          </button>
          <Badge className="bg-gold text-[#3a1d05] gap-1">
            <Zap className="h-3 w-3" /> {points} pts
          </Badge>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black text-gold">🎮 Juegos Recreativos</h1>
          <p className="text-xs text-muted-foreground">Juega GRATIS con puntos · 4 juegos disponibles</p>
        </div>

        {/* Grid de juegos */}
        <div className="grid grid-cols-1 gap-3">
          {GAMES.map((g) => (
            <button
              key={g.view}
              onClick={() => setView(g.view)}
              className={`flex items-center gap-3 rounded-xl border ${g.borderColor} bg-gradient-to-r ${g.gradient} p-4 text-left transition-all hover:scale-[1.02] active:scale-95`}
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/10 text-3xl">
                {g.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-foreground">{g.title}</span>
                </div>
                <div className="text-xs text-muted-foreground">{g.desc}</div>
              </div>
              <div className="shrink-0 text-muted-foreground">
                {g.icon}
              </div>
            </button>
          ))}
        </div>

        {/* Bono diario accesible */}
        <div className="text-center text-xs text-muted-foreground">
          ¿Sin puntos? Reclama tu bono diario de +300 en cualquiera de los juegos
        </div>
      </div>
    </div>
  );
}
