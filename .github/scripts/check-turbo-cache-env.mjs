/**
 * Turbo remote-cache preflight — makes a misconfigured cache LOUD instead of slow.
 *
 * WHY THIS SCRIPT EXISTS: every way of breaking the remote cache is silent, and turbo announces
 * only one of the three states it can be in.
 *
 *   - No TURBO_TOKEN               → "Remote caching disabled". Announced, but easy to miss in a
 *                                     15-minute log, and indistinguishable from a fork PR (where
 *                                     it is correct and expected).
 *   - Token, no signature key      → turbo prints `signing artifact failed: signature secret key
 *                                     not found` ONCE per run and uploads nothing. The job still
 *                                     reads from the cache, so it looks like a participant while
 *                                     contributing nothing.
 *   - Token + key, signing working → turbo prints NOTHING. There is no success signal at all.
 *
 * The third case is the problem this solves. Without a positive signal, "signing is on" is an
 * article of faith: the feature could have been inert since the day it was added and the only
 * evidence would be cache hit rates that nobody baselined.
 *
 * So this script asserts the invariant up front and writes what it found to the step summary.
 * A green run now means the cache was verified, not merely un-complained-about.
 *
 * Non-goal: this does NOT verify the credentials are VALID — only that the shape is coherent. A
 * revoked token still fails at turbo's layer with "Remote caching disabled". Catching that needs
 * a live round-trip, which is turbo's job, not a preflight's.
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Does turbo.json ask for signed artifacts? If not, the signature key is optional. */
export function signatureRequired(turboJsonPath = resolve(REPO_ROOT, 'turbo.json')) {
    try {
        return JSON.parse(readFileSync(turboJsonPath, 'utf8')).remoteCache?.signature === true;
    } catch {
        return false;
    }
}

/**
 * Classify the environment. Pure — takes the env, returns a verdict, touches nothing.
 *
 * @param {Record<string, string | undefined>} env
 * @param {boolean} needsSignature
 * @returns {{ ok: boolean, state: 'inactive' | 'active' | 'misconfigured', summary: string, detail?: string }}
 */
export function evaluate(env, needsSignature) {
    const token = (env.TURBO_TOKEN ?? '').trim();
    const team = (env.TURBO_TEAM ?? '').trim();
    const key = (env.TURBO_REMOTE_CACHE_SIGNATURE_KEY ?? '').trim();

    // No token is a legitimate, expected state: fork PRs never receive secrets, and turbo falls
    // back to the local cache. Never fail for this — it would red every external contribution.
    if (!token) {
        return {
            ok: true,
            state: 'inactive',
            summary: 'Turbo remote cache: INACTIVE (no TURBO_TOKEN) — local cache only.',
            detail: 'Expected on pull requests from forks, which never receive repository secrets.',
        };
    }

    if (!team) {
        return {
            ok: false,
            state: 'misconfigured',
            summary: 'Turbo remote cache: MISCONFIGURED — TURBO_TOKEN is set but TURBO_TEAM is empty.',
            detail:
                'Turbo cannot resolve a cache scope without the team slug, so every request fails and the ' +
                'job silently rebuilds. Set the TURBO_TEAM repository/organization variable, or unset ' +
                'TURBO_TOKEN to disable the remote cache deliberately.',
        };
    }

    if (needsSignature && !key) {
        return {
            ok: false,
            state: 'misconfigured',
            summary: 'Turbo remote cache: MISCONFIGURED — signing is enabled but TURBO_REMOTE_CACHE_SIGNATURE_KEY is empty.',
            detail:
                'turbo.json sets remoteCache.signature, so turbo signs every artifact it uploads. Without the ' +
                'key it logs "signing artifact failed" and uploads NOTHING while still reading from the cache — ' +
                'this job would consume the cache without ever contributing to it. Set the ' +
                'TURBO_REMOTE_CACHE_SIGNATURE_KEY secret, or unset TURBO_TOKEN to disable the remote cache. ' +
                'If this is a reusable workflow, check the CALLER passes `secrets: inherit` — secrets are not ' +
                'inherited by default, though `vars` are, which makes a job look configured when it is not.',
        };
    }

    return {
        ok: true,
        state: 'active',
        summary: `Turbo remote cache: ACTIVE (team ${team})${needsSignature ? ' with artifact signing' : ''}.`,
    };
}

/** GitHub annotation + step-summary line, so the state is visible without reading turbo's output. */
function report(verdict) {
    const level = verdict.ok ? 'notice' : 'error';
    console.log(`::${level}::${verdict.summary}`);
    if (verdict.detail) console.log(verdict.detail);

    if (process.env.GITHUB_STEP_SUMMARY) {
        const icon = verdict.state === 'active' ? '✅' : verdict.state === 'inactive' ? 'ℹ️' : '❌';
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${icon} ${verdict.summary}\n`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const verdict = evaluate(process.env, signatureRequired());
    report(verdict);
    process.exit(verdict.ok ? 0 : 1);
}
