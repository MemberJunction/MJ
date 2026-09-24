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
    return job.runScript.some((l) => /(^|[\s;&|(])(npx\s+)?turbo\b/.test(l));
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

// This guard only protects anything if it actually RUNS when one of the workflows it checks is
// edited. test.yml is path-filtered, so a workflow absent from that list is a workflow whose
// cache wiring can be broken by a PR that never triggers this suite.
describe('turbo remote cache — the guard runs when it matters', () => {
    it('test.yml triggers on every workflow whose cache wiring this file asserts', () => {
        const testYml = readFileSync(resolve(WORKFLOW_DIR, 'test.yml'), 'utf8');
        const triggerPaths = [...testYml.matchAll(/^ {6}- '(.+?)'\s*$/gm)].map((m) => m[1]);

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
