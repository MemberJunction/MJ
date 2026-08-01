#!/usr/bin/env node
/**
 * check-ui-layers.mjs — the UI layering gate.
 *
 * Enforces the boundaries described in `guides/UI_LAYERING_GUIDE.md`:
 *
 *   runtime  (L0)      pure TS — no Angular at all
 *   widgets  (L1+L2)   framework-clean Angular — no Router, no Explorer, no global provider
 *   surface  (L3)      Explorer surfaces — NavigationService only, never Router
 *   shell              the navigation layer ITSELF — the documented Router exception
 *
 * `shell` deliberately checks nothing. It exists so the exception is ENUMERABLE: the shell,
 * app-routing, the guards, the OAuth callback and NavigationService are what `NavigationService`
 * is implemented on top of, so banning Router there would ban the implementation of the rule.
 * Declaring the layer states that out loud in the package itself, and keeps `--list` honest —
 * an undeclared package reads as "not looked at yet", which these have been.
 * Keep this list SMALL. A `shell` declaration on anything that is not literally the navigation
 * layer is a rule being avoided rather than applied.
 *
 * OPT-IN BY DESIGN. A package is checked only when its own package.json declares:
 *
 *     { "mjUILayer": "widgets" }
 *
 * so a repo can adopt the gate one package at a time instead of blocking on a full
 * cleanup. Packages without the field are listed as unchecked and ignored.
 *
 * ONCE A TREE IS CLEAN, LOCK IT. Pass `--require-declared` and an undeclared package under the
 * scanned roots becomes a failure rather than a skip. Without it, the way drift returns is simply
 * a NEW package that never opts in — and "undeclared" is indistinguishable from "compliant" when
 * you are reading a green check.
 *
 * SELF-CONTAINED BY DESIGN. Node built-ins only, no MJ imports, no config file. App
 * repos and external teams copy this one file, add the npm script, and get the same
 * gate. Do not add repo-specific logic here — add it to the package's own tests.
 *
 * Escape hatch: put `mj-ui-layers-allow` in a comment on the offending line. Use it
 * for a genuine, reviewed exception; a package that needs several is in the wrong layer.
 *
 * Usage:  node .github/scripts/check-ui-layers.mjs [root ...] [--quiet] [--list] [--require-declared]
 * Exit:   0 = clean, 1 = at least one violation.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────

/** Module specifiers a layer may never import, and the reason shown on failure. */
const FORBIDDEN_MODULES = {
    runtime: [
        [/^@angular\//, 'L0 runtime code must be pure TypeScript — importable from Node, a worker, or a non-Angular host'],
    ],
    widgets: [
        [/^@angular\/router$/, 'widgets must not route — emit an event and let the host decide'],
        [/^@memberjunction\/ng-shared$/, 'ng-shared is Explorer (NavigationService / BaseResourceComponent) — that is L3'],
        [/^@memberjunction\/ng-explorer/, 'Explorer packages are L3 — a widget that imports one cannot be reused'],
    ],
    // L3 lives inside an app that has Router configured, and `RouterModule` is a legitimate
    // import for declarative `routerLink` chrome. What breaks Explorer is *imperative*
    // navigation, so the surface rule bans the symbols below rather than the module.
    surface: [],
    // The shell IS the navigation layer — it is what `NavigationService` is implemented on top
    // of. Banning Router here would be banning the implementation of the rule.
    shell: [],
};

/** Imported symbol names a layer may never bind, regardless of the module they came from. */
const FORBIDDEN_SYMBOLS = {
    runtime: [],
    widgets: [
        ['Router', 'routing belongs to the host'],
        ['ActivatedRoute', 'routing belongs to the host'],
        ['NavigationEnd', 'routing belongs to the host'],
        ['RouterModule', 'routing belongs to the host'],
        ['NavigationService', 'navigation is L3 — emit an intent event instead'],
        ['SharedService', 'SharedService is Explorer chrome — emit a notification event instead'],
        ['BaseResourceComponent', 'a resource component IS an Explorer surface — that class belongs in the L3 package'],
        ['BaseDashboard', 'a dashboard IS an Explorer surface — that class belongs in the L3 package'],
    ],
    surface: [
        ['Router', 'use NavigationService — Router desyncs the shell tab state from the URL'],
        ['ActivatedRoute', 'use GetQueryParams() / OnQueryParamsChanged()'],
        ['NavigationEnd', 'the shell owns URL sync — never subscribe to Router events'],
    ],
    shell: [],
};

/**
 * Source patterns a layer may never contain. Global-provider construction binds a
 * component to `Metadata.Provider`, which breaks the moment it is embedded under a
 * different provider — the exact reuse this layering exists to enable.
 *
 * NOTE the `\(\s*\)` — only the ZERO-ARGUMENT form is a violation. `new RunView(provider)` and
 * `new RunQuery(this.RunQueryToUse)` pass a provider explicitly and are correct; an earlier,
 * blunter version of these patterns flagged them, which is exactly the kind of false positive
 * that gets a gate switched off.
 */
const FORBIDDEN_PATTERNS = {
    runtime: [],
    widgets: [
        [/\bnew\s+RunViews?\s*\(\s*\)/, 'new RunView()', 'binds the global provider — use RunView.FromMetadataProvider(this.ProviderToUse)'],
        [/\bnew\s+RunQuery\s*\(\s*\)/, 'new RunQuery()', 'binds the global provider — use this.RunQueryToUse'],
        [/\bnew\s+RunReport\s*\(\s*\)/, 'new RunReport()', 'binds the global provider — use this.RunReportToUse'],
        [/\bnew\s+Metadata\s*\(\s*\)/, 'new Metadata()', 'binds the global provider — use this.ProviderToUse'],
    ],
    surface: [],
    shell: [],
};

/** package.json dependency specifiers a layer may never declare. Manifest half of the module ban. */
const FORBIDDEN_DEPS = {
    runtime: [/^@angular\//],
    widgets: [/^@angular\/router$/, /^@memberjunction\/ng-shared$/, /^@memberjunction\/ng-explorer/],
    surface: [],
    shell: [],
};

const VALID_LAYERS = Object.keys(FORBIDDEN_MODULES);
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.angular', 'coverage', 'generated']);
const ALLOW_MARKER = 'mj-ui-layers-allow';

// ─────────────────────────────────────────────────────────────────────────────
// Scanning
// ─────────────────────────────────────────────────────────────────────────────

/** Every directory under `root` that holds a package.json (node_modules/dist pruned). */
function findPackageDirs(root) {
    const found = [];
    const walk = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        if (entries.some((e) => e.isFile() && e.name === 'package.json')) found.push(dir);
        for (const entry of entries) {
            if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
            walk(join(dir, entry.name));
        }
    };
    walk(root);
    return found;
}

/** Every source file inside a package directory. */
function findSourceFiles(packageDir) {
    const found = [];
    const walk = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) walk(full);
            } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
                found.push(full);
            }
        }
    };
    walk(packageDir);
    return found;
}

/**
 * Blank out `//` line comments and block comments, preserving every newline so line
 * numbers still line up with the original file.
 *
 * Necessary because MJ source documents itself heavily: a JSDoc block explaining
 * "this calls `new RunView()` on the global provider" is a comment about a violation,
 * not a violation, and a gate that cannot tell the difference gets switched off.
 * String literals are left alone — the banned constructs do not plausibly appear in one.
 */
export function stripComments(source) {
    let out = '';
    let index = 0;
    while (index < source.length) {
        const two = source.slice(index, index + 2);
        if (two === '//') {
            const end = source.indexOf('\n', index);
            const stop = end === -1 ? source.length : end;
            out += ' '.repeat(stop - index);
            index = stop;
        } else if (two === '/*') {
            const end = source.indexOf('*/', index + 2);
            const stop = end === -1 ? source.length : end + 2;
            // Keep the newlines; blank everything else.
            out += source.slice(index, stop).replace(/[^\n]/g, ' ');
            index = stop;
        } else {
            out += source[index];
            index++;
        }
    }
    return out;
}

/**
 * Extract every import/export-from specifier in a source file, with the names it binds
 * and the 1-based line it starts on.
 *
 * Import-aware rather than grep-based: matching the bare word `Router` anywhere in a
 * file produces false positives on `RouterLikeThing`, comments and strings. What
 * actually matters is whether the module *binds* the symbol.
 *
 * Returns `[{ Specifier, Names, Line }]`.
 */
export function parseImports(source) {
    const results = [];
    // `import ... from 'x'` / `export ... from 'x'` / bare `import 'x'`, incl. multi-line clauses.
    const re = /(?:^|\n)\s*(?:import|export)\s*(?:type\s+)?(?:([\s\S]*?)\s*from\s*)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const [full, clause = '', specifier] = match;
        const line = source.slice(0, match.index + full.indexOf(specifier)).split('\n').length;
        const names = [];
        const braced = clause.match(/\{([\s\S]*?)\}/);
        if (braced) {
            for (const raw of braced[1].split(',')) {
                const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
                if (name) names.push(name);
            }
        }
        const defaultOrNamespace = clause.replace(/\{[\s\S]*?\}/, '').replace(/^type\s+/, '').trim().replace(/,$/, '').trim();
        if (defaultOrNamespace && !defaultOrNamespace.startsWith('*')) names.push(defaultOrNamespace);
        results.push({ Specifier: specifier, Names: names, Line: line });
    }
    return results;
}

/**
 * True when the given 1-based line carries the reviewed-exception marker, or the line directly
 * above it does.
 *
 * The preceding line counts because a real exception deserves a sentence of explanation, and a
 * trailing comment long enough to hold one is unreadable. Only ONE line above — a wider window
 * would let a marker drift away from the thing it excuses.
 */
export function isAllowed(lines, lineNumber) {
    const own = lines[lineNumber - 1] ?? '';
    const above = lineNumber >= 2 ? (lines[lineNumber - 2] ?? '') : '';
    return own.includes(ALLOW_MARKER) || above.includes(ALLOW_MARKER);
}

// ─────────────────────────────────────────────────────────────────────────────
// Checking
// ─────────────────────────────────────────────────────────────────────────────

/** Check one opted-in package. Returns an array of violation records. */
function checkPackage(packageDir, layer, repoRoot) {
    const violations = [];
    const add = (file, line, message) =>
        violations.push({ File: relative(repoRoot, file), Line: line, Message: message });

    // --- manifest ---
    const manifestPath = join(packageDir, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const declared = {
        ...(manifest.dependencies ?? {}),
        ...(manifest.peerDependencies ?? {}),
    };
    for (const dep of Object.keys(declared)) {
        for (const pattern of FORBIDDEN_DEPS[layer]) {
            if (pattern.test(dep)) {
                add(manifestPath, 0, `declares "${dep}" — a "${layer}" package must not depend on it`);
            }
        }
    }

    // --- source ---
    for (const file of findSourceFiles(packageDir)) {
        const raw = readFileSync(file, 'utf8');
        const source = stripComments(raw);
        // Allow-markers live IN comments, so they are read from the original text.
        const lines = raw.split('\n');
        const codeLines = source.split('\n');

        for (const { Specifier, Names, Line } of parseImports(source)) {
            if (isAllowed(lines, Line)) continue;

            for (const [pattern, reason] of FORBIDDEN_MODULES[layer]) {
                if (pattern.test(Specifier)) add(file, Line, `imports "${Specifier}" — ${reason}`);
            }
            for (const [symbol, reason] of FORBIDDEN_SYMBOLS[layer]) {
                if (Names.includes(symbol)) add(file, Line, `imports "${symbol}" — ${reason}`);
            }
        }

        for (const [pattern, label, reason] of FORBIDDEN_PATTERNS[layer]) {
            codeLines.forEach((text, index) => {
                if (pattern.test(text) && !isAllowed(lines, index + 1)) {
                    add(file, index + 1, `uses ${label} — ${reason}`);
                }
            });
        }
    }

    return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
    const argv = process.argv.slice(2);
    const quiet = argv.includes('--quiet');
    const listOnly = argv.includes('--list');
    const requireDeclared = argv.includes('--require-declared');
    const roots = argv.filter((a) => !a.startsWith('--'));
    if (roots.length === 0) roots.push('packages');

    const repoRoot = process.cwd();
    const log = (s) => { if (!quiet) console.log(s); };

    const checked = [];
    const unchecked = [];
    let failures = 0;

    for (const root of roots) {
        const absolute = resolve(repoRoot, root);
        if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
            console.error(`✗ not a directory: ${root}`);
            process.exit(1);
        }

        for (const packageDir of findPackageDirs(absolute)) {
            let manifest;
            try {
                manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
            } catch {
                continue;
            }
            const layer = manifest.mjUILayer;
            if (!layer) {
                unchecked.push(manifest.name ?? relative(repoRoot, packageDir));
                continue;
            }
            if (!VALID_LAYERS.includes(layer)) {
                console.error(`✗ ${manifest.name}: mjUILayer "${layer}" is not one of ${VALID_LAYERS.join(' | ')}`);
                failures++;
                continue;
            }

            const violations = listOnly ? [] : checkPackage(packageDir, layer, repoRoot);
            checked.push({ Name: manifest.name, Layer: layer, Violations: violations.length });
            if (violations.length === 0) {
                log(`✓ ${manifest.name} [${layer}]`);
            } else {
                failures += violations.length;
                log(`✗ ${manifest.name} [${layer}] — ${violations.length} violation(s)`);
                for (const v of violations) log(`    ${v.File}${v.Line ? `:${v.Line}` : ''}  ${v.Message}`);
            }
        }
    }

    log('');
    if (requireDeclared && unchecked.length > 0) {
        failures += unchecked.length;
        console.error('');
        console.error(`✗ ${unchecked.length} package(s) under the scanned roots have no "mjUILayer" declaration:`);
        for (const name of unchecked.sort()) console.error(`    ${name}`);
        console.error('  This tree is locked (--require-declared): every package must declare its layer.');
        console.error('  Add "mjUILayer": "runtime" | "widgets" | "surface" | "shell" to each package.json.');
    }
    log(`Checked ${checked.length} package(s); ${unchecked.length} have no "mjUILayer" declaration${requireDeclared ? ' (REQUIRED — see above)' : ' and were skipped'}.`);
    if (listOnly) {
        log('');
        log('Packages without a layer declaration:');
        for (const name of unchecked.sort()) log(`  ${name}`);
        process.exit(0);
    }

    if (failures > 0) {
        console.error('');
        console.error(`✗ UI layering gate failed with ${failures} violation(s).`);
        console.error('  See guides/UI_LAYERING_GUIDE.md for the layer rules and how to fix each class of violation.');
        process.exit(1);
    }

    log('✓ UI layering gate passed.');
}

// Only run when invoked directly, so the parser can be unit-tested by importing this file.
if (process.argv[1] && process.argv[1].endsWith('check-ui-layers.mjs')) main();
