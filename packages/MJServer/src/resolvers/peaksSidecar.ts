/**
 * @fileoverview Pure helpers for the `peaks.json` waveform sidecar that rides alongside a stored
 * recording. Kept free of type-graphql / resolver / DB dependencies so they can be unit-tested in
 * isolation (the resolver class itself can't be imported under vitest without standing up the full
 * decorated schema). {@link FileResolver.tryReadPeaksSidecar} composes these with a storage driver.
 *
 * @module @memberjunction/server/resolvers/peaksSidecar
 */

/**
 * Derives the `peaks.json` sidecar path that sits in the SAME folder as a file's `ProviderKey`:
 * the final path segment of `providerKey` is replaced with `peaks.json`. Returns `null` when
 * `providerKey` is empty (no folder to derive from).
 *
 * @example deriveSidecarPath('realtime-recordings/sess-1/recording.wav') === 'realtime-recordings/sess-1/peaks.json'
 * @example deriveSidecarPath('recording.wav') === 'peaks.json'
 */
export function deriveSidecarPath(providerKey: string | null | undefined): string | null {
    if (!providerKey) {
        return null;
    }
    const lastSlash = providerKey.lastIndexOf('/');
    return lastSlash >= 0 ? `${providerKey.slice(0, lastSlash)}/peaks.json` : 'peaks.json';
}

/** Generous ceiling on the number of peaks returned — matches the capture-side cap. */
export const MAX_PEAKS = 4096;

/**
 * Parses + sanitizes a `peaks.json` payload (UTF-8 bytes). The content must be a JSON array of
 * finite numbers; each value is clamped to `[0, 1]` and the array is capped at {@link MAX_PEAKS}
 * entries so a malformed/hostile sidecar can't bloat the response. Returns `undefined` for anything
 * that isn't a non-empty array of finite numbers, and NEVER throws (a parse error → `undefined`).
 *
 * @param bytes The raw sidecar bytes (e.g. from a storage `GetObject`).
 * @returns Sanitized `0..1` peaks, or `undefined`.
 */
export function parsePeaksSidecar(bytes: Buffer): number[] | undefined {
    try {
        const parsed: unknown = JSON.parse(bytes.toString('utf8'));
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return undefined;
        }
        const cleaned = parsed
            .slice(0, MAX_PEAKS)
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
            .map((v) => (v < 0 ? 0 : v > 1 ? 1 : v));
        return cleaned.length > 0 ? cleaned : undefined;
    } catch {
        return undefined;
    }
}
