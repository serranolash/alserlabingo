"use client";
// TombolaStage — visual premium nivel Aviator+.
// Bola de fuego que ASCIENDE con el multiplicador, estela de brasas, aura
// pulsante, atmósfera que se incendia (verde→ámbar→rojo fuego), multiplicador
// pulsante, terremoto + flash al explotar, ráfaga de monedas al retirar.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  phase: "betting" | "running" | "crashed";
  multiplier: number;
  ballIndex: number;
  bettingEndsAt: number;
  nextRoundIn: number | null;
  justCashedOut: boolean;
  justCrashed: boolean;
}

export function TombolaStage({ phase, multiplier, ballIndex, bettingEndsAt, nextRoundIn, justCashedOut, justCrashed }: Props) {
  // % de ascenso de la bola de fuego (log-capped para sensación infinita)
  const risePercent = Math.min(68, Math.max(0, (multiplier - 1) * 11));

  // Color de la bola según intensidad
  const fireColor =
    multiplier >= 6
      ? "from-red-400 via-orange-500 to-yellow-200"
      : multiplier >= 3
        ? "from-orange-400 via-red-500 to-amber-300"
        : multiplier >= 1.5
          ? "from-amber-300 via-orange-400 to-yellow-300"
          : "from-yellow-200 via-amber-300 to-yellow-400";
  const glowColor =
    multiplier >= 6 ? "oklch(0.65 0.25 25)" :
    multiplier >= 3 ? "oklch(0.65 0.22 40)" :
    multiplier >= 1.5 ? "oklch(0.75 0.18 60)" : "oklch(0.82 0.16 85)";

  // Atmósfera de fondo que se incendia
  const atmosphere =
    multiplier >= 6
      ? "radial-gradient(circle at 50% 100%, oklch(0.4 0.2 25) 0%, oklch(0.25 0.1 25) 50%, oklch(0.15 0.04 155) 100%)"
      : multiplier >= 3
        ? "radial-gradient(circle at 50% 100%, oklch(0.35 0.15 40) 0%, oklch(0.2 0.06 40) 50%, oklch(0.15 0.04 155) 100%)"
        : multiplier >= 1.5
          ? "radial-gradient(circle at 50% 100%, oklch(0.3 0.1 60) 0%, oklch(0.18 0.05 60) 50%, oklch(0.15 0.04 155) 100%)"
          : "radial-gradient(circle at 50% 100%, oklch(0.22 0.05 155) 0%, oklch(0.16 0.04 155) 60%, oklch(0.12 0.03 155) 100%)";

  // Brasas (memoizado para no regenerar cada render)
  const embers = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: 50 + (Math.random() * 60 - 30),
        dur: 1.2 + Math.random() * 1.6,
        delay: Math.random() * 2,
        drift: `${Math.random() * 50 - 25}px`,
        size: 4 + Math.random() * 5,
      })),
    [],
  );

  // Monedas (ráfaga al retirar)
  const [coins, setCoins] = useState<number>(0);
  useEffect(() => {
    if (justCashedOut) setCoins((c) => c + 1);
  }, [justCashedOut]);
  const coinPieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: 50 + (Math.random() * 80 - 40),
        delay: Math.random() * 0.25,
        dur: 0.9 + Math.random() * 0.5,
      })),
    [coins],
  );

  // Pulso del multiplicador en cada cambio
  const [multPulseKey, setMultPulseKey] = useState(0);
  const prevMultRef = useRef(multiplier);
  useEffect(() => {
    if (multiplier !== prevMultRef.current) {
      setMultPulseKey((k) => k + 1);
      prevMultRef.current = multiplier;
    }
  }, [multiplier]);

  const isRunning = phase === "running";
  const isCrashed = phase === "crashed";
  const isBetting = phase === "betting";

  // Countdown betting
  const [betCountdown, setBetCountdown] = useState(0);
  useEffect(() => {
    if (isBetting) {
      const id = setInterval(() => {
        setBetCountdown(Math.max(0, Math.ceil((bettingEndsAt - Date.now()) / 1000)));
      }, 200);
      return () => clearInterval(id);
    }
  }, [isBetting, bettingEndsAt]);

  return (
    <div
      className={`relative h-80 w-full overflow-hidden rounded-xl border border-gold/20 ${justCrashed ? "shake" : ""}`}
      style={{ background: atmosphere, transition: "background 0.6s ease" }}
    >
      {/* Estrellas en multiplicadores altos */}
      {multiplier >= 2.5 && !isCrashed && (
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="twinkle absolute h-1 w-1 rounded-full bg-white"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${5 + Math.random() * 40}%`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Track de altitud (línea vertical con marcador) */}
      <div className="absolute right-3 top-4 bottom-16 w-1 rounded-full bg-white/10">
        <motion.div
          className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full"
          style={{ background: glowColor, boxShadow: `0 0 10px ${glowColor}` }}
          animate={{ bottom: `${risePercent}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
        {[1, 2, 3, 5, 10].map((m) => (
          <div
            key={m}
            className="absolute right-2 -translate-y-1/2 text-[0.6rem] text-muted-foreground"
            style={{ bottom: `${Math.min(68, (m - 1) * 11)}%` }}
          >
            {m}x
          </div>
        ))}
      </div>

      {/* Flash rojo de explosión */}
      {justCrashed && (
        <div className="crash-flash pointer-events-none absolute inset-0 bg-red-600" />
      )}

      {/* Bola de fuego que asciende + brasas + multiplicador */}
      <motion.div
        className="absolute left-1/2 bottom-12 -translate-x-1/2"
        animate={{ y: `-${risePercent}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 16 }}
      >
        {/* Aura pulsante */}
        <div
          className="aura-pulse absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: `radial-gradient(circle, ${glowColor}88 0%, transparent 70%)` }}
        />

        {/* Brasas ascendentes */}
        {isRunning && (
          <div className="absolute left-1/2 top-1/2 h-0 w-0">
            {embers.map((e) => (
              <div
                key={e.id}
                className="ember"
                style={{
                  left: `${e.left}px`,
                  width: `${e.size}px`,
                  height: `${e.size}px`,
                  animationDuration: `${e.dur}s`,
                  animationDelay: `${e.delay}s`,
                  ["--drift" as string]: e.drift,
                }}
              />
            ))}
          </div>
        )}

        {/* La bola de fuego */}
        {isCrashed ? (
          <div className="relative flex h-20 w-20 items-center justify-center">
            <span className="text-6xl">💥</span>
          </div>
        ) : (
          <div
            className={`fire-glow relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${fireColor} shadow-2xl`}
            style={{ boxShadow: `0 0 40px ${glowColor}, 0 0 80px ${glowColor}66` }}
          >
            {isBetting ? (
              <span className="text-2xl">🔥</span>
            ) : (
              <span className="text-xl font-black text-white drop-shadow">{multiplier.toFixed(2)}x</span>
            )}
          </div>
        )}

        {/* Multiplicador flotante grande (sobre la bola) */}
        {isRunning && (
          <div
            key={multPulseKey}
            className="mult-pulse absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-3xl font-black tabular-nums"
            style={{ color: glowColor, textShadow: `0 0 20px ${glowColor}` }}
          >
            {multiplier.toFixed(2)}x
          </div>
        )}
      </motion.div>

      {/* Ráfaga de monedas al retirar */}
      {justCashedOut && (
        <div className="pointer-events-none absolute inset-0">
          {coinPieces.map((c) => (
            <div
              key={`${coins}-${c.id}`}
              className="coin-piece"
              style={{
                left: `${c.left}%`,
                bottom: "20%",
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.dur}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Estado superpuesto */}
      <div className="absolute inset-x-0 top-3 text-center">
        {isBetting && (
          <>
            <div className="text-lg font-black text-gold">¡Apuesta ahora!</div>
            <div className="text-sm text-muted-foreground">Empieza en {betCountdown}s</div>
          </>
        )}
        {isCrashed && (
          <div className="text-2xl font-black text-red-500">💥 BOMBA</div>
        )}
      </div>

      {/* Countdown próxima ronda */}
      {isCrashed && nextRoundIn !== null && (
        <div className="absolute inset-x-0 bottom-3 text-center text-sm text-muted-foreground">
          Próxima ronda en {Math.ceil(nextRoundIn / 1000)}s
        </div>
      )}
    </div>
  );
}
