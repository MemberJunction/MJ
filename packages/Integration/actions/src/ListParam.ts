import { InvalidBackupParameterError } from './BackupSourceGuard.js';

/**
 * The entries of a list-valued action parameter, which callers pass either as a JSON array of strings
 * (`["a","b"]`) or as a comma-separated list (`a, b`). A value whose first non-blank character is `[`
 * is read as JSON; anything else is split on commas. Entries are trimmed and blank ones dropped.
 *
 * @throws InvalidBackupParameterError (`INVALID_PARAMETER`) when a `[`-prefixed value is not a JSON
 *   array of strings — splitting it on commas instead would hand on fragments like `["a"`.
 */
export function ParseListParam(raw: string, paramName: string): string[] {
    const trimmed = raw.trim();
    const entries = trimmed.startsWith('[') ? parseJsonStringArray(trimmed, paramName) : trimmed.split(',');
    return entries.map(e => e.trim()).filter(e => e.length > 0);
}

/** The strings of a JSON array, or the refusal of anything else. */
function parseJsonStringArray(value: string, paramName: string): string[] {
    const refusal = new InvalidBackupParameterError(`Parameter '${paramName}' starts with '[' but is not a JSON array of strings; pass a JSON array of strings or a comma-separated list.`);
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw refusal;
    }
    if (!Array.isArray(parsed) || !parsed.every((e): e is string => typeof e === 'string')) {
        throw refusal;
    }
    return parsed;
}
