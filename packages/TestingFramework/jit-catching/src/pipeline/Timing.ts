/** Runs `fn` and returns its result with the whole milliseconds it took on the `now` clock. */
export async function Timed<T>(now: () => number, fn: () => Promise<T>): Promise<{ Result: T; Ms: number }> {
    const start = now();
    const result = await fn();
    return { Result: result, Ms: Math.max(0, Math.round(now() - start)) };
}

/** Whole seconds of a millisecond count, for stdout lines. */
export function Seconds(ms: number): string { return `${Math.round(ms / 1000)}s`; }
