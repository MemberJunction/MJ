const fs=require("fs"), path=require("path"), {execSync}=require("child_process");
const corpus=JSON.parse(fs.readFileSync("packages/TestingFramework/jit-catching/corpus/gate1.json","utf8"));
const strip=(p)=>p.replace(/\.(ts|tsx|js|mjs)$/,"").replace(/\/index$/,"");
function fixFiles(sha){ try { return execSync(`git diff --name-only ${sha}^1 ${sha}`,{encoding:"utf8"}).split("\n").filter(Boolean); } catch(e){ return null; } }
function imports(src, filePath){ const out=new Set(); const dir=path.dirname(filePath); for (const m of src.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) out.add(strip(path.normalize(path.join(dir,m[1])))); for (const m of src.matchAll(/vi\.mock\(\s*['"](\.{1,2}\/[^'"]+)['"]/g)) out.add(strip(path.normalize(path.join(dir,m[1])))); return [...out]; }
const risksOut=[];
for (const [label,id] of [["Sonnet","gate1-Tuning-Both-claude-sonnet-5-5"],["Gemini","gate1-Tuning-Bug-gemini-3_8-flash"]]) {
  const l=JSON.parse(fs.readFileSync(".jit-catch/backtests/"+id+".json","utf8"));
  console.log(`\n### ${label}\n| PR | fix files (src) | fix ∩ PR diff | tests | tests importing a fix file | tests importing a fix∩PR file | risks | tests from risks |\n|---|---|---|---|---|---|---|---|`);
  let agg={prs:0,anyFix:0,anyBoth:0,tests:0,tFix:0,tRisk:0};
  for (const e of l.Entries.filter(e=>e.Set==="Bug"&&e.Status==="Assessed")) {
    const c=corpus.Bug.find(b=>b.BugPR===e.PR); const g=JSON.parse(fs.readFileSync(".jit-catch/runs/"+e.RunID+"/generation.json","utf8"));
    const ff=(fixFiles(c.FixMergeSHA)||[]).filter(f=>/\.(ts|tsx)$/.test(f)&&!/__tests__|\.test\.|\.spec\./.test(f)).map(strip);
    const pr=new Set(g.Analysis.ChangedFiles.map(f=>strip(f.Path)));
    const both=ff.filter(f=>pr.has(f));
    const tests=g.Tests.filter(t=>t.Source);
    const tFix=tests.filter(t=>imports(t.Source,t.FilePath).some(i=>ff.includes(i))).length;
    const tBoth=tests.filter(t=>imports(t.Source,t.FilePath).some(i=>both.includes(i))).length;
    const tRisk=tests.filter(t=>t.RiskID).length;
    console.log(`| #${e.PR} | ${ff.length} | ${both.length} | ${tests.length} | ${tFix} | ${tBoth} | ${g.Analysis.Risks.length} | ${tRisk} |`);
    agg.prs++; if(tFix) agg.anyFix++; if(tBoth) agg.anyBoth++; agg.tests+=tests.length; agg.tFix+=tFix; agg.tRisk+=tRisk;
    if(label==="Sonnet") risksOut.push(`\n#### #${e.PR} → fix #${c.FixPR}\nCurated bug: ${c.Description}\nIntent: ${g.Analysis.IntentType}, RiskScore ${g.Analysis.RiskScore}\nFix files: ${ff.join(", ")||"(none)"}\nRisks (${g.Analysis.Risks.length}):\n${g.Analysis.Risks.map((r,i)=>`  ${i+1}. ${typeof r==="string"?r:JSON.stringify(r)}`).join("\n")||"  (none)"}`);
  }
  console.log(`\n${label}: ${agg.prs} PRs; ${agg.anyFix} with ≥1 test importing a fix file; ${agg.anyBoth} with ≥1 test importing a file in both diffs; ${agg.tFix}/${agg.tests} tests import a fix file; ${agg.tRisk}/${agg.tests} tests came from a risk note.`);
}
fs.writeFileSync(process.argv[2]+"/diag-risks.md", risksOut.join("\n"));
