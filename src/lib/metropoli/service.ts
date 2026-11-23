// =============================================================================
//  METRÓPOLI SERVICE — lógica de partida (crear, unirse, colocar, finalizar).
//
//  Determinístico por timestamps: currentTurn = floor((now - gameStart) / 15000).
//  Cada turno revela 3 planos iguales para todos. 12 turnos = 3 min.
//  Al final, el de mayor score gana el prizePool.
// =============================================================================
import { db } from "@/lib/db";
import { HttpError } from "@/lib/game/room-service";
import {
  ENTRY_FEE,
  GRID_SIZE,
  TOTAL_TURNS,
  TURN_MS,
  calculateScore,
  emptyBoard,
  generateTurnPieces,
  parseBoard,
  type PieceType,
} from "./engine";

const notFound = (msg: string) => new HttpError(404, msg);
const badRequest = (msg: string) => new HttpError(400, msg);

export interface MetropoliState {
  game: {
    id: string;
    status: string;
    currentTurn: number;
    turnEndsAt: number | null;
    gameEndsAt: number | null;
    prizePool: number;
    secondsLeft: number;
    isFinished: boolean;
    winnerName: string | null;
  } | null;
  myBoard: (string | null)[][];
  myScore: number;
  placedThisTurn: boolean;
  currentPlans: PieceType[];
  players: Array<{ userId: string; name: string; score: number; placed: boolean }>;
  points: number;
  pendingGameId: string | null; // partida esperando jugadores
}

/** Crea una partida nueva (esperando jugadores). */
export async function createGame(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario no encontrado");
  if (user.points < ENTRY_FEE) throw badRequest(`Necesitas ${ENTRY_FEE} puntos`);

  // Buscar partida existente esperando
  const waiting = await db.metropoliGame.findFirst({
    where: { status: "waiting" },
    include: { players: true },
  });

  if (waiting && waiting.players.length < 4) {
    // Unirse a la existente
    return joinGame(userId, waiting.id);
  }

  // Crear nueva
  return db.$transaction(async (tx) => {
    const game = await tx.metropoliGame.create({
      data: { status: "waiting", prizePool: 0 },
    });
    // El creador se une automáticamente
    await tx.user.update({
      where: { id: userId },
      data: { points: { decrement: ENTRY_FEE } },
    });
    await tx.metropoliPlayer.create({
      data: {
        gameId: game.id,
        userId,
        entryFee: ENTRY_FEE,
        board: emptyBoard(),
      },
    });
    await tx.metropoliGame.update({
      where: { id: game.id },
      data: { prizePool: { increment: ENTRY_FEE } },
    });
    return { gameId: game.id };
  });
}

/** Se une a una partida existente. */
export async function joinGame(userId: string, gameId: string) {
  return db.$transaction(async (tx) => {
    const game = await tx.metropoliGame.findUnique({
      where: { id: gameId },
      include: { players: true },
    });
    if (!game) throw notFound("Partida no encontrada");
    if (game.status !== "waiting") throw badRequest("La partida ya empezó");
    if (game.players.length >= 4) throw badRequest("Partida llena");

    const existing = game.players.find((p) => p.userId === userId);
    if (existing) return { gameId }; // ya está dentro

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");
    if (user.points < ENTRY_FEE) throw badRequest(`Necesitas ${ENTRY_FEE} puntos`);

    await tx.user.update({
      where: { id: userId },
      data: { points: { decrement: ENTRY_FEE } },
    });
    await tx.metropoliPlayer.create({
      data: { gameId, userId, entryFee: ENTRY_FEE, board: emptyBoard() },
    });
    await tx.metropoliGame.update({
      where: { id: gameId },
      data: { prizePool: { increment: ENTRY_FEE } },
    });
    return { gameId };
  });
}

/** Inicia la partida si hay ≥2 jugadores (o la inicia un solo jugador para probar). */
async function startGameIfNeeded(gameId: string) {
  const game = await db.metropoliGame.findUnique({
    where: { id: gameId },
    include: { players: true },
  });
  if (!game || game.status !== "waiting") return;
  if (game.players.length < 1) return;

  const now = Date.now();
  const gameEndsAt = new Date(now + TOTAL_TURNS * TURN_MS);

  // Generar planos para los 12 turnos
  const plansData: Array<{ turnNumber: number; pieceType: string }> = [];
  for (let t = 0; t < TOTAL_TURNS; t++) {
    const pieces = generateTurnPieces(now + t * 7919);
    for (const p of pieces) {
      plansData.push({ turnNumber: t, pieceType: p });
    }
  }

  await db.$transaction(async (tx) => {
    await tx.metropoliGame.update({
      where: { id: gameId },
      data: {
        status: "playing",
        currentTurn: 0,
        turnEndsAt: new Date(now + TURN_MS),
        gameEndsAt,
      },
    });
    await tx.metropoliPlan.createMany({
      data: plansData.map((p) => ({ gameId, ...p })),
    });
  });
}

/** Finaliza la partida: calcula scores, determina ganador, acredita prizePool. */
async function finishGame(gameId: string) {
  const game = await db.metropoliGame.findUnique({
    where: { id: gameId },
    include: { players: { include: { user: { select: { name: true } } } } },
  });
  if (!game || game.status === "finished") return;

  // Calcular scores finales
  let bestScore = -999;
  let winnerId: string | null = null;
  for (const p of game.players) {
    const board = parseBoard(p.board);
    const score = calculateScore(board);
    if (score > bestScore) {
      bestScore = score;
      winnerId = p.userId;
    }
    await db.metropoliPlayer.update({ where: { id: p.id }, data: { score } });
  }

  // Acreditar prizePool al ganador
  if (winnerId && game.prizePool > 0) {
    await db.user.update({
      where: { id: winnerId },
      data: { points: { increment: game.prizePool } },
    });
  }

  await db.metropoliGame.update({
    where: { id: gameId },
    data: { status: "finished", winnerId },
  });
}

/** Estado completo de la partida actual del usuario. */
export async function getMetropoliState(userId: string): Promise<MetropoliState> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario no encontrado");

  // Buscar partida activa del usuario
  let player = await db.metropoliPlayer.findFirst({
    where: { userId },
    include: {
      game: {
        include: {
          players: { include: { user: { select: { id: true, name: true } } } },
          plans: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Si no tiene partida, buscar una waiting para unirse
  let pendingGameId: string | null = null;
  if (!player || (player.game.status === "finished")) {
    const waiting = await db.metropoliGame.findFirst({
      where: { status: "waiting" },
      include: { players: true },
    });
    if (waiting && !waiting.players.some((p) => p.userId === userId)) {
      pendingGameId = waiting.id;
    }
    return {
      game: player?.game
        ? {
            id: player.game.id,
            status: player.game.status,
            currentTurn: player.game.currentTurn,
            turnEndsAt: player.game.turnEndsAt?.getTime() ?? null,
            gameEndsAt: player.game.gameEndsAt?.getTime() ?? null,
            prizePool: player.game.prizePool,
            secondsLeft: 0,
            isFinished: true,
            winnerName: player.game.players.find((p) => p.userId === player!.game.winnerId)?.user.name ?? null,
          }
        : null,
      myBoard: parseBoard(player?.board),
      myScore: player?.score ?? 0,
      placedThisTurn: false,
      currentPlans: [],
      players: [],
      points: user.points,
      pendingGameId,
    };
  }

  const game = player.game;

  // Si está esperando y hay ≥1 jugador, iniciar
  if (game.status === "waiting") {
    await startGameIfNeeded(game.id);
    return getMetropoliState(userId);
  }

  // Si está playing, calcular turno actual por timestamp
  if (game.status === "playing") {
    const now = Date.now();
    const gameStart = game.turnEndsAt?.getTime() ? game.turnEndsAt.getTime() - TURN_MS : now;
    const elapsedTurns = Math.floor((now - gameStart) / TURN_MS);
    const currentTurn = Math.min(elapsedTurns, TOTAL_TURNS - 1);

    if (elapsedTurns >= TOTAL_TURNS) {
      // Finalizar
      await finishGame(game.id);
      return getMetropoliState(userId);
    }

    // Avanzar turno si cambió
    if (currentTurn !== game.currentTurn) {
      await db.metropoliGame.update({
        where: { id: game.id },
        data: { currentTurn, turnEndsAt: new Date(gameStart + (currentTurn + 1) * TURN_MS) },
      });
      // Reset placedThisTurn para todos
      await db.metropoliPlayer.updateMany({
        where: { gameId: game.id },
        data: { placedThisTurn: false },
      });
    }

    // Plano del turno actual (3 piezas)
    const currentPlans = game.plans
      .filter((p) => p.turnNumber === currentTurn)
      .map((p) => p.pieceType as PieceType);

    const secondsLeft = Math.max(0, Math.ceil(((gameStart + (currentTurn + 1) * TURN_MS) - now) / 1000));

    // Recalcular score del tablero del usuario
    const board = parseBoard(player.board);
    const liveScore = calculateScore(board);

    return {
      game: {
        id: game.id,
        status: "playing",
        currentTurn,
        turnEndsAt: gameStart + (currentTurn + 1) * TURN_MS,
        gameEndsAt: game.gameEndsAt?.getTime() ?? null,
        prizePool: game.prizePool,
        secondsLeft,
        isFinished: false,
        winnerName: null,
      },
      myBoard: board,
      myScore: liveScore,
      placedThisTurn: player.placedThisTurn,
      currentPlans,
      players: game.players.map((p) => ({
        userId: p.userId,
        name: p.user.name,
        score: p.score,
        placed: p.placedThisTurn,
      })),
      points: user.points,
      pendingGameId: null,
    };
  }

  // finished
  return {
    game: {
      id: game.id,
      status: "finished",
      currentTurn: game.currentTurn,
      turnEndsAt: game.turnEndsAt?.getTime() ?? null,
      gameEndsAt: game.gameEndsAt?.getTime() ?? null,
      prizePool: game.prizePool,
      secondsLeft: 0,
      isFinished: true,
      winnerName: game.players.find((p) => p.userId === game.winnerId)?.user.name ?? null,
    },
    myBoard: parseBoard(player.board),
    myScore: player.score,
    placedThisTurn: false,
    currentPlans: [],
    players: game.players.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      score: p.score,
      placed: p.placedThisTurn,
    })),
    points: user.points,
    pendingGameId: null,
  };
}

/** Coloca una pieza en el tablero del usuario. */
export async function placePiece(userId: string, row: number, col: number, pieceIndex: number) {
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE)
    throw badRequest("Posición fuera del tablero");
  if (pieceIndex < 0 || pieceIndex > 2) throw badRequest("Índice de pieza inválido");

  return db.$transaction(async (tx) => {
    const player = await tx.metropoliPlayer.findFirst({
      where: { userId },
      include: { game: { include: { plans: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (!player) throw notFound("No tienes partida activa");
    if (player.game.status !== "playing") throw badRequest("La partida no está en juego");
    if (player.placedThisTurn) throw badRequest("Ya colocaste una pieza este turno");

    // Turno actual
    const now = Date.now();
    const gameStart = player.game.turnEndsAt?.getTime() ? player.game.turnEndsAt.getTime() - TURN_MS : now;
    const currentTurn = Math.min(Math.floor((now - gameStart) / TURN_MS), TOTAL_TURNS - 1);

    // Obtener las 3 piezas del turno
    const turnPlans = player.game.plans
      .filter((p) => p.turnNumber === currentTurn)
      .map((p) => p.pieceType);

    if (pieceIndex >= turnPlans.length) throw badRequest("Pieza no disponible");
    const pieceType = turnPlans[pieceIndex];

    const board = parseBoard(player.board);
    if (board[row][col] !== null) throw badRequest("Casilla ocupada");

    board[row][col] = pieceType;
    const score = calculateScore(board);

    await tx.metropoliPlayer.update({
      where: { id: player.id },
      data: { board, score, placedThisTurn: true },
    });

    return { placed: true, pieceType, row, col, score };
  });
}
