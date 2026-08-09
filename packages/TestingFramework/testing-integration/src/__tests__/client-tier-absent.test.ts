import { describe, it, expect } from 'vitest';

/**
 * The client-transport skip contract.
 *
 * A client bundle bootstraps in two steps, and either can fail:
 *
 *   1. `LoadClientConfig()` — throws `MJ_API_KEY is not set …` when the key is absent.
 *      This runs FIRST, before any network call.
 *   2. `preflightMJAPI()` — throws `MJAPI is not reachable …` when the server is absent.
 *      Only reached once a key exists.
 *
 * `IntegrationTestDriver` treats "there is no client tier here" as a skippable
 * environment gap, and everything else as a hard error. The gap it originally matched
 * was (2) only — but the PR gate provisions a database and runs in-process with no MJAPI
 * and no key, so it fails at (1) and never reaches the skip. The whole tier went red on
 * every PR for a condition the workflow explicitly designed around:
 *
 *   > No MJAPI is up, so client-transport members skip on the MJAPI preflight.
 *   >   — .github/workflows/integration.yml
 *
 * These tests pin the pattern so that intent cannot silently regress again. The regex is
 * duplicated here deliberately: importing the driver pulls in a live provider/cache graph,
 * and the property under test is the pattern itself.
 */
const CLIENT_TIER_ABSENT = /MJAPI is not reachable|MJ_API_KEY is not set/i;

/** Verbatim messages from the two bootstrap failure points. */
const NO_KEY = 'MJ_API_KEY is not set in the environment — required for client-side tests.';
const NO_SERVER =
    'MJAPI is not reachable at http://localhost:4000/ (fetch failed). Start it first: cd packages/MJAPI && npm run start';

describe('client-tier-absent detection — what must SKIP', () => {
    it('matches a missing API key, the branch CI actually takes', () => {
        expect(CLIENT_TIER_ABSENT.test(NO_KEY)).toBe(true);
    });

    it('matches an unreachable MJAPI, the branch that already worked', () => {
        expect(CLIENT_TIER_ABSENT.test(NO_SERVER)).toBe(true);
    });

    it('matches once the driver has wrapped the message in its own prefix', () => {
        // The driver composes `Bootstrap failed: ${msg}` for the error path, and tests the
        // raw message for the skip path — both must still match.
        expect(CLIENT_TIER_ABSENT.test(`Bootstrap failed: ${NO_KEY}`)).toBe(true);
    });
});

describe('client-tier-absent detection — what must remain a HARD ERROR', () => {
    it('does not match a key that is present but rejected', () => {
        // A 401 means the environment HAS a client tier and is misconfigured. Skipping it
        // would hide precisely the failure this gate exists to catch.
        const wrongKey = 'MJAPI at http://localhost:4000/ answered HTTP 401 — check MJ_API_KEY and server logs.';
        expect(CLIENT_TIER_ABSENT.test(wrongKey)).toBe(false);
    });

    it('does not match a server error from a reachable MJAPI', () => {
        const serverError = 'MJAPI at http://localhost:4000/ answered HTTP 500 — check MJ_API_KEY and server logs.';
        expect(CLIENT_TIER_ABSENT.test(serverError)).toBe(false);
    });

    it('does not match a cache-ownership violation', () => {
        const ownership =
            'Integration bootstrap must own its process — LocalCacheManager is already initialized by another component.';
        expect(CLIENT_TIER_ABSENT.test(ownership)).toBe(false);
    });

    it('does not match an arbitrary product defect', () => {
        expect(CLIENT_TIER_ABSENT.test('Cannot read properties of undefined (reading Values)')).toBe(false);
    });
});

describe('the 401 message is genuinely distinguishable', () => {
    it('mentions MJ_API_KEY without saying it is unset', () => {
        // Both messages name MJ_API_KEY, so the pattern must key on "is not set" rather
        // than on the variable name — this is the case a looser regex would break.
        const wrongKey = 'MJAPI at http://localhost:4000/ answered HTTP 401 — check MJ_API_KEY and server logs.';
        expect(wrongKey).toContain('MJ_API_KEY');
        expect(CLIENT_TIER_ABSENT.test(wrongKey)).toBe(false);
        expect(/MJ_API_KEY/i.test(wrongKey)).toBe(true);
    });
});
