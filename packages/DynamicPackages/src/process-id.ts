/**
 * Process identity and prefix matching.
 *
 * Process IDs are hierarchical, colon-separated, lowercase strings: `mjapi`, `cli`,
 * `cli:sync`, `cli:sync:push`, `mcp`. A pattern matches an ID when it equals the ID or names
 * one of its ancestor segments — `cli:sync` matches `cli:sync:push` but not `cli:syncother`
 * or `cli:migrate`. This is what lets a config author scope a package to "all of the CLI",
 * "just mj sync", or exactly one command with the same field.
 */

/** Wildcard pattern that matches every process. */
export const ANY_PROCESS = '*';

/** Lowercases, trims, and collapses whitespace around the colon separators. */
export function NormalizeProcessId(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .split(':')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .join(':');
}

/**
 * Builds a CLI process ID from an oclif command ID. oclif reports IDs as either `sync:push`
 * or `sync push` (with `topicSeparator: ' '`); both become `cli:sync:push`.
 */
export function CliProcessId(commandId: string | undefined | null): string {
    const normalized = NormalizeProcessId((commandId ?? '').replace(/\s+/g, ':'));
    return normalized.length > 0 ? `cli:${normalized}` : 'cli';
}

/** True when `pattern` equals `processId` or is an ancestor prefix of it (segment-aware). */
export function ProcessIdMatches(processId: string, pattern: string): boolean {
    const id = NormalizeProcessId(processId);
    const pat = NormalizeProcessId(pattern);
    if (pat === ANY_PROCESS) {
        return true;
    }
    if (pat.length === 0 || id.length === 0) {
        return false;
    }
    return id === pat || id.startsWith(`${pat}:`);
}

/**
 * Evaluates an entry's `Processes` / `ExcludeProcesses` against a process ID.
 * No `Processes` (or an empty list) means "everywhere"; `ExcludeProcesses` is applied after.
 */
export function MatchesProcess(
    processId: string,
    filter: { Processes?: string[] | null; ExcludeProcesses?: string[] | null } | null | undefined
): boolean {
    const includes = (filter?.Processes ?? []).filter((p) => typeof p === 'string' && p.trim().length > 0);
    const excludes = (filter?.ExcludeProcesses ?? []).filter((p) => typeof p === 'string' && p.trim().length > 0);
    if (includes.length > 0 && !includes.some((p) => ProcessIdMatches(processId, p))) {
        return false;
    }
    if (excludes.some((p) => ProcessIdMatches(processId, p))) {
        return false;
    }
    return true;
}

/**
 * Picks the value of the most specific key in `map` that matches `processId`.
 * `'cli:sync'` beats `'cli'` beats `'*'`. Returns `undefined` when nothing matches.
 */
export function ResolveMostSpecific<T>(processId: string, map: Record<string, T> | null | undefined): T | undefined {
    if (!map) {
        return undefined;
    }
    let bestKey: string | undefined;
    let bestDepth = -1;
    for (const key of Object.keys(map)) {
        if (!ProcessIdMatches(processId, key)) {
            continue;
        }
        const normalized = NormalizeProcessId(key);
        const depth = normalized === ANY_PROCESS ? 0 : normalized.split(':').length;
        if (depth > bestDepth) {
            bestDepth = depth;
            bestKey = key;
        }
    }
    return bestKey === undefined ? undefined : map[bestKey];
}
