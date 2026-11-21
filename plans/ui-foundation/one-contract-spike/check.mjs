// The server-side "check" step: real TypeScript compiler, fully in memory, no project on disk needed.
import ts from 'typescript';
import fs from 'node:fs';
const options = { strict: true, noEmit: true, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: 'react', target: ts.ScriptTarget.ES2020,
  lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'], types: [], skipLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext };
const cache = new Map();   // SourceFile cache: lib.d.ts, @types/react and the fixed contract parse once per process
const host = ts.createCompilerHost(options);
const origGet = host.getSourceFile.bind(host);
let component = '';
host.getSourceFile = (name, lang) => {
  if (name.endsWith('component.tsx')) return ts.createSourceFile(name, component, lang, true, ts.ScriptKind.TSX);
  if (!cache.has(name)) cache.set(name, origGet(name, lang));
  return cache.get(name);
};
host.fileExists = (f) => f.endsWith('component.tsx') || ts.sys.fileExists(f);
let old;
export function check(code) {
  component = code;
  const t0 = performance.now();
  const program = ts.createProgram(['contract.d.ts', 'generated.d.ts', 'component.tsx'], options, host, old);
  old = program;
  const diags = ts.getPreEmitDiagnostics(program).map((d) => {
    const pos = d.file ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 };
    return { line: pos.line + 1, col: pos.character + 1, code: 'TS' + d.code, message: ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 170) };
  });
  return { ms: Math.round(performance.now() - t0), diags };
}
for (const f of process.argv.slice(2)) {
  const r = check(fs.readFileSync(f, 'utf8'));
  console.log(`\n== ${f}: ${r.diags.length} error(s) in ${r.ms} ms`);
  for (const d of r.diags) console.log(`  ${d.line}:${d.col} ${d.code} ${d.message}`);
}
