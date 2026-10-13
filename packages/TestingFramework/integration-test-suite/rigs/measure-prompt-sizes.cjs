/**
 * measure-prompt-sizes.cjs — measures what a prompt-eval call actually costs, per agent.
 *
 * The suite generator prices a run before it starts, and the prompt is ~99% of that price. It was
 * originally a flat 12,000-token guess, which measurement showed to be 38% low: the Loop
 * agent-type system prompt ALONE is ~12,700 tokens, before any agent's own prompt or its action
 * catalog. A guess that wrong makes the manifest worse than no manifest, because it is believed.
 *
 * So the estimate is now measured and committed, and this regenerates it. Re-run it whenever the
 * loop template, an agent prompt, or an action catalog changes materially.
 *
 * Composition per call = the shared Loop agent-type system prompt
 *                      + the agent's own prompt template
 *                      + the prose catalog of its actions (names, descriptions, input params).
 *
 * Still an estimate — chars/4, and the RENDERED catalog is larger than the raw metadata it is
 * built from — so it reads LOW rather than high. Treat it as a floor.
 *
 *   node packages/TestingFramework/integration-test-suite/rigs/measure-prompt-sizes.cjs
 */
process.chdir(require('path').resolve(__dirname, '../../../..'));
require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const S = process.env.MJ_CORE_SCHEMA;
// LEN() over an nvarchar(max) column returns bigint, which the driver hands back as a STRING —
// arithmetic on it silently becomes concatenation. Coerce every length.
const N = (v) => Number(v || 0);
const CHARS_PER_TOKEN = 4;
const OUT = 'metadata-optional/prompt-eval-corpus/matrix/prompt-size-baseline.json';

(async () => {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.CODEGEN_DB_USERNAME || process.env.DB_USERNAME,
    password: process.env.CODEGEN_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, options: { encrypt: false, trustServerCertificate: true }
  }).connect();

  const loop = await pool.request().query(`
    SELECT MAX(LEN(t.TemplateText)) AS chars FROM [${S}].vwAIPrompts p
    JOIN [${S}].vwTemplateContents t ON t.TemplateID = p.TemplateID
    WHERE p.Name = 'Loop Agent Type: System Prompt'`);
  const loopChars = N(loop.recordset[0]?.chars);

  const agents = (await pool.request().query(`
    SELECT a.ID, a.Name FROM [${S}].vwAIAgents a
    JOIN [${S}].vwAIAgentTypes t ON t.ID = a.TypeID
    WHERE a.Status = 'Active' AND t.Name = 'Loop'`)).recordset;

  const perAgent = {};
  for (const agent of agents) {
    const own = await pool.request().query(`
      SELECT TOP 1 LEN(t.TemplateText) AS chars FROM [${S}].vwAIAgentPrompts ap
      JOIN [${S}].vwAIPrompts p ON p.ID = ap.PromptID
      JOIN [${S}].vwTemplateContents t ON t.TemplateID = p.TemplateID
      WHERE ap.AgentID = '${agent.ID}' AND ap.Status = 'Active' ORDER BY ap.ExecutionOrder`);
    const cat = await pool.request().query(`
      SELECT ISNULL(SUM(ISNULL(LEN(ac.Name),0) + ISNULL(LEN(ac.Description),0)),0) AS c
      FROM [${S}].vwAIAgentActions aa JOIN [${S}].vwActions ac ON ac.ID = aa.ActionID
      WHERE aa.AgentID = '${agent.ID}' AND aa.Status = 'Active'`);
    const params = await pool.request().query(`
      SELECT ISNULL(SUM(ISNULL(LEN(p.Name),0) + ISNULL(LEN(p.Description),0)),0) AS c
      FROM [${S}].vwAIAgentActions aa
      JOIN [${S}].vwActionParams p ON p.ActionID = aa.ActionID AND p.Type IN ('Input','Both')
      WHERE aa.AgentID = '${agent.ID}' AND aa.Status = 'Active'`);
    perAgent[agent.Name] = Math.round(
      (loopChars + N(own.recordset[0]?.chars) + N(cat.recordset[0]?.c) + N(params.recordset[0]?.c)) / CHARS_PER_TOKEN);
  }

  const values = Object.values(perAgent);
  const payload = {
    _comment: [
      'MEASURED prompt size per Loop agent, in tokens — the dominant term in the suite generator\'s',
      'cost manifest. Regenerate with rigs/measure-prompt-sizes.cjs after changing the loop template,',
      'an agent prompt, or an action catalog. Estimated as chars/4 over the real template text; the',
      'RENDERED action catalog is larger than the raw metadata, so these read LOW — treat as a floor.'
    ],
    measuredAt: new Date().toISOString(),
    loopAgentTypeSystemPromptTokens: Math.round(loopChars / CHARS_PER_TOKEN),
    defaultTokens: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    perAgent: Object.fromEntries(Object.entries(perAgent).sort())
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`measured ${values.length} Loop agent(s) → ${OUT}`);
  console.log(`  loop system prompt alone : ${payload.loopAgentTypeSystemPromptTokens.toLocaleString()} tokens`);
  console.log(`  min ${Math.min(...values).toLocaleString()} · mean ${payload.defaultTokens.toLocaleString()} · max ${Math.max(...values).toLocaleString()} tokens per call`);
  await pool.close();
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
