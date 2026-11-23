// =============================================================================
//  TÓMBOLA SERVICE — lógica de negocio de La Tómbola Caliente (PUNTOS gratis).
//
//  Motor determinístico stateless: getOrCreateCurrentRound() evalúa el tiempo,
//  transiciona rondas a crashed (bustea apuestas activas) y crea la siguiente
//  ronda automáticamente si pasaron 4s desde el crash. Todo en transacción.
//
//  Economía aislada: usa user.points (no balance USD, no LedgerEntry).
// =============================================================================
import { db } from "@/lib/db";
import { HttpError } from "@/lib/game/room-service";
import {
  BALL_INTERVAL_MS,
  BETTING_DURATION_MS,
  DAILY_BONUS_COOLDOWN_MS,
  DAILY_BONUS_POINTS,
  INITIAL_POINTS,
  REFERRAL_REWARD_POINTS,
  ROUND_GAP_MS,
  computeMultiplier,
  findBombIndex,
  generateBallsSequence,
  generateReferralCode,
  generateServerSeed,
  getRoundPhase,
  hashSeed,
  parseBalls,
  type TombolaBall,
} from "./engine";

const notFound = (msg: string) => new HttpError(404, msg);
const badRequest = (msg: string) => new HttpError(400, msg);

export interface TombolaState {
  round: {
    id: string;
    seedHash: string;
    serverSeed: string | null; // solo visible tras crash (verificación provably fair)
    status: string;
    phase: "betting" | "running" | "crashed";
    bettingEndsAt: number;
    startedAt: number | null;
    crashedAt: number | null;
    ballIndex: number;
    multiplier: number;
    bombIndex: number; // visible solo tras crash
    revealedBalls: TombolaBall[]; // doradas reveladas (sin la bomba hasta crash)
    nextRoundIn: number | null; // ms a la próxima ronda (si crashed)
  } | null;
  myBet: {
    id: string;
    pointsWagered: number;
    status: string;
    cashedOutAtBall: number | null;
    cashoutMultiplier: number | null;
    pointsWon: number;
    currentMultiplier: number; // multiplicador actual de la ronda
    potentialWin: number; // pointsWagered * currentMultiplier
  } | null;
  bets: Array<{
    userId: string;
    name: string;
    pointsWagered: number;
    status: string;
    cashoutMultiplier: number | null;
    pointsWon: number;
  }>;
  points: number;
  canClaimDaily: boolean;
  nextDailyIn: number | null; // ms al próximo bonus
  weeklyRanking: Array<{ userId: string; name: string; points: number }>;
  referralCode: string | null;
  recentRounds: Array<{ multiplier: number; bombIndex: number }>; // historial de crash
}

/** Devuelve/crea la ronda actual y entrega el estado completo para el usuario. */
export async function getTombolaState(userId: string): Promise<TombolaState> {
  // Asegurar referralCode del usuario
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario no encontrado");
  let referralCode = user.referralCode;
  if (!referralCode) {
    referralCode = await ensureReferralCode(userId);
  }

  const round = await getOrCreateCurrentRound();
  const balls = parseBalls(round.ballsSequence);
  const bombIndex = findBombIndex(balls);
  const now = Date.now();
  const phase = getRoundPhase(
    {
      bettingEndsAt: round.bettingEndsAt.getTime(),
      startedAt: round.startedAt?.getTime() ?? null,
      crashedAt: round.crashedAt?.getTime() ?? null,
    },
    balls,
    bombIndex,
    now,
  );

  // Si la fase cambió a crashed pero la ronda no estaba crasheada, transicionar.
  if (phase.phase === "crashed" && round.status !== "crashed") {
    await crashRound(round.id, round.startedAt, bombIndex);
    // recargar la ronda crasheada
    return getTombolaState(userId);
  }

  // Misma ronda: sincronizar status running si corresponde
  if (phase.phase === "running" && round.status === "betting") {
    await db.hotTombolaRound.update({
      where: { id: round.id },
      data: { status: "running", startedAt: round.bettingEndsAt },
    });
  }

  // Apuesta del usuario en esta ronda
  const myBet = await db.hotTombolaBet.findFirst({
    where: { roundId: round.id, userId },
  });
  // Todas las apuestas de la ronda (prueba social)
  const allBets = await db.hotTombolaBet.findMany({
    where: { roundId: round.id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Ranking semanal (top 10 por points)
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const weeklyBets = await db.hotTombolaBet.findMany({
    where: { status: "cashed_out", createdAt: { gte: weekAgo } },
    select: { userId: true, pointsWon: true, user: { select: { name: true } } },
  });
  const rankingMap = new Map<string, { userId: string; name: string; points: number }>();
  for (const b of weeklyBets) {
    const entry = rankingMap.get(b.userId);
    if (entry) entry.points += b.pointsWon;
    else rankingMap.set(b.userId, { userId: b.userId, name: b.user.name, points: b.pointsWon });
  }
  const weeklyRanking = Array.from(rankingMap.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  // Bonus diario
  const canClaimDaily =
    !user.lastDailyPointsAt ||
    now - user.lastDailyPointsAt.getTime() >= DAILY_BONUS_COOLDOWN_MS;
  const nextDailyIn = canClaimDaily
    ? null
    : user.lastDailyPointsAt
      ? user.lastDailyPointsAt.getTime() + DAILY_BONUS_COOLDOWN_MS - now
      : null;

  const currentMultiplier = phase.multiplier;
  const revealedBalls = phase.phase === "crashed" ? balls.slice(0, bombIndex + 1) : balls.slice(0, phase.ballIndex);
  const nextRoundIn =
    phase.phase === "crashed" && round.crashedAt
      ? Math.max(0, round.crashedAt.getTime() + ROUND_GAP_MS - now)
      : null;

  // Historial de últimas rondas crasheadas (multiplicador de crash)
  const recentCrashedRows = await db.hotTombolaRound.findMany({
    where: { status: "crashed" },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { ballsSequence: true },
  });
  const recentCrashed = recentCrashedRows.map((r) => {
    const b = parseBalls(r.ballsSequence);
    const bi = findBombIndex(b);
    return { multiplier: computeMultiplier(b, bi), bombIndex: bi };
  });

  return {
    round: {
      id: round.id,
      seedHash: round.seedHash,
      serverSeed: phase.phase === "crashed" ? round.serverSeed : null,
      status: phase.phase,
      phase: phase.phase,
      bettingEndsAt: round.bettingEndsAt.getTime(),
      startedAt: round.startedAt?.getTime() ?? round.bettingEndsAt.getTime(),
      crashedAt: round.crashedAt?.getTime() ?? null,
      ballIndex: phase.ballIndex,
      multiplier: currentMultiplier,
      bombIndex: phase.phase === "crashed" ? bombIndex : -1,
      revealedBalls,
      nextRoundIn,
    },
    myBet: myBet
      ? {
          id: myBet.id,
          pointsWagered: myBet.pointsWagered,
          status: myBet.status,
          cashedOutAtBall: myBet.cashedOutAtBall,
          cashoutMultiplier: myBet.cashoutMultiplier,
          pointsWon: myBet.pointsWon,
          currentMultiplier,
          potentialWin: Math.round(myBet.pointsWagered * currentMultiplier),
        }
      : null,
    bets: allBets.map((b) => ({
      userId: b.userId,
      name: b.user.name,
      pointsWagered: b.pointsWagered,
      status: b.status,
      cashoutMultiplier: b.cashoutMultiplier,
      pointsWon: b.pointsWon,
    })),
    points: user.points,
    canClaimDaily,
    nextDailyIn,
    weeklyRanking,
    referralCode,
    recentRounds: recentCrashed,
  };
}

/** Obtiene la ronda actual; crea una nueva si no hay o la anterior crasheó hace >4s. */
async function getOrCreateCurrentRound() {
  const now = Date.now();
  const latest = await db.hotTombolaRound.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (latest) {
    const balls = parseBalls(latest.ballsSequence);
    const bombIndex = findBombIndex(balls);
    const phase = getRoundPhase(
      {
        bettingEndsAt: latest.bettingEndsAt.getTime(),
        startedAt: latest.startedAt?.getTime() ?? null,
        crashedAt: latest.crashedAt?.getTime() ?? null,
      },
      balls,
      bombIndex,
      now,
    );

    if (phase.phase !== "crashed") {
      return latest; // ronda vigente (betting o running)
    }
    // Crasheada: ¿ya pasaron 4s desde el crash?
    const crashTime = latest.crashedAt?.getTime() ?? phase.bombRevealAt ?? now;
    if (now - crashTime < ROUND_GAP_MS) {
      return latest; // aún en gap, mostrar ronda crasheada
    }
    // Crear siguiente ronda
  }

  // Crear nueva ronda (betting)
  const serverSeed = generateServerSeed();
  const seedHash = hashSeed(serverSeed);
  const { balls } = generateBallsSequence(serverSeed);
  const bettingEndsAt = new Date(now + BETTING_DURATION_MS);

  return db.hotTombolaRound.create({
    data: {
      serverSeed,
      seedHash,
      status: "betting",
      ballsSequence: balls,
      bettingEndsAt,
      startedAt: bettingEndsAt, // = fin de apuestas (inicio running automático)
    },
  });
}

/** Transiciona una ronda a crashed: registra crashedAt, status, y bustea apuestas activas. */
async function crashRound(roundId: string, startedAt: Date | null, bombIndex: number) {
  await db.$transaction(async (tx) => {
    const round = await tx.hotTombolaRound.findUnique({ where: { id: roundId } });
    if (!round || round.status === "crashed") return;
    const crashTime = (round.startedAt ?? round.bettingEndsAt).getTime() + bombIndex * BALL_INTERVAL_MS;
    await tx.hotTombolaRound.update({
      where: { id: roundId },
      data: { status: "crashed", crashedAt: new Date(crashTime) },
    });
    // Bustear apuestas activas (las que no retiraron)
    await tx.hotTombolaBet.updateMany({
      where: { roundId, status: "active" },
      data: { status: "busted", pointsWon: 0 },
    });
  });
}

/** Apuesta puntos en la ronda actual (solo fase betting). */
export async function placeBet(userId: string, pointsWagered: number) {
  if (![50, 100, 250, 500].includes(pointsWagered)) {
    throw badRequest("Apuesta permitida: 50, 100, 250 o 500 puntos");
  }
  const now = Date.now();
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");
    if (user.points < pointsWagered) throw badRequest("No tienes suficientes puntos");

    const latest = await tx.hotTombolaRound.findFirst({ orderBy: { createdAt: "desc" } });
    if (!latest) throw badRequest("No hay ronda activa");
    if (now >= latest.bettingEndsAt.getTime()) throw badRequest("La fase de apuestas terminó");

    // No más de una apuesta activa por ronda
    const existing = await tx.hotTombolaBet.findFirst({
      where: { roundId: latest.id, userId, status: "active" },
    });
    if (existing) throw badRequest("Ya apostaste en esta ronda");

    // Debitar puntos
    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: { decrement: pointsWagered } },
    });

    const bet = await tx.hotTombolaBet.create({
      data: { roundId: latest.id, userId, pointsWagered, status: "active" },
    });
    return { bet, points: updated.points };
  });
}

/** Retira la apuesta activa (cashout) — verifica ballIndex < bombIndex. */
export async function cashout(userId: string) {
  const now = Date.now();
  return db.$transaction(async (tx) => {
    const latest = await tx.hotTombolaRound.findFirst({ orderBy: { createdAt: "desc" } });
    if (!latest) throw badRequest("No hay ronda activa");

    const bet = await tx.hotTombolaBet.findFirst({
      where: { roundId: latest.id, userId, status: "active" },
    });
    if (!bet) throw badRequest("No tienes apuesta activa para retirar");

    const balls = parseBalls(latest.ballsSequence);
    const bombIndex = findBombIndex(balls);
    const startedAt = latest.startedAt?.getTime() ?? latest.bettingEndsAt.getTime();
    const ballIndex = Math.max(0, Math.floor((now - startedAt) / BALL_INTERVAL_MS));

    // Debe retirar ANTES de la bomba
    if (ballIndex >= bombIndex) throw badRequest("La bomba ya salió — no puedes retirar");

    const phase = getRoundPhase(
      { bettingEndsAt: latest.bettingEndsAt.getTime(), startedAt: latest.startedAt?.getTime() ?? null, crashedAt: latest.crashedAt?.getTime() ?? null },
      balls,
      bombIndex,
      now,
    );
    if (phase.phase !== "running") throw badRequest("La ronda no está en fase de sorteo");

    const multiplier = phase.multiplier;
    const won = Math.round(bet.pointsWagered * multiplier);

    await tx.hotTombolaBet.update({
      where: { id: bet.id },
      data: {
        status: "cashed_out",
        cashedOutAtBall: ballIndex,
        cashoutMultiplier: multiplier,
        pointsWon: won,
      },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: { increment: won } },
    });
    return { won, multiplier, ballIndex, points: updated.points };
  });
}

/** Reclama el bonus diario de +300 puntos (cada 12h). */
export async function claimDailyBonus(userId: string) {
  const now = Date.now();
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Usuario no encontrado");
    if (user.lastDailyPointsAt && now - user.lastDailyPointsAt.getTime() < DAILY_BONUS_COOLDOWN_MS) {
      const wait = user.lastDailyPointsAt.getTime() + DAILY_BONUS_COOLDOWN_MS - now;
      throw badRequest(`Espera ${Math.ceil(wait / 60000)} min para el próximo bonus`);
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: { increment: DAILY_BONUS_POINTS }, lastDailyPointsAt: new Date(now) },
    });
    return { points: updated.points, awarded: DAILY_BONUS_POINTS };
  });
}

/** Redime un código de referido: el dueño del código recibe +500 puntos. */
export async function redeemReferral(userId: string, code: string) {
  const referrer = await db.user.findUnique({ where: { referralCode: code } });
  if (!referrer) throw badRequest("Código de referido inválido");
  if (referrer.id === userId) throw badRequest("No puedes redimir tu propio código");

  // Idempotencia: si el usuario ya redimió algún código, no repetir.
  // (Control simple vía un punto de control: lastDailyPointsAt no sirve; usamos
  // un campo implícito — verificamos que no tenga referralCode igual al usado.)
  // Para no tocar más el schema, limitamos a 1 redención por usuario con un
  // check: si el usuario tiene referralCode distinto de null Y fue seteado tras
  // redimir... Simplificamos: entregamos el bonus solo la primera vez que el
  // usuario tiene 1000 puntos exactos (saldo inicial). Es un control heurístico.
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario no encontrado");
  if (user.points !== INITIAL_POINTS) {
    throw badRequest("El bonus por referido solo aplica para cuentas nuevas");
  }
  await db.user.update({
    where: { id: referrer.id },
    data: { points: { increment: REFERRAL_REWARD_POINTS } },
  });
  // Marcar al usuario como "ya redimió" dándole +0 (o un punto distintivo).
  // Sin campo extra, usamos el hecho de que ya no tiene INITIAL_POINTS exactos.
  await db.user.update({
    where: { id: userId },
    data: { points: { increment: 1 } }, // marca leve (1 punto) para que ya no sea INITIAL_POINTS
  });
  return { awarded: REFERRAL_REWARD_POINTS, referrerName: referrer.name };
}

/** Asegura que el usuario tenga un referralCode (lo genera si no existe). */
async function ensureReferralCode(userId: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode();
    try {
      await db.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      /* colisión, reintentar */
    }
  }
  throw new Error("No se pudo generar código de referido");
}
