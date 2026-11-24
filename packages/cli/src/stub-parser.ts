/**
 * Parses a single `--stub stepName=jsonValue` CLI assignment and merges it
 * into the accumulated stubs map, used as commander's variadic option
 * accumulator (called once per repeated `--stub` flag).
 */
export function collectStub(
  assignment: string,
  previous: Record<string, unknown>,
): Record<string, unknown> {
  const separatorIndex = assignment.indexOf('=');
  if (separatorIndex === -1) {
    throw new Error(`Invalid --stub "${assignment}": expected the form stepName=jsonValue`);
  }

  const stepName = assignment.slice(0, separatorIndex);
  const rawValue = assignment.slice(separatorIndex + 1);

  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    // Not valid JSON (e.g. a bare word) — fall back to treating it as a plain string.
    value = rawValue;
  }

  return { ...previous, [stepName]: value };
}
