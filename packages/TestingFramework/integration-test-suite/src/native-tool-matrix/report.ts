/**
 * report.ts — aggregates probe records into per-cell rates and renders the scorecard.
 *
 * Pure: records in, markdown out. The rig writes the markdown to disk, but nothing here knows that,
 * so the aggregation is unit-testable against canned records and the same summaries can feed a
 * different presentation later (a cell-by-cell corpus comparison).
 *
 * The scorecard is organized by QUESTION, not by axis — one section per open question the matrix
 * exists to answer — because a reader arriving from the implementation plan wants "does forcing
 * work on Gemini", not a 210-row grid to pivot themselves.
 */
import type { CellObservation } from './observe';
import type { MatrixCell } from './types';

/** One request/response pair, as persisted to JSONL. The rig appends one of these per repetition. */
export interface ProbeRecord {
    /** Run label, so several runs can share a results directory and still be told apart. */
    Label: string;
    Timestamp: string;
    CellId: string;
    ModelLabel: string;
    ApiName: string;
    Developer: string;
    Generation: string;
    DriverClass: string;
    ScenarioId: string;
    ToolMode: MatrixCell['ToolMode'];
    ResponseFormat: MatrixCell['ResponseFormat'];
    EffortLevel: string | null;
    Rep: number;
    LatencyMs: number;
    Observation: CellObservation;
}

/** Per-cell rates. Every rate is over the repetitions that could produce it, never over all reps. */
export interface CellSummary {
    CellId: string;
    ModelLabel: string;
    ApiName: string;
    Developer: string;
    Generation: string;
    ScenarioId: string;
    ToolMode: MatrixCell['ToolMode'];
    ResponseFormat: MatrixCell['ResponseFormat'];
    EffortLevel: string | null;
    reps: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    errorCount: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    ErrorSamples: string[];
    /**
     * Computed over ALL repetitions, errors included — a provider rejecting the request is a wrong
     * answer from the caller's point of view, not a missing observation.
     */
    DecisionCorrectRate: number;
    /**
     * These three describe what a SUCCESSFUL turn looked like, so they are `null` — not zero — when
     * every repetition errored. Reporting an all-400 cell as "0% called a tool" would read as a
     * model choosing not to call one, which is the opposite of what happened.
     */
    nativeCallRate: number | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    MeanNativeCalls: number | null;
    parallelRate: number | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Among repetitions that produced at least one native call. */
    WellFormedRate: number | null;
    /** Among repetitions that produced at least one native call. */
    TextWithCallRate: number | null;
    ToolChoiceHonoredRate: number | null;
    EnvelopeParsedRate: number | null;
    EnvelopeValidRate: number | null;
    argumentMatchRate: number | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    FinishReasons: Record<string, number>;
    MeanPromptTokens: number | null;
    MeanLatencyMs: number;
}

function mean(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function rateOf(values: boolean[]): number | null {
    return values.length === 0 ? null : values.filter(Boolean).length / values.length;
}

function defined<T>(values: (T | null | undefined)[]): T[] {
    return values.filter((v): v is T => v !== null && v !== undefined);
}

function tallyFinishReasons(observations: CellObservation[]): Record<string, number> {
    const tally: Record<string, number> = {};
    for (const o of observations) {
        const key = o.driverSucceeded ? (o.FinishReason ?? '(none)') : '(error)';
        tally[key] = (tally[key] ?? 0) + 1;
    }
    return tally;
}

/** Collapses one cell's repetitions into rates. */
function summarizeOne(records: ProbeRecord[]): CellSummary {
    const first = records[0];
    const observations = records.map((r) => r.Observation);
    const ok = observations.filter((o) => o.driverSucceeded);
    const withCalls = ok.filter((o) => o.nativeToolCallCount > 0);

    return {
        CellId: first.CellId,
        ModelLabel: first.ModelLabel, ApiName: first.ApiName, Developer: first.Developer, Generation: first.Generation,
        ScenarioId: first.ScenarioId, ToolMode: first.ToolMode, ResponseFormat: first.ResponseFormat, EffortLevel: first.EffortLevel,
        reps: records.length,
        errorCount: observations.length - ok.length,
        ErrorSamples: [...new Set(defined(observations.map((o) => o.errorMessage)))].slice(0, 2),
        DecisionCorrectRate: rateOf(observations.map((o) => o.decisionCorrect)) ?? 0,
        nativeCallRate: rateOf(ok.map((o) => o.nativeToolCallCount > 0)),
        MeanNativeCalls: ok.length === 0 ? null : mean(ok.map((o) => o.nativeToolCallCount)),
        parallelRate: rateOf(ok.map((o) => o.nativeToolCallCount > 1)),
        WellFormedRate: rateOf(withCalls.map((o) => o.nativeCallsWellFormed)),
        TextWithCallRate: rateOf(withCalls.map((o) => o.TextAndCallsTogether)),
        ToolChoiceHonoredRate: rateOf(defined(ok.map((o) => o.ToolChoiceHonored))),
        EnvelopeParsedRate: rateOf(defined(ok.map((o) => o.envelopeParsed))),
        EnvelopeValidRate: rateOf(defined(ok.map((o) => o.envelopeValid))),
        argumentMatchRate: (() => {
            const rates = defined(ok.map((o) => o.argumentMatchRate));
            return rates.length === 0 ? null : mean(rates);
        })(),
        FinishReasons: tallyFinishReasons(observations),
        MeanPromptTokens: (() => {
            const tokens = defined(ok.map((o) => o.PromptTokens));
            return tokens.length === 0 ? null : mean(tokens);
        })(),
        MeanLatencyMs: mean(records.map((r) => r.LatencyMs))
    };
}

/** Groups records by cell and summarizes each. Input order is irrelevant. */
export function SummarizeCells(records: ProbeRecord[]): CellSummary[] {
    const byCell = new Map<string, ProbeRecord[]>();
    for (const record of records) {
        const bucket = byCell.get(record.CellId);
        if (bucket) {
            bucket.push(record);
        } else {
            byCell.set(record.CellId, [record]);
        }
    }
    return [...byCell.values()].map(summarizeOne);
}

/** @deprecated Use {@link SummarizeCells}. */
export function summarizeCells(records: ProbeRecord[]): CellSummary[] {
    return SummarizeCells(records);
}

// ────────────────────────────────────────────────────────────────────────────
// Markdown rendering
// ────────────────────────────────────────────────────────────────────────────

function pct(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function num(value: number | null, digits = 2): string {
    return value === null ? '—' : value.toFixed(digits);
}

function renderTable(headers: string[], rows: string[][]): string {
    const head = `| ${headers.join(' | ')} |`;
    const rule = `|${headers.map(() => '---').join('|')}|`;
    return [head, rule, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

/** The distinct models in scorecard order — developer first, then the order they were configured. */
function modelsOf(summaries: CellSummary[]): CellSummary[] {
    const seen = new Map<string, CellSummary>();
    for (const s of summaries) {
        if (!seen.has(s.ApiName)) {
            seen.set(s.ApiName, s);
        }
    }
    // Sorted, not first-seen: models run in parallel, so record order is nondeterministic and two
    // renders of the SAME jsonl would otherwise produce differently-ordered tables.
    return [...seen.values()].sort((a, b) => a.Developer.localeCompare(b.Developer) || a.ApiName.localeCompare(b.ApiName));
}

/** Pools the cells matching a filter and reports one rate over the pooled repetitions. */
function pooled(summaries: CellSummary[], select: (s: CellSummary) => boolean, metric: (s: CellSummary) => number | null): number | null {
    const chosen = summaries.filter(select);
    const weighted = chosen.map((s) => ({ value: metric(s), reps: s.reps })).filter((e): e is { value: number; reps: number } => e.value !== null);
    const totalReps = weighted.reduce((a, e) => a + e.reps, 0);
    return totalReps === 0 ? null : weighted.reduce((a, e) => a + e.value * e.reps, 0) / totalReps;
}

function renderForcingSection(summaries: CellSummary[]): string {
    const modes: CellSummary['ToolMode'][] = ['none', 'required', 'named'];
    const rows = modelsOf(summaries).map((m) => [
        m.ModelLabel,
        ...modes.map((mode) => pct(pooled(summaries, (s) => s.ApiName === m.ApiName && s.ToolMode === mode, (s) => s.ToolChoiceHonoredRate)))
    ]);
    return [
        '### Forcing semantics — does `toolChoice` mean what it says?',
        '',
        "Share of calls where the provider obeyed the forcing mode: `none` emitted zero calls, `required` emitted at least one, `named` emitted only the named tool. Pooled across scenarios and response formats.",
        '',
        renderTable(['Model', "`'none'`", "`'required'`", '`{ name }`'], rows)
    ].join('\n');
}

function renderJsonModeSection(summaries: CellSummary[]): string {
    const withTools = (s: CellSummary): boolean => s.ToolMode !== 'no-tools';
    const rows = modelsOf(summaries).map((m) => {
        const cells = summaries.filter((s) => s.ApiName === m.ApiName && withTools(s));
        const anyCells = cells.filter((s) => s.ResponseFormat === 'Any');
        const jsonCells = cells.filter((s) => s.ResponseFormat === 'JSON');
        const errorRate = (group: CellSummary[]): string => {
            const reps = group.reduce((a, s) => a + s.reps, 0);
            const errors = group.reduce((a, s) => a + s.errorCount, 0);
            return reps === 0 ? '—' : `${Math.round((errors / reps) * 100)}%`;
        };
        return [
            m.ModelLabel,
            errorRate(anyCells), pct(pooled(anyCells, () => true, (s) => s.DecisionCorrectRate)),
            errorRate(jsonCells), pct(pooled(jsonCells, () => true, (s) => s.DecisionCorrectRate))
        ];
    });
    return [
        '### `responseFormat: JSON` × declared tools (plan §5.6)',
        '',
        'Tools-declared cells only. A high JSON error rate is the provider rejecting the combination outright; a decision-accuracy drop without errors is the subtler failure.',
        '',
        renderTable(['Model', 'Any — errors', 'Any — decision ✓', 'JSON — errors', 'JSON — decision ✓'], rows)
    ].join('\n');
}

function renderParallelSection(summaries: CellSummary[]): string {
    const pick = (apiName: string, format: CellSummary['ResponseFormat']): CellSummary[] =>
        summaries.filter((s) => s.ApiName === apiName && s.ScenarioId === 'parallel-call' && s.ToolMode === 'auto' && s.ResponseFormat === format);
    const rows = modelsOf(summaries).map((m) => [
        m.ModelLabel,
        num(pooled(pick(m.ApiName, 'Any'), () => true, (s) => s.MeanNativeCalls)),
        pct(pooled(pick(m.ApiName, 'Any'), () => true, (s) => s.DecisionCorrectRate)),
        num(pooled(pick(m.ApiName, 'JSON'), () => true, (s) => s.MeanNativeCalls)),
        pct(pooled(pick(m.ApiName, 'JSON'), () => true, (s) => s.DecisionCorrectRate))
    ]);
    return [
        '### Parallel calls (plan §9.3)',
        '',
        'The `parallel-call` scenario under `auto`: one question warranting two different tools. "Both, in one turn" is the decision-correct case. A dash means every repetition errored — see the error table.',
        '',
        renderTable(['Model', 'Mean calls/turn (Any)', 'Both tools called (Any)', 'Mean calls/turn (JSON)', 'Both tools called (JSON)'], rows)
    ].join('\n');
}

function renderCoherenceSection(summaries: CellSummary[]): string {
    const pick = (apiName: string, mode: CellSummary['ToolMode'], format: CellSummary['ResponseFormat']): CellSummary[] =>
        summaries.filter((s) => s.ApiName === apiName && s.ScenarioId === 'no-call-needed' && s.ToolMode === mode && s.ResponseFormat === format);
    const rows = modelsOf(summaries).map((m) => [
        m.ModelLabel,
        pct(pooled(pick(m.ApiName, 'auto', 'Any'), () => true, (s) => s.nativeCallRate)),
        pct(pooled(pick(m.ApiName, 'auto', 'JSON'), () => true, (s) => s.nativeCallRate)),
        pct(pooled(pick(m.ApiName, 'required', 'Any'), () => true, (s) => s.TextWithCallRate))
    ]);
    return [
        '### Coherence — does declaring tools make a model reach for one?',
        '',
        'The `no-call-needed` scenario declares all three tools and asks a general-knowledge question. Under `auto`, **any** call is a failure. Split by response format, because pooling the two hides the mechanism: on some models the spurious calls come entirely from the JSON arm. The last column reports what forcing costs — whether a forced, unwarranted call still carries usable text.',
        '',
        renderTable(['Model', 'Spurious call rate (`auto`, Any)', 'Spurious call rate (`auto`, JSON)', 'Text survives a forced call'], rows)
    ].join('\n');
}

function renderEnvelopeSection(summaries: CellSummary[]): string {
    const pick = (apiName: string, mode: CellSummary['ToolMode'], format: CellSummary['ResponseFormat']): CellSummary[] =>
        summaries.filter((s) => s.ApiName === apiName && s.ScenarioId === 'envelope' && s.ToolMode === mode && s.ResponseFormat === format);
    const rows = modelsOf(summaries).map((m) => [
        m.ModelLabel,
        pct(pooled(pick(m.ApiName, 'no-tools', 'Any'), () => true, (s) => s.EnvelopeValidRate)),
        pct(pooled(pick(m.ApiName, 'auto', 'Any'), () => true, (s) => s.EnvelopeValidRate)),
        pct(pooled(pick(m.ApiName, 'auto', 'Any'), () => true, (s) => s.nativeCallRate)),
        pct(pooled(pick(m.ApiName, 'auto', 'JSON'), () => true, (s) => s.EnvelopeValidRate)),
        pct(pooled(pick(m.ApiName, 'auto', 'JSON'), () => true, (s) => s.nativeCallRate))
    ]);
    return [
        '### The envelope under declared tools — which channel does the model pick?',
        '',
        "MJ's `LoopAgentResponse` asked for in the system prompt. Column 1 is today's path (no tools declared). The rest add declarations under `auto`, split by response format. **This is the malformed-response mechanism in miniature:** a loop that only parses the envelope sees a model answering natively as a parse failure, even though the decision itself was correct.",
        '',
        renderTable(['Model', 'Envelope valid (no tools)', 'Envelope valid (tools, Any)', 'Answered natively (Any)', 'Envelope valid (tools, JSON)', 'Answered natively (JSON)'], rows)
    ].join('\n');
}

function renderShapeSection(summaries: CellSummary[]): string {
    const rows = modelsOf(summaries).map((m) => {
        const calling = summaries.filter((s) => s.ApiName === m.ApiName && s.ToolMode !== 'no-tools' && s.ToolMode !== 'none');
        return [
            m.ModelLabel,
            pct(pooled(calling, () => true, (s) => s.WellFormedRate)),
            pct(pooled(calling, () => true, (s) => s.TextWithCallRate)),
            pct(pooled(calling, () => true, (s) => s.argumentMatchRate))
        ];
    });
    return [
        '### Call shape — well-formedness, text coexistence, argument fidelity',
        '',
        'Pooled over every cell that could produce a call. "Well-formed" means dispatchable: a declared name and an object for arguments. "Text alongside calls" is the frequency of the mixed turn `ChatCompletionMessage` models but nothing may assume (§5.2).',
        '',
        renderTable(['Model', 'Calls well-formed', 'Text alongside calls', 'Argument matchers passed'], rows)
    ].join('\n');
}

function renderFinishReasonSection(summaries: CellSummary[]): string {
    const rows = modelsOf(summaries).map((m) => {
        const mine = summaries.filter((s) => s.ApiName === m.ApiName);
        const tally: Record<string, number> = {};
        for (const s of mine) {
            for (const [reason, count] of Object.entries(s.FinishReasons)) {
                tally[reason] = (tally[reason] ?? 0) + count;
            }
        }
        const rendered = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([r, c]) => `\`${r}\` ×${c}`).join(', ');
        return [m.ModelLabel, rendered];
    });
    return [
        '### Finish-reason distribution',
        '',
        'Diagnostic only, and the empirical backing for [MJ#4335](https://github.com/MemberJunction/MJ/issues/4335): `tool_calls` is the one value the drivers normalize today, and everything else here is whatever the provider said.',
        '',
        renderTable(['Model', 'Observed `finish_reason` values'], rows)
    ].join('\n');
}

function renderCostSection(summaries: CellSummary[]): string {
    const rows = modelsOf(summaries).map((m) => {
        const noTools = summaries.filter((s) => s.ApiName === m.ApiName && s.ToolMode === 'no-tools');
        const withTools = summaries.filter((s) => s.ApiName === m.ApiName && s.ToolMode !== 'no-tools');
        return [
            m.ModelLabel,
            num(pooled(noTools, () => true, (s) => s.MeanPromptTokens), 0),
            num(pooled(withTools, () => true, (s) => s.MeanPromptTokens), 0),
            num(pooled(summaries.filter((s) => s.ApiName === m.ApiName), () => true, (s) => s.MeanLatencyMs), 0)
        ];
    });
    return [
        '### Cost profile',
        '',
        'Prompt tokens with and without declarations, so the price of carrying a tool block is visible. These probes declare three tiny tools — a real action catalog is far larger, which is the direction native declarations are trying to move the number.',
        '',
        renderTable(['Model', 'Prompt tokens (no tools)', 'Prompt tokens (tools declared)', 'Mean latency (ms)'], rows)
    ].join('\n');
}

function renderErrorSection(summaries: CellSummary[]): string {
    const failing = summaries.filter((s) => s.errorCount > 0);
    if (failing.length === 0) {
        return ['### Errors', '', 'None — every cell returned a successful result on every repetition.'].join('\n');
    }
    const rows = failing.map((s) => [`\`${s.CellId}\``, `${s.errorCount}/${s.reps}`, s.ErrorSamples.map((e) => e.replace(/\|/g, '\\|').slice(0, 160)).join('<br>')]);
    return ['### Errors', '', 'Every cell that failed at least once, with the provider message. A whole-cell failure is itself a finding.', '', renderTable(['Cell', 'Failed', 'Message'], rows)].join('\n');
}

/** Run metadata printed at the top of the scorecard so a result is reproducible from the doc alone. */
export interface ScorecardMeta {
    Label: string;
    StartedAt: string;
    FinishedAt: string;
    reps: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    CellCount: number;
    /** Omitted when re-rendering from records, which carry no memory of what the spec skipped. */
    SkippedCount: number | null;
    CallCount: number;
}

/** Renders the whole scorecard. Sections are ordered by the question each answers. */
export function RenderScorecard(summaries: CellSummary[], meta: ScorecardMeta): string {
    return [
        `# BaseLLM tool-calling matrix (\`${meta.Label}\`)`,
        '',
        `Generated by \`rigs/native-tool-matrix.ts\`. ${meta.CellCount} cells × ${meta.reps} repetitions = ${meta.CallCount} live calls${meta.SkippedCount === null ? '' : `; ${meta.SkippedCount} combinations skipped as vacuous`}. Started ${meta.StartedAt}, finished ${meta.FinishedAt}.`,
        '',
        renderForcingSection(summaries), '',
        renderJsonModeSection(summaries), '',
        renderParallelSection(summaries), '',
        renderCoherenceSection(summaries), '',
        renderEnvelopeSection(summaries), '',
        renderShapeSection(summaries), '',
        renderFinishReasonSection(summaries), '',
        renderCostSection(summaries), '',
        renderErrorSection(summaries), ''
    ].join('\n');
}

/** @deprecated Use {@link RenderScorecard}. */
export function renderScorecard(summaries: CellSummary[], meta: ScorecardMeta): string {
    return RenderScorecard(summaries, meta);
}
