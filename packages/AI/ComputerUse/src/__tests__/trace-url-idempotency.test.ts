import { describe, it, expect } from 'vitest';
import { normalizeTraceUrl, traceUrlMatches, UUID_TOKEN } from '../engine/trace.js';

/**
 * Normalization has to be idempotent, because it is applied twice to different
 * things: once at record time to produce the stored pattern, and again at replay
 * time to both that pattern and the live URL.
 *
 * A UUID in the PATH broke that. Replacing it yields a literal `{uuid}`, and
 * re-parsing that pattern percent-encodes the braces to `%7Buuid%7D` — so the
 * stored pattern normalized to something the live URL could never equal. Every
 * record-detail test (`/record/Events/ID|<uuid>`) diverged on a URL that was in
 * fact correct.
 *
 * Query strings were unaffected: they are rebuilt from decoded values, so the
 * token survives there. Only the path round-trips through URL encoding.
 */
describe('normalizeTraceUrl idempotency', () => {
    const withUuid = 'http://localhost:4200/app/data-explorer/record/Events/ID%7C35A10C82-729F-43C0-9E87-068FF4603DC4';

    it('is idempotent — normalizing an already-normalized URL is a no-op', () => {
        const once = normalizeTraceUrl(withUuid);
        expect(normalizeTraceUrl(once)).toBe(once);
    });

    it('keeps the token literal rather than percent-encoding its braces', () => {
        expect(normalizeTraceUrl(withUuid)).toContain(UUID_TOKEN);
        expect(normalizeTraceUrl(normalizeTraceUrl(withUuid))).not.toContain('%7B');
    });

    it('matches a stored pattern against a live URL carrying a different uuid', () => {
        // The exact failure: the pattern is what record time stored.
        const pattern = 'http://localhost:4200/app/data-explorer/record/Events/ID%7C{uuid}';
        expect(traceUrlMatches(pattern, withUuid)).toBe(true);
    });

    it('still distinguishes genuinely different paths', () => {
        const pattern = 'http://localhost:4200/app/data-explorer/record/Events/ID%7C{uuid}';
        const other = 'http://localhost:4200/app/data-explorer/record/Members/ID%7C35A10C82-729F-43C0-9E87-068FF4603DC4';
        expect(traceUrlMatches(pattern, other)).toBe(false);
    });
});
