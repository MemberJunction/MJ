#!/usr/bin/env node
/**
 * check-explorer-prebundle-exclude.mjs — a committed angular.json prebundle exclude holds only
 * "@memberjunction/*".
 *
 * ── WHY (issue #3875) ───────────────────────────────────────────────────────────
 * Angular's Vite dev server pre-bundles dependencies into a cache, so a linked package rebuilt by
 * `pnpm run watch` is served stale unless its scope is in `serve.options.prebundle.exclude`.
 * MJExplorer commits "@memberjunction/*" there for the repo's own dev loop. A joined workspace
 * (`mj dev workspace`) links other repos' scopes ("@mj-biz-apps/*", ...) and adds them to that
 * list on join, recording them so `mj dev workspace clean` takes them back out. Those scopes are
 * per developer: committed, they ride an unrelated PR into every checkout (it happened in #3834).
 * This guard fails such a PR.
 *
 * Checks every `serve` target's `options.prebundle.exclude` and each serve configuration's
 * `prebundle.exclude`, in every committed angular.json that parses as plain JSON. A file with
 * comments is skipped and named: the CLI never edits one either.
 *
 * Runs in test.yml's `guards` job and in `npm run check:guards`.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────────
 *   node check-explorer-prebundle-exclude.mjs                 # every committed angular.json (git ls-files)
 *   node check-explorer-prebundle-exclude.mjs <angular.json>…  # the given files
 *   node check-explorer-prebundle-exclude.mjs --self-test     # in-memory fixtures only
 *
 * Exit: 0 = pass, 1 = violation found, 2 = misconfiguration (missing file, git unavailable).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_ENTRY = '@memberjunction/*';

/** Every prebundle exclude list in a parsed angular.json, with a label naming where it sits. */
function excludeLists(angularJson) {
    const lists = [];
    for (const [projectName, project] of Object.entries(angularJson?.projects ?? {})) {
        const serve = project?.architect?.serve;
        if (serve === undefined) continue;
        if (serve.options?.prebundle?.exclude !== undefined) {
            lists.push({ where: `${projectName} serve.options`, exclude: serve.options.prebundle.exclude });
        }
        for (const [configName, config] of Object.entries(serve.configurations ?? {})) {
            if (config?.prebundle?.exclude !== undefined) {
                lists.push({ where: `${projectName} serve.configurations.${configName}`, exclude: config.prebundle.exclude });
            }
        }
    }
    return lists;
}

/**
 * Pure: the violations in one parsed angular.json. Returns { ok, errors }; errors is empty iff ok.
 */
export function evaluateAngularJson(angularJson) {
    const errors = [];
    for (const { where, exclude } of excludeLists(angularJson)) {
        if (!Array.isArray(exclude)) {
            errors.push(`${where}: prebundle.exclude is not a list`);
            continue;
        }
        const extra = exclude.filter((entry) => entry !== ALLOWED_ENTRY);
        if (extra.length > 0) {
            errors.push(
                `${where}: prebundle.exclude holds ${extra.map((e) => JSON.stringify(e)).join(', ')} — only ` +
                    `"${ALLOWED_ENTRY}" may be committed.\n` +
                    `    Linked scopes from a joined workspace are per developer; \`mj dev workspace\` adds them on join\n` +
                    `    and \`mj dev workspace clean\` removes them. Revert this file's prebundle change before committing.`
            );
        }
    }
    return { ok: errors.length === 0, errors };
}

/** [label, expectedOk, angularJson] */
export const SELF_TEST_FIXTURES = [
    [
        'passes on the committed "@memberjunction/*" only',
        true,
        { projects: { App: { architect: { serve: { options: { prebundle: { exclude: ['@memberjunction/*'] } } } } } } },
    ],
    ['passes when there is no prebundle setting', true, { projects: { App: { architect: { serve: { options: {} } } } } }],
    ['passes when there is no serve target', true, { projects: { Lib: { architect: { build: {} } } } }],
    [
        'fails on a linked app scope beside "@memberjunction/*"',
        false,
        {
            projects: {
                App: { architect: { serve: { options: { prebundle: { exclude: ['@memberjunction/*', '@mj-biz-apps/*'] } } } } },
            },
        },
    ],
    [
        'fails on an extra scope in a serve configuration',
        false,
        {
            projects: {
                App: {
                    architect: {
                        serve: {
                            options: { prebundle: { exclude: ['@memberjunction/*'] } },
                            configurations: { local_modules: { prebundle: { exclude: ['@acme/*'] } } },
                        },
                    },
                },
            },
        },
    ],
    [
        'fails when exclude is not a list',
        false,
        { projects: { App: { architect: { serve: { options: { prebundle: { exclude: '@memberjunction/*' } } } } } } },
    ],
];

export function runSelfTest() {
    let failed = 0;
    for (const [name, expectedOk, angularJson] of SELF_TEST_FIXTURES) {
        const { ok } = evaluateAngularJson(angularJson);
        if (ok !== expectedOk) {
            console.error(`❌ FAIL ${name}: expected ok=${expectedOk}, got ok=${ok}`);
            failed++;
        } else {
            console.log(`✅ PASS ${name}`);
        }
    }
    if (failed > 0) {
        console.error(`\n❌ Self-test failed: ${failed} fixture(s) failed.`);
        process.exit(1);
    }
    console.log(`\n✅ Self-test passed: all ${SELF_TEST_FIXTURES.length} fixtures behaved as expected.`);
}

function repoRoot() {
    return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** Every committed file named angular.json, as absolute paths. */
function committedAngularJsonFiles(root) {
    const out = execFileSync('git', ['ls-files', '-z', '--', 'angular.json', '**/angular.json'], { cwd: root, encoding: 'utf8' });
    return out
        .split('\0')
        .filter((p) => p.length > 0)
        .map((p) => resolve(root, p));
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--self-test')) {
        runSelfTest();
        return;
    }

    let files;
    try {
        files = args.length > 0 ? args.map((a) => resolve(a)) : committedAngularJsonFiles(repoRoot());
    } catch (err) {
        console.error(`❌ check-explorer-prebundle-exclude: could not list angular.json files: ${err.message}`);
        process.exit(2);
    }

    let violations = 0;
    for (const file of files) {
        if (!existsSync(file)) {
            console.error(`❌ check-explorer-prebundle-exclude: file not found: ${file}`);
            process.exit(2);
        }
        let parsed;
        try {
            parsed = JSON.parse(readFileSync(file, 'utf8'));
        } catch {
            console.log(`- ${file}: not plain JSON, skipped`);
            continue;
        }
        const { ok, errors } = evaluateAngularJson(parsed);
        if (ok) continue;
        violations++;
        console.error(`❌ ${file}:`);
        for (const error of errors) console.error(`   ${error}`);
    }
    if (violations > 0) process.exit(1);
    console.log(`✅ ${files.length} angular.json file(s): no prebundle exclude entry beyond "${ALLOWED_ENTRY}".`);
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
