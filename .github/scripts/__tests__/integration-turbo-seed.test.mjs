/**
 * Pins the turbo build seed that PR runs of integration.yml restore from `next`.
 *
 * A PR run holds no remote-cache credentials, so its only warm cache is the `.turbo/cache`
 * that test.yml's Build job saves on every merge to next. integration.yml restores that entry
 * before each turbo build. Every way the handoff can break is silent: a restore that matches
 * nothing is a cache miss, the build compiles from source, and the run is green and 5 to 9
 * minutes slower per job. That is how PR runs went from ~15 to ~21 minutes on 2026-11-21 with
 * no check turning red.
 *
 * What can drift, and is asserted here:
 *   - the save key in test.yml and the restore prefix in integration.yml (a `turbo-v1` to
 *     `turbo-v2` bump in one file only);
 *   - the directory saved, the directory restored, and the directory turbo reads;
 *   - a job that builds with turbo and has no restore step, or has it after the build.
 *
 * Hand-parsed for the reason given in ./lib/workflow.mjs: .github/scripts declares no
 * dependencies, so a `yaml` import would resolve on some checkouts and not in CI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'workflows');
const readWorkflowFile = (file) => readFileSync(resolve(WORKFLOW_DIR, file), 'utf8');

/**
 * Split a workflow into `{ name, steps }` per job, each step a `{ name, body }` record in
 * file order. Jobs sit at 2 spaces and steps are the 6-space `      - ` entries; a step's
 * body is its own first line plus everything up to the next step.
 */
function readJobs(text) {
    const jobs = [];
    let job = null;
    let step = null;
    let inJobs = false;

    for (const line of text.split('\n')) {
        if (/^jobs:\s*$/.test(line)) {
            inJobs = true;
            continue;
        }
        if (!inJobs) continue;
        if (/^[A-Za-z]/.test(line)) break; // a new top-level key ends the jobs block

        const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/.exec(line);
        if (jobMatch) {
            job = { name: jobMatch[1], steps: [] };
            jobs.push(job);
            step = null;
            continue;
        }
        if (!job) continue;

        if (/^ {6}- /.test(line)) {
            step = { name: /^ {6}- name: (.+?)\s*$/.exec(line)?.[1] ?? '(unnamed)', body: [line] };
            job.steps.push(step);
            continue;
        }
        if (step) step.body.push(line);
    }
    return jobs;
}

/** A step's lines with comments dropped, so prose that mentions a command cannot count. */
const code = (step) => step.body.filter((l) => !/^\s*#/.test(l));

/** The value of a `key: value` line in a step, or undefined. */
function field(step, key) {
    return code(step)
        .map((l) => new RegExp(`^\\s*(?:- )?${key}:\\s*(.+?)\\s*$`).exec(l)?.[1])
        .find(Boolean);
}

/** The entries under a step's `restore-keys:`, in either the inline or the block form. */
function restoreKeys(step) {
    const lines = code(step);
    const at = lines.findIndex((l) => /^\s*restore-keys:/.test(l));
    if (at === -1) return [];
    const inline = /^\s*restore-keys:\s*([^|>\s].*?)\s*$/.exec(lines[at])?.[1];
    if (inline) return [inline];
    const indent = lines[at].search(/\S/);
    const keys = [];
    for (const l of lines.slice(at + 1)) {
        if (l.trim() === '') continue;
        if (l.search(/\S/) <= indent) break;
        keys.push(l.trim());
    }
    return keys;
}

/** Does this step compile packages with turbo? A `--dry` run plans a build and compiles nothing. */
function buildsWithTurbo(step) {
    return code(step).some((l) => !/^\s*-\s+name:/.test(l) && /(^|[\s;&|(])turbo\s+(run\s+)?build(?=\s|$)/.test(l) && !/--dry\b/.test(l));
}

const usesAction = (step, action) => code(step).some((l) => new RegExp(`^\\s*(?:- )?uses: ${action}@`).test(l));

// ── The seed test.yml writes ─────────────────────────────────────────────────────────────
const SEED_SAVE_STEP = 'Save turbo build cache';
const testYmlJobs = readJobs(readWorkflowFile('test.yml'));
const saveStep = testYmlJobs.flatMap((j) => j.steps).find((s) => s.name === SEED_SAVE_STEP);
const seedKey = saveStep ? field(saveStep, 'key') : undefined;
const seedPath = saveStep ? field(saveStep, 'path') : undefined;
/** The save key without its per-commit suffix: what a prefix restore has to start with. */
const seedPrefix = seedKey?.replace(/\$\{\{\s*github\.sha\s*\}\}$/, '');

// ── The jobs that should read it ─────────────────────────────────────────────────────────
const integrationText = readWorkflowFile('integration.yml');
const integrationJobs = readJobs(integrationText);
const buildingJobs = integrationJobs.filter((j) => j.steps.some(buildsWithTurbo));

/** A restore of the seed: the cache-restore action, pointed at the seed's directory. */
const isSeedRestore = (step) => usesAction(step, 'actions/cache/restore') && field(step, 'path') === seedPath;

describe('integration.yml turbo build seed', () => {
    it('reads the seed key test.yml saves (guards against the parser matching nothing)', () => {
        expect(saveStep, `test.yml must keep its "${SEED_SAVE_STEP}" step`).toBeDefined();
        expect(usesAction(saveStep, 'actions/cache/save')).toBe(true);
        expect(seedPath).toBeTruthy();
        // The key must end in the commit, so that stripping it leaves a usable prefix.
        expect(seedKey).toMatch(/-\$\{\{\s*github\.sha\s*\}\}$/);
        expect(seedPrefix).toMatch(/-$/);
    });

    it('finds the jobs that build with turbo (guards against a vacuous pass)', () => {
        expect(buildingJobs.map((j) => j.name)).toEqual(
            expect.arrayContaining(['integration-sqlserver', 'cross-server-invalidation', 'codegen-drift']),
        );
        // The tier-selection dry run in `changes` plans a build without compiling anything.
        expect(buildingJobs.map((j) => j.name)).not.toContain('changes');
    });

    it('every job that builds with turbo restores the seed before its first build', () => {
        const gaps = buildingJobs
            .filter((j) => {
                const firstBuild = j.steps.findIndex(buildsWithTurbo);
                const restore = j.steps.findIndex(isSeedRestore);
                return restore === -1 || restore > firstBuild;
            })
            .map((j) => j.name);
        expect(gaps, 'these jobs build cold on every PR run').toEqual([]);
    });

    it('every seed restore falls back to the prefix of the key test.yml saves', () => {
        const restores = integrationJobs.flatMap((j) => j.steps.filter(isSeedRestore).map((s) => ({ job: j.name, step: s })));
        expect(restores.length).toBeGreaterThanOrEqual(buildingJobs.length);
        for (const { job, step } of restores) {
            expect(restoreKeys(step), `${job}: restore-keys must be the save key's prefix`).toEqual([seedPrefix]);
            // The exact key is the same expression the save uses, so a re-run of a seeded commit hits it.
            expect(field(step, 'key'), `${job}: key`).toBe(seedKey);
        }
    });

    it('turbo reads its cache from the directory the seed is restored into', () => {
        const cacheDir = /^ {2}TURBO_CACHE_DIR:\s*(.+?)\s*$/m.exec(integrationText)?.[1];
        expect(cacheDir, 'integration.yml must pin TURBO_CACHE_DIR at workflow level').toBe(seedPath);
        const testYmlCacheDir = /^ {2}TURBO_CACHE_DIR:\s*(.+?)\s*$/m.exec(readWorkflowFile('test.yml'))?.[1];
        expect(testYmlCacheDir, 'test.yml saves the directory turbo writes').toBe(seedPath);
    });

    // The seed is ~3 GB and the repository shares one LRU-evicted Actions cache budget. A copy
    // saved per PR run would evict the entry on next that every PR restores from.
    it('never saves the turbo cache: the seed has one writer, the backstop on next', () => {
        const saves = integrationJobs.flatMap((j) =>
            j.steps.filter((s) => usesAction(s, 'actions/cache/save') && field(s, 'path') === seedPath).map(() => j.name),
        );
        expect(saves).toEqual([]);
    });
});

// PR-triggered turbo builds in sibling workflows share the same no-remote-cache constraint as
// integration.yml and must also restore next's build seed before their first turbo build.
const OTHER_SEEDED_WORKFLOWS = [
    { file: 'pg-migrations.yml', expectedJobs: ['pg-parity', 'managed-host'] },
    { file: 'claude-pack.yml', expectedJobs: ['e2e-bundle-smoke'] },
    {
        file: 'eds-integration.yml',
        expectedJobs: [
            'pg-driver-integration',
            'mongo-driver-integration',
            'sqlserver-driver-integration',
            'mysql-driver-integration',
            'oracle-driver-integration',
        ],
    },
];

describe('other PR workflows — turbo build seed', () => {
    for (const { file, expectedJobs } of OTHER_SEEDED_WORKFLOWS) {
        it(`${file} pins TURBO_CACHE_DIR and restores next's seed before each PR turbo build`, () => {
            const text = readWorkflowFile(file);
            const cacheDir = /^ {2}TURBO_CACHE_DIR:\s*(.+?)\s*$/m.exec(text)?.[1];
            expect(cacheDir, `${file} must pin TURBO_CACHE_DIR to ${seedPath}`).toBe(seedPath);

            const jobs = readJobs(text);
            for (const name of expectedJobs) {
                const job = jobs.find((j) => j.name === name);
                expect(job, `${file} → ${name}`).toBeDefined();
                const firstBuild = job.steps.findIndex(buildsWithTurbo);
                const restore = job.steps.findIndex(isSeedRestore);
                expect(firstBuild, `${file} → ${name} builds with turbo`).toBeGreaterThanOrEqual(0);
                expect(restore, `${file} → ${name} restores seed before build`).toBeGreaterThanOrEqual(0);
                expect(restore, `${file} → ${name} restores seed before build`).toBeLessThan(firstBuild);
                expect(restoreKeys(job.steps[restore])).toEqual([seedPrefix]);
            }
        });
    }

    it('build.yml pins TURBO_CACHE_DIR and restores next build seed before pnpm run build', () => {
        const text = readWorkflowFile('build.yml');
        const cacheDir = /^ {2}TURBO_CACHE_DIR:\s*(.+?)\s*$/m.exec(text)?.[1];
        expect(cacheDir).toBe(seedPath);
        const buildJob = readJobs(text).find((j) => j.name === 'build-only');
        expect(buildJob).toBeDefined();
        const restore = buildJob.steps.findIndex(isSeedRestore);
        const buildIdx = buildJob.steps.findIndex((s) => code(s).some((l) => /\bpnpm run build\b/.test(l)));
        expect(restore).toBeGreaterThanOrEqual(0);
        expect(restore).toBeLessThan(buildIdx);
        expect(restoreKeys(buildJob.steps[restore])).toEqual([seedPrefix]);
    });
});
