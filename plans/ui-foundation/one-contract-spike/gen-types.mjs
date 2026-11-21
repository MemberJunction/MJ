// Generates the per-component declarations from the spec itself. Nothing here is hand-written per component.
import fs from 'node:fs';
const spec = JSON.parse(fs.readFileSync(process.argv[2] ?? 'spec.json', 'utf8'));
const SQL = { uniqueidentifier: 'string', nvarchar: 'string', varchar: 'string', int: 'number', decimal: 'number', float: 'number', bit: 'boolean', datetimeoffset: 'Date', datetime: 'Date', date: 'Date' };
const lit = (vals) => vals.map((v) => JSON.stringify(v)).join(' | ');
const propType = (p) => (p.possibleValues?.length ? lit(p.possibleValues) : p.type);
const ident = (s) => s.replace(/[^A-Za-z0-9]+/g, '_');
const out = [];
const rowMap = [];
for (const e of spec.dataRequirements?.entities ?? []) {
  const declared = new Set([...(e.displayFields ?? []), ...(e.filterFields ?? []), ...(e.sortFields ?? [])]);
  const fields = e.fieldMetadata.filter((f) => declared.has(f.name)); // only what the spec DECLARED it reads
  const name = 'Row_' + ident(e.name.split(':').pop().trim());
  out.push(`interface ${name} {\n` + fields.map((f) => {
    const t = f.possibleValues?.length ? lit(f.possibleValues) : (SQL[f.type] ?? 'unknown');
    return `  ${f.name}: ${t}${f.allowsNull ? ' | null' : ''};`;
  }).join('\n') + '\n}');
  rowMap.push(`  ${JSON.stringify(e.name)}: ${name};`);
}
out.push(`interface EntityRowMap {\n${rowMap.join('\n')}\n}`);
out.push('interface ChildComponents {\n' + (spec.dependencies ?? []).map((d) =>
  `  ${d.name}: (props: { ${d.properties.map((p) => `${p.name}${p.required ? '' : '?'}: ${propType(p)}`).join('; ')} }) => any;`).join('\n') + '\n}');
const props = (spec.properties ?? []).map((p) => `  /** ${p.description ?? ''} */\n  ${p.name}${p.required ? '' : '?'}: ${propType(p)};`);
const events = (spec.events ?? []).map((ev) => `  /** event: ${ev.description ?? ''} */\n  ${ev.name}?: (${(ev.parameters ?? []).map((a) => `${a.name}: ${a.type}`).join(', ')}) => void;`);
out.push(`interface ${spec.name}Props extends StandardProps {\n${[...props, ...events].join('\n')}\n}`);
fs.writeFileSync('generated.d.ts', '// GENERATED from the component spec — do not edit\n' + out.join('\n\n') + '\n');
console.log(fs.readFileSync('generated.d.ts', 'utf8'));
