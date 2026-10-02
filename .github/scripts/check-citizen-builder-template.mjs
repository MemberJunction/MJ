#!/usr/bin/env node
/**
 * check-citizen-builder-template.mjs — the CLI's bundled copy of the citizen-builder template
 * must be identical to citizen-builder/.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────────────────
 * `mj agent init` scaffolds a workspace from the citizen-builder template. The template is
 * edited in one place, citizen-builder/ at the repo root, and committed a second time as
 * packages/MJCLI/src/init-templates/citizen-builder/. The second copy is not redundant:
 *
 *   1. It is @memberjunction/cli's build-cache key for the template. turbo.json declares no
 *      `inputs` for `build`, so the CLI's cache key covers only files inside packages/MJCLI.
 *      An edit to citizen-builder/ alone leaves that key unchanged, and a cache hit restores a
 *      dist/ whose bundled template predates the edit: scripts/copy-regression-assets.mjs,
 *      which copies the template into dist/, runs only on a cache miss.
 *   2. It is what the CLI reads when it runs from source. Run that way, `mj agent init`
 *      resolves src/init-templates/citizen-builder before citizen-builder/, so vitest scaffolds
 *      workspaces from this copy.
 *
 * Nothing kept the two in step. A build rewrites the copy from citizen-builder/ but cannot
 * commit it, and an early revision of #4586 changed four template files and not the copy: the
 * CLI's own tests went on scaffolding the old template, and passed.
 *
 * This guard fails when the trees differ in their file set, a file's content, or a file's
 * executable bit (the workspace's scripts are run directly). It runs in test.yml's guards
 * job rather than as a vitest test in @memberjunction/cli because, on the PR shape that
 * breaks it (only citizen-builder/ changes), the affected-package filter selects nothing and
 * the CLI's test cache is not invalidated. test.yml's `paths` list citizen-builder/** for the
 * same reason.
 *
 * Files are listed the way git sees them, tracked plus untracked-but-not-ignored, so a local
 * .env, a workspace's state or node_modules under either tree is never compared, copied or
 * deleted.
 *
 * Usage:
 *   node .github/scripts/check-citizen-builder-template.mjs              # check; exit 1 on drift
 *   node .github/scripts/check-citizen-builder-template.mjs --write      # make the copy match
 *   node .github/scripts/check-citizen-builder-template.mjs --self-test  # in-memory fixtures only
 *
 * Exit codes: 0 in step, 1 drift (or a failed self-test), 2 cannot run.
 */
import { execFileSync } from 'node:child_process';
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    rmdirSync,
    statSync,
    unlinkSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_DIR = 'citizen-builder';
export const COPY_DIR = 'packages/MJCLI/src/init-templates/citizen-builder';
const WRITE_COMMAND = 'node .github/scripts/check-citizen-builder-template.mjs --write';

// ---------------------------------------------------------------------------
// Core: pure functions over in-memory trees (Map<relativePath, { content, executable }>)
// ---------------------------------------------------------------------------

/**
 * Compares the template's source with its bundled copy. No filesystem, no process.
 *
 * @param {Map<string, { content: Buffer, executable: boolean }>} source
 * @param {Map<string, { content: Buffer, executable: boolean }>} copy
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function compareTrees(source, copy) {
    if (source.size === 0) {
        // A comparison that looked at nothing has not passed: a renamed directory or a wrong
        // working directory must fail loudly instead of reporting the trees as equal.
        return { ok: false, errors: [`${SOURCE_DIR}/ lists no files, so there is nothing to compare`] };
    }

    const errors = [];
    for (const path of [...source.keys()].sort()) {
        const problem = describeDifference(source.get(path), copy.get(path));
        if (problem) {
            errors.push(`${problem}: ${path}`);
        }
    }
    for (const path of [...copy.keys()].sort()) {
        if (!source.has(path)) {
            errors.push(`only in the copy (deleted from ${SOURCE_DIR}/?): ${path}`);
        }
    }
    return { ok: errors.length === 0, errors };
}

/**
 * @param {{ content: Buffer, executable: boolean }} sourceFile
 * @param {{ content: Buffer, executable: boolean } | undefined} copyFile
 * @returns {string | null} what differs, or null when the copy matches
 */
function describeDifference(sourceFile, copyFile) {
    if (!copyFile) {
        return 'missing from the copy';
    }
    if (!sourceFile.content.equals(copyFile.content)) {
        return 'content differs';
    }
    if (sourceFile.executable !== copyFile.executable) {
        return `executable bit differs (${sourceFile.executable ? 'set' : 'clear'} in ${SOURCE_DIR}/)`;
    }
    return null;
}

/**
 * The changes that make the copy match the source. No filesystem, no process.
 *
 * @param {Map<string, { content: Buffer, executable: boolean }>} source
 * @param {Map<string, { content: Buffer, executable: boolean }>} copy
 * @returns {{ write: string[], remove: string[] }}
 */
export function planSync(source, copy) {
    const write = [...source.keys()].filter((path) => describeDifference(source.get(path), copy.get(path)) !== null);
    const remove = [...copy.keys()].filter((path) => !source.has(path));
    return { write: write.sort(), remove: remove.sort() };
}

// ---------------------------------------------------------------------------
// Self-test fixtures: exercised via --self-test, never against the real trees.
// ---------------------------------------------------------------------------

const file = (text, executable = false) => ({ content: Buffer.from(text), executable });
const tree = (entries) => new Map(Object.entries(entries));

const BASE = {
    'docker/Dockerfile': file('FROM node:24\n'),
    'scripts/docker-entrypoint.sh': file('#!/bin/bash\nset -e\n', true),
    '.env.example': file('MJ_VERSION=\n'),
};

/** [name, expectedOk, source, copy, marker the errors must contain (null when ok)] */
const COMPARE_FIXTURES = [
    ['identical trees pass', true, tree(BASE), tree(BASE), null],
    [
        'a file whose content differs fails, naming the file',
        false,
        tree(BASE),
        tree({ ...BASE, 'docker/Dockerfile': file('FROM node:22\n') }),
        'content differs: docker/Dockerfile',
    ],
    [
        'a file missing from the copy fails',
        false,
        tree(BASE),
        tree({ 'docker/Dockerfile': BASE['docker/Dockerfile'], '.env.example': BASE['.env.example'] }),
        'missing from the copy: scripts/docker-entrypoint.sh',
    ],
    [
        'a file only in the copy fails',
        false,
        tree(BASE),
        tree({ ...BASE, 'scripts/removed.sh': file('echo old\n', true) }),
        'only in the copy (deleted from citizen-builder/?): scripts/removed.sh',
    ],
    [
        'an executable bit that differs fails',
        false,
        tree(BASE),
        tree({ ...BASE, 'scripts/docker-entrypoint.sh': file('#!/bin/bash\nset -e\n', false) }),
        'executable bit differs (set in citizen-builder/): scripts/docker-entrypoint.sh',
    ],
    ['an empty source fails rather than passing vacuously', false, tree({}), tree({}), 'lists no files'],
];

/** [name, source, copy, expected plan] */
const PLAN_FIXTURES = [
    ['identical trees need no changes', tree(BASE), tree(BASE), { write: [], remove: [] }],
    [
        'drifted, missing and extra files are all planned',
        tree(BASE),
        tree({
            'docker/Dockerfile': file('FROM node:22\n'),
            'scripts/docker-entrypoint.sh': file('#!/bin/bash\nset -e\n', false),
            'scripts/removed.sh': file('echo old\n'),
        }),
        { write: ['.env.example', 'docker/Dockerfile', 'scripts/docker-entrypoint.sh'], remove: ['scripts/removed.sh'] },
    ],
];

export function runSelfTest() {
    let failed = 0;
    for (const [name, expectedOk, source, copy, marker] of COMPARE_FIXTURES) {
        const { ok, errors } = compareTrees(source, copy);
        if (ok !== expectedOk) {
            console.error(`❌ FAIL ${name}: expected ok=${expectedOk}, got ok=${ok} ${JSON.stringify(errors)}`);
            failed++;
        } else if (marker !== null && !errors.some((error) => error.includes(marker))) {
            // Right verdict for the wrong reason: the rule this fixture is named after did not fire.
            console.error(`❌ FAIL ${name}: no error contains '${marker}'. Reported: ${JSON.stringify(errors)}`);
            failed++;
        } else {
            console.log(`✅ PASS ${name}`);
        }
    }
    for (const [name, source, copy, expected] of PLAN_FIXTURES) {
        const plan = planSync(source, copy);
        if (JSON.stringify(plan) !== JSON.stringify(expected)) {
            console.error(`❌ FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(plan)}`);
            failed++;
        } else {
            console.log(`✅ PASS ${name}`);
        }
    }
    const total = COMPARE_FIXTURES.length + PLAN_FIXTURES.length;
    if (failed > 0) {
        console.error(`\n❌ Self-test failed: ${failed} of ${total} fixture(s) failed.`);
        process.exit(1);
    }
    console.log(`\n✅ Self-test passed: all ${total} fixtures behaved as expected.`);
}

// ---------------------------------------------------------------------------
// Filesystem and git
// ---------------------------------------------------------------------------

function repoRoot() {
    return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function isFileOnDisk(absolute) {
    return existsSync(absolute) && statSync(absolute).isFile();
}

/**
 * Files under `dir` as git sees them (tracked plus untracked-but-not-ignored), relative to `dir`,
 * skipping entries deleted from the working tree.
 */
function listFiles(root, dir) {
    const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', dir], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const paths = new Set(output.split('\0').filter(Boolean));
    return [...paths]
        .filter((path) => isFileOnDisk(join(root, path)))
        .map((path) => relative(dir, path).split(sep).join('/'));
}

/**
 * Source files the copy lacks only in git's eyes: on disk under the copy, but ignored there, so
 * `--write` cannot fix them and no commit carries them. The copy's .env.example was in exactly this
 * state until .gitignore gained a negation for it.
 */
function ignoredInCopy(root, source, copy) {
    return [...source.keys()].filter((path) => !copy.has(path) && isFileOnDisk(join(root, COPY_DIR, path))).sort();
}

function readTree(root, dir) {
    const files = new Map();
    for (const path of listFiles(root, dir)) {
        const absolute = join(root, dir, path);
        files.set(path, {
            content: readFileSync(absolute),
            executable: (statSync(absolute).mode & 0o111) !== 0,
        });
    }
    return files;
}

function applySync(root, plan) {
    for (const path of plan.write) {
        const from = join(root, SOURCE_DIR, path);
        const to = join(root, COPY_DIR, path);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        chmodSync(to, statSync(from).mode & 0o777);
    }
    for (const path of plan.remove) {
        unlinkSync(join(root, COPY_DIR, path));
        pruneEmptyDirectories(join(root, COPY_DIR), dirname(join(root, COPY_DIR, path)));
    }
}

function pruneEmptyDirectories(stopAt, start) {
    for (let current = start; current.startsWith(stopAt + sep); current = dirname(current)) {
        if (readdirSync(current).length > 0) {
            return;
        }
        rmdirSync(current);
    }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function fail(message, code) {
    console.error(`❌ check-citizen-builder-template: ${message}`);
    process.exit(code);
}

function readBothTrees(root) {
    if (!existsSync(join(root, SOURCE_DIR))) {
        fail(`${SOURCE_DIR}/ not found under ${root}`, 2);
    }
    try {
        return { source: readTree(root, SOURCE_DIR), copy: readTree(root, COPY_DIR) };
    } catch (err) {
        return fail(`could not list the template with git: ${err.message}`, 2);
    }
}

function reportDrift(errors, ignored) {
    console.error(`❌ ${COPY_DIR}/ has drifted from ${SOURCE_DIR}/:`);
    for (const error of errors) {
        console.error(`   ${error}`);
    }
    console.error(
        `\n${SOURCE_DIR}/ is the template's source; the copy is what the CLI builds and tests from.` +
            `\nEdit ${SOURCE_DIR}/, then bring the copy in line and commit both:` +
            `\n   ${WRITE_COMMAND}`
    );
    if (ignored.length > 0) {
        console.error(
            `\nPresent in the copy but ignored by git, so no commit would carry them: ${ignored.join(', ')}` +
                `\nAdd a .gitignore negation for their paths under ${COPY_DIR}/, as there is for .env.example.`
        );
    }
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--self-test')) {
        runSelfTest();
        return;
    }

    const root = repoRoot();
    let { source, copy } = readBothTrees(root);

    if (args.includes('--write')) {
        const plan = planSync(source, copy);
        applySync(root, plan);
        console.log(`Wrote ${plan.write.length} file(s) and removed ${plan.remove.length} from ${COPY_DIR}/.`);
        ({ source, copy } = readBothTrees(root));
    }

    const { ok, errors } = compareTrees(source, copy);
    if (!ok) {
        reportDrift(errors, ignoredInCopy(root, source, copy));
        process.exit(1);
    }
    console.log(`✅ ${COPY_DIR}/ matches ${SOURCE_DIR}/ (${source.size} files).`);
}

const isEntry = () => {
    try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
};

if (isEntry()) {
    main();
}
