// =============================================================================
//  BINGO 75 — Constantes del juego (compartidas cliente + servidor)
//  Bingo americano 75 bolillas: 5 columnas B-I-N-G-O, cada una un rango de 15.
// =============================================================================

export const GRID_SIZE = 5;
export const MAX_BALL = 75;
export const NUMBERS_PER_COLUMN = 15;

/** Letras de las columnas, en orden. */
export const BINGO_COLUMNS = ["B", "I", "N", "G", "O"] as const;
export type BingoLetter = (typeof BINGO_COLUMNS)[number];

/** Rangos numéricos por columna (inclusivos). */
export const COLUMN_RANGES: Record<BingoLetter, [number, number]> = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};

/** Índice de columna (0-4) -> rango [min,max]. */
export const COLUMN_RANGE_BY_INDEX: Array<[number, number]> = [
  COLUMN_RANGES.B,
  COLUMN_RANGES.I,
  COLUMN_RANGES.N,
  COLUMN_RANGES.G,
  COLUMN_RANGES.O,
];

/** Centro libre (free space): fila 2, col 2. */
export const FREE_CELL = { row: 2, col: 2 } as const;

/** Las 4 esquinas del cartón 5x5. */
export const CORNER_CELLS: Array<[number, number]> = [
  [0, 0],
  [0, 4],
  [4, 0],
  [4, 4],
];

/** Todos los números 1..75 (bolillero completo). */
export const ALL_NUMBERS: number[] = Array.from(
  { length: MAX_BALL },
  (_, i) => i + 1,
);

/** Valores por defecto del motor (overrideable por sala / env). */
export const DEFAULT_GAME = {
  drawIntervalSec: 5,
  initialCredits: 1000,
  cardPrice: 100,
  prizeLine: 100,
  prizeCorners: 80,
  prizeBingo: 300,
  currency: "ARS",
} as const;

/** Color de letra asignado a cada bolilla (para la UI "cantada"). */
export function letterForBall(n: number): BingoLetter | null {
  if (n < 1 || n > MAX_BALL) return null;
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}

/** Devuelve el índice de columna (0-4) para un número dado. */
export function columnIndexForBall(n: number): number {
  const letter = letterForBall(n);
  if (!letter) return -1;
  return BINGO_COLUMNS.indexOf(letter);
}
