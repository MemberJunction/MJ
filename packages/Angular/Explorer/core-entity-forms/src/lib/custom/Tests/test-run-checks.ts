/**
 * Pure (Angular-free) helpers for rendering an MJ Test Run's per-check results.
 *
 * The engine persists `TestRun.ResultDetails` as a BARE array of `OracleResult`
 * objects ({ oracleType, passed, score, message, details }) — one element per
 * check (see TestEngine.updateTestRun, which writes `JSON.stringify(oracleResults)`).
 * The custom Test Run form renders these via the `CheckResult` view shape below.
 *
 * Kept Angular-free (like bridge-provider-features.ts) so the mapping can be unit
 * tested without bootstrapping the component / Angular DI.
 */

/** The per-check shape the Test Run form template binds to. */
export interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
  weight?: number;
}

/**
 * Map the engine's persisted `ResultDetails` payload into `CheckResult[]`.
 *
 * `ResultDetails` is a bare `OracleResult[]` array; each element's `oracleType`
 * becomes the check's display name. Anything that is not an array (null, an
 * object, a malformed value) yields an empty list so the form renders nothing
 * rather than throwing.
 */
export function parseCheckResults(resultDetails: unknown): CheckResult[] {
  if (!Array.isArray(resultDetails)) {
    return [];
  }
  return (resultDetails as Array<Record<string, unknown>>).map(r => ({
    name: (r?.['oracleType'] as string) ?? '',
    passed: r?.['passed'] === true,
    message: r?.['message'] as string | undefined
    // OracleResult has no `weight`; CheckResult.weight stays undefined.
  }));
}
