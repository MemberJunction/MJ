import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pins the shape that lets a check be required in next-protect.
//
// A workflow skipped by a workflow-level `paths:` filter never reports its checks, so a required
// check from it holds every PR outside those paths at "Expected — Waiting for status" forever.
// The workflows below move the filter into a `changes` job instead. Reading a diff, nothing looks
// wrong when a `paths:` filter comes back; the first sign is a docs-only PR that cannot merge.

const WORKFLOW_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'workflows');

/** Workflows whose checks are, or are about to be, required in next-protect. */
const REQUIRED_CHECK_WORKFLOWS = ['changes.yml', 'test.yml', 'dependency-check.yml', 'ci-standards.yml'];

/** Workflows that gate their real job on a `changes` job, with the job each one gates. */
const GATED = [
    { file: 'dependency-check.yml', job: 'check-dependencies', check: 'Detect missing and unused dependencies' },
    { file: 'ci-standards.yml', job: 'standards', check: 'adopted standards' },
];

const read = (file) => readFileSync(resolve(WORKFLOW_DIR, file), 'utf8');

/** One top-level job's block, from its key line to the next top-level job. */
const jobBlock = (text, job) => text.split(new RegExp(`^ {2}${job}:$`, 'm'))[1].split(/^ {2}[a-z-]+:$/m)[0];

describe('required-check workflows always report', () => {
    for (const file of REQUIRED_CHECK_WORKFLOWS) {
        it(`${file} has no workflow-level paths filter`, () => {
            const triggers = read(file).split(/^jobs:$/m)[0];
            expect(triggers).not.toMatch(/^ {4}paths(-ignore)?:/m);
        });
    }

    for (const { file, job, check } of GATED) {
        describe(file, () => {
            const text = read(file);
            const block = jobBlock(text, job);

            it(`keeps the check name "${check}"`, () => {
                // Renaming it breaks the ruleset entry that points at it, and quietly: a rule
                // naming a check that no longer exists blocks nothing.
                expect(block).toMatch(new RegExp(`^ {4}name: ${check}$`, 'm'));
            });

            it(`gates "${job}" on the changes job`, () => {
                expect(block).toMatch(/^ {4}needs: changes$/m);
            });

            it('fails closed when change detection fails', () => {
                // A skipped required check counts as passing, so a failed `changes` job must run
                // the real check rather than skip it.
                expect(block).toMatch(/needs\.changes\.result != 'success' \|\| needs\.changes\.outputs\.relevant == 'true'/);
            });
        });
    }
});
