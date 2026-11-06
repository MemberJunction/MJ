import env from 'env-var';

/**
 * Root of the Betty Public API, including the version segment.
 *
 * NO DEFAULT, deliberately. The legacy `@memberjunction/ai-betty-bot` provider defaults to a single
 * hosted service because there is only one of them. Betty is deployed per customer, so a default
 * here would mean a misconfigured instance silently answering from somebody else's tenant — the
 * failure this provider most needs to avoid. An unset value surfaces as a clear error on the first
 * call instead.
 *
 * Read lazily rather than at module load so a process that never calls Betty is not required to
 * configure it, and so the error arrives attached to a request rather than to a bootstrap stack.
 */
export function GetBettyBaseURL(): string {
    return env.get('BETTY_API_BASE_URL').default('').asString().trim();
}

/** Name of the variable above, so error messages and docs cannot drift from the lookup. */
export const BETTY_BASE_URL_VAR = 'BETTY_API_BASE_URL';

const SLASH = '/'.charCodeAt(0);

/** Index of the first character that is not a slash. */
function firstNonSlash(value: string): number {
    let i = 0;
    while (i < value.length && value.charCodeAt(i) === SLASH) i++;
    return i;
}

/** Length of `value` with any trailing slashes removed. */
function lengthWithoutTrailingSlashes(value: string): number {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === SLASH) end--;
    return end;
}

/**
 * Join the configured root with a path, tolerating a trailing slash either way.
 *
 * `new URL(path, base)` is not used: it treats the base's last segment as a directory only when the
 * base ends in `/`, so `.../betty/v1` + `messages` would silently resolve to `.../betty/messages`
 * and 404 against a correct deployment.
 *
 * Trimmed by index rather than by `/\/+$/` and `/^\/+/`. Those are anchored, unbounded repetitions
 * over a value that arrives from configuration, which CodeQL flags as polynomial backtracking
 * (ReDoS) — a base of many slashes would take time quadratic in its length. Scanning from each end
 * is linear and cannot backtrack at all.
 */
export function BettyEndpoint(base: string, path: string): string {
    const root = base.slice(0, lengthWithoutTrailingSlashes(base));
    const tail = path.slice(firstNonSlash(path));
    return `${root}/${tail}`;
}
