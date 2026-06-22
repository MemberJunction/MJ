#!/usr/bin/env node
/**
 * gen-dom-stub.mjs — generate a starter DOM-test stub for an Angular component.
 *
 * Reads a component's @Input/@Output + template and emits a *.component.dom.test.ts
 * skeleton with one TODO per dynamic template feature (@if gating, [class.x], (event),
 * {{ binding }}, [attr.x]). Produces STARTERS WITH TODOs — you fill in the assertions.
 * (No auto-generated green: the generator never asserts behavior for you.)
 *
 * Usage:
 *   node scripts/gen-dom-stub.mjs <path/to/x.component.ts>             # print stub to stdout
 *   node scripts/gen-dom-stub.mjs <path/to/x.component.ts> --write     # write .dom.test.ts + bootstrap package config
 *   node scripts/gen-dom-stub.mjs <path/to/x.component.ts> --write --no-config  # spec only
 *
 * With --write it also makes the OWNING PACKAGE DOM-test-ready (idempotent), so one command
 * takes a component from zero to runnable:
 *   - tsconfig.spec.json — created if absent (so the Angular AOT compiler sees the spec files).
 *   - vitest.config.ts — created (or a node-only boilerplate config converted) to the DOM preset.
 *       Single vs. DUAL preset is AUTO-DETECTED: if any existing non-DOM spec does
 *       vi.mock('@angular/core' | '@memberjunction/core') — mocks that break the Angular AOT
 *       compile path — a dual node+dom project config is emitted; otherwise a single DOM preset.
 *       An existing DOM-capable or unrecognized custom config is left untouched.
 *   - package.json — adds @memberjunction/ng-test-utils to devDependencies (run npm install after).
 *
 * Component metadata (class, selector, standalone, @Input/@Output, template) is read
 * via the TypeScript compiler AST — robust against decorator formatting, helper
 * classes declared in the same file, getter/setter @Inputs, and decorator arguments.
 * Template dynamic bits are matched with focused regexes (Angular's binding syntax is
 * regular); swapping in the @angular/compiler template AST is a possible future step.
 *
 * v1 scope: standalone/leaf components get a renderComponentFixture skeleton;
 * module-declared (standalone:false) components get a renderTemplate note + ideas.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { dirname, basename, join, relative } from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

const file = process.argv[2];
const write = process.argv.includes("--write");
const noConfig = process.argv.includes("--no-config");
if (!file || !file.endsWith(".component.ts")) {
  console.error("Usage: node scripts/gen-dom-stub.mjs <path/to/x.component.ts> [--write] [--no-config]");
  process.exit(1);
}

// repo root = parent of this script's /scripts dir. fileURLToPath handles spaces in the path.
const repoRoot = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, "");

const src = readFileSync(file, "utf-8");
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, /* setParentNodes */ true);

const decoratorName = (dec) => {
  const expr = ts.isCallExpression(dec.expression) ? dec.expression.expression : dec.expression;
  return ts.isIdentifier(expr) ? expr.text : "";
};
const decoratorsOf = (node) => (ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined) || [];

// --- find the @Component-decorated class (skips helper classes in the same file) ---
let componentClass;
let componentArg;
const visit = (node) => {
  if (ts.isClassDeclaration(node)) {
    for (const dec of decoratorsOf(node)) {
      if (decoratorName(dec) === "Component" && ts.isCallExpression(dec.expression)) {
        componentClass = node;
        componentArg = dec.expression.arguments[0];
      }
    }
  }
  ts.forEachChild(node, visit);
};
ts.forEachChild(sf, visit);

const className = componentClass?.name?.text ?? "TheComponent";

// --- read the @Component({...}) metadata ---
let selector = "";
let standalone = true; // Angular 21 defaults to standalone when omitted
let template = "";
let templateUrl = "";
if (componentArg && ts.isObjectLiteralExpression(componentArg)) {
  for (const prop of componentArg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(sf);
    const init = prop.initializer;
    if (key === "selector" && ts.isStringLiteralLike(init)) selector = init.text;
    else if (key === "standalone") standalone = init.kind === ts.SyntaxKind.TrueKeyword;
    else if (key === "template" && ts.isStringLiteralLike(init)) template = init.text;
    else if (key === "templateUrl" && ts.isStringLiteralLike(init)) templateUrl = init.text;
  }
}

// --- @Input / @Output members (properties + get/set accessors; dedupe getter+setter pairs) ---
const inputs = [];
const outputs = [];
if (componentClass) {
  for (const member of componentClass.members) {
    if (!member.name || !ts.isIdentifier(member.name)) continue;
    for (const dec of decoratorsOf(member)) {
      const dn = decoratorName(dec);
      if (dn === "Input") inputs.push(member.name.text);
      else if (dn === "Output") outputs.push(member.name.text);
    }
  }
}
const uniqInputs = [...new Set(inputs)];
const uniqOutputs = [...new Set(outputs)];

// --- resolve the template (inline captured above, else read templateUrl) ---
if (!template && templateUrl) {
  const htmlPath = join(dirname(file), templateUrl);
  if (existsSync(htmlPath)) template = readFileSync(htmlPath, "utf-8");
}

// --- derive test ideas from the template's dynamic bits ---
// Collect @for loop variables (e.g. `@for (day of days; ...)` → "day"). A TODO whose
// expression references one is NOT settable via an @Input — it must be asserted on a
// rendered item — so we flag it rather than implying it's a simple input test.
const loopVars = new Set([...template.matchAll(/@for\s*\(\s*(\w+)\s+of\b/g)].map((m) => m[1]));
const loopFlag = (expr) =>
  [...loopVars].some((v) => new RegExp(`\\b${v}\\b`).test(expr)) ? "  [↻ references a @for loop var — assert via a rendered item, not an @Input]" : "";

const todos = [];
for (const m of template.matchAll(/@if\s*\(([^)]+)\)/g)) todos.push(`gating: shows/hides the right element when \`${m[1].trim()}\`${loopFlag(m[1])}`);
for (const m of template.matchAll(/\[class\.([\w-]+)\]="([^"]+)"/g))
  todos.push(`conditional class: \`${m[1]}\` applied when \`${m[2].trim()}\`${loopFlag(m[2])}`);
for (const m of template.matchAll(/\[attr\.([\w-]+)\]="([^"]+)"/g)) todos.push(`attribute: \`${m[1]}\` reflects \`${m[2].trim()}\`${loopFlag(m[2])}`);
for (const m of template.matchAll(/\((\w+)\)="([^"]+)"/g))
  todos.push(`event: \`(${m[1]})\` → \`${m[2].trim()}\` (assert the @Output emits / handler runs)${loopFlag(m[2])}`);
for (const m of template.matchAll(/\{\{\s*([\w.?]+)\s*\}\}/g)) todos.push(`renders \`${m[1]}\`${loopFlag(m[1])}`);
const uniqTodos = [...new Set(todos)];

// --- emit ---
const importPath = "./" + basename(file).replace(/\.ts$/, "");
const header = `  // @Inputs:  ${uniqInputs.join(", ") || "(none)"}\n  // @Outputs: ${uniqOutputs.join(", ") || "(none)"}`;
const todoBlock = uniqTodos.length ? uniqTodos.map((t) => `  // TODO: ${t}`).join("\n") : "  // (no dynamic template bits detected — assert the static render)";

let out;
if (standalone) {
  out = `import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { ${className} } from '${importPath}';

/** DOM-level spec for <${selector}>. Generated starter — replace the TODOs with real assertions. */
describe('${className} (DOM)', () => {
${header}

  it('renders', () => {
    const fixture = renderComponentFixture(${className});
    expect(fixture.nativeElement).toBeTruthy();
  });

${todoBlock}
});
`;
} else {
  out = `import { describe, it, expect, vi } from 'vitest';
import { renderTemplate } from '@memberjunction/ng-test-utils';
import { ${className} } from '${importPath}';

/**
 * <${selector}> is a module-declared (standalone:false) component. Use renderTemplate:
 *   const fixture = await renderTemplate('<${selector}>...</${selector}>', {
 *     imports: [CommonModule],
 *     declarations: [${className}, ...any child components],
 *   });
 */
describe('${className} (DOM)', () => {
${header}

${todoBlock}
});
`;
}

if (write) {
  const dest = file.replace(/\.component\.ts$/, ".component.dom.test.ts");
  if (existsSync(dest)) {
    console.error(`Refusing to overwrite existing ${dest}`);
    process.exit(1);
  }
  writeFileSync(dest, out, "utf-8");
  console.error(`Wrote ${dest}`);
  if (!noConfig) ensurePackageDomConfig(file);
} else {
  console.log(out);
}

// ── package-level DOM config bootstrap (idempotent) ──────────────────────────

/** Make the component's owning package DOM-test-ready: tsconfig.spec.json + vitest.config.ts + devDep. */
function ensurePackageDomConfig(componentFile) {
  const pkgRoot = findPackageRoot(componentFile);
  if (!pkgRoot) {
    console.error("  ! could not locate package root — skipped config bootstrap");
    return;
  }
  const rel = relative(pkgRoot, repoRoot).replace(/\\/g, "/") || ".";
  ensureTsconfigSpec(pkgRoot);
  ensureVitestConfig(pkgRoot, rel);
  ensureTestUtilsDevDep(pkgRoot);
}

/** Walk up from a file to the nearest directory containing a package.json. */
function findPackageRoot(startFile) {
  let dir = dirname(startFile);
  for (let i = 0; i < 30 && dir !== dirname(dir); i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return null;
}

/** Recursively collect non-DOM `*.test.ts` specs under a dir (skips node_modules). */
function listNonDomSpecs(dir) {
  const found = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (name !== "node_modules" && name !== "dist") walk(p);
      } else if (name.endsWith(".test.ts") && !name.endsWith(".dom.test.ts")) {
        found.push(p);
      }
    }
  };
  walk(dir);
  return found;
}

/**
 * A package needs the DUAL (node + dom) preset when it has logic specs that
 * vi.mock('@angular/core') or vi.mock('@memberjunction/core') — those mocks break the
 * Angular AOT compile path, so they must stay on the node preset.
 */
function needsDualPreset(pkgRoot) {
  const breaker = /vi\.mock\(\s*['"](?:@angular\/core|@memberjunction\/core)['"]/;
  return listNonDomSpecs(join(pkgRoot, "src")).some((f) => breaker.test(readFileSync(f, "utf-8")));
}

function ensureTsconfigSpec(pkgRoot) {
  const p = join(pkgRoot, "tsconfig.spec.json");
  if (existsSync(p)) {
    console.error("  = tsconfig.spec.json exists (left as-is — keeps any narrowed include)");
    return;
  }
  writeFileSync(
    p,
    `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["vitest/globals", "node"]
  },
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
`,
    "utf-8",
  );
  console.error("  + wrote tsconfig.spec.json");
}

function ensureVitestConfig(pkgRoot, rel) {
  const p = join(pkgRoot, "vitest.config.ts");
  const dual = needsDualPreset(pkgRoot);
  const wanted = dual ? dualPresetConfig(rel, basename(pkgRoot)) : singlePresetConfig(rel, pkgNameOf(pkgRoot));
  if (!existsSync(p)) {
    writeFileSync(p, wanted, "utf-8");
    console.error(`  + wrote vitest.config.ts (${dual ? "dual" : "single"} preset)`);
    return;
  }
  const cur = readFileSync(p, "utf-8");
  if (cur.includes("vitest.dom.shared")) {
    console.error("  = vitest.config.ts already DOM-capable (left as-is)");
    return;
  }
  // Recognized node-only boilerplate (the scaffold's default preset) is safe to convert.
  if (/vitest\.shared/.test(cur) && /environment:\s*['"]node['"]/.test(cur)) {
    writeFileSync(p, wanted, "utf-8");
    console.error(`  ~ converted node-only vitest.config.ts → ${dual ? "dual" : "single"} preset`);
    return;
  }
  console.error("  ! vitest.config.ts exists but isn't recognized boilerplate — left as-is; wire the DOM preset manually");
}

function ensureTestUtilsDevDep(pkgRoot) {
  const p = join(pkgRoot, "package.json");
  const pkg = JSON.parse(readFileSync(p, "utf-8"));
  const dep = "@memberjunction/ng-test-utils";
  if (pkg.devDependencies?.[dep]) return;
  pkg.devDependencies = { ...(pkg.devDependencies ?? {}), [dep]: testUtilsVersion() };
  writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.error(`  + added ${dep} to devDependencies — run \`npm install\` at the repo root`);
}

function pkgNameOf(pkgRoot) {
  try {
    return JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf-8")).name || "unknown";
  } catch {
    return "unknown";
  }
}

/** Pin the dep to the test-utils package's own version so it tracks releases. */
function testUtilsVersion() {
  try {
    return JSON.parse(readFileSync(join(repoRoot, "packages/Angular/Generic/test-utils/package.json"), "utf-8")).version || "*";
  } catch {
    return "*";
  }
}

function singlePresetConfig(rel, pkgName) {
  return `import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '${rel}/vitest.dom.shared';

// DOM-level Angular component tests: jsdom + analog (Angular compile) + zoneless TestBed.
// Single preset — no existing spec mocks @angular/core or @memberjunction/core, so the
// package's logic specs (if any) compile fine under the Angular path. Generated by
// scripts/gen-dom-stub.mjs. See guides/ANGULAR_TESTING_GUIDE.md.
export default mergeConfig(
  domSharedConfig,
  defineProject({
    test: {
      name: '${pkgName}',
    },
  })
);
`;
}

function dualPresetConfig(rel, shortName) {
  return `import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '${rel}/vitest.shared';
import domSharedConfig from '${rel}/vitest.dom.shared';

// Dual preset — this package has logic specs that vi.mock('@angular/core') or
// vi.mock('@memberjunction/core'); those mocks break under the Angular AOT compile path, so
// they stay on the fast node preset while *.dom.test.ts run under the jsdom/Angular DOM
// preset. The two projects are kept disjoint by EXCLUSION (mergeConfig concatenates the
// include/exclude arrays). Generated by scripts/gen-dom-stub.mjs. See
// guides/ANGULAR_TESTING_GUIDE.md §3b.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: { name: '${shortName} (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: { name: '${shortName} (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
        }),
      ),
    ],
  },
});
`;
}
