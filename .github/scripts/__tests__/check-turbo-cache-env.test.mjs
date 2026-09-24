/**
 * Suite for the turbo remote-cache preflight.
 *
 * The preflight exists to fail loudly, so the assertions that matter most are the ones proving it
 * does NOT fail in the two states where failing would be wrong: a fork PR with no credentials
 * (which must stay green for external contributors) and a repo that has deliberately turned
 * signing off.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate, signatureRequired } from '../check-turbo-cache-env.mjs';

const FULL = {
    TURBO_TOKEN: 'tok',
    TURBO_TEAM: 'mj-team',
    TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'sig',
};

describe('evaluate — inactive (no credentials)', () => {
    // The single most important assertion here. Fork PRs receive no secrets; if the preflight
    // failed on an empty token it would red every external contribution for a cache they were
    // never going to use.
    it('passes with no token at all, and says why', () => {
        const v = evaluate({}, true);
        expect(v.ok).toBe(true);
        expect(v.state).toBe('inactive');
        expect(v.detail).toMatch(/fork/i);
    });

    it('treats whitespace as absent — an unset GitHub secret interpolates to empty', () => {
        expect(evaluate({ TURBO_TOKEN: '   ' }, true).state).toBe('inactive');
    });

    it('does not care about a missing signature key when there is no token', () => {
        expect(evaluate({ TURBO_TOKEN: '', TURBO_REMOTE_CACHE_SIGNATURE_KEY: '' }, true).ok).toBe(true);
    });
});

describe('evaluate — misconfigured', () => {
    it('fails when the token is set but the team is empty', () => {
        const v = evaluate({ TURBO_TOKEN: 'tok' }, false);
        expect(v.ok).toBe(false);
        expect(v.state).toBe('misconfigured');
        expect(v.summary).toMatch(/TURBO_TEAM/);
    });

    // The silent-degradation case this whole PR is about: the job reads the cache and uploads
    // nothing, so it looks like a participant while contributing nothing.
    it('fails when signing is required but the key is empty', () => {
        const v = evaluate({ TURBO_TOKEN: 'tok', TURBO_TEAM: 'mj-team' }, true);
        expect(v.ok).toBe(false);
        expect(v.summary).toMatch(/TURBO_REMOTE_CACHE_SIGNATURE_KEY/);
    });

    // The failure mode found in review: a reusable workflow gets `vars` but not `secrets`, so
    // TURBO_TEAM is populated and TURBO_TOKEN is not. The remedy belongs in the error text,
    // because the person reading it is looking at the CALLED workflow, not the caller.
    it('names secrets: inherit in the signature-key failure, for the reusable-workflow case', () => {
        expect(evaluate({ TURBO_TOKEN: 'tok', TURBO_TEAM: 'mj-team' }, true).detail).toMatch(/secrets: inherit/);
    });

    it('offers unsetting the token as the deliberate way out, not just "add the secret"', () => {
        expect(evaluate({ TURBO_TOKEN: 'tok', TURBO_TEAM: 'mj-team' }, true).detail).toMatch(/unset TURBO_TOKEN/);
    });
});

describe('evaluate — active', () => {
    it('passes with the full set and reports the team', () => {
        const v = evaluate(FULL, true);
        expect(v.ok).toBe(true);
        expect(v.state).toBe('active');
        expect(v.summary).toContain('mj-team');
        expect(v.summary).toMatch(/signing/);
    });

    // Signing is a repo-level choice. If turbo.json turns it off, demanding the key would be a
    // gate for its own sake.
    it('does not require the signature key when turbo.json has signing off', () => {
        const v = evaluate({ TURBO_TOKEN: 'tok', TURBO_TEAM: 'mj-team' }, false);
        expect(v.ok).toBe(true);
        expect(v.state).toBe('active');
        expect(v.summary).not.toMatch(/signing/);
    });
});

describe('signatureRequired', () => {
    const write = (contents) => {
        const path = join(mkdtempSync(join(tmpdir(), 'turbo-cfg-')), 'turbo.json');
        writeFileSync(path, contents);
        return path;
    };

    it('reads remoteCache.signature from turbo.json', () => {
        expect(signatureRequired(write('{"remoteCache":{"signature":true}}'))).toBe(true);
        expect(signatureRequired(write('{"remoteCache":{"signature":false}}'))).toBe(false);
        expect(signatureRequired(write('{}'))).toBe(false);
    });

    // Fail OPEN, not closed: a malformed or missing turbo.json is a different problem, and turning
    // it into "your signature key is missing" would send whoever hits it down the wrong path.
    it('returns false rather than throwing on unreadable or malformed input', () => {
        expect(signatureRequired(write('not json at all'))).toBe(false);
        expect(signatureRequired('/nonexistent/turbo.json')).toBe(false);
    });

    it("agrees with the repo's actual turbo.json", () => {
        expect(signatureRequired()).toBe(true);
    });
});
