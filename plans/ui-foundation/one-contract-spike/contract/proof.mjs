import ts from 'typescript'; import fs from 'node:fs'; import crypto from 'node:crypto';
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const load = (f = 'surface.contract.json') => JSON.parse(fs.readFileSync(f, 'utf8'));
const Pascal = (s) => s[0].toUpperCase() + s.slice(1);

// ── 1. GENERATOR: contract → types. Pure function of the contract: sorted keys, no clock, no network.
export function generate(c) {
  const N = Pascal(c.name);
  const props = Object.keys(c.inputs).sort().map((k) => `  ${k}?: ${c.inputs[k].type};`).join('\n');
  return `// GENERATED from ${c.name}.contract.json (sha ${sha(JSON.stringify(c))}) — do not edit\n` +
    `export interface ${N}Props {\n${props}\n  children?: unknown;\n}\n` +
    `export type ${N}Part = ${Object.keys(c.parts).sort().map((p) => JSON.stringify(p)).join(' | ')};\n`;
}
// expected DOM classes for any props — also a pure function of the contract (the parity oracle)
export function expectedClasses(c, p = {}) {
  const out = [c.class];
  for (const [k, d] of Object.entries(c.inputs)) {
    const v = p[k] ?? d.default;
    if (d.openAxis) out.push(d.openAxis.classPattern.replace('{value}', v));
    if (d.class && v === true) out.push(d.class);
  }
  return out.sort();
}

// ── 2. ANGULAR BINDING vs contract: read Matt's real component with the TS parser (no Angular needed).
function angularFacts(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const inputs = {}, parts = {}; let builtin = [];
  const lit = (n) => n.kind === ts.SyntaxKind.TrueKeyword ? true : n.kind === ts.SyntaxKind.FalseKeyword ? false : ts.isStringLiteral(n) ? n.text : undefined;
  const visit = (n) => {
    if (ts.isPropertyDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText() === 'input') {
      const d = lit(n.initializer.arguments[0]);
      inputs[n.name.getText()] = { type: n.initializer.typeArguments?.[0].getText() ?? typeof d, default: d };
    }
    if (ts.isDecorator(n) && n.expression.getText().startsWith('Directive')) {
      const t = n.expression.getText(); const cls = /class:\s*'([^']+)'/.exec(t)?.[1]; const sel = /selector:\s*'\[mjSurface(\w+)\]'/.exec(t)?.[1];
      if (cls && sel) parts[sel.toLowerCase()] = cls;
    }
    if (ts.isVariableDeclaration(n) && n.name.getText() === 'BUILTIN_SURFACE_LEVELS') builtin = [...n.getText().matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    ts.forEachChild(n, visit);
  };
  visit(sf); return { inputs, parts, builtin };
}
export function checkAngular(c, file = 'surface.component.ts') {
  const a = angularFacts(file), errs = [];
  for (const k of new Set([...Object.keys(c.inputs), ...Object.keys(a.inputs)])) {
    if (!a.inputs[k]) errs.push(`contract input ${k} is missing from the Angular binding`);
    else if (!c.inputs[k]) errs.push(`Angular input ${k} is not in the contract`);
    else if (a.inputs[k].type !== c.inputs[k].type || a.inputs[k].default !== c.inputs[k].default) errs.push(`${k}: Angular ${JSON.stringify(a.inputs[k])} ≠ contract ${JSON.stringify({ type: c.inputs[k].type, default: c.inputs[k].default })}`);
  }
  if (JSON.stringify(a.parts) !== JSON.stringify(c.parts)) errs.push(`parts differ: ${JSON.stringify(a.parts)} vs ${JSON.stringify(c.parts)}`);
  if (a.builtin.join() !== c.inputs.Level.openAxis.builtin.join()) errs.push(`built-in levels differ: ${a.builtin} vs ${c.inputs.Level.openAxis.builtin}`);
  return errs;
}

// ── 3. CSS vs contract: every class and every public custom property in the stylesheet must be one the contract declares.
export function checkCss(c, file = 'primitives.css') {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), errs = [];
  const declared = new Set([c.class, ...Object.values(c.parts), ...Object.values(c.inputs).flatMap((d) => [d.class, ...(d.openAxis?.builtin.map((v) => d.openAxis.classPattern.replace('{value}', v)) ?? [])]).filter(Boolean)]);
  const used = new Set(css.match(/\.mj-surface[a-z-]*/g).map((s) => s.slice(1)));
  for (const u of used) if (!declared.has(u)) errs.push(`CSS class .${u} is not in the contract`);
  for (const d of declared) if (d.startsWith('mj-surface') && !used.has(d)) errs.push(`contract class .${d} has no CSS`);
  const ev = c.exposedValues, levels = c.inputs.Level.openAxis.builtin;
  const re = new RegExp(`^--mj-surface(-(${levels.join('|')}))?-(${[...ev.properties].sort((a, b) => b.length - a.length).join('|')})(-(${ev.states.join('|')}))?$`);
  const vars = [...new Set(css.match(/--mj-surface-[a-z0-9-]+/g))];
  for (const v of vars) if (!re.test(v)) errs.push(`exposed value ${v} does not fit the contract's naming rule`);
  return { errs, classes: used.size, vars: vars.length };
}

// ── 4. REACT BINDING vs contract: the compiler is the check. Exhaustive by construction (the `rest` trick).
const REACT_BINDING = `import type { SurfaceProps } from './surface.generated';
declare const React: typeof import('react');
export function Surface({ Level = 'base', Elevation, Interactive = false, Selected = false, Padding, Radius, Tone, VisualRole, children, ...rest }: SurfaceProps) {
  const _exhaustive: Record<string, never> = rest;   // a new contract input that this binding ignores fails to compile
  const cls = ['mj-surface', 'mj-surface-' + Level, Interactive && 'mj-surface-interactive', Selected && 'is-selected'].filter(Boolean).join(' ');
  return React.createElement('div', { className: cls }, children as never);
}`;
export function checkReact(c) {
  fs.writeFileSync('surface.generated.ts', generate(c)); fs.writeFileSync('surface.react.ts', REACT_BINDING);
  const prog = ts.createProgram(['surface.react.ts'], { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], typeRoots: ['../node_modules/@types'] });
  return ts.getPreEmitDiagnostics(prog).map((d) => 'TS' + d.code + ' ' + ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 150));
}
// ── 5. DOM parity for the React binding: render every fixture the contract implies, compare to the oracle.
export function checkReactDom(c) {
  const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
  const js = ts.transpileModule(REACT_BINDING.replace(/^import.*\n|^declare.*\n/gm, '').replace('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const Surface = new Function('React', js + '; return Surface;')(React);
  let n = 0, bad = [];
  for (const Level of [...c.inputs.Level.openAxis.builtin, 'brand-x']) for (const Interactive of [false, true]) for (const Selected of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(Surface, { Level, Interactive, Selected }));
    const got = /class="([^"]*)"/.exec(html)[1].split(' ').sort().join(' '), want = expectedClasses(c, { Level, Interactive, Selected }).join(' ');
    n++; if (got !== want) bad.push(`${JSON.stringify({ Level, Interactive, Selected })}: got "${got}" want "${want}"`);
  }
  return { n, bad };
}

const run = (label, c) => {
  const css = checkCss(c), ng = checkAngular(c), rx = checkReact(c), dom = checkReactDom(c);
  console.log(`\n### ${label}`);
  console.log(`generated types sha: ${sha(generate(c))} (2nd run: ${sha(generate(load()))})`);
  console.log(`Angular binding vs contract: ${ng.length ? 'FAIL' : 'pass'}`); ng.forEach((e) => console.log('   ✗', e));
  console.log(`CSS vs contract (${css.classes} classes, ${css.vars} exposed values): ${css.errs.length ? 'FAIL' : 'pass'}`); css.errs.forEach((e) => console.log('   ✗', e));
  console.log(`React binding compiles against generated types: ${rx.length ? 'FAIL' : 'pass'}`); rx.forEach((e) => console.log('   ✗', e));
  console.log(`React DOM parity over ${dom.n} fixtures: ${dom.bad.length ? 'FAIL' : 'pass'}`); dom.bad.slice(0, 3).forEach((e) => console.log('   ✗', e));
};
const c = load(); run('Contract as written, against Matt\'s real surface component and stylesheet (#6673)', c);
const drift = structuredClone(c); drift.inputs.Density = { type: 'string', default: 'comfortable' }; drift.inputs.Selected.default = true;
run('Drift test: contract gains a Density input and flips a default; bindings not updated', drift);
