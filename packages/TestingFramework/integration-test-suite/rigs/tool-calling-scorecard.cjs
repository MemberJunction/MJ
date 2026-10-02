/**
 * tool-calling-scorecard.cjs — turns a completed prompt-eval suite run into the envelope-vs-native
 * envelope-versus-native comparison.
 *
 * WHY A SCRIPT AND NOT A HAND COUNT. The comparison is the deliverable, and a hand count of 1,026
 * observations is both unreproducible and the easiest place in this whole exercise to fool
 * yourself. Everything here is a query over rows the harness already persisted, so a comparison
 * number can be re-derived months later from the same database without re-spending the run.
 *
 * THE ONE JUDGEMENT CALL IT MAKES is separating INFRASTRUCTURE failures from MODEL behavior. A run
 * that never reached the model — a connection reset, a credential error, a 300s timeout — is not
 * evidence that a mode produces malformed output, and pooling it into the malformed rate is how a
 * bad network evening becomes a finding about tool calling. Those rows are reported on their own
 * line and excluded from every rate below it. The exclusion is visible, never silent: a cell whose
 * infrastructure loss is high enough to bias the remainder says so.
 *
 * USAGE (from the repo root):
 *   node packages/TestingFramework/integration-test-suite/rigs/tool-calling-scorecard.cjs
 *   … --suite "Native Tool Calling — Envelope vs Native" --since <utc-timestamp>
 */
process.chdir(require('node:path').resolve(__dirname, '../../../..'));
require('dotenv').config();
const sql = require('mssql');
const fs = require('node:fs');
const path = require('node:path');
const S = process.env.MJ_CORE_SCHEMA;

/**
 * Case ids whose expectation CANNOT be satisfied by calling an action.
 *
 * The coherence probe needs this and nothing coarser. `expectedKind` alone is not enough: a third
 * of the corpus expects `anyOf`, and those alternatives routinely INCLUDE an action — a dead URL
 * may legitimately be answered by retrying with a different search action or by telling the user.
 * Counting every non-`action` expectation as a turn that must not call a tool scored those as
 * violations and roughly tripled the apparent failure rate. The question the comparison actually
 * asks is narrower: on a turn where an action is *never* the right answer, did declaring tools make
 * the model reach for one anyway?
 */
function loadNonActionCases() {
    const dir = path.join(process.cwd(), 'metadata-optional/prompt-eval-corpus/cases');
    const admitsAction = (e) => e?.kind === 'action'
        || (e?.kind === 'anyOf' && (e.anyOf ?? []).some(admitsAction));
    const out = new Set();
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!admitsAction(c.expect)) out.add(c.id);
    }
    return out;
}
/** Case ids tagged `payload-change` — the payload table is computed over these only. */
function loadPayloadCases() {
    const dir = path.join(process.cwd(), 'metadata-optional/prompt-eval-corpus/cases');
    const out = new Set();
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if ((c.tags ?? []).includes('payload-change')) out.add(c.id);
    }
    return out;
}
const PAYLOAD_CASES = loadPayloadCases();

/** Case ids by tag — multi-turn cases and, within them, the "does it finish after the write?" pair. */
function loadCasesByTag(tag) {
    const dir = path.join(process.cwd(), 'metadata-optional/prompt-eval-corpus/cases');
    const out = new Set();
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if ((c.tags ?? []).includes(tag)) out.add(c.id);
    }
    return out;
}
const MULTI_TURN_CASES = loadCasesByTag('multi-turn');
const FINISH_CASES = new Set([...MULTI_TURN_CASES].filter((id) => id.includes('write-then-finish')));
// Payload cases leave the coherence population: a research agent that searches once
// more on a "write your findings" turn is a payload-fidelity question, measured in the PAYLOAD
// section, not the "declared tools made it act where acting is never right" question this probe asks.
const NON_ACTION_CASES = new Set([...loadNonActionCases()].filter((id) => !PAYLOAD_CASES.has(id)));

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
};
const SUITE = arg('suite', 'Native Tool Calling — Envelope vs Native');
const SINCE = arg('since', null);
/** Exclusive upper bound, so one run can be scored when a later run of the same suite has started. */
const UNTIL = arg('until', null);

/** Reasons a row never became a model decision. Order matters — first match wins. */
const INFRA_PATTERNS = [
    ['vertex-credential', /Vertex AI credentials/i],
    ['timeout', /TimeoutMS|was aborted \(timeout\)/i],
    ['connection', /Connection error|ECONNRESET|socket hang up|fetch failed/i],
    ['rate-limit', /429|rate.?limit/i],
    ['other-execution-failure', /execution failed/i]
];

function classifyInfra(oracles) {
    const text = oracles.map(o => String(o.message ?? '')).join(' ');
    for (const [label, pattern] of INFRA_PATTERNS) {
        if (pattern.test(text)) return label;
    }
    return null;
}

/** `<caseId> [<cell label>]` → its two halves. The label carries model, vendor and mode. */
function splitName(name) {
    const m = /^(.*) \[(.*)\]$/.exec(name);
    if (!m) return { caseId: name, cell: '(unlabelled)', mode: 'unknown' };
    // Label suffix → mode. 'native' and 'native-hybrid' are the hybrid; the
    // '-results' arms return tool results natively under the same protocol.
    const suffix = m[2].split(' · ').pop();
    const mode = suffix === 'envelope' ? 'envelope'
        : suffix === 'native' || suffix === 'native-hybrid' ? 'native'
        : suffix === 'native-implicit' ? 'implicit'
        : suffix === 'native-hybrid-results' ? 'native-results'
        : suffix === 'native-implicit-results' ? 'implicit-results' : 'unknown';
    return { caseId: m[1], cell: m[2], mode };
}

/** The arm-independent identity of a cell: everything but the trailing mode. */
const armOf = (cell) => cell.replace(/ · (native(-hybrid|-implicit)?(-results)?|envelope)$/, '');
/** Whether a mode returns tool results natively. */
const isResultsMode = (mode) => mode.endsWith('-results');

const pct = (n, d) => (d === 0 ? '   —  ' : `${((n / d) * 100).toFixed(1).padStart(5)}%`);
const delta = (a, b) => {
    if (a === null || b === null) return '   —  ';
    const d = (b - a) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)}pp`.padStart(7);
};

(async () => {
    const pool = await new sql.ConnectionPool({
        server: process.env.DB_HOST, port: +process.env.DB_PORT,
        user: process.env.CODEGEN_DB_USERNAME || process.env.DB_USERNAME,
        password: process.env.CODEGEN_DB_PASSWORD || process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true }
    }).connect();

    const rows = (await pool.request().query(`
        SELECT t.Name, r.Score, r.Status, r.ResultDetails, r.DurationSeconds,
               pr.TokensPrompt, pr.TokensCompletion, pr.TotalCost, pr.ToolCallingMode
        FROM [${S}].TestRun r
        JOIN [${S}].Test t ON t.ID = r.TestID
        LEFT JOIN [${S}].AIPromptRun pr ON pr.ID = r.TargetLogID
        -- Membership via EXISTS, not a JOIN: a Test that belongs to two suites (the comparison suite
        -- and a disposable remainder suite used to finish a run in parallel) would
        -- otherwise appear once per membership and every one of its runs would be counted twice.
        WHERE EXISTS (
            SELECT 1 FROM [${S}].TestSuiteTest st
            JOIN [${S}].TestSuite s ON s.ID = st.SuiteID
            WHERE st.TestID = t.ID AND s.Name = '${SUITE.replace(/'/g, "''")}'
        )
          ${SINCE ? `AND r.StartedAt >= '${SINCE}'` : ''}
          ${UNTIL ? `AND r.StartedAt < '${UNTIL}'` : ''}
    `)).recordset;

    if (rows.length === 0) {
        console.log(`no TestRun rows for suite "${SUITE}"${SINCE ? ` since ${SINCE}` : ''}`);
        await pool.close();
        return;
    }

    const cells = new Map();
    // The coherence probe needs a CONTROL ARM. Per (case, model) pair,
    // how often did EACH arm act on a case where an action is never right?
    const pairs = new Map();
    for (const row of rows) {
        const { caseId, cell, mode } = splitName(row.Name);
        let oracles = [];
        try { oracles = JSON.parse(row.ResultDetails) ?? []; } catch { /* a row with no details is a loss */ }
        if (!Array.isArray(oracles)) oracles = [];

        const bucket = cells.get(cell) ?? {
            cell, mode, arm: armOf(cell), total: 0, infra: 0, infraBy: {}, recordedMode: {},
            usable: 0, decided: 0, scored: 0, scoreSum: 0,
            actionAcc: [], paramFid: [], promptTokens: [], cost: 0,
            nativeEncoded: 0, coherenceEligible: 0, coherenceViolations: 0, coherenceByKind: {}, coherenceTools: {},
            narration: 0, placeholder: 0, payloadRows: 0, payloadWritten: 0, payloadMatchers: 0, payloadMatchersPassed: 0, payloadFirst: 0,
            multiRows: 0, multiPassed: 0, finishRows: 0, finishCompleted: 0
        };
        bucket.total++;
        bucket.cost += Number(row.TotalCost ?? 0);
        // What the RUNNER says happened, independent of what the cell asked for. A native cell whose
        // rows read 'NativeFallback' hit a provider rejection and was retried with tools stripped —
        // the row is then an envelope observation wearing a native label, and the cell's numbers
        // are measuring the fallback, not the feature. That has to be visible, never averaged away.
        const recorded = row.ToolCallingMode ?? '(none)';
        bucket.recordedMode[recorded] = (bucket.recordedMode[recorded] ?? 0) + 1;

        // A row the harness never finished — killed mid-flight, still 'Running', or with no oracle
        // results at all — is not a model observation. Without this it would score as a failure on
        // every metric, which is how a cancelled run would quietly lower a cell's numbers.
        const incomplete = oracles.length === 0 || row.Status === 'Running' || row.Status === 'Cancelled';
        const infra = incomplete ? 'incomplete-run' : classifyInfra(oracles);
        if (infra) {
            bucket.infra++;
            bucket.infraBy[infra] = (bucket.infraBy[infra] ?? 0) + 1;
            cells.set(cell, bucket);
            continue;
        }

        bucket.scored++;
        bucket.scoreSum += Number(row.Score ?? 0);
        if (row.TokensPrompt) bucket.promptTokens.push(Number(row.TokensPrompt));

        const wellFormed = oracles.find(o => o.oracleType === 'response-well-formed');
        const decision = oracles.find(o => o.oracleType === 'agent-decision-match');
        if (wellFormed?.passed) bucket.usable++;
        if (decision?.passed) bucket.decided++;

        const d = decision?.details ?? {};
        if (typeof d.actionAccuracy === 'number') bucket.actionAcc.push(d.actionAccuracy);
        // Param fidelity is CONDITIONAL on having invoked the right action. The oracle reports 0
        // when the expected action was never called — its params cannot be checked — and pooling
        // those zeros made the first scorecard show native "worse on params" when every native
        // turn that picked the right tool filled it correctly. Wrong-tool is already counted in
        // `action`; counting it again here double-charges one mistake to two columns.
        if (typeof d.paramFidelity === 'number' && d.actionAccuracy === 1) bucket.paramFid.push(d.paramFidelity);
        if (d.encoding === 'native') bucket.nativeEncoded++;

        // Dual-channel turns — a tool call AND a parseable envelope in one
        // turn. The loop dispatches the call and discards the envelope; this is the only place the
        // discard is counted. Rows from runs before the flag existed carry none and read as 0.
        if (d.encoding === 'native' && d.dualChannel === true) bucket.dualChannel = (bucket.dualChannel ?? 0) + 1;
        if (/concatenated/i.test(String(d.diagnostic ?? ''))) bucket.concatenatedEnvelopes = (bucket.concatenatedEnvelopes ?? 0) + 1;
        // Prose beside a call, and the placeholder-argument subset.
        if (d.encoding === 'native' && d.narrationWithCalls === true) bucket.narration++;
        if (d.encoding === 'native' && d.placeholderCall === true) bucket.placeholder++;
        // Implicit protocol: a payload write where the case wanted something else — usually a
        // terminal case answered with the write first (spec §2.1: completion-with-payload is two
        // turns). Counted so decision accuracy can be read with and without this protocol cost.
        if (mode.startsWith('implicit') && d.observedKind === 'payloadChange' && d.decisionKindMatch === false) bucket.payloadFirst++;
        // Multi-turn cases, and the write-then-finish pair within them.
        if (MULTI_TURN_CASES.has(caseId)) {
            bucket.multiRows++;
            if (decision?.passed) bucket.multiPassed++;
            if (FINISH_CASES.has(caseId)) {
                bucket.finishRows++;
                if (d.observedKind === 'taskComplete') bucket.finishCompleted++;
            }
        }
        // Payload table: did the turn write the payload at all, and did the writes match?
        if (PAYLOAD_CASES.has(caseId)) {
            bucket.payloadRows++;
            if (d.payloadChanged === true) bucket.payloadWritten++;
            for (const r of (d.paramResults ?? []).filter((x) => String(x.param ?? '').startsWith('payload '))) {
                bucket.payloadMatchers++;
                if (r.passed) bucket.payloadMatchersPassed++;
            }
        }

        // Paired collection for the control-arm comparison printed below.
        if (NON_ACTION_CASES.has(caseId)) {
            const pk = `${caseId}|${armOf(cell)}`;
            const p = pairs.get(pk) ?? { caseId, arm: armOf(cell), env: { n: 0, acted: 0 }, nat: { n: 0, acted: 0 }, imp: { n: 0, acted: 0 }, res: { n: 0, acted: 0 } };
            const side = mode === 'native' ? p.nat : mode === 'implicit' ? p.imp : isResultsMode(mode) ? p.res : p.env;
            side.n++;
            if (d.observedKind === 'action') side.acted++;
            pairs.set(pk, p);
        }

        // The coherence probe: with tools declared, a turn whose right answer
        // is NOT an action must still not emit one. This is the 1-in-8 failure class the stage
        // gate exists to catch, and it is invisible in a decision-accuracy average.
        if (mode !== 'envelope' && NON_ACTION_CASES.has(caseId)) {
            bucket.coherenceEligible++;
            const kind = d.expectedKind ?? 'unknown';
            bucket.coherenceByKind[kind] = bucket.coherenceByKind[kind] ?? { n: 0, bad: 0 };
            bucket.coherenceByKind[kind].n++;
            // A control-tool call (ask_user, delegate_to_*, payload_change_request) is a decision, not
            // a spurious action — only an ACTION call on a non-action case is a violation.
            if (d.encoding === 'native' && d.observedKind === 'action') {
                bucket.coherenceViolations++;
                bucket.coherenceByKind[kind].bad++;
                for (const a of d.observedActions ?? []) {
                    bucket.coherenceTools[a] = (bucket.coherenceTools[a] ?? 0) + 1;
                }
            }
        }
        cells.set(cell, bucket);
    }

    const mean = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
    const ordered = [...cells.values()].sort((a, b) => a.arm.localeCompare(b.arm) || a.mode.localeCompare(b.mode));

    console.log(`\n══ ${SUITE} ══`);
    console.log(`${rows.length} observation(s)${SINCE ? ` since ${SINCE}` : ''}\n`);

    console.log('CELL                                          n   infra  usable  decision  action  params*  promptTok    cost');
    console.log('─'.repeat(112));
    for (const c of ordered) {
        const tok = mean(c.promptTokens);
        console.log(
            `${c.cell.padEnd(44).slice(0, 44)} ${String(c.total).padStart(3)}  ${String(c.infra).padStart(5)}  ` +
            `${pct(c.usable, c.scored)}  ${pct(c.decided, c.scored)}  ` +
            `${(mean(c.actionAcc) === null ? '   —  ' : (mean(c.actionAcc) * 100).toFixed(1).padStart(5) + '%')}  ` +
            `${(mean(c.paramFid) === null ? '   —  ' : (mean(c.paramFid) * 100).toFixed(1).padStart(5) + '%')}  ` +
            `${(tok === null ? '       —' : Math.round(tok).toLocaleString().padStart(8))}  ${('$' + c.cost.toFixed(3)).padStart(7)}`
        );
    }

    console.log('  * params = fidelity GIVEN the right action was invoked; a wrong tool is charged to `action` only');
    // Attribution guard. Two different things can make a native cell's rows read as not-Native:
    //
    //   'NativeFallback' — the provider REJECTED the declarations and the runner retried with tools
    //   stripped. The row is an envelope observation under a native label, and the cell is
    //   measuring the fallback rather than the feature. This is a measurement defect and is shouted.
    //
    //   'Envelope' — the gate resolved false because there was nothing to declare: the agent has no
    //   Actions (Marketing Agent, 5 corpus cases). The driver logs this at run time, the row is a
    //   legitimate observation of an agent that has no tools either way, and it belongs in both
    //   arms unchanged. Reported quietly so the count is on the record without reading as an alarm.
    const fallbacks = ordered.filter((c) => (c.recordedMode.NativeFallback ?? 0) > 0);
    if (fallbacks.length > 0) {
        console.log('\n⚠ NATIVE FALLBACK — these rows were retried WITHOUT tools after a provider rejection; they are not native observations');
        for (const c of fallbacks) {
            console.log(`  ${c.cell.padEnd(44).slice(0, 44)} NativeFallback×${c.recordedMode.NativeFallback}`);
        }
    }
    const undeclared = ordered.filter((c) => c.mode !== 'envelope' && (c.recordedMode.Envelope ?? 0) > 0);
    if (undeclared.length > 0) {
        console.log(`\n  note: ${undeclared.map((c) => `${c.cell.split(' · ')[0]} ${c.recordedMode.Envelope}`).join(', ')} native-cell row(s) ran on the envelope because the agent has no Actions to declare (expected: the Marketing Agent cases)`);
    }

    const printDeltaTable = (title, fromMode, toMode) => {
        const arms = [...new Set(ordered.map(c => c.arm))].filter((arm) =>
            ordered.some((c) => c.arm === arm && c.mode === fromMode) && ordered.some((c) => c.arm === arm && c.mode === toMode));
        if (arms.length === 0) return;
        console.log(`\n${title}`);
        console.log('─'.repeat(112));
        console.log('MODEL                                      usable   decision    action    params   promptTok      cost');
        for (const arm of arms) {
            const e = ordered.find(c => c.arm === arm && c.mode === fromMode);
            const n = ordered.find(c => c.arm === arm && c.mode === toMode);
            const tokE = mean(e.promptTokens), tokN = mean(n.promptTokens);
            console.log(
                `${arm.padEnd(42).slice(0, 42)} ${delta(e.usable / (e.scored || 1), n.usable / (n.scored || 1))}  ` +
                `${delta(e.decided / (e.scored || 1), n.decided / (n.scored || 1))}  ` +
                `${delta(mean(e.actionAcc), mean(n.actionAcc))}  ${delta(mean(e.paramFid), mean(n.paramFid))}  ` +
                `${(tokE && tokN ? `${(tokN - tokE >= 0 ? '+' : '')}${Math.round(tokN - tokE).toLocaleString()}` : '—').padStart(10)}  ` +
                `${(`${n.cost - e.cost >= 0 ? '+' : '-'}$${Math.abs(n.cost - e.cost).toFixed(3)}`).padStart(9)}`
            );
        }
    };
    printDeltaTable('ENVELOPE → NATIVE (hybrid), per model (positive favours native)', 'envelope', 'native');
    printDeltaTable('ENVELOPE → IMPLICIT, per model (positive favours implicit)', 'envelope', 'implicit');
    printDeltaTable('NATIVE → IMPLICIT, per model (positive favours implicit)', 'native', 'implicit');
    printDeltaTable('ENVELOPE → NATIVE + RESULTS (on the hybrid), per model', 'envelope', 'native-results');
    printDeltaTable('ENVELOPE → IMPLICIT + RESULTS (on implicit), per model', 'envelope', 'implicit-results');
    printDeltaTable('NATIVE → NATIVE + RESULTS (the tool-results effect on the hybrid)', 'native', 'native-results');
    printDeltaTable('IMPLICIT → IMPLICIT + RESULTS (the tool-results effect on implicit)', 'implicit', 'implicit-results');

    console.log(`\nN1 COHERENCE PROBE — on the ${NON_ACTION_CASES.size} case(s) where an action is NEVER right, did declaring tools make the model call one?`);
    console.log('─'.repeat(112));
    for (const c of ordered.filter(x => x.mode !== 'envelope')) {
        console.log(`${c.cell.padEnd(44).slice(0, 44)} ${String(c.coherenceViolations).padStart(3)} / ${String(c.coherenceEligible).padStart(3)} non-action turns emitted a tool call   ${pct(c.coherenceViolations, c.coherenceEligible)}`);
        const byKind = Object.entries(c.coherenceByKind).sort((a, b) => b[1].bad - a[1].bad);
        if (byKind.length > 0) {
            console.log(`    by expected kind: ${byKind.map(([k, v]) => `${k} ${v.bad}/${v.n}`).join(' · ')}`);
        }
        const tools = Object.entries(c.coherenceTools).sort((a, b) => b[1] - a[1]).slice(0, 4);
        if (tools.length > 0) {
            console.log(`    tools it reached for: ${tools.map(([t, n]) => `${t}×${n}`).join(', ')}`);
        }
    }

    console.log('\nPAIRED COHERENCE — same case, same model: did the ENVELOPE arm act too? (native-only violations are the mode\'s)');
    console.log('─'.repeat(112));
    for (const arm of [...new Set(ordered.map(c => c.arm))]) {
        const list = [...pairs.values()].filter((p) => p.arm === arm);
        const envActed = list.reduce((s, p) => s + p.env.acted, 0), envN = list.reduce((s, p) => s + p.env.n, 0);
        const natActed = list.reduce((s, p) => s + p.nat.acted, 0), natN = list.reduce((s, p) => s + p.nat.n, 0);
        const shared = list.filter((p) => p.env.acted > 0 && p.nat.acted > 0).reduce((s, p) => s + p.nat.acted, 0);
        const impActed = list.reduce((s, p) => s + (p.imp?.acted ?? 0), 0), impN = list.reduce((s, p) => s + (p.imp?.n ?? 0), 0);
        const resActed = list.reduce((s, p) => s + (p.res?.acted ?? 0), 0), resN = list.reduce((s, p) => s + (p.res?.n ?? 0), 0);
        console.log(`${arm.padEnd(42).slice(0, 42)} envelope acted ${String(envActed).padStart(3)}/${envN}   native acted ${String(natActed).padStart(3)}/${natN}   ` +
            `native-only ${String(natActed - shared).padStart(3)}   paired Δ ${delta(envActed / (envN || 1), natActed / (natN || 1))}` +
            (impN > 0 ? `   implicit acted ${String(impActed).padStart(3)}/${impN}   paired Δ(implicit) ${delta(envActed / (envN || 1), impActed / (impN || 1))}` : '') +
            (resN > 0 ? `   +results acted ${String(resActed).padStart(3)}/${resN}   paired Δ(results) ${delta(envActed / (envN || 1), resActed / (resN || 1))}` : ''));
        for (const p of list.filter((x) => x.nat.acted > 0 || x.env.acted > 0 || (x.imp?.acted ?? 0) > 0).sort((a, b) => (b.nat.acted - b.env.acted) - (a.nat.acted - a.env.acted))) {
            console.log(`    ${p.caseId.padEnd(46)} env ${p.env.acted}/${p.env.n}   nat ${p.nat.acted}/${p.nat.n}` + ((p.imp?.n ?? 0) > 0 ? `   imp ${p.imp.acted}/${p.imp.n}` : ''));
        }
    }
    console.log('\nDUAL CHANNEL — native turns that ALSO carried a parseable envelope (discarded by tool-call-wins), and concatenated envelopes');
    console.log('─'.repeat(112));
    for (const c of ordered.filter(x => x.mode !== 'envelope')) {
        console.log(`${c.cell.padEnd(44).slice(0, 44)} dual-channel ${String(c.dualChannel ?? 0).padStart(3)} / ${String(c.nativeEncoded).padStart(3)} tool-call turns   concatenated envelopes ${String(c.concatenatedEnvelopes ?? 0).padStart(3)}`);
    }

    console.log('\nNARRATION & PLACEHOLDER CALLS — prose beside a call (not an envelope), and the placeholder-argument subset');
    console.log('─'.repeat(112));
    for (const c of ordered.filter(x => x.mode !== 'envelope')) {
        console.log(`${c.cell.padEnd(44).slice(0, 44)} narration ${String(c.narration).padStart(3)} / ${String(c.nativeEncoded).padStart(3)} call turns   placeholder calls ${String(c.placeholder).padStart(3)}` + (c.mode.startsWith('implicit') ? `   payload-first turns (case wanted otherwise) ${String(c.payloadFirst).padStart(3)}` : ''));
    }

    if (PAYLOAD_CASES.size > 0 && ordered.some((c) => c.payloadRows > 0)) {
        console.log(`\nPAYLOAD — on the ${PAYLOAD_CASES.size} payload-change case(s): did the turn write the payload, and did the writes match?`);
        console.log('─'.repeat(112));
        for (const c of ordered.filter((x) => x.payloadRows > 0)) {
            console.log(`${c.cell.padEnd(44).slice(0, 44)} wrote payload ${String(c.payloadWritten).padStart(3)} / ${String(c.payloadRows).padStart(3)} rows   payload fidelity ${pct(c.payloadMatchersPassed, c.payloadMatchers)} (${c.payloadMatchers} matchers)`);
        }
    }

    if (MULTI_TURN_CASES.size > 0 && ordered.some((c) => c.multiRows > 0)) {
        console.log(`\nMULTI-TURN — on the ${MULTI_TURN_CASES.size} multi-turn case(s): passes per arm, and on the write-then-finish pair, did the model finish?`);
        console.log('─'.repeat(112));
        for (const c of ordered.filter((x) => x.multiRows > 0)) {
            console.log(`${c.cell.padEnd(44).slice(0, 44)} passed ${String(c.multiPassed).padStart(3)} / ${String(c.multiRows).padStart(3)}   finished after the write ${String(c.finishCompleted).padStart(3)} / ${String(c.finishRows).padStart(3)}`);
        }
    }

    const infraTotal = ordered.reduce((a, c) => a + c.infra, 0);
    if (infraTotal > 0) {
        console.log('\nEXCLUDED — never reached the model, so not evidence about either mode');
        console.log('─'.repeat(112));
        const byReason = {};
        for (const c of ordered) for (const [k, v] of Object.entries(c.infraBy)) byReason[k] = (byReason[k] ?? 0) + v;
        for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${reason.padEnd(26)} ${String(n).padStart(4)}`);
        }
        const worst = ordered.reduce((a, c) => (c.infra / (c.total || 1) > a.infra / (a.total || 1) ? c : a));
        if (worst.infra / worst.total > 0.1) {
            console.log(`\n  ⚠ ${worst.cell} lost ${pct(worst.infra, worst.total).trim()} of its observations to infrastructure.`);
            console.log('    Rates above are computed on what remains and should be treated as provisional.');
        }
    }

    console.log(`\nTOTAL SPEND  $${ordered.reduce((a, c) => a + c.cost, 0).toFixed(2)}\n`);
    await pool.close();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
