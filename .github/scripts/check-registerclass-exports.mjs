#!/usr/bin/env node
/**
 * CI gate: every `@RegisterClass`-decorated class MUST be exported from its
 * package's public API.
 *
 * WHY THIS IS AN INVARIANT (not a style preference)
 * -------------------------------------------------
 * `@RegisterClass` exists to plug a class into a resolution chain the package
 * author does not control (MJ's ClassFactory plugin architecture). A class that
 * registers itself but is not reachable from its package entry point is
 * incoherent by construction: it announces "resolve me from anywhere" while
 * being importable from nowhere.
 *
 * It also actively breaks the build products. The pre-built class manifests
 * (`@memberjunction/ng-bootstrap`, `ng-bootstrap-lite`, `server-bootstrap`, ...)
 * emit NAMED IMPORTS for every registered class:
 *
 *     import { SomeRegisteredClass } from '@memberjunction/some-package';
 *
 * If the package does not export that name, the manifest is unloadable outside a
 * bundler — `SyntaxError: The requested module ... does not provide an export
 * named 'X'`. Bundlers paper over it; plain Node does not. That is how this bug
 * class ships silently and surfaces only in a consumer's native-ESM runtime.
 *
 * HOW REACHABILITY IS COMPUTED
 * ----------------------------
 * The entry point (`src/public-api.ts` or `src/index.ts`) is parsed with the
 * TypeScript AST and its export graph is resolved TRANSITIVELY, tracking the
 * PROVENANCE of every exported binding as `<file>#<localName>`. A registered
 * class counts as exported when some binding exported from the entry traces back
 * to that exact class declaration. All of these therefore pass:
 *
 *     export * from './lib/foo';                 // star re-export, any depth
 *     export { Foo } from './lib/foo';           // explicit named re-export
 *     export { Foo as Bar } from './lib/foo';    // aliased (still a named export)
 *     export { Foo };                            // local clause over an import/decl
 *
 * Provenance (rather than bare name matching) is what keeps two same-named
 * classes in different files from covering for each other.
 *
 * WHAT IS DELIBERATELY *NOT* TREATED AS A PASS
 * --------------------------------------------
 *   export * as ns from './lib/foo';   // namespace-only: no top-level named
 *                                      // export, so a manifest named import of
 *                                      // the class still fails. Reported UNCERTAIN.
 *   export default class Foo {}        // no named export for the manifest to bind.
 *
 * Anything the resolver cannot settle statically with confidence (an unresolvable
 * `export *` out to another package, a namespace-only chain) is reported in a
 * separate UNCERTAIN bucket rather than silently passing or silently failing.
 * UNCERTAIN is non-gating — this gate fails only on what it can prove.
 *
 * Usage:
 *   ./check-registerclass-exports.mjs                 # sweep all packages
 *   ./check-registerclass-exports.mjs --file <path>   # check a single .ts file
 *   ./check-registerclass-exports.mjs --json          # machine-readable output
 *   ./check-registerclass-exports.mjs --quiet         # summary + violations only
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const ALLOWLIST_PATH = join(REPO_ROOT, '.github/scripts/ci/registerclass-export-allowlist.txt');

/** Entry-point filenames, in the precedence order MJ packages use. */
const ENTRY_CANDIDATES = ['src/public-api.ts', 'src/index.ts'];

/* ------------------------------------------------------------------ *
 * Allowlist
 * ------------------------------------------------------------------ */

/**
 * Parse the allowlist. Format, one per line:
 *
 *     <repo-relative-file-path>|<ClassName>   # required reason
 *
 * The trailing `# reason` is MANDATORY — an allowlist entry without a
 * documented justification is rejected as a malformed allowlist (exit 2), so
 * entries cannot accumulate as unexplained silent suppressions.
 */
function loadAllowlist() {
    if (!existsSync(ALLOWLIST_PATH)) return { entries: new Map(), errors: [] };
    const entries = new Map();
    const errors = [];
    const lines = readFileSync(ALLOWLIST_PATH, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const withoutComment = raw.split('#')[0].trim();
        if (withoutComment === '') continue; // blank or pure-comment line
        const reason = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1).trim() : '';
        if (reason === '') {
            errors.push(`${ALLOWLIST_PATH}:${i + 1}: allowlist entry has no "# reason" — a reason is required`);
            continue;
        }
        const [file, className] = withoutComment.split('|').map((s) => s.trim());
        if (!file || !className) {
            errors.push(`${ALLOWLIST_PATH}:${i + 1}: malformed entry (expected "<file>|<ClassName>  # reason")`);
            continue;
        }
        entries.set(`${file}|${className}`, reason);
    }
    return { entries, errors };
}

/* ------------------------------------------------------------------ *
 * Package + file discovery
 * ------------------------------------------------------------------ */

/** Recursively collect directories under `packages/` that contain a package.json. */
function findPackageDirs(dir, out = []) {
    if (existsSync(join(dir, 'package.json'))) out.push(dir);
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
        findPackageDirs(join(dir, entry.name), out);
    }
    return out;
}

/**
 * True for unit-test sources. These are excluded from the sweep by design: test
 * files are stripped from `dist/`, are never part of a package's published
 * surface, and are not scanned by the manifest generator — so a `@RegisterClass`
 * on a test stub/fixture (registering a fake driver for a test) cannot break a
 * manifest named import. Requiring them to be publicly exported would be
 * actively wrong: it would push test doubles into the shipped API.
 */
function isTestFile(filePath) {
    return (
        filePath.split(sep).includes('__tests__') ||
        filePath.endsWith('.test.ts') ||
        filePath.endsWith('.spec.ts')
    );
}

/** Collect every .ts file under a directory, skipping node_modules/dist, declaration files, and tests. */
function collectTsFiles(dir, out = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
            if (entry.name === '__tests__') continue;
            collectTsFiles(full, out);
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !isTestFile(full)) {
            out.push(full);
        }
    }
    return out;
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

const sourceFileCache = new Map();

function parseFile(filePath) {
    if (sourceFileCache.has(filePath)) return sourceFileCache.get(filePath);
    let sf = null;
    try {
        sf = ts.createSourceFile(filePath, readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
    } catch {
        sf = null;
    }
    sourceFileCache.set(filePath, sf);
    return sf;
}

/**
 * Resolve a relative module specifier to a concrete .ts file on disk.
 * Handles NodeNext-style `.js` specifiers that actually mean `.ts` on disk, plus
 * the `<dir>/index.ts` and `<dir>/public-api.ts` barrel conventions.
 * Returns null for bare (package) specifiers and unresolvable paths.
 */
function resolveSpecifier(fromFile, spec) {
    if (!spec.startsWith('.')) return null; // bare specifier — another package
    const base = resolve(dirname(fromFile), spec);
    const stripped = base.replace(/\.js$/, ''); // NodeNext `./foo.js` -> ./foo.ts
    const candidates = [
        `${base}.ts`,
        `${stripped}.ts`,
        base.endsWith('.ts') ? base : null,
        join(base, 'index.ts'),
        join(base, 'public-api.ts'),
    ].filter(Boolean);
    for (const c of candidates) {
        if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
}

/**
 * Find every `@RegisterClass`-decorated class in a source file.
 * Returns [{ className, line, isExported }].
 */
function findRegisteredClasses(sf) {
    const found = [];
    if (!sf) return found;

    const visit = (node) => {
        if (ts.isClassDeclaration(node) && node.name) {
            const decorators = ts.canHaveDecorators?.(node) ? (ts.getDecorators(node) ?? []) : [];
            const hasRegister = decorators.some((d) => {
                const expr = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
                return ts.isIdentifier(expr) && expr.text === 'RegisterClass';
            });
            if (hasRegister) {
                const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
                const mods = ts.getModifiers(node) ?? [];
                found.push({
                    className: node.name.text,
                    line: line + 1,
                    isExported: mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

/* ------------------------------------------------------------------ *
 * Export-graph resolution (with provenance)
 * ------------------------------------------------------------------ */

/**
 * Resolve the full set of names a file exports, each mapped to the set of
 * `<file>#<localName>` origins it can be traced back to.
 *
 * `state.unresolvableStar` is set when the graph hits an `export *` to a bare
 * specifier (another package) — reachability can no longer be proven exhaustively
 * from that point, which downgrades misses to UNCERTAIN rather than VIOLATION.
 * `state.namespaceOnly` collects provenance reachable ONLY via `export * as ns`,
 * which is not a usable named export for a manifest import.
 *
 * `seen` guards re-entry so a circular barrel graph terminates.
 */
function resolveExportedBindings(filePath, state, stack = new Set()) {
    // Memo hit: a fully-resolved (non-cycle-truncated) result is reusable anywhere.
    if (state.cache.has(filePath)) return state.cache.get(filePath);

    // Re-entry on the CURRENT path is a genuine cycle: truncate. `stack` is unwound
    // below so that a file merely *revisited* by a sibling branch (extremely common
    // in barrel graphs) recomputes or hits the memo — it must NOT be mistaken for a
    // cycle and silently resolved to "exports nothing", which would report every
    // class behind it as unexported.
    if (stack.has(filePath)) {
        state.cycleHit = true;
        return new Map();
    }
    stack.add(filePath);

    // Track whether THIS subtree was truncated by a cycle; a truncated (possibly
    // incomplete) result must not be memoized, or the truncation leaks globally.
    const outerCycle = state.cycleHit;
    state.cycleHit = false;

    const sf = parseFile(filePath);
    const bindings = new Map(); // exportedName -> Set<'<file>#<local>'>
    if (!sf) {
        stack.delete(filePath);
        state.cycleHit = outerCycle;
        return bindings;
    }

    const addBinding = (name, provenance) => {
        if (!bindings.has(name)) bindings.set(name, new Set());
        for (const p of provenance) bindings.get(name).add(p);
    };

    // Track local imports so `export { X }` (no `from`) can be traced to its origin.
    const importOrigins = new Map(); // localName -> { spec, importedName }

    for (const stmt of sf.statements) {
        // import { A as B } from './x'
        if (ts.isImportDeclaration(stmt) && stmt.importClause && ts.isStringLiteral(stmt.moduleSpecifier)) {
            const spec = stmt.moduleSpecifier.text;
            const named = stmt.importClause.namedBindings;
            if (named && ts.isNamedImports(named)) {
                for (const el of named.elements) {
                    importOrigins.set(el.name.text, { spec, importedName: (el.propertyName ?? el.name).text });
                }
            }
            continue;
        }

        if (!ts.isExportDeclaration(stmt)) {
            // Locally declared + exported class/const/function/etc.
            const mods = ts.canHaveModifiers?.(stmt) ? (ts.getModifiers(stmt) ?? []) : [];
            if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
            if ((ts.isClassDeclaration(stmt) || ts.isFunctionDeclaration(stmt)) && stmt.name) {
                addBinding(stmt.name.text, [`${filePath}#${stmt.name.text}`]);
            } else if (ts.isVariableStatement(stmt)) {
                for (const decl of stmt.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name)) addBinding(decl.name.text, [`${filePath}#${decl.name.text}`]);
                }
            }
            continue;
        }

        const specText = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : null;

        // export * from './x'  |  export * as ns from './x'
        if (!stmt.exportClause) {
            if (!specText) continue;
            const target = resolveSpecifier(filePath, specText);
            if (!target) {
                state.unresolvableStar = true; // `export *` out to another package
                continue;
            }
            const inner = resolveExportedBindings(target, state, stack);
            for (const [name, prov] of inner) addBinding(name, prov);
            continue;
        }

        // export * as ns from './x' — namespace object, NOT a named export of the class
        if (ts.isNamespaceExport(stmt.exportClause)) {
            if (!specText) continue;
            const target = resolveSpecifier(filePath, specText);
            if (!target) continue;
            const inner = resolveExportedBindings(target, state, stack);
            for (const prov of inner.values()) for (const p of prov) state.namespaceOnly.add(p);
            continue;
        }

        // export { A, B as C } [from './x']
        for (const el of stmt.exportClause.elements) {
            const exportedName = el.name.text;
            const localName = (el.propertyName ?? el.name).text;

            if (specText) {
                const target = resolveSpecifier(filePath, specText);
                if (!target) continue; // re-export from another package — not our class
                const inner = resolveExportedBindings(target, state, stack);
                addBinding(exportedName, inner.get(localName) ?? [`${target}#${localName}`]);
            } else if (importOrigins.has(localName)) {
                const origin = importOrigins.get(localName);
                const target = resolveSpecifier(filePath, origin.spec);
                if (!target) continue;
                const inner = resolveExportedBindings(target, state, stack);
                addBinding(exportedName, inner.get(origin.importedName) ?? [`${target}#${origin.importedName}`]);
            } else {
                // Declared in this file and exported via a clause.
                addBinding(exportedName, [`${filePath}#${localName}`]);
            }
        }
    }

    // Unwind: this file is no longer on the active path, so a later sibling branch
    // that reaches it again resolves it properly instead of seeing a false cycle.
    stack.delete(filePath);
    const truncated = state.cycleHit;
    state.cycleHit = outerCycle || truncated;
    // Only memoize a result that was NOT cycle-truncated — an incomplete result
    // must not be promoted to the global cache.
    if (!truncated) state.cache.set(filePath, bindings);
    return bindings;
}

/* ------------------------------------------------------------------ *
 * Analysis
 * ------------------------------------------------------------------ */

/** Analyze one package; returns its violations / uncertains / pass count. */
function analyzePackage(pkgDir) {
    const pkgJsonPath = join(pkgDir, 'package.json');
    let pkgName = relative(REPO_ROOT, pkgDir);
    try {
        pkgName = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).name ?? pkgName;
    } catch {
        /* keep the path-derived fallback */
    }

    const srcDir = join(pkgDir, 'src');
    if (!existsSync(srcDir)) return null;

    const tsFiles = collectTsFiles(srcDir);
    const registered = [];
    for (const f of tsFiles) {
        for (const cls of findRegisteredClasses(parseFile(f))) registered.push({ ...cls, file: f });
    }
    if (registered.length === 0) return null;

    const entry = ENTRY_CANDIDATES.map((c) => join(pkgDir, c)).find((p) => existsSync(p));
    if (!entry) {
        // Application packages (MJAPI, MJExplorer, CLIs) publish no library entry
        // point. They are bundled as leaves, never imported by a manifest, so a
        // registered class there cannot break a named import. Informational only.
        return { pkgName, pkgDir, noEntry: true, registeredCount: registered.length, violations: [], uncertain: [], passed: 0 };
    }

    const state = { cache: new Map(), unresolvableStar: false, namespaceOnly: new Set() };
    const bindings = resolveExportedBindings(entry, state);

    // Flatten every provenance reachable as a real named export from the entry.
    const exportedProvenance = new Set();
    for (const prov of bindings.values()) for (const p of prov) exportedProvenance.add(p);

    const violations = [];
    const uncertain = [];
    let passed = 0;

    for (const cls of registered) {
        const key = `${cls.file}#${cls.className}`;
        if (exportedProvenance.has(key)) {
            passed++;
            continue;
        }
        const record = {
            pkgName,
            className: cls.className,
            file: relative(REPO_ROOT, cls.file),
            line: cls.line,
            isGenerated: cls.file.split(sep).includes('generated'),
            entry: relative(REPO_ROOT, entry),
            isExportedLocally: cls.isExported,
        };
        if (state.namespaceOnly.has(key)) {
            uncertain.push({ ...record, why: 'reachable only via `export * as ns` — not a usable named export' });
        } else if (state.unresolvableStar) {
            uncertain.push({ ...record, why: 'package entry has an `export *` to another package; reachability not statically provable' });
        } else {
            violations.push(record);
        }
    }

    return { pkgName, pkgDir, noEntry: false, registeredCount: registered.length, violations, uncertain, passed };
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

/**
 * Build the literal export line to add, matching the convention the package's
 * entry file already uses. A gate that only says "this is wrong" makes every
 * consumer re-derive the fix; this prints the line to paste.
 */
function suggestFix(v) {
    const entryAbs = join(REPO_ROOT, v.entry);
    const fileAbs = join(REPO_ROOT, v.file);
    let rel = relative(dirname(entryAbs), fileAbs).replace(/\.ts$/, '');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    rel = rel.split(sep).join('/');

    // Match the entry file's dominant style: star barrel vs explicit named exports.
    let usesStar = true;
    try {
        const text = readFileSync(entryAbs, 'utf8');
        const starCount = (text.match(/^export \* from/gm) ?? []).length;
        const namedCount = (text.match(/^export \{/gm) ?? []).length;
        usesStar = starCount >= namedCount;
    } catch {
        /* default to the star convention */
    }

    const line = usesStar ? `export * from '${rel}';` : `export { ${v.className} } from '${rel}';`;
    const extra = v.isExportedLocally
        ? ''
        : `\n      NOTE: \`class ${v.className}\` is not declared with \`export\` in its own file — add the \`export\` keyword there too.`;
    return `    add to ${v.entry}:\n      ${line}${extra}`;
}

function printHuman(report, opts) {
    const { violations, uncertain, allowlisted, totals } = report;

    if (!opts.quiet && uncertain.length > 0) {
        console.log('');
        console.log(`UNCERTAIN (${uncertain.length}) — not gating, resolve by hand if you care:`);
        for (const u of uncertain) {
            console.log(`  ? ${u.pkgName} | ${u.className} | ${u.file}:${u.line}`);
            console.log(`      ${u.why}`);
        }
    }

    if (!opts.quiet && allowlisted.length > 0) {
        console.log('');
        console.log(`ALLOWLISTED (${allowlisted.length}):`);
        for (const a of allowlisted) {
            console.log(`  - ${a.pkgName} | ${a.className} | ${a.file}:${a.line}`);
            console.log(`      reason: ${a.reason}`);
        }
    }

    if (violations.length > 0) {
        console.log('');
        console.log(`VIOLATIONS (${violations.length}) — @RegisterClass classes not exported from their package's public API:`);
        console.log('');
        const byPkg = new Map();
        for (const v of violations) {
            if (!byPkg.has(v.pkgName)) byPkg.set(v.pkgName, []);
            byPkg.get(v.pkgName).push(v);
        }
        for (const [pkg, list] of [...byPkg].sort((a, b) => b[1].length - a[1].length)) {
            console.log(`  ${pkg}  (${list.length})`);
            for (const v of list) {
                console.log(`    ✖ ${v.className} | ${v.file}:${v.line}${v.isGenerated ? '  [GENERATED]' : ''}`);
                console.log(suggestFix(v));
            }
            console.log('');
        }
    }

    console.log('─────────────────────────────────────────');
    console.log(
        `@RegisterClass export invariant: ${totals.registered} registered classes in ${totals.packages} packages — ` +
            `${totals.passed} exported, ${violations.length} violations, ${uncertain.length} uncertain, ${allowlisted.length} allowlisted`
    );
    console.log('─────────────────────────────────────────');

    if (violations.length > 0) {
        console.log(`
Every class decorated with @RegisterClass must be exported from its package's
public API (src/public-api.ts or src/index.ts).

WHY: @RegisterClass plugs a class into MJ's ClassFactory resolution chain — a
registered-but-unexported class claims to be resolvable from anywhere while being
importable from nowhere. Concretely, the pre-built class manifests
(@memberjunction/ng-bootstrap, ng-bootstrap-lite, server-bootstrap, ...) emit a
NAMED IMPORT for each registered class, so an unexported one makes the manifest
unloadable outside a bundler:

    SyntaxError: The requested module '@memberjunction/x'
                 does not provide an export named 'Y'

FIX: add the suggested export line above to the package's entry point, matching
that file's existing convention.

If a class genuinely must not be exported (a structurally unsafe circular import,
or generated code you cannot hand-edit), add it to:
  .github/scripts/ci/registerclass-export-allowlist.txt
as "<file>|<ClassName>   # reason" — the reason is REQUIRED.`);
    }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
    const opts = { json: false, quiet: false, singleFile: null };
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--json': opts.json = true; break;
            case '--quiet': opts.quiet = true; break;
            case '--file': opts.singleFile = argv[++i]; break;
            case '-h':
            case '--help':
                console.log('Usage: check-registerclass-exports.mjs [--file <path>] [--json] [--quiet]');
                process.exit(0);
                break;
            default:
                console.error(`Unknown arg: ${argv[i]}`);
                process.exit(2);
        }
    }
    return opts;
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const { entries: allowlist, errors: allowlistErrors } = loadAllowlist();
    if (allowlistErrors.length > 0) {
        console.error('registerclass-gate: malformed allowlist');
        for (const e of allowlistErrors) console.error(`  ${e}`);
        process.exit(2);
    }

    if (!existsSync(PACKAGES_DIR)) {
        console.error(`registerclass-gate: packages directory not found: ${PACKAGES_DIR}`);
        process.exit(2);
    }

    // --file narrows the sweep to the package OWNING that file: reachability is a
    // whole-package property, so the package's export graph must still be resolved.
    let pkgDirs = findPackageDirs(PACKAGES_DIR);
    if (opts.singleFile) {
        const target = resolve(opts.singleFile);
        if (!existsSync(target)) {
            console.error(`registerclass-gate: file not found: ${opts.singleFile}`);
            process.exit(2);
        }
        pkgDirs = pkgDirs.filter((d) => target.startsWith(d + sep));
        // Deepest match wins (nested workspace packages).
        pkgDirs = pkgDirs.sort((a, b) => b.length - a.length).slice(0, 1);
        if (pkgDirs.length === 0) {
            console.error(`registerclass-gate: ${opts.singleFile} is not inside a package under packages/`);
            process.exit(2);
        }
    }

    const results = [];
    for (const dir of pkgDirs) {
        const r = analyzePackage(dir);
        if (r) results.push(r);
    }

    const allViolationsRaw = results.flatMap((r) => r.violations);
    const uncertain = results.flatMap((r) => r.uncertain);

    // Partition against the allowlist.
    const allowlisted = [];
    const violations = [];
    for (const v of allViolationsRaw) {
        const reason = allowlist.get(`${v.file}|${v.className}`);
        if (reason) allowlisted.push({ ...v, reason });
        else violations.push(v);
    }

    // In --file mode, report only classes defined in that file.
    let scopedViolations = violations;
    let scopedUncertain = uncertain;
    if (opts.singleFile) {
        const rel = relative(REPO_ROOT, resolve(opts.singleFile));
        scopedViolations = violations.filter((v) => v.file === rel);
        scopedUncertain = uncertain.filter((u) => u.file === rel);
    }

    const totals = {
        packages: results.length,
        registered: results.reduce((n, r) => n + r.registeredCount, 0),
        passed: results.reduce((n, r) => n + r.passed, 0),
        generatedViolations: scopedViolations.filter((v) => v.isGenerated).length,
        handWrittenViolations: scopedViolations.filter((v) => !v.isGenerated).length,
        noEntryPackages: results.filter((r) => r.noEntry).length,
    };

    const report = { violations: scopedViolations, uncertain: scopedUncertain, allowlisted, totals };

    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report, opts);

    process.exit(scopedViolations.length > 0 ? 1 : 0);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main();
}

export { resolveExportedBindings, resolveSpecifier, findRegisteredClasses, analyzePackage, loadAllowlist };
