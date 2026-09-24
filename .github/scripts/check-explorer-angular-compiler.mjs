#!/usr/bin/env node
/**
 * check-explorer-angular-compiler.mjs — MJExplorer must declare "@angular/compiler" itself.
 *
 * ── WHY (issue #4427) ───────────────────────────────────────────────────────────
 * A host repo produced by `mj install` could not build its Angular Explorer app:
 * node_modules/@angular/ had compiler-cli but no compiler, and the build died with a bare
 * ERR_MODULE_NOT_FOUND naming a bundle chunk rather than the missing package.
 *
 * The monorepo hides this dependency two ways that a host repo does NOT inherit:
 *   1. This repo's root package.json declares "@angular/compiler" itself, which puts it in the
 *      REPO-ROOT node_modules. That directory is an ancestor of packages/MJExplorer/**, so Node's
 *      upward module resolution finds it from MJExplorer's own source even though MJExplorer's
 *      manifest never declared it. (Verified by walking the chain: .../MJExplorer/src/node_modules
 *      miss, .../MJExplorer/node_modules miss, .../packages/node_modules miss, MJ/node_modules HIT.)
 *   2. pnpm satisfies each dependent's peer INSIDE that dependent's own virtual-store directory,
 *      and that is what hides the exact import which fails in a host. `compiler-cli`'s internal
 *      `import '@angular/compiler'` resolves from its realpath in the store, where pnpm has placed
 *      a `compiler` symlink in a directory whose name encodes the peer:
 *          .pnpm/@angular+compiler-cli@<v>_@angular+compiler@<v>_typescript@<v>/node_modules/
 *      The same holds for `platform-browser-dynamic`. pnpm only installs those peers at all
 *      because the joined dev workspace turns peer auto-install on — `auto-install-peers` is a
 *      PNPM key (npm has no such config; npm 7+ auto-installs peers unconditionally). That switch
 *      has already moved once, from the workspace `.npmrc` to `pnpm-workspace.yaml`
 *      (`PEER_INSTALL_SETTINGS`, packages/MJCLI/src/lib/dev-workspace/build.ts), so this comment
 *      names the BEHAVIOUR rather than the file that currently carries it.
 *
 * A host repo produced by `mj install` inherits neither: its flat npm node_modules has no root
 * declaration for this package, and npm has no per-dependent virtual store to put a peer in.
 * Worse, packages/MJInstaller/src/phases/DependencyPhase.ts retries `npm install` with
 * `--legacy-peer-deps` whenever npm reports an ERESOLVE conflict — and that flag disables
 * npm's automatic peer installation outright. A host repo that hits any ERESOLVE during
 * install loses automatic peer resolution entirely, so an undeclared "@angular/compiler"
 * is simply absent afterward.
 *
 * "@angular/compiler" is a non-optional peer of two of MJExplorer's own declared
 * dependencies:
 *   - @angular/platform-browser-dynamic — a RUNTIME dependency (src/main.ts bootstraps via
 *     platformBrowserDynamic()), so this is a runtime peer, not merely a build-time one.
 *   - @angular/compiler-cli — a devDependency (the AOT/JIT compiler `ng build` invokes).
 * Angular declares both peers at an EXACT version equal to the package's own version, so
 * this guard also requires exact-pin equality: a caret/tilde range on any of the three
 * reintroduces the very ERESOLVE conflict that triggers the --legacy-peer-deps retry.
 *
 * Note for anyone diffing against the shipped distribution: the distribution's
 * apps/MJExplorer/package.json is NOT a byte-for-byte copy of this manifest.
 * DistributionAssembler puts package.json in ANGULAR_IGNORE (excluded from the raw file
 * copy) and re-emits it via removePortFlagsFromPackageJson() — only `scripts` is
 * rewritten. Dependency content is preserved verbatim; the bytes are not.
 *
 * Why this is a standalone script + workflow instead of a vitest test in MJInstaller: see
 * the header comment in .github/workflows/ci-explorer-angular-compiler.yml.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────────
 *   node check-explorer-angular-compiler.mjs                    # checks packages/MJExplorer/package.json
 *   node check-explorer-angular-compiler.mjs <path/to/package.json>
 *   node check-explorer-angular-compiler.mjs --self-test        # in-memory fixtures only
 *
 * Exit: 0 = pass, 1 = violation found, 2 = misconfiguration (bad path / unparseable JSON).
 */

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PEER_NAME = '@angular/compiler';
const RUNTIME_PEER_OF = '@angular/platform-browser-dynamic';
const BUILD_PEER_OF = '@angular/compiler-cli';
const EXACT_PIN_RE = /^\d+\.\d+\.\d+$/;

/** F3: read the union of dependencies + devDependencies — assert the FACT, not the section. */
export function unionDeclaredDeps(manifest) {
    return { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
}

/**
 * Names declared in BOTH sections with different specs.
 *
 * The union above answers "is it declared?", which is section-agnostic and correct. It cannot
 * answer "which spec gets installed?": a union has to pick one value per key, and object spread
 * keeps the LAST — devDependencies — while npm and pnpm both install from `dependencies` and warn
 * about nothing (measured: pnpm 11.21.0 resolved `dependencies:'^21.2.22'` beside
 * `devDependencies:'21.2.22'` to version **21.2.23**, floating the caret past the pin the gate was
 * reading). So `dependencies: '^21.2.22'` beside `devDependencies: '21.2.22'` would install from the
 * caret range while every assertion below inspected the pin, and this gate would report OK on
 * exactly the range it exists to forbid.
 *
 * Rather than teaching the gate one package manager's precedence rule, reject the ambiguity: if a
 * name is declared twice with conflicting specs, no reader can tell what ships either. Identical
 * specs in both sections stay legal — redundant, but unambiguous.
 */
function conflictingDeclarations(manifest, names) {
    const conflicts = [];
    for (const name of names) {
        const inDependencies = manifest.dependencies?.[name];
        const inDevDependencies = manifest.devDependencies?.[name];
        if (inDependencies !== undefined && inDevDependencies !== undefined && inDependencies !== inDevDependencies) {
            conflicts.push({ name, inDependencies, inDevDependencies });
        }
    }
    return conflicts;
}

/**
 * Evaluate the three assertions against an already-parsed manifest object. Pure function —
 * no filesystem, no process — so it is directly self-testable against in-memory fixtures.
 * Returns { ok, errors }; errors is empty iff ok.
 */
export function evaluateManifest(manifest) {
    const declared = unionDeclaredDeps(manifest);
    const compiler = declared[PEER_NAME];
    const errors = [];

    for (const { name, inDependencies, inDevDependencies } of conflictingDeclarations(manifest, [
        PEER_NAME,
        RUNTIME_PEER_OF,
        BUILD_PEER_OF,
    ])) {
        errors.push(
            `${name} is declared twice with conflicting specs: dependencies '${inDependencies}' vs ` +
                `devDependencies '${inDevDependencies}'.\n` +
                `    npm and pnpm both install the 'dependencies' spec and warn about nothing, so the\n` +
                `    other one is silently discarded — while the checks below read the 'devDependencies'\n` +
                `    one. Declare it once, or declare the same spec in both.`
        );
    }

    if (compiler === undefined) {
        errors.push(
            `${PEER_NAME} is not declared in dependencies or devDependencies.\n` +
                `    It is a non-optional peer of ${RUNTIME_PEER_OF} (a runtime dependency — src/main.ts\n` +
                `    bootstraps via platformBrowserDynamic()) AND of ${BUILD_PEER_OF} (build-time).\n` +
                `    A host repo produced by 'mj install' has neither this monorepo's root\n` +
                `    package.json declaration nor the joined dev workspace's pnpm peer auto-install to\n` +
                `    fall back on. Worse, DependencyPhase.ts retries 'npm install' with\n` +
                `    --legacy-peer-deps on any ERESOLVE conflict, which disables npm's automatic peer\n` +
                `    installation outright — so the host's Angular build dies with\n` +
                `    ERR_MODULE_NOT_FOUND instead of a clear peer-dependency error.`
        );
        return { ok: false, errors };
    }

    if (!EXACT_PIN_RE.test(compiler)) {
        errors.push(
            `${PEER_NAME} is declared as '${compiler}', not an exact pin (expected to match /^\\d+\\.\\d+\\.\\d+$/).\n` +
                `    Angular declares this peer at an exact version; a caret or tilde range reintroduces\n` +
                `    the ERESOLVE conflict that triggers the --legacy-peer-deps retry.`
        );
    }

    for (const peerName of [RUNTIME_PEER_OF, BUILD_PEER_OF]) {
        const peerVersion = declared[peerName];
        if (peerVersion !== undefined && peerVersion !== compiler) {
            errors.push(
                `${PEER_NAME}@${compiler} does not match ${peerName}@${peerVersion}.\n` +
                    `    Angular declares '${PEER_NAME}' as an exact-version peer of '${peerName}' —\n` +
                    `    skew between them reintroduces the ERESOLVE conflict that triggers\n` +
                    `    --legacy-peer-deps.`
            );
        }
    }

    return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Self-test fixtures — exercised via --self-test, never against the real manifest.
// ---------------------------------------------------------------------------

const PASSING_MANIFEST = {
    dependencies: {
        '@angular/platform-browser-dynamic': '21.2.22',
    },
    devDependencies: {
        '@angular/compiler': '21.2.22',
        '@angular/compiler-cli': '21.2.22',
    },
};

/**
 * [label, expectedOk, manifest, expectedMarker]
 *
 * `expectedMarker` is a substring of the error the fixture is NAMED after, and it is what makes the
 * label true. Asserting `ok` alone lets any rule stand in for any other: the caret fixture also
 * skews from both peers, and the missing-compiler fixture falls through to
 * EXACT_PIN_RE.test(undefined) — so deleting either the pin rule or the missing-declaration branch
 * left every fixture green. Mutation-tested: with the marker, both mutants die.
 * `null` on a passing fixture means "expect no errors at all".
 */
export const SELF_TEST_FIXTURES = [
    ['passes when compiler is declared, exact-pinned, and matches both peers', true, PASSING_MANIFEST, null],
    [
        'passes when compiler is declared in dependencies instead of devDependencies (F3: union, not section)',
        true,
        {
            dependencies: { '@angular/compiler': '21.2.22', '@angular/platform-browser-dynamic': '21.2.22' },
            devDependencies: { '@angular/compiler-cli': '21.2.22' },
        },
        null,
    ],
    [
        'passes when compiler is declared and exact-pinned but neither peer is present to compare against',
        true,
        { dependencies: {}, devDependencies: { '@angular/compiler': '21.2.22' } },
        null,
    ],
    [
        'passes when only @angular/compiler-cli is declared and matches (platform-browser-dynamic absent)',
        true,
        {
            dependencies: {},
            devDependencies: { '@angular/compiler': '21.2.22', '@angular/compiler-cli': '21.2.22' },
        },
        null,
    ],
    ['fails when @angular/compiler is missing entirely', false, { dependencies: {}, devDependencies: {} }, 'is not declared'],
    [
        'fails on a caret range',
        false,
        {
            dependencies: { '@angular/platform-browser-dynamic': '21.2.22' },
            devDependencies: { '@angular/compiler': '^21.2.22', '@angular/compiler-cli': '21.2.22' },
        },
        'not an exact pin',
    ],
    [
        'fails on a tilde range',
        false,
        {
            dependencies: {},
            devDependencies: { '@angular/compiler': '~21.2.22', '@angular/compiler-cli': '21.2.22' },
        },
        'not an exact pin',
    ],
    [
        'fails when skewed from @angular/platform-browser-dynamic',
        false,
        {
            dependencies: { '@angular/platform-browser-dynamic': '21.2.21' },
            devDependencies: { '@angular/compiler': '21.2.22', '@angular/compiler-cli': '21.2.22' },
        },
        'does not match @angular/platform-browser-dynamic',
    ],
    [
        'fails when declared in BOTH sections with conflicting specs (npm installs the dependencies spec)',
        false,
        {
            dependencies: { '@angular/compiler': '^21.2.22', '@angular/platform-browser-dynamic': '21.2.22' },
            devDependencies: { '@angular/compiler': '21.2.22', '@angular/compiler-cli': '21.2.22' },
        },
        'declared twice with conflicting specs',
    ],
    [
        'fails when skewed from @angular/compiler-cli',
        false,
        {
            dependencies: { '@angular/platform-browser-dynamic': '21.2.22' },
            devDependencies: { '@angular/compiler': '21.2.22', '@angular/compiler-cli': '21.2.23' },
        },
        'does not match @angular/compiler-cli',
    ],
];

export function runSelfTest() {
    let failed = 0;
    for (const [name, expectedOk, manifest, expectedMarker] of SELF_TEST_FIXTURES) {
        const { ok, errors } = evaluateManifest(manifest);
        if (ok !== expectedOk) {
            console.error(`❌ FAIL ${name}: expected ok=${expectedOk}, got ok=${ok}`);
            failed++;
        } else if (expectedMarker !== null && !errors.some((e) => e.includes(expectedMarker))) {
            // The verdict was right for the wrong reason — the rule this fixture is named after
            // did not fire, and some other rule covered for it.
            console.error(
                `❌ FAIL ${name}: verdict ok=${ok} is correct, but no error contains ` +
                    `'${expectedMarker}'. Reported instead: ${JSON.stringify(errors.map((e) => e.split('\n')[0]))}`
            );
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

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function defaultManifestPath() {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    return resolve(scriptDir, '..', '..', 'packages', 'MJExplorer', 'package.json');
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--self-test')) {
        runSelfTest();
        return;
    }

    const manifestPath = args[0] ? resolve(args[0]) : defaultManifestPath();
    if (!existsSync(manifestPath)) {
        console.error(`❌ check-explorer-angular-compiler: manifest not found: ${manifestPath}`);
        process.exit(2);
    }

    let manifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
        console.error(`❌ check-explorer-angular-compiler: failed to parse ${manifestPath}: ${err.message}`);
        process.exit(2);
    }

    const { ok, errors } = evaluateManifest(manifest);
    if (!ok) {
        console.error(`❌ ${manifestPath}:`);
        for (const error of errors) {
            console.error(`   ${error}`);
        }
        process.exit(1);
    }

    console.log(`✅ ${manifestPath}: ${PEER_NAME} is declared, exact-pinned, and matches its peers.`);
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
