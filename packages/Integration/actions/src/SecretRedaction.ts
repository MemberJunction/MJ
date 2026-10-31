/**
 * Keeps a secret embedded in a SQL statement (a storage credential's SAS token) out of the error a
 * failed statement produces. `ignoreLogging` keeps such a statement out of SQL logging, but on failure
 * the SQL Server provider rewrites the error message to carry the full statement text and its
 * parameters, and the backup actions hand that message on to the action result, the execution log and
 * the progress run.
 */

/** What every occurrence of a secret is replaced with. */
export const REDACTED_SECRET = '[REDACTED]';

/** Secret parts shorter than this are not redacted on their own (they would match ordinary text). */
const MIN_SECRET_PART_LENGTH = 8;

/**
 * The strings to redact for a SAS token: the token as passed, its SQL-escaped form, and each of its
 * `name=value` parts' values that is long enough to be distinctive (the signature above all), so a
 * fragment of the token echoed by the database is caught too.
 */
export function SasTokenSecrets(sasToken: string): string[] {
    const token = sasToken.trim();
    if (!token) {
        return [];
    }
    const partValues = token.split('&')
        .map(part => part.slice(part.indexOf('=') + 1))
        .filter(value => value.length >= MIN_SECRET_PART_LENGTH);
    return [token, token.replace(/'/g, "''"), ...partValues];
}

/** `text` with every occurrence of every secret replaced by {@link REDACTED_SECRET}; empty secrets are ignored. */
export function RedactSecrets(text: string, secrets: readonly string[]): string {
    // Longest first, so a part of a longer secret never leaves the rest of it behind.
    const ordered = [...secrets].filter(s => s.length > 0).sort((a, b) => b.length - a.length);
    let result = text;
    for (const secret of ordered) {
        result = result.split(secret).join(REDACTED_SECRET);
    }
    return result;
}

/**
 * The database's own error text from a failed statement, without the statement. The SQL Server
 * provider reports a failure as `Error executing SQL / Error: <server text> / Query: <statement> /
 * Parameters: <values>`; everything from the `Query:` line on is dropped, as is the provider's prefix.
 * A message in any other shape is returned as it is (callers still redact it).
 */
export function DatabaseErrorText(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lines = message.split('\n');
    const queryLine = lines.findIndex(line => line.trimStart().startsWith('Query:'));
    const kept = (queryLine >= 0 ? lines.slice(0, queryLine) : lines).map(line => line.trim()).filter(line => line.length > 0);
    if (kept[0] === 'Error executing SQL') {
        kept.shift();
    }
    if (kept[0]?.startsWith('Error:')) {
        kept[0] = kept[0].slice('Error:'.length).trim();
    }
    return kept.join(' ');
}

/**
 * An error for a failed statement that embedded `secrets`: the given context plus the database's own
 * text, with the statement dropped and every secret redacted. The original error is deliberately not
 * kept as `cause`, since its message carries the statement.
 */
export function SecretSafeSqlError(context: string, error: unknown, secrets: readonly string[]): Error {
    return new Error(RedactSecrets(`${context}: ${DatabaseErrorText(error)}`, secrets));
}
