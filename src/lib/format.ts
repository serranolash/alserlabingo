// =============================================================================
//  Formato de moneda — todas las cantidades internas son centavos USD (Int).
//  $5.00 = 500. formatUSD(cents) => "$5.00 USD".
// =============================================================================

/** Convierte centavos a string "$X.XX USD". */
export function formatUSD(cents: number): string {
  const dollars = (cents ?? 0) / 100;
  return `$${dollars.toFixed(2)} USD`;
}

/** Convierte centavos a string corto "$X.XX" (sin "USD", para espacios reducidos). */
export function formatUSDShort(cents: number): string {
  const dollars = (cents ?? 0) / 100;
  return `$${dollars.toFixed(2)}`;
}

/** Convierte un monto en dólares (string/number) a centavos enteros. */
export function dollarsToCents(dollars: string | number): number {
  const n = typeof dollars === "string" ? Number(dollars) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Mínimo precio de cartón: $1.00 = 100 centavos. */
export const MIN_CARD_PRICE_CENTS = 100;

/** Bono de bienvenida: $5.00 = 500 centavos. */
export const WELCOME_BONUS_CENTS = 500;
