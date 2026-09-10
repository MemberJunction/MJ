#!/usr/bin/env node
/**
 * Scanner placement guard (#4369).
 *
 * A test file inside a package may not read paths OUTSIDE its own package.
 *
 * Why this is a CI-correctness rule, not a style rule: turbo hashes `<pkg>#test` from that
 * package's own files only (`test.inputs` in turbo.json resolve relative to the package
 * directory) plus the hashes of the tasks it dependsOn. A test that scans the repo therefore
 * has a cache key that cannot contain the code it asserts about — so turbo replays a stale
 * green forever, and the replayed log prints the same ✓ a real run would.
 *
 * That is exactly how nine MetadataSync violations survived on `next`: the UUID and
 * multi-provider scanners lived in packages/MJGlobal/src/__tests__, and MJGlobal is the ROOT
 * of the dependency graph, so no upstream task hash widened its key either. The affected-package
 * PR filter (`--filter=...[base]`) selects changed packages and their DEPENDENTS, and MJGlobal
 * is never a dependent — so the PR lane could not run them and the backstop lane replayed them.
 *
 * A repo-wide scanner belongs in .github/guards, which is not an npm workspace and so cannot
 * join the turbo test graph at all. See .github/guards/vitest.config.mts.
 *
 * Escape hatch, for a test that genuinely needs a shared fixture from outside its package:
 *   // scanner-placement-ok: <reason>
 * The reason is required.
 *
 * Usage: node .github/scripts/check-scanner-placement.mjs [packages-dir]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';

// Reuse the repo's comment/string stripper rather than write a second one. It is already
// unit-tested against the false positives that matter here (prose naming an anti-pattern,
// escaped quotes, unterminated template literals).
import { stripCommentsAndStrings } from '../../scripts/check-spec-antipatterns.mjs';

/** Anchors a path built from the file's OWN location. */
const ANCHOR = /(?:\bpath\s*\.\s*)?\b(?:resolve|join)\s*\(\s*__dirname\s*,/;

/** The ESM spelling of __dirname, normalized away before matching. */
const ESM_DIRNAME = /\bdirname\s*\(\s*fileURLToPath\s*\(\s*import\s*\.\s*meta\s*\.\s*url\s*\)\s*\)/g;

/** Inline allowlist marker. A reason is required — a bare marker does not count. */
const ALLOW_COMMENT = /\/\/\s*scanner-placement-ok:\s*\S+/;

const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|cts|mjs|cjs|js)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'generated', 'coverage']);

/**
 * Read the argument list of a call, starting just after its opening paren, and return the
 * string literals in it. String-aware so a paren inside a literal cannot end the scan early,
 * and multi-line aware so a call split across lines is read whole.
 */
function readStringArgs(text, startIndex) {
    const segments = [];
    let depth = 1;
    let i = startIndex;
    while (i < text.length && depth > 0) {
        const ch = text[i];
        if (ch === '(') {
            depth++;
            i++;
        } else if (ch === ')') {
            depth--;
            i++;
        } else if (ch === "'" || ch === '"' || ch === '`') {
            const quote = ch;
            let literal = '';
            i++;
            while (i < text.length && text[i] !== quote) {
                if (text[i] === '\\') {
                    literal += text[i + 1] ?? '';
                    i += 2;
                    continue;
                }
                literal += text[i];
                i++;
            }
            i++; // closing quote
            segments.push(literal);
        } else {
            i++;
        }
    }
    return segments;
}

/**
 * Find every path built from the file's own directory.
 * @returns {{line: number, segments: string[], raw: string}[]} 1-indexed lines.
 */
export function findTraversals(text) {
    const lines = text.split('\n');
    // Normalize the ESM spelling on both views so one anchor regex covers both forms. The
    // replacement is the same length or shorter, and we re-find the anchor per line rather
    // than trusting column offsets, so the shift is harmless.
    const normalizedLines = lines.map((l) => l.replace(ESM_DIRNAME, '__dirname'));
    const stripped = stripCommentsAndStrings(normalizedLines);

    const found = [];
    for (let i = 0; i < stripped.length; i++) {
        // The anchor must survive stripping — otherwise it was prose, not code.
        if (!ANCHOR.test(stripped[i])) continue;

        const match = ANCHOR.exec(normalizedLines[i]);
        if (!match) continue;

        // Read the arguments from the ORIGINAL text (strings intact), continuing across lines.
        const rest = normalizedLines.slice(i).join('\n');
        const openParen = rest.indexOf('(', match.index);
        found.push({
            line: i + 1,
            segments: readStringArgs(rest, openParen + 1),
            raw: lines[i].trim(),
        });
    }
    return found;
}

/** `a/b/` and `a/b/.` and `a/b` are the same place; the repo root is `.`, never `./`. */
function tidy(p) {
    const n = posix.normalize(p).replace(/\/+$/, '');
    return n === '' ? '.' : n;
}

/** Is `target` at or beneath `prefix`? */
function within(target, prefix) {
    return target === prefix || target.startsWith(`${prefix}/`);
}

/**
 * Flag traversals that leave the owning package.
 *
 * Depth is COMPUTED, never counted: `../../..` escapes from src/__tests__ but not from
 * src/a/b/__tests__, and packages nest (packages/Angular/Generic/<pkg>).
 *
 * A read is NOT a finding when the package's turbo cache key already covers it — that is
 * remedy 2 below, and a guard that kept complaining after the real fix would only teach
 * people to reach for the annotation instead.
 *
 * @param text            file contents
 * @param fileDirRel      the file's directory, repo-relative, POSIX separators
 * @param packageRootRel  the owning package's root, repo-relative, POSIX separators
 * @param coveredPrefixes repo-relative trees the package declares via $TURBO_ROOT$ inputs
 */
export function scanText(text, fileDirRel, packageRootRel, coveredPrefixes = []) {
    const lines = text.split('\n');
    const covered = coveredPrefixes.map(tidy);
    const violations = [];

    for (const t of findTraversals(text)) {
        if (ALLOW_COMMENT.test(lines[t.line - 1] ?? '')) continue;

        const resolved = tidy(posix.join(fileDirRel, ...t.segments));
        if (within(resolved, packageRootRel)) continue;
        if (covered.some((prefix) => within(resolved, prefix))) continue;

        violations.push({ line: t.line, resolved, raw: t.raw });
    }
    return violations;
}

/**
 * The repo-relative trees a package declares on its `#test` task via $TURBO_ROOT$ inputs.
 * A trailing `/**` (or any glob tail) is trimmed back to the literal directory prefix.
 */
export function coveredPrefixesFor(turboConfig, packageName) {
    const inputs = turboConfig?.tasks?.[`${packageName}#test`]?.inputs ?? [];
    return inputs
        .filter((i) => i.startsWith('$TURBO_ROOT$/'))
        .map((i) => i.slice('$TURBO_ROOT$/'.length).replace(/\/?\*.*$/, ''))
        .filter(Boolean)
        .map(tidy);
}

/** Nearest ancestor directory holding a package.json, at or below `stopAt`. */
function owningPackage(fileDir, stopAt) {
    let dir = fileDir;
    while (dir.startsWith(stopAt) && dir !== stopAt) {
        if (existsSync(join(dir, 'package.json'))) return dir;
        dir = resolve(dir, '..');
    }
    return null;
}

/** turbo.json is JSONC. Only whole-line comments are stripped, so a `//` inside a glob is safe. */
function readTurboConfig(path) {
    try {
        const body = readFileSync(path, 'utf-8')
            .split('\n')
            .map((l) => (l.trim().startsWith('//') ? '' : l))
            .join('\n');
        return JSON.parse(body);
    } catch (e) {
        console.error(`Scanner placement guard: could not read ${path} (${e.message}); assuming no coverage.`);
        return {};
    }
}

function findTestFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            out.push(...findTestFiles(join(dir, entry.name)));
        } else if (TEST_FILE.test(entry.name)) {
            out.push(join(dir, entry.name));
        }
    }
    return out;
}

function main() {
    const repoRoot = resolve(process.argv[2] ? resolve(process.argv[2], '..') : join(import.meta.dirname, '..', '..'));
    const packagesDir = process.argv[2] ? resolve(process.argv[2]) : join(repoRoot, 'packages');

    if (!existsSync(packagesDir)) {
        console.error(`Scanner placement guard: no such directory: ${packagesDir}`);
        process.exit(1);
    }

    const toRel = (p) => relative(repoRoot, p).split(sep).join('/');
    const findings = [];

    const turboConfig = readTurboConfig(join(repoRoot, 'turbo.json'));
    const prefixCache = new Map();
    const prefixesFor = (pkgRoot) => {
        if (!prefixCache.has(pkgRoot)) {
            let name = null;
            try {
                name = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf-8')).name;
            } catch {
                name = null;
            }
            prefixCache.set(pkgRoot, name ? coveredPrefixesFor(turboConfig, name) : []);
        }
        return prefixCache.get(pkgRoot);
    };

    for (const file of findTestFiles(packagesDir)) {
        const fileDir = resolve(file, '..');
        const pkgRoot = owningPackage(fileDir, packagesDir);
        if (!pkgRoot) continue; // a stray test outside any package — not this guard's business

        const text = readFileSync(file, 'utf-8');
        for (const v of scanText(text, toRel(fileDir), toRel(pkgRoot), prefixesFor(pkgRoot))) {
            findings.push({ file: toRel(file), pkg: toRel(pkgRoot), ...v });
        }
    }

    if (findings.length === 0) {
        console.log('Scanner placement guard: no package test reads outside its own package.');
        return;
    }

    console.error(`\nFound ${findings.length} package test(s) reading OUTSIDE their own package:\n`);
    for (const f of findings) {
        console.error(`  ${f.file}:${f.line}`);
        console.error(`      ${f.raw}`);
        console.error(`      reaches '${f.resolved}', outside '${f.pkg}'\n`);
    }
    console.error(
        `Turbo hashes <pkg>#test from that package's own files only, so a test reading outside\n` +
            `its package has a cache key that cannot contain what it asserts about — turbo replays a\n` +
            `stale green indefinitely, and the replayed log looks exactly like a real run (#4369).\n\n` +
            `How to fix:\n` +
            `  1. A repo-wide SCANNER belongs in .github/guards/<name>.guard.test.ts, which is not an\n` +
            `     npm workspace and so never enters the turbo test graph. It runs in the Source guards job.\n` +
            `  2. A package test that reads a shared FIXTURE outside the package: declare that tree in\n` +
            `     turbo.json under "<pkg>#test".inputs with a $TURBO_ROOT$ path, so the cache key covers it.\n` +
            `  3. Genuinely fine as-is: append  // scanner-placement-ok: <reason>  on the line.`
    );
    process.exit(1);
}

// Only run the CLI when invoked directly, so the unit tests can import the pure functions.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'check-scanner-placement.mjs')) {
    main();
}
