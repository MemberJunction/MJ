process.chdir(require('node:path').resolve(__dirname, '../../../..'));
require('dotenv').config();
const sql = require('mssql'); const fs = require('fs'); const S = process.env.MJ_CORE_SCHEMA;
/**
 * Three models, one per wire family MJ can actually reach, used by BOTH matrices.
 *
 * Both matrices must hold the model set fixed — the whole comparison is envelope-vs-native
 * on the SAME model, so a model that appears in one arm and not the other contributes nothing but
 * confounding. This script therefore emits both matrices from one list.
 *
 * Why these three, rather than a broader deployed-adoption set:
 *   Gemini 3.7 Flash — current Google Flash, and cheaper than the 3.5 Flash previously pinned
 *     ($0.75/$3.75 against $1.50/$9.00). Also the generation that fixes 2.5's
 *     inability to combine `auto` tool calling with a JSON response format.
 *   GPT 5.6-luna    — the OpenAI row, at **xhigh** reasoning effort ($1/$6). `xhigh` is above the
 *     top of MJ's numeric 1-100 effort scale and is passed to the driver as a named level; the
 *     OpenAI driver accepts it by name. Effort is part of the cell
 *     identity, so a later low-effort row would be a separate cell rather than pooled noise.
 *     NOTE the cost floor understates this row the most: xhigh bills reasoning tokens as output
 *     at $6/1M, and the estimator assumes ~250 completion tokens per call.
 *   GPT-OSS-120B    — the deployed workhorse; all 15 corpus agents list it. Cerebras rather than
 *     Groq because no Groq credential is configured.
 *
 * Two Claude rows are pinned.
 * Aggregator vendors (Vertex, Bedrock, OpenRouter, Azure) stay out — they multiply cost without
 * changing what is being measured.
 *
 * `modelId` is given explicitly where the catalog is ambiguous. `GPT 5.4-mini` exists as TWO
 * distinct AIModel rows both served by OpenAI under the same APIName; a `TOP 1` would pick between
 * them arbitrarily and a re-pin months later could silently choose the other. Pinning the row that
 * Azure and OpenRouter also serve keeps the pair addressable if an aggregator cell is ever added.
 */
/**
 * `[model, vendor, why, pinnedModelId, baselineEffort, comparisonEffort]`.
 *
 * The last two are separate because ONE model cannot run its baseline effort
 * level in native mode at all: OpenAI answers
 * `400 Function tools with reasoning_effort are not supported for gpt-5.6-luna in
 * /v1/chat/completions — to use function tools, use /v1/responses or set reasoning_effort to
 * 'none'`. MJ's OpenAI driver speaks chat-completions, so on a reasoning model the choice is
 * reasoning OR tools, not both.
 *
 * The comparison matrix therefore pins that cell at `none` in BOTH arms rather than at `xhigh`. Holding effort
 * fixed across the two arms is what makes the comparison mean anything; pinning `xhigh` on the
 * envelope arm and `none` on the native arm would attribute a reasoning delta to the mode.
 */
// Catalog prerequisite for a comparison run: the shipped catalog is OFF by default. Each model
// below needs `LLM.DefaultToNativeToolCalling: true`, and the 'implicit' rows `LLM.NativeControlFlow: 'implicit'`,
// pushed before launch and reverted after — see launch-eval-comparison.sh. The driver only controls what is OFFERED.
const WANT = [
  // 7th column: the native PROTOCOL each model runs in the comparison.
  ['Gemini 3.7 Flash','Google','current Google Flash; fixes 2.5\'s auto+JSON conflict', null, null, null, 'implicit'],
  ['GPT 5.6-luna','OpenAI','OpenAI row; xhigh on the baseline, none on the comparison (tools and reasoning_effort are mutually exclusive on chat-completions)', null, 'xhigh', 'none', 'hybrid'],
  // ['GPT-OSS-120B','Cerebras','deployed workhorse — all 15 corpus agents list it', null, null, null],
  //   ^ out of the comparison runs: it never returns two
  //     tool calls in one turn. Uncomment to re-measure; nothing else changes.
  // Anthropic. effortLevel stays
  // null on both: the Anthropic driver turns on extended thinking with a 31,000-token budget the
  // moment an effort level is set, which would make these cells unlike every other cell and far
  // more expensive. Two rows, not three — Opus 5 at $5/$25 per 1M would roughly double the run.
  ['Claude Sonnet 5','Anthropic','Anthropic reasoning-class row; tools with no extended thinking, same footing as the other cells', null, null, null, 'implicit'],
  ['Claude Haiku 4.5','Anthropic','Anthropic small/fast row, the size class Cerebras represents elsewhere', null, null, null, 'hybrid'],
];

(async () => {
  const pool = await new sql.ConnectionPool({ server: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.CODEGEN_DB_USERNAME || process.env.DB_USERNAME,
    password: process.env.CODEGEN_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, options: { encrypt: false, trustServerCertificate: true } }).connect();
  const cells = [];
  for (const [model, vendor, generation, pinnedModelId, effortLevel, comparisonEffortLevel, protocol] of WANT) {
    const r = await pool.request().query(`
      SELECT mv.ModelID, mv.VendorID, mv.APIName
      FROM [${S}].vwAIModelVendors mv
      JOIN [${S}].vwAIModels m ON m.ID = mv.ModelID
      JOIN [${S}].vwAIVendors v ON v.ID = mv.VendorID
      WHERE m.Name='${model}' AND v.Name='${vendor}' AND mv.Type='Inference Provider' AND mv.Status='Active'
        ${pinnedModelId ? `AND mv.ModelID='${pinnedModelId}'` : ''}
      ORDER BY mv.ModelID`);
    if (!r.recordset.length) { console.log(`  MISSING ${model} @ ${vendor}`); continue; }
    // An ambiguous name is a pinning failure, not a detail: a re-pin months later would be free to
    // resolve it the other way and silently measure a different catalog row.
    if (r.recordset.length > 1) {
      console.log(`  AMBIGUOUS ${model} @ ${vendor}: ${r.recordset.length} rows — add an explicit modelId to WANT`);
      console.log(`             ${r.recordset.map(x => x.ModelID).join(', ')}`);
      process.exit(1);
    }
    const { ModelID, VendorID, APIName } = r.recordset[0];
    // Carry the price with the pin. The generator runs offline, and a cost manifest that needs a
    // database is a cost manifest nobody sees before spending.
    const price = (await pool.request().query(`
      SELECT TOP 1 c.InputPricePerUnit AS inp, c.OutputPricePerUnit AS outp
      FROM [${S}].vwAIModelCosts c
      JOIN [${S}].vwAIModels m2 ON m2.ID = c.ModelID
      JOIN [${S}].vwAIVendors v2 ON v2.ID = c.VendorID
      JOIN [${S}].vwAIModelPriceUnitTypes ut ON ut.ID = c.UnitTypeID
      WHERE m2.Name='${model}' AND v2.Name='${vendor}' AND c.Status='Active' AND ut.Name='Per 1M Tokens'`)).recordset[0];
    cells.push({ modelId: ModelID, vendorId: VendorID,
                 ...(effortLevel ? { effortLevel } : {}),
                 inputPricePer1M: Number(price?.inp ?? 0), outputPricePer1M: Number(price?.outp ?? 0),
                 _model: model, _vendor: vendor, _why: generation, _apiName: APIName,
                 _comparisonEffortLevel: comparisonEffortLevel ?? effortLevel ?? null, _protocol: protocol ?? 'hybrid' });
  }
  /**
   * One matrix cell per (model, mode). Mode is an AXIS: the same model appears in both arms.
   *
   * `effortKey` selects which of the two pinned effort levels applies — see {@link WANT}. Within a
   * single matrix every arm uses the same one, so mode stays the only thing that varies.
   */
  // Mode tokens → cells:
  //   'envelope'        → the envelope arm
  //   'native'          → native under the model's own protocol (WANT column 7): label `native-<protocol>`,
  //                       nativeControlFlow 'implicit' when the protocol is implicit
  //   'native-results'  → the same plus nativeToolResults: true, label `native-<protocol>-results`
  const cellsFor = (modes, effortKey = 'effortLevel') => modes.flatMap(mode => cells.map(c => {
    const { _comparisonEffortLevel, _protocol, ...rest } = c;
    const effortLevel = (effortKey === 'effortLevel' ? c.effortLevel : _comparisonEffortLevel) ?? undefined;
    const protocol = _protocol ?? 'hybrid';
    const label = mode === 'envelope' ? 'envelope' : `native-${protocol}${mode === 'native-results' ? '-results' : ''}`;
    return {
      label: `${c._apiName}${effortLevel ? `@${effortLevel}` : ''} · ${c._vendor} · ${label}`,
      toolCallingMode: mode === 'envelope' ? 'envelope' : 'native',
      ...(mode !== 'envelope' && protocol === 'implicit' ? { nativeControlFlow: 'implicit' } : {}),
      ...(mode === 'native-results' ? { nativeToolResults: true } : {}),
      responseFormat: 'Any', ...rest,
      ...(effortLevel ? { effortLevel } : { effortLevel: undefined })
    };
  }));

  const ORACLES = [
    { type: 'response-well-formed', weight: 0.3 },
    { type: 'agent-decision-match', weight: 0.7 }
  ];
  // N=3, not the plan's N=20. The corpus supplies the sampling variation the exemplar
  // experiment got from repetition: 57 cases × 3 = 171 observations per cell, well past what a
  // two-proportion test on the aggregate needs. Escalate to N=20 only on the (case, cell) pairs
  // that come back non-unanimous — that is the only place more repetition resolves anything.
  const REPS = 3;
  const pinnedAt = new Date().toISOString();

  const baseline = {
    _comment: [
      "Envelope baseline matrix. Three models, one per wire family MJ can reach, all in ENVELOPE",
      "mode — the baseline quantifies TODAY's path, so it contains no native cells; those are what it",
      "is compared against. The SAME three models carry into matrix/tool-calling-comparison.json, because",
      "envelope-vs-native is only attributable to the mode if the model is held fixed.",
      "IDs are pinned rather than resolved by name so a rerun months later addresses the",
      "same catalog rows; _apiName records the snapshot each resolved to.",
      "Regenerate both matrices with: rigs/pin-eval-matrix.cjs"
    ],
    suiteName: 'Native Tool Calling — Envelope Baseline',
    pinnedAt, cells: cellsFor(['envelope']), oracles: ORACLES, reps: REPS
  };

  const comparison = {
    _comment: [
      "Comparison matrix: the baseline models in BOTH arms, so every delta is attributable",
      "to the mode rather than to a model change.",
      "",
      "What makes the two arms differ, and nothing else:",
      "  1. Capability + preference. LLM.SupportsNativeToolCalling is declared at MODEL level, and",
      "     the prompt these cases execute — Loop Agent Type: System Prompt — declares",
      "     LLM.UseNativeToolCalling for the run.",
      "  2. BaseAgent supplies the tools: each of the agent's Actions via buildActionToolSet.",
      "  3. PromptEvalConfig.toolCallingMode is applied. An 'envelope' cell WITHHOLDS the declarations",
      "     the composer attached, which is the gate's third term (toolsProvided) and therefore the",
      "     only thing that differs between the two arms.",
      "",
      "TWO provider constraints shape this matrix, both found by smoking a single cell before the run:",
      "  - OpenAI rejects tools alongside reasoning_effort on /v1/chat/completions, so the OpenAI",
      "    cell runs at effort 'none' in BOTH arms here, not the 'xhigh' the baseline uses. Holding effort",
      "    equal across arms is what keeps the delta attributable to the mode.",
      "  - The Cerebras response_format conflict does not bite this corpus: the",
      "    executed prompt is ResponseFormat=Any, so nothing sets response_format at all. The Cerebras",
      "    driver also now drops it from any request that declares tools, for the prompts where it would.",
      "",
      "THREE ARMS: envelope, native (the hybrid — Actions as tools, control flow in the",
      "envelope) and native-implicit (sub-agents, payload_change_request and ask_user as tools;",
      "plain text ends the turn). The implicit arm only measures implicit when the model's catalog says",
      "LLM.NativeControlFlow = 'implicit'; the hybrid arm strips the control tools in the driver.",
      "Regenerate with: rigs/pin-eval-matrix.cjs"
    ],
    suiteName: 'Native Tool Calling — Envelope vs Native',
    pinnedAt, cells: cellsFor(['envelope', 'native', 'native-results'], '_comparisonEffortLevel'), oracles: ORACLES, reps: REPS
  };

  fs.writeFileSync('metadata-optional/prompt-eval-corpus/matrix/envelope-baseline.json', JSON.stringify(baseline, null, 2) + '\n');
  fs.writeFileSync('metadata-optional/prompt-eval-corpus/matrix/tool-calling-comparison.json', JSON.stringify(comparison, null, 2) + '\n');
  console.log(`pinned ${cells.length} model(s) → envelope-baseline.json (${baseline.cells.length} cells), tool-calling-comparison.json (${comparison.cells.length} cells):`);
  cells.forEach(c => console.log(`   ${c._model.padEnd(22)} @ ${c._vendor.padEnd(10)} → ${String(c._apiName).padEnd(20)} $${c.inputPricePer1M}/$${c.outputPricePer1M} per 1M   (${c._why})`));
  await pool.close();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
