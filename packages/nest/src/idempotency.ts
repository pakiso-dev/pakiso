/** Standard HTTP header convention for request idempotency keys */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * Reads the `Idempotency-Key` request header (case-insensitive, as Node/Express/
 * Fastify all normalize incoming header names to lowercase) so a controller can
 * pass it straight through to `CausalEngine.startWorkflow({ idempotencyKey })`.
 * Returns the first value if the header was sent multiple times.
 */
export function readIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const value = headers[IDEMPOTENCY_KEY_HEADER];
  return Array.isArray(value) ? value[0] : value;
}
