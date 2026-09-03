import fs from 'node:fs';
const variants = process.argv.slice(2);
const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const v of variants) {
  if (!fs.existsSync(`results-${v}.json`)) { console.log(v, 'missing'); continue; }
  const rows = JSON.parse(fs.readFileSync(`results-${v}.json`, 'utf8')).rows;
  const score = (pred) => { const tp = rows.filter(r => pred(r) && r.Researched).length, fn = rows.filter(r => !pred(r) && r.Researched).length, fp = rows.filter(r => pred(r) && !r.Researched).length, tn = rows.filter(r => !pred(r) && !r.Researched).length; return { agree: +(100 * (tp + tn) / rows.length).toFixed(1), falseSkipPct: +(100 * fn / (tp + fn)).toFixed(1), skipsCaught: +(100 * tn / (fp + tn)).toFixed(1), tp, tn, fp, fn }; };
  const A = score(r => r.Intent === 'needs_research');
  const B = score(r => r.Intent === 'needs_research' || r.Agent === 'betty_research');
  const C = score(r => !(r.Intent === 'smalltalk' || r.Intent === 'out_of_scope'));  // conservative: only skip research for smalltalk/out-of-scope
  const D = score(r => !((r.Intent === 'smalltalk' || r.Intent === 'out_of_scope') && (r.Conf ?? 0) >= 0.9));  // conservative + confidence gate
  console.log(`\n=== ${v} (${rows.length} turns, median ${med(rows.map(r => r.ms))} ms) ===`);
  console.log(' rule A  intent==needs_research            ', JSON.stringify(A));
  console.log(' rule B  A or agent==betty_research         ', JSON.stringify(B));
  console.log(' rule C  skip only smalltalk/out_of_scope   ', JSON.stringify(C));
  console.log(' rule D  C + confidence>=0.9                ', JSON.stringify(D));
  const skipsC = rows.filter(r => !((r.Intent === 'smalltalk' || r.Intent === 'out_of_scope')) === false);
  const wrongSkipsC = rows.filter(r => (r.Intent === 'smalltalk' || r.Intent === 'out_of_scope') && r.Researched);
  console.log(` rule C false skips (${wrongSkipsC.length}):`); wrongSkipsC.slice(0, 10).forEach(r => console.log('    ', r.Intent, r.Conf, '|', JSON.stringify(r.Message.slice(0, 90))));
}
