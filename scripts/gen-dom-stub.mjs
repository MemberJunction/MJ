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
 *   node scripts/gen-dom-stub.mjs <path/to/x.component.ts>          # print to stdout
 *   node scripts/gen-dom-stub.mjs <path/to/x.component.ts> --write  # write the .dom.test.ts next to it
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
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, basename, join } from "path";
import ts from "typescript";

const file = process.argv[2];
const write = process.argv.includes("--write");
if (!file || !file.endsWith(".component.ts")) {
  console.error("Usage: node scripts/gen-dom-stub.mjs <path/to/x.component.ts> [--write]");
  process.exit(1);
}

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
} else {
  console.log(out);
}
