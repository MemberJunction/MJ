#!/usr/bin/env node
/**
 * skip-eval-scorecard.cjs — what native tool calling did inside Skip's agents during eval runs.
 *
 * Skip-Brain/evals/run.ts drives a Skip sub-agent through MJAPI (/eval/run) into the Skip API
 * (/eval/run-agent), and each result records the Skip-side `agentRunID`. This rig reads those runs
 * back out of the Skip database (the rows, not the runner's summary): per run the agent, status,
 * every step's ToolCallingMode / NativeToolCallCount / NativeToolResultsSent, and every prompt
 * run's ToolCallingMode and model — so the eval score and the tool-calling path are side by side.
 *
 * Usage (from anywhere; connection comes from MJ/.env with DB_DATABASE overridden):
 *   DB_DATABASE=skip_native node rigs/skip-eval-scorecard.cjs --results <dir>[,<dir>...]
 *   DB_DATABASE=skip_native node rigs/skip-eval-scorecard.cjs --dirs-file <file with one results dir per line>
 *   DB_DATABASE=skip_native node rigs/skip-eval-scorecard.cjs --runs <agentRunId>[,...]
 * Options: --steps (print every step), --json (machine-readable).
 */
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const REPO = path.resolve(__dirname, '../../../..');
const req = createRequire(path.join(REPO, 'packages/TestingFramework/integration-test-suite/rigs/x.js'));
process.chdir(REPO);
req('dotenv').config({ quiet: true });
const sql = req('mssql');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);
const S = process.env.MJ_CORE_SCHEMA || '__mj';

/** Result detail files under the given results dirs → [{ evalID, agent, weightedScore, executionTimeMs, agentRunID, error }]. */
function loadEvalResults(dirs) {
  const out = [];
  for (const dir of dirs) {
    const detail = path.join(dir, 'detail');
    if (!fs.existsSync(detail)) continue;
    for (const f of fs.readdirSync(detail).filter((x) => x.endsWith('.json'))) {
      const r = JSON.parse(fs.readFileSync(path.join(detail, f), 'utf8'));
      out.push({
        evalID: r.evalID,
        agent: r.agent,
        difficulty: r.difficulty,
        weightedScore: r.scores?.weightedScore ?? null,
        executionTimeMs: r.executionTimeMs,
        agentRunID: r.agentRunID ?? null,
        error: r.error ?? null,
        dimensions: r.scores?.dimensions ?? {},
      });
    }
  }
  return out;
}

(async () => {
  let evals = [];
  if (arg('results')) evals = loadEvalResults(arg('results').split(',').map((d) => d.trim()).filter(Boolean));
  if (arg('dirs-file')) evals = evals.concat(loadEvalResults(fs.readFileSync(arg('dirs-file'), 'utf8').split('\n').map((d) => d.trim()).filter(Boolean)));
  if (arg('runs')) for (const id of arg('runs').split(',')) evals.push({ evalID: `run ${id.slice(0, 8)}`, agentRunID: id });
  if (evals.length === 0) { console.error('nothing to score — pass --results, --dirs-file or --runs'); process.exit(2); }
  // Two runner invocations that start in the same second share a results dir, so two dirs-files can
  // list the same detail files — one run, one row: dedupe on the Skip-side run id (evalID when absent).
  const seen = new Set();
  evals = evals.filter((e) => { const key = e.agentRunID ?? `eval:${e.evalID}`; if (seen.has(key)) return false; seen.add(key); return true; });
  // A transport failure (the eval never reached an agent — no run id) that was later rerun for the same
  // eval is noise, not a result: keep the row only when no run exists for that eval in this set.
  const evalsWithRuns = new Set(evals.filter((e) => e.agentRunID).map((e) => e.evalID));
  evals = evals.filter((e) => e.agentRunID || !evalsWithRuns.has(e.evalID));

  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST, port: Number(process.env.DB_PORT || 1433), database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, options: { encrypt: false, trustServerCertificate: true },
  }).connect();

  const report = [];
  for (const ev of evals) {
    const entry = { ...ev, run: null, steps: [], prompts: [] };
    if (ev.agentRunID) {
      // the eval's run plus every descendant (sub-agents), so nested Loop agents are counted too
      const runs = (await pool.request().input('id', sql.UniqueIdentifier, ev.agentRunID).query(`
        WITH tree AS (
          SELECT r.ID, r.ParentRunID, 0 AS depth FROM [${S}].AIAgentRun r WHERE r.ID = @id
          UNION ALL
          SELECT c.ID, c.ParentRunID, t.depth + 1 FROM [${S}].AIAgentRun c JOIN tree t ON c.ParentRunID = t.ID
        )
        SELECT t.ID, t.depth, a.Name AS Agent, r.Status, r.Success, r.TotalTokensUsed, r.TotalCost, r.StartedAt, r.CompletedAt, LEFT(ISNULL(r.ErrorMessage,''), 300) AS ErrorMessage
        FROM tree t JOIN [${S}].AIAgentRun r ON r.ID = t.ID JOIN [${S}].AIAgent a ON a.ID = r.AgentID ORDER BY t.depth, r.StartedAt`)).recordset;
      entry.run = runs[0] ?? null;
      entry.subRuns = runs.slice(1);
      const ids = runs.map((r) => `'${r.ID}'`).join(',');
      if (ids) {
        entry.steps = (await pool.request().query(`
          SELECT s.AgentRunID, s.StepNumber, s.StepType, LEFT(s.StepName, 90) AS StepName, s.Status, s.Success,
                 s.ToolCallingMode, s.NativeToolCallCount, s.NativeDualChannel, s.NativeToolResultsSent, LEFT(ISNULL(s.ErrorMessage,''), 200) AS ErrorMessage
          FROM [${S}].AIAgentRunStep s WHERE s.AgentRunID IN (${ids}) ORDER BY s.AgentRunID, s.StepNumber`)).recordset;
        // a prompt run belongs to a run through its Prompt step (AIAgentRunStep.TargetLogID = AIPromptRun.ID)
        entry.prompts = (await pool.request().query(`
          SELECT s.AgentRunID, p.ToolCallingMode, m.Name AS Model, p.Success, p.TokensPrompt, p.TokensCompletion, p.ExecutionTimeMS, LEFT(ISNULL(p.ErrorMessage,''), 160) AS ErrorMessage
          FROM [${S}].AIAgentRunStep s JOIN [${S}].AIPromptRun p ON p.ID = s.TargetLogID LEFT JOIN [${S}].AIModel m ON m.ID = p.ModelID
          WHERE s.AgentRunID IN (${ids}) AND s.StepType = 'Prompt' ORDER BY p.RunAt`)).recordset;
      }
    }
    report.push(entry);
  }
  await pool.close();

  if (flag('json')) { console.log(JSON.stringify(report, null, 2)); return; }

  const count = (arr, pred) => arr.filter(pred).length;
  console.log(`\nSkip eval scorecard — ${report.length} eval(s), database ${process.env.DB_DATABASE}\n`);
  const hdr = ['eval', 'agent', 'score', 'run status', 'prompt runs (mode)', 'steps: actions / native calls / results-as-tool', 'tokens', 'secs', 'sub-runs'];
  console.log(hdr.join(' | '));
  let tokensTotal = 0;
  let secsTotal = 0;
  for (const e of report) {
    const modes = {};
    for (const p of e.prompts) modes[p.ToolCallingMode ?? 'null'] = (modes[p.ToolCallingMode ?? 'null'] || 0) + 1;
    const actionSteps = count(e.steps, (s) => s.StepType === 'Actions' || s.StepType === 'Sub-Agent');
    const nativeCalls = e.steps.reduce((n, s) => n + (s.NativeToolCallCount || 0), 0);
    const resultsAsTool = count(e.steps, (s) => s.NativeToolResultsSent === true || s.NativeToolResultsSent === 1);
    const dual = count(e.steps, (s) => s.NativeDualChannel === true || s.NativeDualChannel === 1);
    const tokens = e.prompts.reduce((n, p) => n + (p.TokensPrompt || 0) + (p.TokensCompletion || 0), 0);
    const secs = e.run?.StartedAt && e.run?.CompletedAt ? (new Date(e.run.CompletedAt) - new Date(e.run.StartedAt)) / 1000 : null;
    tokensTotal += tokens;
    secsTotal += secs ?? 0;
    console.log([
      e.evalID,
      e.run?.Agent ?? e.agent ?? '?',
      e.weightedScore ?? (e.error ? 'ERR' : '-'),
      e.run ? `${e.run.Status}${e.run.Success === false ? ' (failed)' : ''}` : (e.agentRunID ? 'run not found' : 'no run id'),
      `${e.prompts.length} (${Object.entries(modes).map(([k, v]) => `${k}:${v}`).join(' ')})`,
      `${actionSteps} / ${nativeCalls} / ${resultsAsTool}${dual ? ` / DUAL:${dual}` : ''}`,
      `${tokens}`,
      secs === null ? '-' : secs.toFixed(0),
      `${e.subRuns?.length ?? 0}`,
    ].join(' | '));
    if (e.error) console.log(`    error: ${String(e.error).slice(0, 240)}`);
    if (e.run?.ErrorMessage) console.log(`    run error: ${e.run.ErrorMessage}`);
    for (const p of e.prompts.filter((x) => x.Success === false)) console.log(`    prompt run failed [${p.ToolCallingMode}] ${p.Model}: ${p.ErrorMessage}`);
    if (flag('steps')) for (const s of e.steps) console.log(`    #${s.StepNumber} ${s.StepType.padEnd(10)} ${String(s.ToolCallingMode ?? '-').padEnd(14)} calls=${s.NativeToolCallCount ?? 0} results=${s.NativeToolResultsSent ? 1 : 0} ${s.Success === false ? 'FAIL ' : ''}${s.StepName}`);
  }
  const scored = report.filter((e) => typeof e.weightedScore === 'number');
  if (scored.length) console.log(`\nmean weighted score: ${(scored.reduce((a, e) => a + e.weightedScore, 0) / scored.length).toFixed(2)} over ${scored.length}`);
  const allPrompts = report.flatMap((e) => e.prompts);
  const byMode = {};
  for (const p of allPrompts) byMode[p.ToolCallingMode ?? 'null'] = (byMode[p.ToolCallingMode ?? 'null'] || 0) + 1;
  console.log(`prompt runs by ToolCallingMode: ${Object.entries(byMode).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);
  console.log(`native tool calls in total: ${report.flatMap((e) => e.steps).reduce((n, s) => n + (s.NativeToolCallCount || 0), 0)}`);
  console.log(`prompt tokens in total (prompt + completion): ${tokensTotal}; agent run seconds in total: ${secsTotal.toFixed(0)}`);
})().catch((e) => { console.error(e); process.exit(1); });
