import { readFileSync, writeFileSync } from 'node:fs';
const sql = readFileSync('migrations/v5/B202605291452__v5.38.x__Baseline.sql', 'utf8');
const REST = '3ef73582-bc71-4189-9df9-867f0d4b074b';
// IntegrationObject value tuples: '<IO-ID>', N'<IntegrationID>', N'<IO-Name>', ...
const re = /'([0-9A-Fa-f-]{36})'\s*,\s*N'([0-9A-Fa-f-]{36})'\s*,\s*N'((?:[^']|'')*)'/g;
const seen = new Map();
let m;
while ((m = re.exec(sql))) {
  const ioId = m[1], intId = m[2].toLowerCase(), name = m[3].replace(/''/g, "'");
  if (intId === REST && !seen.has(ioId)) seen.set(ioId, name);
}
const recs = [...seen.entries()].map(([id, name]) => ({ fields: { Name: name }, primaryKey: { ID: id }, deleteRecord: { delete: true } }));
writeFileSync('metadata/integration-object-deletes/.old-salesforce-seed.deletes.json', JSON.stringify(recs, null, 2) + '\n');
console.log('salesforce REST deletes authored:', recs.length, 'IOs under 3EF73582');
console.log('sample:', recs.slice(0, 5).map(r => r.fields.Name).join(' | '));
