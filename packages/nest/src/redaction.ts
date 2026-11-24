import type { RedactionOptions } from '@causal/core';

const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_VALUE = '[CIRCULAR]';

const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'ssn',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'pin',
];

/**
 * Recursively deep-clones `value`, masking any object key whose name
 * case-insensitively matches a known sensitive field (or one of
 * `options.extraKeys`) with the literal string "[REDACTED]".
 *
 * Deliberately hand-rolled rather than built on a path-compiling redaction
 * library: those compile object paths into executable code, and their own
 * documentation warns against deriving paths from untrusted/dynamic data —
 * exactly what workflow run inputs/outputs are. Matching by key name via
 * plain recursion has no such risk and handles arbitrary depth/shape safely.
 */
export function redactSensitiveFields(
  value: Record<string, unknown>,
  options?: RedactionOptions,
): Record<string, unknown> {
  const sensitiveKeys = new Set(
    [...DEFAULT_SENSITIVE_KEYS, ...(options?.extraKeys ?? [])].map((key) => key.toLowerCase()),
  );
  return redactValue(value, sensitiveKeys, new Set()) as Record<string, unknown>;
}

function redactValue(value: unknown, sensitiveKeys: Set<string>, ancestors: Set<object>): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      return CIRCULAR_VALUE;
    }
    ancestors.add(value);
    const result = value.map((item) => redactValue(item, sensitiveKeys, ancestors));
    ancestors.delete(value);
    return result;
  }

  if (value !== null && typeof value === 'object') {
    if (ancestors.has(value)) {
      return CIRCULAR_VALUE;
    }
    ancestors.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      result[key] = sensitiveKeys.has(key.toLowerCase())
        ? REDACTED_VALUE
        : redactValue(entryValue, sensitiveKeys, ancestors);
    }
    ancestors.delete(value);
    return result;
  }

  return value;
}
