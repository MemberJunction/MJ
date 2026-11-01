#!/usr/bin/env node
/**
 * CI gate: dynamic `import()` of a package the importing package does not declare (#3741).
 *
 * A bare specifier resolves from the IMPORTING package. Under pnpm's strict layout that
 * package only sees what its own package.json declares, so `await import('some-pkg')` from a
 * package that does not declare `some-pkg` fails at runtime with ERR_MODULE_NOT_FOUND, even
 * when the host application installs it. npm's hoisting hid this; pnpm does not.
 *
 * The dependency-check workflow (Knip) catches a plain `import('pkg')`, but misses the two
 * idioms people reach for to mark an import as optional:
 *
 *   await import('pkg' as string)          // literal behind a cast
 *   const id = 'pkg'; await import(id)     // literal behind a const
 *
 * This gate parses every source file under packages/ with the TypeScript compiler, recovers the
 * specifier of each `import()` call when it is a string literal (also through parentheses,
 * `as`, `satisfies`, `!`, or a `const` in an enclosing scope), and fails when a bare package
 * name is not in any dependency field of the nearest package.json. Relative paths, absolute
 * paths, URLs, `node:` and Node built-ins are never flagged.
 *
 * Specifiers that are genuinely dynamic (a name read from config, a computed path) are not a
 * failure: the gate cannot know the package. `--report-dynamic` lists the ones without an
 * exemption comment, for auditing.
 *
 * Exemption: put `dynamic-import: <reason>` in a comment on the import's line, inside the call,
 * or in the contiguous comment block directly above it. A route for a runtime-configured name
 * is `ImportFromHost` from @memberjunction/dynamic-packages, which resolves from the host.
 *
 * Usage:
 *   node check-dynamic-imports.mjs                   # scan packages/
 *   node check-dynamic-imports.mjs --report-dynamic  # also list unannotated non-literal specifiers
 *   node check-dynamic-imports.mjs --root <dir>      # scan <dir> instead of packages/
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const EXEMPTION_MARKER = 'dynamic-import:';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx']);
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'coverage', '__tests__', '__mocks__', '.git',
  'bundled-libs', 'vendor', '.angular', '.turbo',
]);
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const BUILTINS = new Set(builtinModules);

/** Package name of a bare specifier (`@scope/pkg/sub` → `@scope/pkg`), or null when it is not bare. */
export function PackageNameOf(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return null;
  if (/^[a-zA-Z][a-zA-Z+.-]*:/.test(specifier)) return null; // node:, file:, http:, data:, C:\…
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (BUILTINS.has(name)) return null;
  return name;
}

/** Strips parentheses, `as`, `satisfies`, `<T>x` and `!` around an expression. */
function unwrap(expr) {
  let e = expr;
  while (
    ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) ||
    ts.isTypeAssertionExpression(e) || ts.isNonNullExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

function literalText(expr) {
  const e = unwrap(expr);
  return ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) ? e.text : null;
}

/** Finds a `const <name> = '<literal>'` declared directly in a scope enclosing `node`. */
function constLiteralInScope(node, name) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!(ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope))) continue;
    for (const stmt of scope.statements) {
      if (!ts.isVariableStatement(stmt) || !(stmt.declarationList.flags & ts.NodeFlags.Const)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
          return literalText(decl.initializer);
        }
      }
    }
  }
  return null;
}

function isExempt(sourceText, lines, call) {
  if (sourceText.slice(call.getStart(), call.getEnd()).includes(EXEMPTION_MARKER)) return true;
  const startLine = ts.getLineAndCharacterOfPosition(call.getSourceFile(), call.getStart()).line;
  if (lines[startLine].includes(EXEMPTION_MARKER)) return true;
  for (let i = startLine - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'))) break;
    if (t.includes(EXEMPTION_MARKER)) return true;
  }
  return false;
}

/**
 * Every `import()` call in one file: `{ line, specifier, exempt }`, where `specifier` is the
 * recovered literal or null when the specifier is genuinely dynamic.
 */
export function FindDynamicImports(sourceText, fileName = 'file.ts') {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const lines = sourceText.split('\n');
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
      const arg = unwrap(node.arguments[0]);
      const specifier = ts.isIdentifier(arg) ? constLiteralInScope(node, arg.text) : literalText(arg);
      found.push({
        line: ts.getLineAndCharacterOfPosition(sf, node.getStart()).line + 1,
        specifier,
        exempt: isExempt(sourceText, lines, node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function declaredNames(pkgJson) {
  const names = new Set(pkgJson.name ? [pkgJson.name] : []);
  for (const field of DEPENDENCY_FIELDS) for (const n of Object.keys(pkgJson[field] ?? {})) names.add(n);
  return names;
}

function isSourceFile(name) {
  return SOURCE_EXTENSIONS.has(extname(name)) && !/\.d\.[cm]?ts$/.test(name) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
}

/**
 * Scans `root` recursively. Each file is checked against its nearest package.json.
 * Returns `{ violations, dynamic, scanned }`.
 */
export function ScanTree(root) {
  const violations = [];
  const dynamic = [];
  let scanned = 0;
  const walk = (dir, owner) => {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        owner = { dir, names: declaredNames(JSON.parse(readFileSync(pkgPath, 'utf8'))) };
      } catch {
        // unparseable package.json — keep the enclosing owner
      }
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), owner);
        continue;
      }
      if (!entry.isFile() || !isSourceFile(entry.name) || !owner) continue;
      const file = join(dir, entry.name);
      const text = readFileSync(file, 'utf8');
      if (!text.includes('import(')) continue;
      scanned++;
      for (const hit of FindDynamicImports(text, entry.name)) {
        if (hit.exempt) continue;
        if (hit.specifier === null) {
          dynamic.push({ file, line: hit.line });
          continue;
        }
        const pkg = PackageNameOf(hit.specifier);
        if (pkg && !owner.names.has(pkg)) {
          violations.push({ file, line: hit.line, specifier: hit.specifier, pkg, packageJson: join(owner.dir, 'package.json') });
        }
      }
    }
  };
  walk(root, null);
  return { violations, dynamic, scanned };
}

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const root = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : join(REPO_ROOT, 'packages');
  const { violations, dynamic, scanned } = ScanTree(root);
  const rel = (p) => relative(REPO_ROOT, p);

  if (args.includes('--report-dynamic')) {
    console.log(`Non-literal import() specifiers without a "${EXEMPTION_MARKER}" comment (${dynamic.length}):`);
    for (const d of dynamic) console.log(`  ${rel(d.file)}:${d.line}`);
  }

  if (violations.length === 0) {
    console.log(`✅ check:dynamic-imports — ${scanned} file(s) with import(); every literal package specifier is declared.`);
    return;
  }
  console.error(`❌ check:dynamic-imports — ${violations.length} dynamic import(s) of a package the importing package does not declare:\n`);
  for (const v of violations) {
    console.error(`  ${rel(v.file)}:${v.line}  import('${v.specifier}')  — '${v.pkg}' is not in ${rel(v.packageJson)}`);
  }
  console.error('\nUnder pnpm a bare specifier resolves from the importing package, so an undeclared one fails at runtime');
  console.error('even when the host installs it. Declare it (optionalDependencies for an optional SDK), or, for a name');
  console.error('that comes from configuration, load it with ImportFromHost from @memberjunction/dynamic-packages.');
  console.error(`If the import is intentionally undeclared, mark it: // ${EXEMPTION_MARKER} <reason>`);
  process.exit(1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main();
}
