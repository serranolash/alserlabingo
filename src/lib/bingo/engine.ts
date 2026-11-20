// =============================================================================
//  BINGO 75 — Motor de cartones y bolillero (puro, sin side-effects)
//  Compartido entre servidor (compra/reclamo) y cliente (render PWA).
// =============================================================================
import {
  ALL_NUMBERS,
  COLUMN_RANGE_BY_INDEX,
  FREE_CELL,
  GRID_SIZE,
} from "./constants";
import type { Grid } from "./types";

/** Rango inclusivo [a..b]. */
export function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Fisher-Yates (Durstenfeld). Devuelve un nuevo arreglo (no muta el original). */
export function shuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Genera un cartón 5x5 de Bingo 75.
 * Columnas: B(1-15) I(16-30) N(31-45) G(46-60) O(61-75).
 * Cada columna toma 5 números únicos de su rango. Centro [2][2] = null (libre).
 */
export function generateBingo75Card(): Grid {
  const grid: Grid = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    grid.push(new Array<number | null>(GRID_SIZE).fill(0));
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    const [min, max] = COLUMN_RANGE_BY_INDEX[c];
    const picks = shuffle(range(min, max)).slice(0, GRID_SIZE);
    for (let r = 0; r < GRID_SIZE; r++) {
      grid[r][c] = picks[r];
    }
  }
  // Centro libre
  grid[FREE_CELL.row][FREE_CELL.col] = null;
  return grid;
}

/**
 * Genera la permutación completa de [1..75] que define el sorteo determinístico.
 * Se persiste una sola vez en Room.ballSequence al iniciar la sala.
 */
export function generateBallSequence(): number[] {
  return shuffle(ALL_NUMBERS);
}

/** Normaliza un grid almacenado (Json) a Grid tipada. */
export function normalizeGrid(raw: unknown): Grid {
  if (!Array.isArray(raw)) return [];
  return (raw as (number | null)[][]).map((row) =>
    Array.isArray(row) ? row.map((c) => (c === null ? null : Number(c))) : [],
  );
}
