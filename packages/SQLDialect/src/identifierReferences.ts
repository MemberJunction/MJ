/**
 * Identifier-name matching for SQL text a caller supplies.
 *
 * Lives in `sql-dialect` because it is SQL semantics: how a caller's spelling of a column name
 * resolves to one entity field.
 */

/** Escapes regex metacharacters so a field name is matched literally, never as a pattern. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The case rule for identifier comparison. A name is reduced to its {@link matchingKey}, and
 * text matches the key with JavaScript's case-insensitive matching without the `u` flag. That
 * matching never maps a non-ASCII letter onto an ASCII one (U+212A KELVIN SIGN is not `k`).
 */
const IDENTIFIER_CASE_FLAGS = 'i';

/** A name's key: trimmed and lower-cased. */
function matchingKey(name: string): string {
    return name.trim().toLowerCase();
}

/**
 * Whether `reference` names the identifier `name`. Both steps must pass: the case-insensitive
 * pattern for the name's key matches all of the trimmed reference, and the reference's own key
 * is the name's key. A look-alike letter that only lower-cases to the same text does not match.
 *
 * Code that resolves a caller's text to an entity field must use this rule, or a stricter one.
 *
 * @param reference The identifier as the caller wrote it, without quoting delimiters
 * @param name The identifier to compare against, such as an entity field name
 */
export function IdentifierMatches(reference: string, name: string): boolean {
    if (typeof reference !== 'string' || typeof name !== 'string') return false;
    const key = matchingKey(name);
    if (!key || matchingKey(reference) !== key) return false;
    return new RegExp(`^(?:${escapeRegex(key)})$`, IDENTIFIER_CASE_FLAGS).test(reference.trim());
}
