/**
 * Probe failure classification.
 *
 * A probe's failure reason is persisted into `additionalSchemaInfo` next to the key
 * it explains, so it leaves the database and lands in a file a human reads. Database
 * error messages routinely quote the offending value — PostgreSQL's
 * `invalid input syntax for type uuid: "0f3c-not-a-uuid"`, SQL Server's
 * `Conversion failed when converting the varchar value 'AA:1000000'` — which would
 * smuggle customer data into the output of a component whose contract is counts only.
 *
 * So a raw driver error is never persisted. It is classified into one of a fixed set
 * of reasons, and anything that could be a value is stripped from whatever tail is
 * kept. {@link sanitizeErrorText} is the belt to the classifier's braces.
 */

/** Fixed causes a probe can fail for. The persisted reason is always one of these. */
const PROBE_FAILURE_PATTERNS: ReadonlyArray<{ test: RegExp; reason: string }> = [
    // Type incompatibility — the shape that matters most, because a silent 0 here is
    // what hides a real cross-type soft key.
    { test: /operator does not exist|no operator matches|cannot be compared|operand type clash|invalid input syntax|conversion failed|data type .* is invalid|incompatible types|could not identify an equality operator/i,
      reason: 'columns are not comparable (type mismatch)' },
    // Cancellation / timeout.
    { test: /statement timeout|canceling statement|query was cancelled|query timeout|execution timeout|timeout expired|lock timeout|ETIMEDOUT/i,
      reason: 'probe exceeded its timeout' },
    // Authorization.
    { test: /permission denied|access is denied|insufficient privilege|not authorized|the SELECT permission was denied|must be owner/i,
      reason: 'no permission to read one of the columns' },
    // Missing object.
    { test: /does not exist|invalid object name|invalid column name|undefined table|undefined column|unknown column|relation .* does not exist/i,
      reason: 'table or column no longer exists' },
    // Connectivity.
    { test: /ECONNREFUSED|ECONNRESET|EPIPE|connection terminated|connection closed|server closed the connection|socket hang up|no connection|client has encountered/i,
      reason: 'lost the database connection during the probe' },
    // Resource pressure.
    { test: /out of memory|insufficient resources|too many connections|disk full|no space left|temporary file size exceeds/i,
      reason: 'database refused the probe for lack of resources' },
];

/**
 * Remove anything from a message that could be a data value: single- or double-quoted
 * runs, backticked runs, bracketed runs, and any long unbroken token. What survives is
 * prose.
 */
export function sanitizeErrorText(text: string): string {
    return text
        .replace(/'[^']*'/g, "'?'")
        .replace(/"[^"]*"/g, '"?"')
        .replace(/`[^`]*`/g, '`?`')
        .replace(/\[[^\]]*\]/g, '[?]')
        // Any remaining token of 25+ non-space characters is far more likely to be a
        // value, identifier or key than a word of explanation.
        .replace(/\S{25,}/g, '?')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Classify a driver error into a fixed, value-free reason.
 *
 * Unrecognised errors fall back to a sanitised, length-capped tail so a novel failure
 * is still debuggable, but it goes through {@link sanitizeErrorText} first.
 */
export function describeProbeFailure(error: unknown): string {
    const raw = errorMessage(error);
    for (const { test, reason } of PROBE_FAILURE_PATTERNS) {
        if (test.test(raw)) return reason;
    }
    const cleaned = sanitizeErrorText(raw);
    const capped = cleaned.length > 120 ? `${cleaned.slice(0, 120)}…` : cleaned;
    return capped.length > 0 ? `probe failed: ${capped}` : 'probe failed for an unknown reason';
}

/** Pull a provider error code (PostgreSQL SQLSTATE, MySQL errno, SQL Server number) if present. */
export function extractSqlState(error: unknown): string | undefined {
    if (error === null || typeof error !== 'object') return undefined;
    const rec = error as Record<string, unknown>;
    const code = rec.code ?? rec.number ?? rec.errno;
    if (typeof code === 'string' && code.length > 0) return code;
    if (typeof code === 'number') return String(code);
    return undefined;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error !== null && typeof error === 'object') {
        const m = (error as Record<string, unknown>).message;
        if (typeof m === 'string') return m;
    }
    return '';
}
