/**
 * Minimal reader for .github/workflows/test.yml, shared by the tests that pin its SHAPE.
 *
 * Deliberately parses by hand instead of importing `yaml`: .github/scripts is not an npm
 * workspace and declares no dependencies, so a bare `yaml` import resolves only by walking up
 * to a parent node_modules that exists on some checkouts and not in CI.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKFLOW = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'workflows', 'test.yml');

/** The raw text of test.yml. */
export function readWorkflow() {
    return readFileSync(WORKFLOW, 'utf8');
}

/**
 * Split one job's step list into `{ name, body }` records, in file order.
 *
 * Steps are the 6-space `      - name:` entries; a step's body runs to the next such entry.
 * Scanning stops at the next top-level job so a neighbouring job's steps can't leak in.
 */
export function readJobSteps(jobName) {
    const lines = readWorkflow().split('\n');
    const steps = [];
    let inJob = false;
    let current = null;

    for (const line of lines) {
        const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
        if (jobMatch) {
            if (current) steps.push(current);
            current = null;
            inJob = jobMatch[1] === jobName;
            continue;
        }
        if (!inJob) continue;

        const stepMatch = /^ {6}- name: (.+?)\s*$/.exec(line);
        if (stepMatch) {
            if (current) steps.push(current);
            current = { name: stepMatch[1], body: [] };
            continue;
        }
        if (current) current.body.push(line);
    }
    if (current) steps.push(current);
    return steps;
}

/** The `if:` expression declared directly on a step, or undefined when it declares none. */
export function stepCondition(step) {
    return step.body.map((l) => /^ {8}if:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean);
}

/** The top-level job names, in file order. */
export function readJobNames() {
    const lines = readWorkflow().split('\n');
    const names = [];
    let inJobs = false;
    for (const line of lines) {
        if (/^jobs:\s*$/.test(line)) {
            inJobs = true;
            continue;
        }
        if (!inJobs) continue;
        if (/^\S/.test(line)) break; // a new top-level key ends the jobs block
        const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
        if (m) names.push(m[1]);
    }
    return names;
}

/**
 * The `needs:` of a job, as an array. Handles both the inline-list form
 * (`needs: [a, b]`) and the single-value form (`needs: a`).
 */
export function readJobNeeds(jobName) {
    const lines = readWorkflow().split('\n');
    let inJob = false;
    for (const line of lines) {
        const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
        if (jobMatch) {
            inJob = jobMatch[1] === jobName;
            continue;
        }
        if (!inJob) continue;
        const m = /^ {4}needs:\s*(.+?)\s*$/.exec(line);
        if (!m) continue;
        const raw = m[1].trim();
        return raw.startsWith('[')
            ? raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
            : [raw];
    }
    return [];
}
