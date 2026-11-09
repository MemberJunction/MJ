/** z for a two-sided 95% interval. */
const Z = 1.96;

/** A count of successes in trials, its rate (null when there are no trials) and its 95% Wilson interval. */
export interface RateWithInterval { K: number; N: number; Rate: number | null; Low: number; High: number; }

/** Wilson score interval for k successes in n trials (z = 1.96); { Low: 0, High: 0 } when n = 0. */
export function WilsonInterval(k: number, n: number): { Low: number; High: number } {
    if (n === 0) return { Low: 0, High: 0 };
    const p = k / n; const z2 = Z * Z;
    const denominator = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denominator;
    const half = (Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denominator;
    return { Low: Math.max(0, center - half), High: Math.min(1, center + half) };
}

/** k of n with its rate and Wilson interval. */
export function RateOf(k: number, n: number): RateWithInterval {
    return { K: k, N: n, Rate: n === 0 ? null : k / n, ...WilsonInterval(k, n) };
}

/** Mean of the values; null when there are none. */
export function MeanOf(values: number[]): number | null {
    return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

/** How many times each key occurs. */
export function CountBy(keys: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = (out[k] ?? 0) + 1;
    return out;
}
