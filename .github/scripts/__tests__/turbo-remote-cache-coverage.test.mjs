/**
 * Pins the Turbo remote-cache wiring across EVERY workflow.
 *
 * The remote cache is configured entirely by environment variables, and every way of getting it
 * wrong is silent:
 *
 *   - A job that runs `turbo` without TURBO_TOKEN does not fail. Turbo reports
 *     "Remote caching disabled" and rebuilds from scratch. The run is green, just slower.
 *   - A job holding TURBO_TOKEN without TURBO_REMOTE_CACHE_SIGNATURE_KEY does not fail either.
 *     It logs `signing artifact failed: signature secret key not found` and uploads NOTHING,
 *     so the job quietly stops contributing to the cache it reads from.
 *   - A reusable workflow invoked with `uses:` receives no secrets unless the caller passes
 *     them. `vars` DO propagate, so the job looks configured while the token is empty.
 *
 * None of that shows up on the PR page, and none of it turns a check red — the only symptom is
 * CI gradually getting slower for reasons nobody can attribute. So the wiring is asserted here
 * rather than trusted to review.
 *
 * Deliberately hand-parses instead of importing `yaml`: .github/scripts is not an npm workspace
 * and declares no dependencies, so a bare `yaml` import resolves only via a parent node_modules
 * that exists on some checkouts and not in CI. Same reasoning as ./lib/workflow.mjs.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = resolve(HERE, '..', '..', 'workflows');
const REPO_ROOT = resolve(HERE, '..', '..', '..');

/** The four vars a turbo-invoking job needs. TURBO_API is intentionally an unset variable. */
const REQUIRED_VARS = ['TURBO_TOKEN', 'TURBO_TEAM', 'TURBO_API', 'TURBO_REMOTE_CACHE_SIGNATURE_KEY'];

/** The two Turbo remote-cache WRITE credentials. TURBO_TEAM/TURBO_API are not secrets. */
const TURBO_SECRETS = ['TURBO_TOKEN', 'TURBO_REMOTE_CACHE_SIGNATURE_KEY'];

/** Triggers that run workflow code on behalf of a pull request. */
const PR_TRIGGERS = ['pull_request', 'pull_request_target'];

/**
 * The PR triggers (`pull_request`, `pull_request_target`) in a workflow's top-level `on:`.
 * Handles the block form, the inline list `on: [push, pull_request]` and the scalar
 * `on: pull_request`.
 */
function pullRequestTriggers(text) {
    const found = new Set();
    let inOn = false;
    for (const line of text.split('\n')) {
        if (/^on:\s*(?:#.*)?$/.test(line)) {
            inOn = true;
            continue;
        }
        const inlineOn = /^on:\s*\[([^\]]+)\]/.exec(line);
        if (inlineOn) {
            for (const t of inlineOn[1].split(',')) if (PR_TRIGGERS.includes(t.trim())) found.add(t.trim());
            break;
        }
        const scalarOn = /^on:\s*([A-Za-z_]+)\s*(?:#.*)?$/.exec(line);
        if (scalarOn) {
            if (PR_TRIGGERS.includes(scalarOn[1])) found.add(scalarOn[1]);
            break;
        }
        if (!inOn) continue;
        if (/^[A-Za-z]/.test(line)) break;
        const trigger = /^ {2}([A-Za-z_]+)\s*:/.exec(line);
        if (trigger && PR_TRIGGERS.includes(trigger[1])) found.add(trigger[1]);
    }
    return found;
}

/** Local reusable workflows a workflow calls with `uses: ./.github/workflows/<file>`. */
function calledWorkflows(text) {
    return [...text.matchAll(/^\s*uses:\s*\.\/\.github\/workflows\/([\w.-]+)\s*$/gm)].map(([, f]) => f);
}

/**
 * Map each workflow file to the PR triggers it can run under. A reusable workflow runs with its
 * CALLER's `github.event_name`, so it inherits the triggers of every workflow that calls it.
 */
function prTriggersByWorkflow(texts) {
    const triggers = new Map([...texts].map(([file, text]) => [file, pullRequestTriggers(text)]));
    let changed = true;
    while (changed) {
        changed = false;
        for (const [file, text] of texts) {
            for (const called of calledWorkflows(text)) {
                const target = triggers.get(called);
                if (!target) continue;
                for (const t of triggers.get(file)) {
                    if (!target.has(t)) {
                        target.add(t);
                        changed = true;
                    }
                }
            }
        }
    }
    return triggers;
}

/** A line that mentions either write credential, in dot or bracket form. */
const SECRET_MENTION = new RegExp(String.raw`secrets\s*(?:\.\s*|\[\s*['"])(?:${TURBO_SECRETS.join('|')})\b`);

/**
 * The ONLY accepted way for a pull_request-reachable workflow to mention a write credential:
 * a whole `KEY: ${{ github.event_name != 'pull_request' && secrets.X || '' }}` line. A substring
 * match is not enough — `!= 'pull_request' || secrets.X` contains the gate text and still leaks.
 */
const GATED_LINE = new RegExp(
    String.raw`^\s*(?:-\s+)?[A-Za-z_][A-Za-z0-9_]*:\s*\$\{\{\s*github\.event_name\s*!=\s*'pull_request'\s*&&\s*secrets\.(?:${TURBO_SECRETS.join('|')})\s*\|\|\s*''\s*\}\}\s*(?:#.*)?$`,
);

/**
 * Every line of a workflow that hands a Turbo write credential to a PR run. Scans every line,
 * whatever its indentation, so step-level `env:`, `with:` and `secrets:` blocks are covered as
 * well as job-level `env:`.
 *
 * Under `pull_request_target`, `github.event_name` is `pull_request_target`, so the gate above
 * does NOT close it: any mention at all in such a workflow is a leak.
 */
function ungatedTurboSecretLines(text, triggers) {
    if (triggers.size === 0) return [];
    const leaks = [];
    text.split('\n').forEach((line, i) => {
        if (/^\s*#/.test(line) || !SECRET_MENTION.test(line)) return;
        if (triggers.has('pull_request_target') || !GATED_LINE.test(line)) leaks.push(`${i + 1}: ${line.trim()}`);
    });
    return leaks;
}

/**
 * Parse one workflow into `{ name, env, runScript }` per job.
 *
 * Indentation in these files is uniform: jobs at 2 spaces, job keys at 4, job-level `env:`
 * entries at 6. Step-level `env:` sits at 8 and `services:` blocks deeper still, so anchoring
 * job env to exactly 6 spaces keeps those out.
 */
function parseJobs(text) {
    const lines = text.split('\n');
    const jobs = [];
    let job = null;
    let inJobsBlock = false;
    let inJobEnv = false;
    let runIndent = null; // set while consuming a `run: |` block scalar

    for (const line of lines) {
        if (/^jobs:\s*$/.test(line)) {
            inJobsBlock = true;
            continue;
        }
        if (!inJobsBlock) continue;

        // A new top-level key (column 0, non-comment, non-blank) ends the jobs block.
        if (/^[A-Za-z]/.test(line)) break;

        const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/.exec(line);
        if (jobMatch) {
            if (job) jobs.push(job);
            job = { name: jobMatch[1], env: new Set(), runScript: [] };
            inJobEnv = false;
            runIndent = null;
            continue;
        }
        if (!job) continue;

        // ── job-level env block ────────────────────────────────────────────────
        // `env:` may carry a trailing comment (`env: # Turbo remote cache — see …`), which is
        // valid YAML and is how several jobs in eds-integration.yml are written.
        if (/^ {4}env:\s*(?:#.*)?$/.test(line)) {
            inJobEnv = true;
            continue;
        }
        if (inJobEnv) {
            const entry = /^ {6}([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
            if (entry) {
                job.env.add(entry[1]);
                continue;
            }
            // A comment inside the block, or a blank line, does not end it.
            if (/^\s*(#.*)?$/.test(line)) continue;
            inJobEnv = false;
        }

        // ── run: scripts, so `turbo` in a comment or a step NAME can't count ───
        if (runIndent !== null) {
            const indent = line.search(/\S/);
            if (line.trim() === '' || indent > runIndent) {
                if (!/^\s*#/.test(line)) job.runScript.push(line);
                continue;
            }
            runIndent = null; // dedented out of the block scalar
        }

        const runMatch = /^(\s*)(?:- )?run:\s*(.*)$/.exec(line);
        if (runMatch) {
            const [, indent, value] = runMatch;
            if (/^[|>]/.test(value.trim())) {
                runIndent = indent.length; // block scalar; body follows, more indented
            } else {
                job.runScript.push(value);
            }
        }
    }
    if (job) jobs.push(job);
    return jobs;
}

/** Every job in every workflow, tagged with its file. */
function allJobs() {
    const out = [];
    for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml'))) {
        const text = readFileSync(resolve(WORKFLOW_DIR, file), 'utf8');
        for (const job of parseJobs(text)) out.push({ file, ...job });
    }
    return out;
}

/** Does this job actually shell out to turbo? */
function invokesTurbo(job) {
    // `turbo` followed by whitespace or end of line, so a path like `turbo.json` in a path list
    // is not mistaken for an invocation.
    return job.runScript.some((l) => /(^|[\s;&|(])(npx\s+)?turbo(?=\s|$)/.test(l));
}

const JOBS = allJobs();

describe('turbo remote cache — env coverage', () => {
    it('finds jobs to check (guards against the parser silently matching nothing)', () => {
        // Without this, a parser regression would make every assertion below vacuously true.
        expect(JOBS.length).toBeGreaterThan(20);
        expect(JOBS.filter(invokesTurbo).length).toBeGreaterThan(10);
    });

    it('every job that invokes turbo declares all four TURBO_* vars', () => {
        const gaps = JOBS.filter(invokesTurbo)
            .map((j) => ({ job: `${j.file} → ${j.name}`, missing: REQUIRED_VARS.filter((v) => !j.env.has(v)) }))
            .filter((g) => g.missing.length);

        expect(gaps.map((g) => `${g.job} is missing ${g.missing.join(', ')}`)).toEqual([]);
    });

    // The token and the signature key must travel together. A job with the token but no key
    // reads the cache and writes nothing to it — the most expensive failure mode, because it
    // looks like participation.
    it('the token and the signature key are declared by exactly the same jobs', () => {
        const withToken = JOBS.filter((j) => j.env.has('TURBO_TOKEN')).map((j) => `${j.file} → ${j.name}`);
        const withKey = JOBS.filter((j) => j.env.has('TURBO_REMOTE_CACHE_SIGNATURE_KEY')).map((j) => `${j.file} → ${j.name}`);
        expect(withKey.sort()).toEqual(withToken.sort());
    });

    // PR #6817 cache-poisoning boundary: no pull_request-triggered job may ever receive the
    // remote-cache write token or HMAC signing key. Without this gate, unreviewed PR code could
    // sign and upload poisoned build artifacts that push/release runs later replay.
    // Every LINE is checked, not just job-level env, and the whole expression must match.
    it('every pull_request-reachable workflow gates TURBO_TOKEN and TURBO_REMOTE_CACHE_SIGNATURE_KEY off pull_request', () => {
        const texts = new Map(
            readdirSync(WORKFLOW_DIR)
                .filter((f) => f.endsWith('.yml'))
                .map((f) => [f, readFileSync(resolve(WORKFLOW_DIR, f), 'utf8')]),
        );
        const triggers = prTriggersByWorkflow(texts);

        // Non-vacuity: the gated form must actually be found, in several PR-triggered workflows.
        const gatedFiles = [...texts].filter(
            ([f, text]) => triggers.get(f).size > 0 && text.split('\n').some((l) => GATED_LINE.test(l)),
        );
        expect(gatedFiles.length).toBeGreaterThan(5);

        const leaks = [...texts].flatMap(([f, text]) =>
            ungatedTurboSecretLines(text, triggers.get(f)).map((l) => `${f}:${l}`),
        );
        expect(
            leaks,
            "PR-reachable workflows must use exactly `${{ github.event_name != 'pull_request' && secrets.X || '' }}`",
        ).toEqual([]);
    });

    // Secrets are not inherited by reusable workflows. `vars` are — so a caller that forgets
    // this produces a job with TURBO_TEAM set and TURBO_TOKEN empty, which reads as configured.
    it('callers of a reusable workflow that uses the cache pass their secrets through', () => {
        for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml'))) {
            const text = readFileSync(resolve(WORKFLOW_DIR, file), 'utf8');
            const calls = [...text.matchAll(/^ {4}uses: \.\/\.github\/workflows\/([\w.-]+)\s*$/gm)];
            for (const [, called] of calls) {
                const calledText = readFileSync(resolve(WORKFLOW_DIR, called), 'utf8');
                if (!calledText.includes('TURBO_TOKEN')) continue;
                expect(text, `${file} calls ${called}, which uses the remote cache, so it must pass secrets`).toMatch(
                    /^ {4}secrets: inherit\s*$/m,
                );
            }
        }
    });
});

// The gate check above passes on today's files, so these pin what it would CATCH.
describe('turbo remote cache — the PR gate check itself', () => {
    const GATED = "      TURBO_TOKEN: ${{ github.event_name != 'pull_request' && secrets.TURBO_TOKEN || '' }}";
    const wf = (on, body) => `on:\n${on}\njobs:\n  j:\n    runs-on: ubuntu-latest\n${body}\n`;
    const PR = new Set(['pull_request']);

    it('reads pull_request and pull_request_target in block, inline and scalar forms', () => {
        expect([...pullRequestTriggers(wf('  pull_request:\n  push:', ''))]).toEqual(['pull_request']);
        expect([...pullRequestTriggers(wf('  pull_request_target:\n    types: [opened]', ''))]).toEqual([
            'pull_request_target',
        ]);
        expect([...pullRequestTriggers('on: [push, pull_request_target]\n')]).toEqual(['pull_request_target']);
        expect([...pullRequestTriggers('on: pull_request\n')]).toEqual(['pull_request']);
        expect(pullRequestTriggers(wf('  push:\n  workflow_dispatch:', '')).size).toBe(0);
    });

    it('accepts the exact gate in job-level env', () => {
        expect(ungatedTurboSecretLines(wf('  pull_request:', `    env:\n${GATED}`), PR)).toEqual([]);
    });

    it('flags an ungated secret in a STEP-level env', () => {
        const body = `    steps:\n      - run: npx turbo build\n        env:\n          TURBO_TOKEN: \${{ secrets.TURBO_TOKEN }}`;
        expect(ungatedTurboSecretLines(wf('  pull_request:', body), PR)).toHaveLength(1);
    });

    it('flags a value that contains the gate text but uses the wrong operator', () => {
        const body = "    env:\n      TURBO_TOKEN: ${{ github.event_name != 'pull_request' || secrets.TURBO_TOKEN }}";
        expect(ungatedTurboSecretLines(wf('  pull_request:', body), PR)).toHaveLength(1);
    });

    it("flags a gate without the trailing `|| ''`", () => {
        const body = "    env:\n      TURBO_TOKEN: ${{ github.event_name != 'pull_request' && secrets.TURBO_TOKEN }}";
        expect(ungatedTurboSecretLines(wf('  pull_request:', body), PR)).toHaveLength(1);
    });

    it('flags bracket access to the secret', () => {
        const body = "    env:\n      TURBO_REMOTE_CACHE_SIGNATURE_KEY: ${{ secrets['TURBO_REMOTE_CACHE_SIGNATURE_KEY'] }}";
        expect(ungatedTurboSecretLines(wf('  pull_request:', body), PR)).toHaveLength(1);
    });

    it('flags even the exact gate under pull_request_target, where event_name is not pull_request', () => {
        const text = wf('  pull_request_target:', `    env:\n${GATED}`);
        expect(ungatedTurboSecretLines(text, pullRequestTriggers(text))).toHaveLength(1);
    });

    it('ignores comments and workflows no PR can reach', () => {
        expect(ungatedTurboSecretLines(wf('  pull_request:', '    # TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}'), PR)).toEqual([]);
        const ungated = wf('  push:', '    env:\n      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}');
        expect(ungatedTurboSecretLines(ungated, pullRequestTriggers(ungated))).toEqual([]);
    });

    it('a reusable workflow inherits the PR triggers of its callers', () => {
        const texts = new Map([
            ['caller.yml', wf('  pull_request:', '    uses: ./.github/workflows/callee.yml\n    secrets: inherit')],
            ['callee.yml', 'on:\n  workflow_call:\n'],
            ['other.yml', 'on:\n  workflow_call:\n'],
        ]);
        const triggers = prTriggersByWorkflow(texts);
        expect([...triggers.get('callee.yml')]).toEqual(['pull_request']);
        expect(triggers.get('other.yml').size).toBe(0);
    });
});

// This guard only protects anything if it actually RUNS when one of the workflows it checks is
// edited. test.yml's `changes` job skips the lanes for PRs outside its path list, so a workflow
// absent from that list is a workflow whose cache wiring can be broken by a PR that never runs
// this suite.
describe('turbo remote cache — the guard runs when it matters', () => {
    it('test.yml triggers on every workflow whose cache wiring this file asserts', () => {
        const testYml = readFileSync(resolve(WORKFLOW_DIR, 'test.yml'), 'utf8');
        const pathsBlock = testYml.match(/<<'PATHS'\n([\s\S]*?)\n\s*PATHS\n/);
        expect(pathsBlock, "test.yml's changes job must keep its <<'PATHS' list").not.toBeNull();
        const triggerPaths = pathsBlock[1]
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'));

        const needsTrigger = readdirSync(WORKFLOW_DIR)
            .filter((f) => f.endsWith('.yml'))
            .filter((f) => {
                const text = readFileSync(resolve(WORKFLOW_DIR, f), 'utf8');
                if (text.includes('TURBO_TOKEN')) return true;
                // Callers matter too: the secrets: inherit assertion lives in the CALLER.
                return [...text.matchAll(/^ {4}uses: \.\/\.github\/workflows\/([\w.-]+)\s*$/gm)].some(([, called]) =>
                    readFileSync(resolve(WORKFLOW_DIR, called), 'utf8').includes('TURBO_TOKEN'),
                );
            });

        const missing = needsTrigger.filter((f) => !triggerPaths.includes(`.github/workflows/${f}`));
        expect(missing, 'add these to test.yml\'s pull_request paths').toEqual([]);
    });
});

describe('turbo remote cache — signing', () => {
    it('turbo.json enables artifact signature verification', () => {
        const turboJson = JSON.parse(readFileSync(resolve(REPO_ROOT, 'turbo.json'), 'utf8'));
        expect(turboJson.remoteCache?.signature).toBe(true);
    });
});
