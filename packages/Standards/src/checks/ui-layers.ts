/**
 * @fileoverview The UI layering standard.
 *
 * Enforces the boundaries in the MJ repo's `guides/UI_LAYERING_GUIDE.md`:
 *
 *   runtime  (L0)      pure TS — no Angular at all
 *   widgets  (L1+L2)   framework-clean Angular — no Router, no Explorer, no global provider
 *   surface  (L3)      Explorer surfaces — NavigationService only, never Router
 *   shell              the navigation layer ITSELF — the documented Router exception
 *
 * A package opts in by declaring `"mjUILayer"` in its own package.json. A package without the
 * field is skipped, unless `requireDeclared` is on — see the option's docs for why that matters.
 *
 * @module @memberjunction/standards
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';

/** The layers a package can declare. */
export type UILayer = 'runtime' | 'widgets' | 'surface' | 'shell';

const VALID_LAYERS: UILayer[] = ['runtime', 'widgets', 'surface', 'shell'];

/** Module specifiers a layer may never import, with the reason shown on failure. */
const FORBIDDEN_MODULES: Record<UILayer, Array<[RegExp, string]>> = {
    runtime: [[/^@angular\//, 'L0 runtime code must be pure TypeScript — importable from Node, a worker, or a non-Angular host']],
    widgets: [
        [/^@angular\/router$/, 'widgets must not route — emit an event and let the host decide'],
        [/^@memberjunction\/ng-shared$/, 'ng-shared is Explorer (NavigationService / BaseResourceComponent) — that is L3'],
        [/^@memberjunction\/ng-explorer/, 'Explorer packages are L3 — a widget that imports one cannot be reused'],
    ],
    // L3 lives inside an app that has Router configured, and `RouterModule` is a legitimate import
    // for declarative `routerLink` chrome. What breaks the shell is *imperative* navigation, so the
    // surface rule bans the symbols below rather than the module.
    surface: [],
    // The shell IS the navigation layer — what NavigationService is implemented on top of. Banning
    // Router here would ban the implementation of the rule.
    shell: [],
};

/** Imported symbol names a layer may never bind, whatever module they came from. */
const FORBIDDEN_SYMBOLS: Record<UILayer, Array<[string, string]>> = {
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
 * Source constructs a layer may never contain.
 *
 * Note the `\(\s*\)` — only the ZERO-ARGUMENT form is a violation. `new RunView(provider)` passes
 * a provider explicitly and is correct; a blunter pattern flagged it, which is exactly the kind of
 * false positive that gets a gate switched off.
 */
const FORBIDDEN_PATTERNS: Record<UILayer, Array<[RegExp, string, string]>> = {
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

/** Dependency specifiers a layer may never declare. The manifest half of the module ban. */
const FORBIDDEN_DEPS: Record<UILayer, RegExp[]> = {
    runtime: [/^@angular\//],
    widgets: [/^@angular\/router$/, /^@memberjunction\/ng-shared$/, /^@memberjunction\/ng-explorer/],
    surface: [],
    shell: [],
};

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.angular', 'coverage', 'generated']);
const ALLOW_MARKER = 'mj-ui-layers-allow';

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Blank out `//` and block comments, preserving every newline so line numbers still line up.
 *
 * Necessary because MJ source documents itself heavily: a JSDoc block explaining "this calls
 * `new RunView()` on the global provider" is a comment about a violation, not a violation, and a
 * gate that cannot tell the difference gets switched off. String literals are left alone — the
 * banned constructs do not plausibly appear in one.
 */
export function StripComments(source: string): string {
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
            out += source.slice(index, stop).replace(/[^\n]/g, ' ');
            index = stop;
        } else {
            out += source[index];
            index++;
        }
    }
    return out;
}

/** One import/export-from occurrence. */
export interface ImportRecord {
    Specifier: string;
    Names: string[];
    Line: number;
}

/**
 * Extract every import/export-from specifier with the names it binds and its 1-based line.
 *
 * Import-aware rather than grep-based: matching the bare word `Router` anywhere produces false
 * positives on `RouterLikeThing`, on comments and on strings. What matters is whether the module
 * *binds* the symbol.
 */
export function ParseImports(source: string): ImportRecord[] {
    const results: ImportRecord[] = [];
    const re = /(?:^|\n)\s*(?:import|export)\s*(?:type\s+)?(?:([\s\S]*?)\s*from\s*)?['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
        const [full, clause = '', specifier] = match;
        const line = source.slice(0, match.index + full.indexOf(specifier)).split('\n').length;
        const names: string[] = [];
        const braced = /\{([\s\S]*?)\}/.exec(clause);
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
 * Does the given 1-based line carry a reviewed-exception marker, on itself or the line above?
 *
 * The preceding line counts because a real exception deserves a sentence of explanation and a
 * trailing comment long enough to hold one is unreadable. Only ONE line above — a wider window
 * would let a marker drift away from the thing it excuses.
 */
export function IsAllowed(lines: string[], lineNumber: number): boolean {
    const own = lines[lineNumber - 1] ?? '';
    const above = lineNumber >= 2 ? (lines[lineNumber - 2] ?? '') : '';
    return own.includes(ALLOW_MARKER) || above.includes(ALLOW_MARKER);
}

// ─────────────────────────────────────────────────────────────────────────────
// Filesystem walk
// ─────────────────────────────────────────────────────────────────────────────

function findPackageDirs(root: string): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
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

function findSourceFiles(packageDir: string): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
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

// ─────────────────────────────────────────────────────────────────────────────
// The check
// ─────────────────────────────────────────────────────────────────────────────

/** Check one opted-in package. */
function checkPackage(packageDir: string, layer: UILayer, repoRoot: string, packageName: string): Violation[] {
    const violations: Violation[] = [];
    const add = (file: string, line: number, message: string): void => {
        violations.push({ File: relative(repoRoot, file), Line: line, Message: message, Package: packageName });
    };

    const manifestPath = join(packageDir, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
    };
    const declared = { ...(manifest.dependencies ?? {}), ...(manifest.peerDependencies ?? {}) };
    for (const dep of Object.keys(declared)) {
        for (const pattern of FORBIDDEN_DEPS[layer]) {
            if (pattern.test(dep)) add(manifestPath, 0, `declares "${dep}" — a "${layer}" package must not depend on it`);
        }
    }

    for (const file of findSourceFiles(packageDir)) {
        const raw = readFileSync(file, 'utf8');
        const source = StripComments(raw);
        // Allow-markers live IN comments, so they are read from the original text.
        const lines = raw.split('\n');
        const codeLines = source.split('\n');

        for (const { Specifier, Names, Line } of ParseImports(source)) {
            if (IsAllowed(lines, Line)) continue;
            for (const [pattern, reason] of FORBIDDEN_MODULES[layer]) {
                if (pattern.test(Specifier)) add(file, Line, `imports "${Specifier}" — ${reason}`);
            }
            for (const [symbol, reason] of FORBIDDEN_SYMBOLS[layer]) {
                if (Names.includes(symbol)) add(file, Line, `imports "${symbol}" — ${reason}`);
            }
        }

        for (const [pattern, label, reason] of FORBIDDEN_PATTERNS[layer]) {
            codeLines.forEach((text, index) => {
                if (pattern.test(text) && !IsAllowed(lines, index + 1)) add(file, index + 1, `uses ${label} — ${reason}`);
            });
        }
    }

    return violations;
}

/**
 * Read a package's declared layer.
 *
 * Returns `undefined` for no declaration and `null` for an invalid one — different outcomes: the
 * first is "not adopted", the second is a typo that must be reported.
 */
function readLayer(packageDir: string): { Name: string; Layer: UILayer | null | undefined } | null {
    try {
        const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
            name?: string;
            mjUILayer?: string;
        };
        const raw = manifest.mjUILayer;
        const layer = raw === undefined ? undefined : VALID_LAYERS.includes(raw as UILayer) ? (raw as UILayer) : null;
        return { Name: manifest.name ?? packageDir, Layer: layer };
    } catch {
        return null;
    }
}

/** The registered UI layering standard. */
export const UILayersCheck: StandardCheck = {
    Id: 'ui-layers',
    Title: 'Widgets must not import Router or MJ Explorer, and must read through ProviderToUse',
    Since: '6.0.0',
    DefaultSeverity: 'error',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/guides/UI_LAYERING_GUIDE.md',
    Description:
        'Four UI layers: L0 pure-TS runtime, L1 presentational widget, L2 composite widget, L3 Explorer surface. ' +
        'Nothing below L3 may import @angular/router or an Explorer package; nothing below L3 may construct a ' +
        'global-provider RunView/Metadata. Packages opt in with "mjUILayer" in their own package.json.',
    DefaultRoots: ['packages'],
    DefaultOptions: {
        /**
         * Turn "no mjUILayer field" from a skip into a violation, across every scanned root.
         *
         * Once a tree is clean, LOCK it. The way drift returns is not an edit to an existing
         * package — it is a NEW package that never opts in, and from the outside "undeclared" is
         * indistinguishable from "compliant".
         */
        requireDeclared: false,
        /**
         * Lock only these subtrees (repo-relative path prefixes), leaving the rest adopting.
         *
         * This is the shape a real migration actually takes: one tree gets cleaned and must stay
         * clean, while the others are still being worked through. Without it a repo has to choose
         * between locking everything (impossible mid-migration) and locking nothing (which is how
         * drift returns), and most will pick nothing.
         */
        requireDeclaredIn: [] as string[],
    },

    Run(context: CheckContext): CheckResult {
        const violations: Violation[] = [];
        const notes: string[] = [];
        const undeclared: Array<{ Name: string; Locked: boolean }> = [];
        let checkedCount = 0;

        const requireDeclaredAll = context.Options['requireDeclared'] === true;
        const lockedPrefixes = Array.isArray(context.Options['requireDeclaredIn'])
            ? (context.Options['requireDeclaredIn'] as unknown[]).filter((p): p is string => typeof p === 'string')
            : [];
        const isLocked = (packageDir: string): boolean => {
            if (requireDeclaredAll) return true;
            const rel = relative(context.RepoRoot, packageDir).split('\\').join('/');
            return lockedPrefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`));
        };

        for (const root of context.Roots) {
            const absolute = join(context.RepoRoot, root);
            for (const packageDir of findPackageDirs(absolute)) {
                const info = readLayer(packageDir);
                if (!info) continue;

                if (info.Layer === undefined) {
                    undeclared.push({ Name: info.Name, Locked: isLocked(packageDir) });
                    continue;
                }
                if (info.Layer === null) {
                    violations.push({
                        File: relative(context.RepoRoot, join(packageDir, 'package.json')),
                        Line: 0,
                        Message: `mjUILayer is not one of ${VALID_LAYERS.join(' | ')}`,
                        Package: info.Name,
                    });
                    continue;
                }

                checkedCount++;
                violations.push(...checkPackage(packageDir, info.Layer, context.RepoRoot, info.Name));
            }
        }

        const lockedUndeclared = undeclared.filter((u) => u.Locked).map((u) => u.Name).sort();
        for (const name of lockedUndeclared) {
            violations.push({
                File: 'package.json',
                Line: 0,
                Message:
                    `${name} has no "mjUILayer" declaration and sits in a locked tree. ` +
                    `Add "mjUILayer": "${VALID_LAYERS.join('" | "')}" to its package.json.`,
                Package: name,
            });
        }

        const skipped = undeclared.length - lockedUndeclared.length;
        notes.push(
            `${checkedCount} package(s) checked; ${lockedUndeclared.length} undeclared in a locked tree; ` +
                `${skipped} undeclared elsewhere and skipped`,
        );
        return { Violations: violations, Notes: notes };
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Adoption support
// ─────────────────────────────────────────────────────────────────────────────

/** A package that has not yet declared a layer, and whether it would pass if it did. */
export interface UndeclaredPackage {
    /** Absolute directory. */
    Dir: string;
    Name: string;
    /**
     * Layers this package could honestly claim, strictest-first, never including `shell`.
     * Empty means it needs work before it can be declared at all.
     */
    WouldPassAs: UILayer[];
}

/**
 * Layers a tool may assign automatically, strictest first.
 *
 * **`shell` is deliberately absent.** It checks nothing, so every package "passes" as `shell` —
 * auto-assigning it would hand a permanent exemption to exactly the packages that most need work,
 * and the repo would get a green check that means nothing. `shell` is a human decision, reserved
 * for the handful of packages that genuinely implement navigation.
 */
const AUTO_ASSIGNABLE_LAYERS: UILayer[] = ['runtime', 'widgets', 'surface'];

/**
 * Find packages with no `mjUILayer` and work out which layers they could honestly claim.
 *
 * This is what lets `mj standards adopt` declare the already-compliant packages instead of leaving
 * a repo with a config that enforces nothing. It answers the question by **running the rules**
 * against a hypothetical layer, not by editing anything — probing by writing a field to
 * package.json and reverting it would be a data-loss bug waiting for an interrupted process.
 *
 * `WouldPassAs` is ordered strictest-first and never contains `shell`, so a caller taking
 * `WouldPassAs[0]` gets the most informative honest label, and a package that passes nothing comes
 * back with an empty array — "needs work", not "call it shell".
 */
export function ProbeUndeclaredPackages(repoRoot: string, roots: string[]): UndeclaredPackage[] {
    const results: UndeclaredPackage[] = [];
    for (const root of roots) {
        for (const packageDir of findPackageDirs(join(repoRoot, root))) {
            const info = readLayer(packageDir);
            if (!info || info.Layer !== undefined) continue;
            const wouldPassAs = AUTO_ASSIGNABLE_LAYERS.filter(
                (layer) => checkPackage(packageDir, layer, repoRoot, info.Name).length === 0,
            );
            results.push({ Dir: packageDir, Name: info.Name, WouldPassAs: wouldPassAs });
        }
    }
    return results;
}

/** Write `mjUILayer` into a package's manifest, preserving formatting as best as JSON allows. */
export function DeclareLayer(packageDir: string, layer: UILayer): void {
    const path = join(packageDir, 'package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    manifest['mjUILayer'] = layer;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
