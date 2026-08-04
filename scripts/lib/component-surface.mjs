import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import ts from "typescript";

/**
 * Shared Angular-component parser. Reads a `*.component.ts` and returns its testable
 * **surface**: class name, selector, standalone flag, `@Input`/`@Output` members, and the
 * dynamic template behaviors (gating, conditional classes, attribute bindings, event
 * bindings, interpolations).
 *
 * Used by BOTH `gen-dom-stub.mjs` (to scaffold a spec's TODO checklist) and
 * `dom-test-report.mjs` (to score how much of that surface a spec actually exercises) — so the
 * two always agree on what a component's surface *is*. Don't fork this.
 */

const decoratorName = (dec) => {
  const expr = ts.isCallExpression(dec.expression) ? dec.expression.expression : dec.expression;
  return ts.isIdentifier(expr) ? expr.text : "";
};
const decoratorsOf = (node) => (ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined) || [];

/**
 * @param {string} file absolute/relative path to a `*.component.ts`
 * @returns {{
 *   className: string, selector: string, standalone: boolean, hasTemplate: boolean,
 *   inputs: string[], outputs: string[], loopVars: string[],
 *   behaviors: {
 *     gating: string[],
 *     conditionalClasses: {cls: string, expr: string}[],
 *     attrs: {name: string, expr: string}[],
 *     events: {event: string, handler: string}[],
 *     renders: string[],
 *   },
 * }}
 */
export function parseComponentSurface(file) {
  const src = readFileSync(file, "utf-8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, /* setParentNodes */ true);

  // find the @Component-decorated class (skips helper classes in the same file)
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

  // @Component({...}) metadata
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

  // @Input / @Output members (properties + get/set accessors; dedupe getter+setter pairs)
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

  // resolve the template (inline captured above, else read templateUrl)
  if (!template && templateUrl) {
    const htmlPath = join(dirname(file), templateUrl);
    if (existsSync(htmlPath)) template = readFileSync(htmlPath, "utf-8");
  }

  const loopVars = [...template.matchAll(/@for\s*\(\s*(\w+)\s+of\b/g)].map((m) => m[1]);

  const behaviors = {
    gating: [...template.matchAll(/@if\s*\(([^)]+)\)/g)].map((m) => m[1].trim()),
    conditionalClasses: [...template.matchAll(/\[class\.([\w-]+)\]="([^"]+)"/g)].map((m) => ({ cls: m[1], expr: m[2].trim() })),
    attrs: [...template.matchAll(/\[attr\.([\w-]+)\]="([^"]+)"/g)].map((m) => ({ name: m[1], expr: m[2].trim() })),
    events: [...template.matchAll(/\((\w+)\)="([^"]+)"/g)].map((m) => ({ event: m[1], handler: m[2].trim() })),
    renders: [...template.matchAll(/\{\{\s*([\w.?]+)\s*\}\}/g)].map((m) => m[1]),
  };

  return {
    className,
    selector,
    standalone,
    hasTemplate: !!template,
    inputs: [...new Set(inputs)],
    outputs: [...new Set(outputs)],
    loopVars: [...new Set(loopVars)],
    behaviors,
  };
}
