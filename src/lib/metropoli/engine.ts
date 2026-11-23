// =============================================================================
//  METRÓPOLI EXPRESS — Motor de juego (drafting urbano, 12 turnos × 15s).
//
//  Tablero 6×6, 8 tipos de piezas con sinergias y penalizaciones.
//  El score se calcula por adyacencia: algunas combinaciones bonifican,
//  otras penalizan. El parque convierte penalizaciones en bonos dobles.
// =============================================================================

export const GRID_SIZE = 6;
export const TOTAL_TURNS = 12;
export const TURN_MS = 15_000;
export const ENTRY_FEE = 50;

export type PieceType =
  | "HOSPITAL" | "FABRICA" | "PARQUE" | "AUTOPISTA"
  | "BARRIO" | "COMERCIO" | "ESCUELA" | "BOMBA";

export interface PieceSpec {
  type: PieceType;
  label: string;
  emoji: string;
  basePoints: number;
  color: string;
  desc: string;
}

export const PIECE_SPECS: Record<PieceType, PieceSpec> = {
  HOSPITAL:  { type: "HOSPITAL",  label: "Hospital",  emoji: "🏥", basePoints: 8,  color: "#10b981", desc: "+2 junto a Barrio" },
  FABRICA:   { type: "FABRICA",   label: "Fábrica",   emoji: "🏭", basePoints: 10, color: "#f59e0b", desc: "-3 junto a Barrio" },
  PARQUE:    { type: "PARQUE",    label: "Parque",    emoji: "🌳", basePoints: 3,  color: "#22c55e", desc: "Cancela penalizaciones, +doble" },
  AUTOPISTA: { type: "AUTOPISTA", label: "Autopista", emoji: "🛣️", basePoints: 5,  color: "#6b7280", desc: "+3 junto a Comercio" },
  BARRIO:    { type: "BARRIO",    label: "Barrio",    emoji: "🏠", basePoints: 4,  color: "#3b82f6", desc: "+2 junto a Escuela/Hospital" },
  COMERCIO:  { type: "COMERCIO",  label: "Comercio",  emoji: "🏪", basePoints: 6,  color: "#ec4899", desc: "+3 junto a Autopista" },
  ESCUELA:   { type: "ESCUELA",   label: "Escuela",   emoji: "🏫", basePoints: 7,  color: "#8b5cf6", desc: "+2 junto a Barrio" },
  BOMBA:     { type: "BOMBA",     label: "Bomba",     emoji: "💣", basePoints: -15, color: "#ef4444", desc: "Resta 15, evita colocar cerca" },
};

export const ALL_PIECE_TYPES: PieceType[] = [
  "HOSPITAL", "FABRICA", "PARQUE", "AUTOPISTA",
  "BARRIO", "COMERCIO", "ESCUELA", "BOMBA",
];

/** Las 3 piezas que se revelan en un turno (aleatorias, iguales para todos). */
export function generateTurnPieces(seed: number): PieceType[] {
  const pieces: PieceType[] = [];
  const rng = mulberry32(seed);
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(rng() * ALL_PIECE_TYPES.length);
    pieces.push(ALL_PIECE_TYPES[idx]);
  }
  return pieces;
}

/** PRNG determinístico (mulberry32) para generar planos reproducibles. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tablero vacío 6×6. */
export function emptyBoard(): (string | null)[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

/** Vecinos ortogonales de una celda. */
function getNeighbors(row: number, col: number): Array<[number, number]> {
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  return dirs
    .map(([dr, dc]) => [row + dr, col + dc] as [number, number])
    .filter(([r, c]) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE);
}

/**
 * Calcula el score total del tablero evaluando sinergias por adyacencia.
 * Reglas:
 *  - Fábrica junto a Barrio: -3 (penalización)
 *  - Parque junto a Fábrica+Barrio: cancela la penalización y da +3 (bono doble)
 *  - Hospital junto a Barrio: +2
 *  - Escuela junto a Barrio: +2
 *  - Autopista junto a Comercio: +3
 *  - Bomba: -15 base, -5 extra por cada vecino
 */
export function calculateScore(board: (string | null)[][]): number {
  let score = 0;

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const spec = PIECE_SPECS[piece as PieceType];
      if (!spec) continue;
      score += spec.basePoints;

      const neighbors = getNeighbors(r, c);
      const neighborTypes = neighbors
        .map(([nr, nc]) => board[nr][nc])
        .filter(Boolean) as string[];

      // Parque cancela penalizaciones adyacentes y da bono doble
      if (piece === "PARQUE") {
        const hasFactory = neighborTypes.includes("FABRICA");
        const hasBarrio = neighborTypes.includes("BARRIO");
        if (hasFactory && hasBarrio) {
          score += 6; // bono doble: cancela -3 y da +3 extra
        }
      }

      // Penalización Fábrica + Barrio (si no hay parque entre ellos)
      if (piece === "FABRICA" && neighborTypes.includes("BARRIO")) {
        const hasParkNeighbor = neighborTypes.includes("PARQUE");
        if (!hasParkNeighbor) score -= 3;
      }

      // Bono Hospital + Barrio
      if (piece === "HOSPITAL" && neighborTypes.includes("BARRIO")) {
        score += 2;
      }

      // Bono Escuela + Barrio
      if (piece === "ESCUELA" && neighborTypes.includes("BARRIO")) {
        score += 2;
      }

      // Bono Autopista + Comercio
      if (piece === "AUTOPISTA" && neighborTypes.includes("COMERCIO")) {
        score += 3;
      }

      // Bomba: -5 extra por cada vecino
      if (piece === "BOMBA") {
        score -= 5 * neighborTypes.length;
      }
    }
  }

  return score;
}

/** Convierte el tablero (Json) a tipo tipado. */
export function parseBoard(raw: unknown): (string | null)[][] {
  if (!Array.isArray(raw)) return emptyBoard();
  return raw as (string | null)[][];
}
