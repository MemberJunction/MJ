import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log('top-level keys:', Object.keys(r));
for (const f of r.testResults) {
  console.log('file:', f.name, 'status:', f.status);
  for (const t of f.assertionResults) {
    console.log('  ', t.status, '|', t.fullName, '|', t.duration, 'ms');
    for (const m of t.failureMessages ?? []) console.log('     msg:', m.split('\n').slice(0, 6).join('\n          '));
  }
}
