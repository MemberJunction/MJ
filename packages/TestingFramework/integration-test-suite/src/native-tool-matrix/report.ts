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
    label: string;
    timestamp: string;
    cellId: string;
    modelLabel: string;
    apiName: string;
    developer: string;
    generation: string;
    driverClass: string;
    scenarioId: string;
    toolMode: MatrixCell['toolMode'];
    responseFormat: MatrixCell['responseFormat'];
    effortLevel: string | null;
    rep: number;
    latencyMs: number;
    observation: CellObservation;
}

/** Per-cell rates. Every rate is over the repetitions that could produce it, never over all reps. */
export interface CellSummary {
    cellId: string;
    modelLabel: string;
    apiName: string;
    developer: string;
    generation: string;
    scenarioId: string;
    toolMode: MatrixCell['toolMode'];
    responseFormat: MatrixCell['responseFormat'];
    effortLevel: string | null;
    reps: number;
    errorCount: number;
    errorSamples: string[];
    /**
     * Computed over ALL repetitions, errors included — a provider rejecting the request is a wrong
     * answer from the caller's point of view, not a missing observation.
     */
    decisionCorrectRate: number;
    /**
     * These three describe what a SUCCESSFUL turn looked like, so they are `null` — not zero — when
     * every repetition errored. Reporting an all-400 cell as "0% called a tool" would read as a
     * model choosing not to call one, which is the opposite of what happened.
     */
    nativeCallRate: number | null;
    meanNativeCalls: number | null;
    parallelRate: number | null;
    /** Among repetitions that produced at least one native call. */
    wellFormedRate: number | null;
    /** Among repetitions that produced at least one native call. */
    textWithCallRate: number | null;
    toolChoiceHonoredRate: number | null;
    envelopeParsedRate: number | null;
    envelopeValidRate: number | null;
    argumentMatchRate: number | null;
    finishReasons: Record<string, number>;
    meanPromptTokens: number | null;
    meanLatencyMs: number;
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
        const key = o.driverSucceeded ? (o.finishReason ?? '(none)') : '(error)';
        tally[key] = (tally[key] ?? 0) + 1;
    }
    return tally;
}

/** Collapses one cell's repetitions into rates. */
function summarizeOne(records: ProbeRecord[]): CellSummary {
    const first = records[0];
    const observations = records.map((r) => r.observation);
    const ok = observations.filter((o) => o.driverSucceeded);
    const withCalls = ok.filter((o) => o.nativeToolCallCount > 0);

    return {
        cellId: first.cellId,
        modelLabel: first.modelLabel, apiName: first.apiName, developer: first.developer, generation: first.generation,
        scenarioId: first.scenarioId, toolMode: first.toolMode, responseFormat: first.responseFormat, effortLevel: first.effortLevel,
        reps: records.length,
        errorCount: observations.length - ok.length,
        errorSamples: [...new Set(defined(observations.map((o) => o.errorMessage)))].slice(0, 2),
        decisionCorrectRate: rateOf(observations.map((o) => o.decisionCorrect)) ?? 0,
        nativeCallRate: rateOf(ok.map((o) => o.nativeToolCallCount > 0)),
        meanNativeCalls: ok.length === 0 ? null : mean(ok.map((o) => o.nativeToolCallCount)),
        parallelRate: rateOf(ok.map((o) => o.nativeToolCallCount > 1)),
        wellFormedRate: rateOf(withCalls.map((o) => o.nativeCallsWellFormed)),
        textWithCallRate: rateOf(withCalls.map((o) => o.textAndCallsTogether)),
        toolChoiceHonoredRate: rateOf(defined(ok.map((o) => o.toolChoiceHonored))),
        envelopeParsedRate: rateOf(defined(ok.map((o) => o.envelopeParsed))),
        envelopeValidRate: rateOf(defined(ok.map((o) => o.envelopeValid))),
        argumentMatchRate: (() => {
            const rates = defined(ok.map((o) => o.argumentMatchRate));
            return rates.length === 0 ? null : mean(rates);
        })(),
        finishReasons: tallyFinishReasons(observations),
        meanPromptTokens: (() => {
            const tokens = defined(ok.map((o) => o.promptTokens));
            return tokens.length === 0 ? null : mean(tokens);
        })(),
        meanLatencyMs: mean(records.map((r) => r.latencyMs))
    };
}

/** Groups records by cell and summarizes each. Input order is irrelevant. */
export function SummarizeCells(records: ProbeRecord[]): CellSummary[] {
    const byCell = new Map<string, ProbeRecord[]>();
    for (const record of records) {
        const bucket = byCell.get(record.cellId);
        if (bucket) {
            bucket.push(record);
        } else {
            byCell.set(record.cellId, [record]);
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
        if (!seen.has(s.apiName)) {
            seen.set(s.apiName, s);
        }
    }
    // Sorted, not first-seen: models run in parallel, so record order is nondeterministic and two
    // renders of the SAME jsonl would otherwise produce differently-ordered tables.
    return [...seen.values()].sort((a, b) => a.developer.localeCompare(b.developer) || a.apiName.localeCompare(b.apiName));
}

/** Pools the cells matching a filter and reports one rate over the pooled repetitions. */
function pooled(summaries: CellSummary[], select: (s: CellSummary) => boolean, metric: (s: CellSummary) => number | null): number | null {
    const chosen = summaries.filter(select);
    const weighted = chosen.map((s) => ({ value: metric(s), reps: s.reps })).filter((e): e is { value: number; reps: number } => e.value !== null);
    const totalReps = weighted.reduce((a, e) => a + e.reps, 0);
    return totalReps === 0 ? null : weighted.reduce((a, e) => a + e.value * e.reps, 0) / totalReps;
}

function renderForcingSection(summaries: CellSummary[]): string {
    const modes: CellSummary['toolMode'][] = ['none', 'required', 'named'];
    const rows = modelsOf(summaries).map((m) => [
        m.modelLabel,
        ...modes.map((mode) => pct(pooled(summaries, (s) => s.apiName === m.apiName && s.toolMode === mode, (s) => s.toolChoiceHonoredRate)))
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
    const withTools = (s: CellSummary): boolean => s.toolMode !== 'no-tools';
    const rows = modelsOf(summaries).map((m) => {
        const cells = summaries.filter((s) => s.apiName === m.apiName && withTools(s));
        const anyCells = cells.filter((s) => s.responseFormat === 'Any');
        const jsonCells = cells.filter((s) => s.responseFormat === 'JSON');
        const errorRate = (group: CellSummary[]): string => {
            const reps = group.reduce((a, s) => a + s.reps, 0);
            const errors = group.reduce((a, s) => a + s.errorCount, 0);
            return reps === 0 ? '—' : `${Math.round((errors / reps) * 100)}%`;
        };
        return [
            m.modelLabel,
            errorRate(anyCells), pct(pooled(anyCells, () => true, (s) => s.decisionCorrectRate)),
            errorRate(jsonCells), pct(pooled(jsonCells, () => true, (s) => s.decisionCorrectRate))
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
    const pick = (apiName: string, format: CellSummary['responseFormat']): CellSummary[] =>
        summaries.filter((s) => s.apiName === apiName && s.scenarioId === 'parallel-call' && s.toolMode === 'auto' && s.responseFormat === format);
    const rows = modelsOf(summaries).map((m) => [
        m.modelLabel,
        num(pooled(pick(m.apiName, 'Any'), () => true, (s) => s.meanNativeCalls)),
        pct(pooled(pick(m.apiName, 'Any'), () => true, (s) => s.decisionCorrectRate)),
        num(pooled(pick(m.apiName, 'JSON'), () => true, (s) => s.meanNativeCalls)),
        pct(pooled(pick(m.apiName, 'JSON'), () => true, (s) => s.decisionCorrectRate))
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
    const pick = (apiName: string, mode: CellSummary['toolMode'], format: CellSummary['responseFormat']): CellSummary[] =>
        summaries.filter((s) => s.apiName === apiName && s.scenarioId === 'no-call-needed' && s.toolMode === mode && s.responseFormat === format);
    const rows = modelsOf(summaries).map((m) => [
        m.modelLabel,
        pct(pooled(pick(m.apiName, 'auto', 'Any'), () => true, (s) => s.nativeCallRate)),
        pct(pooled(pick(m.apiName, 'auto', 'JSON'), () => true, (s) => s.nativeCallRate)),
        pct(pooled(pick(m.apiName, 'required', 'Any'), () => true, (s) => s.textWithCallRate))
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
    const pick = (apiName: string, mode: CellSummary['toolMode'], format: CellSummary['responseFormat']): CellSummary[] =>
        summaries.filter((s) => s.apiName === apiName && s.scenarioId === 'envelope' && s.toolMode === mode && s.responseFormat === format);
    const rows = modelsOf(summaries).map((m) => [
        m.modelLabel,
        pct(pooled(pick(m.apiName, 'no-tools', 'Any'), () => true, (s) => s.envelopeValidRate)),
        pct(pooled(pick(m.apiName, 'auto', 'Any'), () => true, (s) => s.envelopeValidRate)),
        pct(pooled(pick(m.apiName, 'auto', 'Any'), () => true, (s) => s.nativeCallRate)),
        pct(pooled(pick(m.apiName, 'auto', 'JSON'), () => true, (s) => s.envelopeValidRate)),
        pct(pooled(pick(m.apiName, 'auto', 'JSON'), () => true, (s) => s.nativeCallRate))
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
        const calling = summaries.filter((s) => s.apiName === m.apiName && s.toolMode !== 'no-tools' && s.toolMode !== 'none');
        return [
            m.modelLabel,
            pct(pooled(calling, () => true, (s) => s.wellFormedRate)),
            pct(pooled(calling, () => true, (s) => s.textWithCallRate)),
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
        const mine = summaries.filter((s) => s.apiName === m.apiName);
        const tally: Record<string, number> = {};
        for (const s of mine) {
            for (const [reason, count] of Object.entries(s.finishReasons)) {
                tally[reason] = (tally[reason] ?? 0) + count;
            }
        }
        const rendered = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([r, c]) => `\`${r}\` ×${c}`).join(', ');
        return [m.modelLabel, rendered];
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
        const noTools = summaries.filter((s) => s.apiName === m.apiName && s.toolMode === 'no-tools');
        const withTools = summaries.filter((s) => s.apiName === m.apiName && s.toolMode !== 'no-tools');
        return [
            m.modelLabel,
            num(pooled(noTools, () => true, (s) => s.meanPromptTokens), 0),
            num(pooled(withTools, () => true, (s) => s.meanPromptTokens), 0),
            num(pooled(summaries.filter((s) => s.apiName === m.apiName), () => true, (s) => s.meanLatencyMs), 0)
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
    const rows = failing.map((s) => [`\`${s.cellId}\``, `${s.errorCount}/${s.reps}`, s.errorSamples.map((e) => e.replace(/\|/g, '\\|').slice(0, 160)).join('<br>')]);
    return ['### Errors', '', 'Every cell that failed at least once, with the provider message. A whole-cell failure is itself a finding.', '', renderTable(['Cell', 'Failed', 'Message'], rows)].join('\n');
}

/** Run metadata printed at the top of the scorecard so a result is reproducible from the doc alone. */
export interface ScorecardMeta {
    label: string;
    startedAt: string;
    finishedAt: string;
    reps: number;
    cellCount: number;
    /** Omitted when re-rendering from records, which carry no memory of what the spec skipped. */
    skippedCount: number | null;
    callCount: number;
}

/** Renders the whole scorecard. Sections are ordered by the question each answers. */
export function RenderScorecard(summaries: CellSummary[], meta: ScorecardMeta): string {
    return [
        `# BaseLLM tool-calling matrix (\`${meta.label}\`)`,
        '',
        `Generated by \`rigs/native-tool-matrix.ts\`. ${meta.cellCount} cells × ${meta.reps} repetitions = ${meta.callCount} live calls${meta.skippedCount === null ? '' : `; ${meta.skippedCount} combinations skipped as vacuous`}. Started ${meta.startedAt}, finished ${meta.finishedAt}.`,
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
