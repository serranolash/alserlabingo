// =============================================================================
//  BINGO 75 — Validación de patrones + detector "a 1 bolilla" (near-miss)
//
//  Un único módulo de patrones (elimina la duplicación bingo.ts/patterns.ts
//  del repo original). Reglas canónicas del Bingo americano:
//    - LÍNEA: cualquier fila, columna o diagonal completamente marcada.
//    - CUATRO ESQUINAS: las 4 esquinas marcadas.
//    - BINGO: todas las celdas no-nulas marcadas (cartón lleno).
//  Las diagonales SÍ cuentan como línea (regla estándar del Bingo de 75 bolillas).
// =============================================================================
import { CORNER_CELLS, FREE_CELL, GRID_SIZE } from "./constants";
import type { DrawnSet, Grid, NearMissKind, NearMissResult } from "./types";

/** Marca si una celda está "cubierta" (null=libre, o número ya cantado). */
function isCovered(value: number | null, drawn: DrawnSet): boolean {
  if (value === null) return true; // centro libre
  return drawn.has(value);
}

/** Las 12 líneas posibles: 5 filas + 5 columnas + 2 diagonales. */
type Line = { kind: "row" | "col" | "diag" | "anti"; index: number };

const LINES: Line[] = [
  ...rangeIndices(0, GRID_SIZE - 1).map((i) => ({ kind: "row", index: i }) as Line),
  ...rangeIndices(0, GRID_SIZE - 1).map((i) => ({ kind: "col", index: i }) as Line),
  { kind: "diag", index: 0 },
  { kind: "anti", index: 0 },
];

function rangeIndices(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Devuelve las celdas [row,col] de una línea dada. */
function lineCells(line: Line): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  if (line.kind === "row") {
    for (let c = 0; c < GRID_SIZE; c++) cells.push([line.index, c]);
  } else if (line.kind === "col") {
    for (let r = 0; r < GRID_SIZE; r++) cells.push([r, line.index]);
  } else if (line.kind === "diag") {
    for (let i = 0; i < GRID_SIZE; i++) cells.push([i, i]);
  } else {
    for (let i = 0; i < GRID_SIZE; i++) cells.push([i, GRID_SIZE - 1 - i]);
  }
  return cells;
}

/** ¿Está la línea completamente marcada? */
export function hasLine(grid: Grid, drawn: DrawnSet): boolean {
  if (grid.length < GRID_SIZE) return false;
  return LINES.some((line) =>
    lineCells(line).every(([r, c]) => isCovered(grid[r]?.[c] ?? null, drawn)),
  );
}

/** ¿Están las 4 esquinas marcadas? */
export function hasFourCorners(grid: Grid, drawn: DrawnSet): boolean {
  if (grid.length < GRID_SIZE) return false;
  return CORNER_CELLS.every(([r, c]) => isCovered(grid[r]?.[c] ?? null, drawn));
}

/** ¿Está el cartón lleno (Bingo)? */
export function hasBingo(grid: Grid, drawn: DrawnSet): boolean {
  if (grid.length < GRID_SIZE) return false;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!isCovered(grid[r]?.[c] ?? null, drawn)) return false;
    }
  }
  return true;
}

/** Valida un patrón por tipo. */
export function validatePattern(
  grid: Grid,
  drawn: DrawnSet,
  type: "LINE" | "CORNERS" | "BINGO",
): boolean {
  switch (type) {
    case "LINE":
      return hasLine(grid, drawn);
    case "CORNERS":
      return hasFourCorners(grid, drawn);
    case "BINGO":
      return hasBingo(grid, drawn);
  }
}

/** Celdas no marcadas de una línea (para near-miss). */
function lineMissing(
  grid: Grid,
  drawn: DrawnSet,
  line: Line,
): Array<[number, number]> {
  return lineCells(line).filter(([r, c]) => !isCovered(grid[r]?.[c] ?? null, drawn));
}

/**
 * Progreso de un cartón hacia cada tipo de premio.
 * `missing` = cuántas bolillas faltan para completar el patrón.
 * `nearMiss` = true si falta exactamente 1 bolilla en cualquier patrón.
 */
export interface CardProgress {
  line: { missing: number; cells: Array<[number, number]> };
  corners: { missing: number; cells: Array<[number, number]> };
  bingo: { missing: number; cells: Array<[number, number]> };
  nearMiss: boolean;
  bestMissing: number;
  bestKind: NearMissKind | null;
}

/** Calcula el progreso completo de un cartón (para auto-ordenamiento + near-miss UI). */
export function computeCardProgress(
  grid: Grid,
  drawn: DrawnSet,
): CardProgress {
  // Línea: la mejor (menos faltantes) de las 12 líneas
  let bestLineMissing = Infinity;
  let bestLineCells: Array<[number, number]> = [];
  for (const line of LINES) {
    const miss = lineMissing(grid, drawn, line);
    if (miss.length < bestLineMissing) {
      bestLineMissing = miss.length;
      bestLineCells = miss;
    }
    if (bestLineMissing === 0) break; // ya completó una línea
  }

  // Esquinas
  const cornerMiss = CORNER_CELLS.filter(
    ([r, c]) => !isCovered(grid[r]?.[c] ?? null, drawn),
  );

  // Bingo (todas las no-nulas)
  const bingoMiss: Array<[number, number]> = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (r === FREE_CELL.row && c === FREE_CELL.col) continue;
      if (!isCovered(grid[r]?.[c] ?? null, drawn)) bingoMiss.push([r, c]);
    }
  }

  const lineMissingCount = bestLineMissing === Infinity ? 0 : bestLineMissing;
  const nearMiss =
    lineMissingCount === 1 || cornerMiss.length === 1 || bingoMiss.length === 1;

  const candidates: Array<{ kind: NearMissKind; missing: number }> = [
    { kind: "LINE", missing: lineMissingCount },
    { kind: "CORNERS", missing: cornerMiss.length },
    { kind: "BINGO", missing: bingoMiss.length },
  ];
  const best = candidates.reduce((a, b) => (a.missing <= b.missing ? a : b));

  return {
    line: { missing: lineMissingCount, cells: bestLineCells },
    corners: { missing: cornerMiss.length, cells: cornerMiss },
    bingo: { missing: bingoMiss.length, cells: bingoMiss },
    nearMiss,
    bestMissing: best.missing,
    bestKind: best.missing > 0 ? best.kind : null,
  };
}

/** Devuelve el near-miss más cercano a ganar (para el termómetro de sala). */
export function nearestMiss(
  grid: Grid,
  drawn: DrawnSet,
): NearMissResult | null {
  const p = computeCardProgress(grid, drawn);
  if (p.bestMissing === 0) return null;
  const kind = p.bestKind;
  if (!kind) return null;
  const cells =
    kind === "LINE" ? p.line.cells : kind === "CORNERS" ? p.corners.cells : p.bingo.cells;
  return { kind, missing: p.bestMissing, missingCells: cells };
}

/**
 * Devuelve las celdas que forman el patrón ganador (para resaltado visual).
 * Si no hay victoria de ese tipo, retorna null.
 */
export function getWinningCells(
  grid: Grid,
  drawn: DrawnSet,
  type: "LINE" | "CORNERS" | "BINGO",
): Array<[number, number]> | null {
  if (grid.length < GRID_SIZE) return null;
  if (type === "CORNERS") {
    return hasFourCorners(grid, drawn) ? CORNER_CELLS : null;
  }
  if (type === "BINGO") {
    if (!hasBingo(grid, drawn)) return null;
    const cells: Array<[number, number]> = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++) cells.push([r, c]);
    return cells;
  }
  // LINE: la primera línea completada
  for (const line of LINES) {
    const cells = lineCells(line);
    if (cells.every(([r, c]) => isCovered(grid[r]?.[c] ?? null, drawn))) {
      return cells;
    }
  }
  return null;
}
