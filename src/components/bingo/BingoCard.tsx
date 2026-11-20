"use client";
// Cartón 5x5 interactivo: marcado automático, centro libre, pulso near-miss,
// resaltado dorado de la línea/esquinas/bingo ganador.
import { useMemo } from "react";
import { BINGO_COLUMNS, FREE_CELL, GRID_SIZE, letterForBall } from "@/lib/bingo/constants";
import { computeCardProgress, getWinningCells } from "@/lib/bingo/patterns";
import { normalizeGrid } from "@/lib/bingo/engine";
import type { Grid, TicketStatus } from "@/lib/bingo/types";

interface Props {
  grid: unknown;
  drawn: Set<number>;
  status: TicketStatus;
  index?: number;
  compact?: boolean;
  onClaim?: (type: "LINE" | "CORNERS" | "BINGO") => void;
  claimable?: boolean;
}

export function BingoCard({ grid: rawGrid, drawn, status, index, compact, onClaim, claimable }: Props) {
  const grid = useMemo(() => normalizeGrid(rawGrid), [rawGrid]);
  const drawnSet = drawn;

  const progress = useMemo(
    () => computeCardProgress(grid, drawnSet),
    [grid, drawnSet],
  );

  // Celdas ganadoras para resaltado (según el status del cartón).
  const winningCells = useMemo(() => {
    if (status === "WON_LINE") return getWinningCells(grid, drawnSet, "LINE");
    if (status === "WON_CORNERS") return getWinningCells(grid, drawnSet, "CORNERS");
    if (status === "WON_BINGO") return getWinningCells(grid, drawnSet, "BINGO");
    return null;
  }, [grid, drawnSet, status]);

  const winningSet = useMemo(() => {
    const s = new Set<string>();
    winningCells?.forEach(([r, c]) => s.add(`${r}-${c}`));
    return s;
  }, [winningCells]);

  const isWon = status.startsWith("WON_");
  const nearMiss = progress.bestMissing === 1 && !isWon;

  const cellSize = compact ? "h-9 w-9 text-xs" : "h-12 w-12 text-sm sm:h-14 sm:w-14 sm:text-base";

  return (
    <div
      className={`rounded-xl border-2 bg-card/80 p-2 shadow-lg transition-all ${
        nearMiss ? "near-miss-pulse border-gold" : isWon ? "border-gold" : "border-border/60"
      }`}
    >
      {/* Header B-I-N-G-O */}
      <div className="mb-1 flex justify-center gap-1">
        {BINGO_COLUMNS.map((letter) => {
          const colorClass = `ball-${letter}`;
          return (
            <div
              key={letter}
              className={`${cellSize} flex items-center justify-center rounded-md font-black ${colorClass}`}
              style={{ minWidth: 0 }}
            >
              {letter}
            </div>
          );
        })}
      </div>

      {/* Grilla */}
      <div className="flex flex-col items-center gap-1">
        {Array.from({ length: GRID_SIZE }).map((_, r) => (
          <div key={r} className="flex gap-1">
            {Array.from({ length: GRID_SIZE }).map((__, c) => {
              const value = grid[r]?.[c] ?? null;
              const isFree = r === FREE_CELL.row && c === FREE_CELL.col;
              const isMarked = isFree || (value !== null && drawnSet.has(value));
              const isWinning = winningSet.has(`${r}-${c}`);
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

      {/* Footer: estado + claim */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[0.7rem]">
          {isWon ? (
            <span className="font-bold text-gold">
              {status === "WON_LINE" ? "LINEA!" : status === "WON_CORNERS" ? "ESQUINAS!" : "BINGO!"}
            </span>
          ) : nearMiss ? (
            <span className="font-bold text-gold">A 1 bolilla! ({progress.bestKind})</span>
          ) : (
            <span className="text-muted-foreground">
              Faltan {progress.bestMissing} para {progress.bestKind ?? "ganar"}
            </span>
          )}
          {typeof index === "number" && (
            <span className="ml-1 text-muted-foreground/60">#{index + 1}</span>
          )}
        </div>
        {claimable && onClaim && status === "ACTIVE" && (
          <div className="flex gap-1">
            <button
              onClick={() => onClaim("LINE")}
              className="rounded bg-primary/20 px-2 py-1 text-[0.65rem] font-bold text-primary hover:bg-primary/30"
            >
              Línea
            </button>
            <button
              onClick={() => onClaim("CORNERS")}
              className="rounded bg-primary/20 px-2 py-1 text-[0.65rem] font-bold text-primary hover:bg-primary/30"
            >
              Esquinas
            </button>
            <button
              onClick={() => onClaim("BINGO")}
              className="rounded bg-gold/20 px-2 py-1 text-[0.65rem] font-bold text-gold hover:bg-gold/30"
            >
              Bingo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
