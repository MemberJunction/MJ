#!/usr/bin/env node
/**
 * Entity class-registration manifest completeness gate.
 *
 * The committed `mj-class-registrations.ts` manifests are the only thing that pulls
 * `@RegisterClass` subclasses into a running app. A subclass that is not in them compiles,
 * passes every test, and merges green — and then the app silently instantiates the BASE class
 * instead, so whatever the subclass overrode (a server-side permission check, a computed field)
 * never runs.
 *
 * ## The incidents this exists to prevent (October 2026)
 *
 * Three in one day, all the same shape:
 *
 *  - #5973 and #4412 each added registered classes without regenerating. `next`'s Build went red
 *    on the freshness gate and STAYED red for most of 2026-10-22, until #6009 regenerated the
 *    four manifests by hand. While it was red the unit shards were skipped, so the whole
 *    full-suite signal was off for a day.
 *  - #5997 added `MJConversationEntityServer` and #6022 added `MJEntityAlternateBaseViewEntity`;
 *    both reached review with the class in NO manifest.
 *
 * The reason this keeps happening is structural, not careless: **PR CI cannot see it.** The
 * sibling freshness gate in `test.yml` regenerates the manifests and diffs them, which needs a
 * fully built tree, so it is guarded by `steps.scope.outputs.turbo_filter == ''` — i.e. it runs
 * only on full-suite builds, which in practice means a push to `next`. Every PR run uses a turbo
 * filter and skips it. The author gets a green PR and `next` takes the hit after merge.
 *
 * ## Why this gate is static, and what that buys
 *
 * This check never builds anything and never runs the generator. It reads the committed source
 * and the committed manifests and asserts one invariant:
 *
 *   > if a manifest already imports from package P, then every `@RegisterClass(BaseEntity, …)`
 *   > class exported by P must be imported by that manifest.
 *
 * That makes it cheap enough for the `Source guards` job, which runs on every PR, and it holds
 * regardless of HOW the omission arrived — a forgotten regeneration, a bad merge resolution that
 * took one side of a manifest conflict, or a hand edit.
 *
 * ## Why only `BaseEntity`
 *
 * Measured against `origin/next` at 5b9218de28, before this gate existed:
 *
 *  - the naive rule "every registered class must appear in some manifest" flags 607 of 1970 —
 *    useless, because it hits JSDoc examples, abstract bases, and whole provider families that
 *    no bootstrap includes;
 *  - scoping to packages a manifest already imports from still flags 87, all of them
 *    `BaseAction` (25), `BaseLintRule` (60), `BaseCLIPlugin` (1) and
 *    `BaseTransportDriverFactory` (1) — families that are loaded by other means;
 *  - restricting to `@RegisterClass(BaseEntity, …)` flags **0 of 535**.
 *
 * So entity subclasses are the one family where the invariant already holds everywhere, which is
 * what lets this be a blocking gate that starts green instead of a 600-line allowlist. It is also
 * exactly the family CodeGen generates and the family that caused all three incidents.
 *
 * Re-run those numbers before widening the decorator set.
 *
 * ## Escape hatch
 *
 * A class that genuinely must stay out of a manifest carries, on the decorator line or within
 * the two lines above the class, a marker naming the reason:
 *
 *   // manifest-registration-ok: abstract base, never instantiated directly
 *
 * Exit codes: 0 clean, 1 violations found, 2 misconfiguration (no populated manifests or no
 * registered entity classes discovered, which would mean this gate silently checks nothing).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join, dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = process.cwd();
const PACKAGES = join(REPO_ROOT, 'packages');
const MANIFEST_BASENAMES = ['mj-class-registrations.ts', 'class-registrations-manifest.ts'];
const ALLOW_MARKER = 'manifest-registration-ok:';
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '__tests__', 'coverage', '.turbo']);

/** Every .ts file under packages/, minus build output and tests. */
function collectSourceFiles(dir, out = []) {
   let entries;
   try {
      entries = readdirSync(dir, { withFileTypes: true });
   } catch {
      return out;
   }
   for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
         if (!SKIP_DIRS.has(entry.name)) collectSourceFiles(full, out);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
         out.push(full);
      }
   }
   return out;
}

/** Comments hold `@RegisterClass` examples; they are not registrations. */
export function stripComments(text) {
   return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^([ \t]*)\/\/.*$/gm, '$1');
}

/** The nearest package.json name above a file, cached per directory. */
const packageNameCache = new Map();
function owningPackage(file) {
   let dir = dirname(file);
   const seen = [];
   while (dir.startsWith(PACKAGES)) {
      if (packageNameCache.has(dir)) {
         const hit = packageNameCache.get(dir);
         for (const d of seen) packageNameCache.set(d, hit);
         return hit;
      }
      seen.push(dir);
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) {
         let name = null;
         try {
            name = JSON.parse(readFileSync(pkgPath, 'utf8')).name ?? null;
         } catch {
            name = null;
         }
         for (const d of seen) packageNameCache.set(d, name);
         return name;
      }
      dir = dirname(dir);
   }
   for (const d of seen) packageNameCache.set(d, null);
   return null;
}

/**
 * Each manifest's imports, as (identifier -> package) plus the set of packages it draws from.
 * Identifiers are taken from the IMPORT statements rather than the body: the bodies are full of
 * names that collide with entity class names, and an import ties the identifier to its package.
 */
export function parseManifestImports(text) {
   const identifiers = new Map();
   const packages = new Set();
   for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"]/g)) {
      const pkg = m[2];
      packages.add(pkg);
      for (const raw of m[1].split(',')) {
         const name = raw.trim().split(/\s+as\s+/)[0].trim();
         if (name) identifiers.set(name, pkg);
      }
   }
   return { identifiers, packages };
}

/**
 * Every `@RegisterClass(BaseEntity, …)` class declared in a source file.
 *
 * Takes RAW text (not comment-stripped) because the allow marker lives in a comment, and skips
 * matches that carry a `${…}` substitution or a non-identifier name: CodeGen's own emitters hold
 * `@RegisterClass(BaseEntity, '${entity.Name}') export class ${sClassName}` inside template
 * literals, which is the generator's output rather than a registration in that file.
 */
export function extractBaseEntityRegistrations(raw) {
   const text = stripComments(raw);
   const rawLines = raw.split('\n');
   const out = [];
   const pattern = /@RegisterClass\(\s*BaseEntity\b[^)]*\)(?:[ \t]*\/\/[^\n]*)?\s*export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/g;
   let match;
   while ((match = pattern.exec(text))) {
      const className = match[1];
      if (match[0].includes('${') || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(className)) continue;
      const lineIndex = text.slice(0, match.index).split('\n').length - 1;
      const window = rawLines.slice(Math.max(0, lineIndex - 2), lineIndex + 3).join('\n');
      out.push({ className, lineIndex, allowed: window.includes(ALLOW_MARKER) });
   }
   return out;
}

function readManifests() {
   const files = collectSourceFiles(PACKAGES).filter((f) => MANIFEST_BASENAMES.includes(basename(f)));
   return files.map((file) => {
      const { identifiers, packages } = parseManifestImports(readFileSync(file, 'utf8'));
      return { file, relPath: relative(REPO_ROOT, file), identifiers, packages };
   });
}

/** Which root script regenerates a given manifest, read from package.json rather than hardcoded. */
function regenerationScripts(manifestRelPath) {
   let scripts = {};
   try {
      scripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts ?? {};
   } catch {
      return [];
   }
   const needle = manifestRelPath.replace(/^\.\//, '');
   return Object.entries(scripts)
      .filter(([name, body]) => name.startsWith('mj:manifest') && typeof body === 'string' && body.includes(needle))
      .map(([name]) => name);
}

function main() {
   if (!existsSync(PACKAGES)) {
      console.error('check:manifest-registrations — no packages/ directory; run from the repository root.');
      process.exit(2);
   }
   const manifests = readManifests();
   if (!manifests.some((m) => m.packages.size > 0)) {
      console.error('check:manifest-registrations — found no populated class-registration manifests. This gate would check nothing.');
      process.exit(2);
   }

   const sourceFiles = collectSourceFiles(PACKAGES).filter((f) => !MANIFEST_BASENAMES.includes(basename(f)));
   const violations = [];
   let scanned = 0;
   let allowed = 0;

   for (const file of sourceFiles) {
      let raw;
      try {
         raw = readFileSync(file, 'utf8');
      } catch {
         continue;
      }
      if (!raw.includes('@RegisterClass')) continue;
      for (const hit of extractBaseEntityRegistrations(raw)) {
         if (hit.allowed) {
            allowed++;
            continue;
         }
         const className = hit.className;
         scanned++;
         const pkg = owningPackage(file);
         if (!pkg) continue;
         const covering = manifests.filter((m) => m.packages.has(pkg));
         if (covering.length === 0) continue; // nothing ships this package's registrations
         const missing = covering.filter((m) => m.identifiers.get(className) !== pkg);
         if (missing.length > 0) {
            violations.push({ className, pkg, file: relative(REPO_ROOT, file), missing: missing.map((m) => m.relPath) });
         }
      }
   }

   if (scanned === 0 && allowed === 0) {
      console.error('check:manifest-registrations — found no @RegisterClass(BaseEntity, …) classes in packages/. This gate would check nothing.');
      process.exit(2);
   }

   if (violations.length === 0) {
      console.log(
         `✅ check:manifest-registrations — ${scanned} BaseEntity registration(s) across ${manifests.length} manifest(s); ` +
            `all present${allowed ? `, ${allowed} allow-marked` : ''}.`
      );
      return;
   }

   console.error(`❌ check:manifest-registrations — ${violations.length} registered entity class(es) missing from a manifest that ships their package:\n`);
   const scriptsToRun = new Set();
   for (const v of violations) {
      console.error(`  ${v.className}`);
      console.error(`    declared in : ${v.file}  (${v.pkg})`);
      console.error(`    missing from: ${v.missing.join('\n                  ')}`);
      for (const m of v.missing) for (const s of regenerationScripts(m)) scriptsToRun.add(s);
   }
   console.error('\nA class missing here compiles and tests green, then the app instantiates the BASE class at runtime.');
   console.error('PR CI cannot catch this any other way: the freshness gate that regenerates and diffs the manifests');
   console.error("needs a fully built tree, so it runs only on full-suite builds (a push to `next`), never on a PR.\n");
   if (scriptsToRun.size > 0) {
      console.error('Regenerate with:');
      for (const s of [...scriptsToRun].sort()) console.error(`  pnpm run ${s}`);
      console.error('\nRun these on a FULLY BUILT tree. On a partly built one the generators emit hundreds of spurious');
      console.error('lines for packages whose dist is missing.');
   }
   console.error(`\nIf a class genuinely belongs outside the manifests, mark it: // ${ALLOW_MARKER} <reason>`);
   process.exit(1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
   main();
}
