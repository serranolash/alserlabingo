"use client";
// Cartón 5x5 interactivo: marcado automático, centro libre, pulso near-miss,
// resaltado dorado de la línea/esquinas/bingo ganador.
// MULTIGANANCIA: muestra badges de Línea✓/Esquinas✓ ganadas (vía claims) sin
// bloquear el cartón. El botón "Bingo" sigue habilitado hasta que el cartón
// completa Bingo (status WON_BINGO).
import { useMemo } from "react";
import { BINGO_COLUMNS, FREE_CELL, GRID_SIZE } from "@/lib/bingo/constants";
import { computeCardProgress, getWinningCells } from "@/lib/bingo/patterns";
import { normalizeGrid } from "@/lib/bingo/engine";
import type { Grid, TicketStatus } from "@/lib/bingo/types";

export interface TicketWin {
  id: string;
  type: "LINE" | "CORNERS" | "BINGO";
  prizeAwarded: number;
}

interface Props {
  grid: unknown;
  drawn: Set<number>;
  status: TicketStatus;
  wins: TicketWin[]; // victorias válidas de este cartón (multiganancia)
  index?: number;
  onClaim?: (type: "LINE" | "CORNERS" | "BINGO") => void;
  claimable?: boolean;
}

export function BingoCard({ grid: rawGrid, drawn, status, wins, index, onClaim, claimable }: Props) {
  const grid = useMemo(() => normalizeGrid(rawGrid), [rawGrid]);

  const progress = useMemo(() => computeCardProgress(grid, drawn), [grid, drawn]);

  const wonTypes = useMemo(() => new Set(wins.map((w) => w.type)), [wins]);
  const hasWonLine = wonTypes.has("LINE");
  const hasWonCorners = wonTypes.has("CORNERS");
  const hasWonBingo = status === "WON_BINGO" || wonTypes.has("BINGO");

  // Celdas ganadoras para resaltado (la victoria más reciente o todas)
  const winningCells = useMemo(() => {
    const cells = new Set<string>();
    if (hasWonBingo) {
      getWinningCells(grid, drawn, "BINGO")?.forEach(([r, c]) => cells.add(`${r}-${c}`));
    }
    if (hasWonLine) {
      getWinningCells(grid, drawn, "LINE")?.forEach(([r, c]) => cells.add(`${r}-${c}`));
    }
    if (hasWonCorners) {
      getWinningCells(grid, drawn, "CORNERS")?.forEach(([r, c]) => cells.add(`${r}-${c}`));
    }
    return cells;
  }, [grid, drawn, hasWonBingo, hasWonLine, hasWonCorners]);

  const nearMiss = progress.bestMissing === 1 && !hasWonBingo;
  const cellSize = "h-12 w-12 text-sm sm:h-14 sm:w-14 sm:text-base";

  // Botones de claim: habilitados si el cartón está en juego (no WON_BINGO/CANCELLED)
  // y el tipo aún no fue ganado por este cartón.
  const canClaim = claimable && onClaim && status === "ACTIVE";

  return (
    <div
      className={`rounded-xl border-2 bg-card/80 p-2 shadow-lg transition-all ${
        nearMiss ? "near-miss-pulse border-gold" : hasWonBingo ? "border-gold" : "border-border/60"
      }`}
    >
      {/* Header B-I-N-G-O */}
      <div className="mb-1 flex justify-center gap-1">
        {BINGO_COLUMNS.map((letter) => (
          <div
            key={letter}
            className={`${cellSize} ball-${letter} flex items-center justify-center rounded-md font-black`}
            style={{ minWidth: 0 }}
          >
            {letter}
          </div>
        ))}
      </div>

      {/* Grilla */}
      <div className="flex flex-col items-center gap-1">
        {Array.from({ length: GRID_SIZE }).map((_, r) => (
          <div key={r} className="flex gap-1">
            {Array.from({ length: GRID_SIZE }).map((__, c) => {
              const value = grid[r]?.[c] ?? null;
              const isFree = r === FREE_CELL.row && c === FREE_CELL.col;
              const isMarked = isFree || (value !== null && drawn.has(value));
              const isWinning = winningCells.has(`${r}-${c}`);
              const cls = isWinning
                ? "cell-winning"
                : isMarked
                  ? "cell-marked"
                  : "bg-muted/40 text-foreground/80";
              return (
                <div
                  key={c}
                  className={`${cellSize} flex items-center justify-center rounded-md font-bold ${cls} ${isFree ? "ring-1 ring-gold/60" : ""}`}
                >
                  {isFree ? (
                    <span className="text-[0.6rem] font-black text-gold">FREE</span>
                  ) : (
                    value
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer: victorias + claim */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-[0.65rem]">
          {hasWonLine && <span className="font-bold text-gold">Línea✓</span>}
          {hasWonCorners && <span className="font-bold text-gold">Esquinas✓</span>}
          {hasWonBingo && <span className="font-bold text-gold">BINGO!</span>}
          {!hasWonBingo && !nearMiss && (
            <span className="text-muted-foreground">
              Faltan {progress.bestMissing} para {progress.bestKind ?? "ganar"}
            </span>
          )}
          {!hasWonBingo && nearMiss && (
            <span className="font-bold text-gold">A 1 bolilla! ({progress.bestKind})</span>
          )}
          {typeof index === "number" && (
            <span className="text-muted-foreground/60">#{index + 1}</span>
          )}
        </div>
        {canClaim && (
          <div className="flex shrink-0 gap-1">
            {!hasWonLine && (
              <button
                onClick={() => onClaim?.("LINE")}
                className="rounded bg-primary/20 px-2 py-1 text-[0.6rem] font-bold text-primary hover:bg-primary/30"
              >
                Línea
              </button>
            )}
            {!hasWonCorners && (
              <button
                onClick={() => onClaim?.("CORNERS")}
                className="rounded bg-primary/20 px-2 py-1 text-[0.6rem] font-bold text-primary hover:bg-primary/30"
              >
                Esquinas
              </button>
            )}
            {/* Bingo siempre habilitado mientras el cartón esté activo (multiganancia) */}
            <button
              onClick={() => onClaim?.("BINGO")}
              className="rounded bg-gold/20 px-2 py-1 text-[0.6rem] font-bold text-gold hover:bg-gold/30"
            >
              Bingo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
