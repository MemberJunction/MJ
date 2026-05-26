/**
 * Reduces a value to a "structural shape" representation safe for logging.
 *
 * Returns a structure that mirrors the input — field names, array lengths, nesting depth —
 * but every primitive value is replaced with a type marker (e.g. `'<string>'`, `'<number>'`).
 * `null` and `undefined` are preserved as-is since they carry no value-content risk and are
 * structurally meaningful.
 *
 * Used at the GraphQL request boundary (`context.ts`) to give developers visibility into
 * what the client sent without ever emitting plaintext variable values. Encrypted fields,
 * tokens, and user content stay out of stdout regardless of which flag is set.
 *
 * The `maxDepth` cap prevents unbounded log output for pathological / recursive structures.
 * Default 5 is sufficient for any realistic GraphQL variables shape (typically 2-3 levels).
 */
export function describeStructure(value: unknown, maxDepth = 5): unknown {
  return describeAtDepth(value, maxDepth, 0);
}

function describeAtDepth(value: unknown, maxDepth: number, currentDepth: number): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint' || t === 'symbol' || t === 'function') {
    return `<${t}>`;
  }

  // From here on `value` is an object. Apply the depth cap before walking in.
  if (currentDepth >= maxDepth) {
    return '<object>';
  }

  if (Array.isArray(value)) {
    return value.map((v) => describeAtDepth(v, maxDepth, currentDepth + 1));
  }

  // Special object types: Date, Map, Set, class instances — labeled by their constructor name
  // rather than walked. Distinguishes "this is a typed object" from "this is a plain bag of fields."
  // `Object.create(null)` has no constructor, in which case we recurse (treat as plain object).
  const ctor = (value as object).constructor;
  if (ctor && ctor !== Object) {
    return `<${ctor.name}>`;
  }

  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    result[key] = describeAtDepth(v, maxDepth, currentDepth + 1);
  }
  return result;
}

/**
 * Builds the boundary log payload that `context.ts` passes to `console.dir`.
 * Separated from the log site so tests can lock the exact shape under both flag states
 * without booting the full request-context module chain.
 *
 * When `logVariablesEnabled` is false: `{ operationName }` only — the load-bearing leak fix.
 * When true: `{ operationName, variables }` with `variables` reduced via `describeStructure`.
 * In both cases, no literal value from the variables payload can reach the returned object.
 */
export function buildBoundaryLogPayload(
  operationName: string | undefined,
  variables: unknown,
  logVariablesEnabled: boolean,
): { operationName: string | undefined; variables?: unknown } {
  if (logVariablesEnabled) {
    return { operationName, variables: describeStructure(variables) };
  }
  return { operationName };
}
