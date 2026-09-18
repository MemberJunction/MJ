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

describe('normalizeTraceUrl idempotency with encoded query values (review #2)', () => {
    const cases: Array<[string, string]> = [
        ['encoded delimiters in a redirect_uri',
            'http://localhost:4200/app?redirect_uri=https%3A%2F%2Fapp%2Fcb%3Fa%3D1%26b%3D2&state=s'],
        ['encoded ampersand', 'http://localhost:4200/x?a=1%262&b=3'],
        ['encoded equals', 'http://localhost:4200/x?a=k%3Dv'],
        ['encoded hash', 'http://localhost:4200/x?a=frag%23top'],
        ['plus as space', 'http://localhost:4200/x?q=hello+world'],
        ['already-plain value', 'http://localhost:4200/x?a=1&b=2'],
        ['no query', 'http://localhost:4200/app/data'],
    ];

    it.each(cases)('is idempotent: %s', (_label, url) => {
        const once = normalizeTraceUrl(url);
        expect(normalizeTraceUrl(once)).toBe(once);
    });

    it.each(cases)('a normalized URL still matches its own pattern: %s', (_label, url) => {
        // traceUrlMatches normalizes the pattern a second time, so a pattern
        // recorded from this URL must still match the live URL it came from.
        const recorded = normalizeTraceUrl(url);
        expect(traceUrlMatches(recorded, url)).toBe(true);
    });
});

describe('traceUrlMatches precision (review #3)', () => {
    it('an absolute-URL pattern does NOT match a different path on the same origin', () => {
        // A goal postcondition distilled from a run that ends at the app root used
        // to pass on any URL of that origin, including an error page.
        expect(traceUrlMatches('http://localhost:4200/', 'http://localhost:4200/login-error?x=1')).toBe(false);
        expect(traceUrlMatches('http://localhost:4200/app/data', 'http://localhost:4200/app/data-archive')).toBe(false);
    });

    it('an absolute-URL pattern matches the same URL', () => {
        expect(traceUrlMatches('http://localhost:4200/', 'http://localhost:4200/')).toBe(true);
        expect(traceUrlMatches('http://localhost:4200/app/data', 'http://localhost:4200/app/data')).toBe(true);
    });

    it('an absolute-URL pattern matches a deeper path at a segment boundary', () => {
        expect(traceUrlMatches('http://localhost:4200/app/data', 'http://localhost:4200/app/data/records')).toBe(true);
    });

    it('a path-fragment pattern still matches by containment', () => {
        expect(traceUrlMatches('/app/data', 'http://localhost:4200/app/data?view=grid')).toBe(true);
        expect(traceUrlMatches('/app/data', 'http://localhost:4200/app/home')).toBe(false);
    });

    it('an empty pattern still matches anything', () => {
        expect(traceUrlMatches('', 'http://localhost:4200/anything')).toBe(true);
    });

    it('ignores the query when the pattern records none, but not the path', () => {
        expect(traceUrlMatches('http://localhost:4200/app', 'http://localhost:4200/app?x=1')).toBe(true);
        expect(traceUrlMatches('http://localhost:4200/app', 'http://localhost:4200/other?x=1')).toBe(false);
    });
});
