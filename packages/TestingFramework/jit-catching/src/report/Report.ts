import { GetAgreement } from '@memberjunction/rubrics';
import { UUIDMap } from '@memberjunction/global';
import type { BaseCatchStore } from '../contracts/BaseCatchStore';
import type { BacktestLedger, LedgerEntry } from '../backtest/Ledger';
import type { Corpus } from '../corpus/Corpus';
import type { RunDir } from '../pipeline/RunDir';
import { BUCKET_SCORE } from '../judges/JudgePanel';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import type { Catch, Feedback, Run, SessionRecord, TokenUsage } from '../types';
import { CountBy, MeanOf, RateOf, type RateWithInterval } from './Stats';

export type AgreementResult = ReturnType<typeof GetAgreement>;
/** The human label of a catch, with AuthorChangedPR counted as Bug. */
export type HumanLabel = 'Bug' | 'Intended' | 'TestFault';

export interface ModelReport {
    Model: string; Ledgers: string[];
    /**
     * Caught = run bug PRs whose reported catch matched the fix ÷ run bug PRs with a match result (progress).
     * GateCaught = bug PRs whose reported catch matched ÷ every curated bug PR of the slices (the gate value).
     * NotYetMatched = run bug PRs with no match result. MatchedOnFixMerge = Matched PRs whose tests ran on the fix PR's merge commit.
     */
    BugSet: {
        PRs: number; Run: number; Failed: number; Caught: RateWithInterval; GateCaught: RateWithInterval; AnyWeakMatched: number; MatchedOnFixMerge: number;
        NotMatched: number; NoCatch: number; ApplyFailed: number; PrepareFailed: number; NotYetMatched: number;
    };
    /** FalseAlarms = run clean PRs with a reported catch labeled Intended or TestFault. */
    CleanSet: { PRs: number; Run: number; Failed: number; Reported: number; Labeled: number; Pending: number; FalseAlarms: RateWithInterval; RealBugs: number };
    /**
     * TotalUSD: the ledger cost of every attempt. RecordedUSD and TableUSD: the recorded and the table-priced cost of the tokens of each
     * entry's current run, also per model in ByModel. UnpricedModels: models with no table price; their recorded cost is used in TableUSD.
     */
    Cost: { TotalUSD: number; PerPR: number | null; PerMatchedCatch: number | null; RecordedUSD: number; TableUSD: number; ByModel: Record<string, { RecordedUSD: number; TableUSD: number }>; UnpricedModels: string[] };
    /** Session end reason → count. */
    Sessions: Record<string, number>;
    /** Fallbacks: runs whose analyzer reply was invalid twice, of the Runs with a readable generation file. NoFile: runs with data but no readable generation file. */
    AnalyzerFallbacks: { Fallbacks: number; Runs: number; NoFile: number };
    /** Drop rule → count. */
    Drops: Record<string, number>;
    Judges: { Model: string; Agreement: AgreementResult; HighOnIntended: number; LowOnBug: number }[];
    TPProb: Record<HumanLabel, { N: number; Mean: number | null }>;
}
export interface GateReport { GeneratedAt: string; Models: ModelReport[]; }

export interface GateReportOptions {
    Ledgers: BacktestLedger[]; Corpus: Corpus; Store: BaseCatchStore; RunDirOf: (runID: string) => RunDir;
    /** Prices per 1M tokens for TableUSD; the default settings' prices when not given. */
    Prices?: Settings['Prices'];
}

/** A catch with its human label (latest feedback by `At`), or null when it has none. */
type LabeledCatch = Catch & { Label: HumanLabel | null };
interface RunData { Run: Run | null; Catches: LabeledCatch[]; Sessions: SessionRecord[];
    /** The analysis's fallback flag; null when the generation file is missing or unreadable. */
    Fallback: boolean | null; }
/** A catch whose truth is known: +1 bug (label Bug or a matched test), −1 not a bug. `Intended` marks a label of Intended or TestFault. */
interface Truth { Catch: LabeledCatch; Score: 1 | -1; Intended: boolean; }

/**
 * The gate-1 report: one section per generator model, combining that model's ledgers.
 * The human label of a catch is its latest feedback by `At`; an AuthorChangedPR answer counts as Bug everywhere
 * (not a false alarm, score +1, grouped under Bug in TPProb). Bug-set catches take their truth from the match:
 * a matched test scores +1, an unmatched one −1. The store is read once per run ID; each run's generation file
 * is read for the analyzer fallback, and its execution file only when the run has a test that passed on both revisions.
 * A missing or unreadable generation file leaves the run out of the fallback count; an unreadable one also writes one stderr line.
 */
export async function BuildGateReport(o: GateReportOptions): Promise<GateReport> {
    const runIDs = [...new Set(o.Ledgers.flatMap((l) => l.Entries.flatMap((e) => (e.RunID === null ? [] : [e.RunID]))))];
    const data = new Map<string, RunData>();
    for (const id of runIDs) data.set(id, await loadRun(id, o.Store, o.RunDirOf));
    const prices = o.Prices ?? DEFAULT_SETTINGS.Prices;
    return { GeneratedAt: new Date().toISOString(), Models: groupByModel(o.Ledgers).map((ls) => modelReportOf(ls, o.Corpus, data, prices)) };
}

async function loadRun(id: string, store: BaseCatchStore, runDirOf: (runID: string) => RunDir): Promise<RunData> {
    const [run, catches, sessions] = await Promise.all([store.GetRun(id), store.ListCatches(id), store.ListSessions(id)]);
    const labeled = await Promise.all(catches.map(async (c) => ({ ...c, Label: LatestLabel(await store.ListFeedback(c.ID)) })));
    return { Run: run, Catches: labeled, Sessions: sessions, Fallback: analyzerFallback(runDirOf(id)) };
}

/** The analysis's fallback flag, or null when the generation file is missing or unreadable (with one stderr line). */
function analyzerFallback(dir: RunDir): boolean | null {
    if (!dir.HasGeneration()) return null;
    try { return dir.ReadGeneration().Analysis.Fallback; } catch {
        process.stderr.write(`report: ${dir.RunID}: generation.json unreadable, skipped\n`);
        return null;
    }
}

/** The answer of the latest feedback by `At`, AuthorChangedPR as Bug; null when there is none. */
export function LatestLabel(feedback: Feedback[]): HumanLabel | null {
    const latest = [...feedback].sort((a, b) => a.At.localeCompare(b.At)).at(-1);
    if (!latest) return null;
    return latest.Answer === 'AuthorChangedPR' ? 'Bug' : latest.Answer;
}

/** Ledgers grouped by Model, in order of first appearance. */
function groupByModel(ledgers: BacktestLedger[]): BacktestLedger[][] {
    const groups = new Map<string, BacktestLedger[]>();
    for (const l of ledgers) groups.set(l.Model, [...(groups.get(l.Model) ?? []), l]);
    return [...groups.values()];
}

/** The report of one model over its ledgers and the loaded run data. The set counts cover only entries whose PR is still in the corpus; the cost covers every attempt. */
function modelReportOf(ledgers: BacktestLedger[], corpus: Corpus, data: Map<string, RunData>, prices: Settings['Prices']): ModelReport {
    const entries = uniqueEntries(ledgers);
    const assessed = entries.filter((e) => e.Status === 'Assessed');
    const runs = assessed.flatMap((e) => runData(e, data));
    const catches = runs.flatMap((r) => r.Catches);
    const bugPRs = corpusPRs(ledgers, corpus, 'Bug');
    const cleanPRs = corpusPRs(ledgers, corpus, 'Clean');
    const bug = bugSetOf(entries.filter((e) => e.Set === 'Bug' && bugPRs.has(e.PR)), bugPRs);
    return {
        Model: ledgers[0].Model, Ledgers: ledgers.map((l) => l.ID), BugSet: bug,
        CleanSet: cleanSetOf(entries.filter((e) => e.Set === 'Clean' && cleanPRs.has(e.PR)), cleanPRs.size, data),
        Cost: costOf(entries, assessed.length, bug.AnyWeakMatched, data, prices),
        Sessions: CountBy(runs.flatMap((r) => r.Sessions.map((s) => s.EndReason))),
        AnalyzerFallbacks: { Fallbacks: runs.filter((r) => r.Fallback === true).length, Runs: runs.filter((r) => r.Fallback !== null).length, NoFile: runs.filter((r) => r.Fallback === null).length },
        Drops: CountBy(catches.flatMap((c) => (c.DroppedByRule === null ? [] : [c.DroppedByRule]))),
        Judges: judgesOf(truthsOf(assessed, data)), TPProb: tpProbOf(catches),
    };
}

/** Entries of all ledgers, one per set and PR; a later ledger's entry wins. */
function uniqueEntries(ledgers: BacktestLedger[]): LedgerEntry[] {
    const byKey = new Map<string, LedgerEntry>();
    for (const e of ledgers.flatMap((l) => l.Entries)) byKey.set(`${e.Set}:${e.PR}`, e);
    return [...byKey.values()];
}

function runData(e: LedgerEntry, data: Map<string, RunData>): RunData[] {
    const d = e.RunID === null ? undefined : data.get(e.RunID);
    return d ? [d] : [];
}

/** Corpus PRs of the set in the slices the ledgers cover for that set. */
function corpusPRs(ledgers: BacktestLedger[], corpus: Corpus, set: 'Bug' | 'Clean'): Set<number> {
    const slices = new Set(ledgers.filter((l) => l.Set === set || l.Set === 'Both').map((l) => l.Slice));
    return new Set(set === 'Bug' ? corpus.Bug.filter((b) => slices.has(b.Slice)).map((b) => b.BugPR) : corpus.Clean.filter((c) => slices.has(c.Slice)).map((c) => c.PR));
}

/** The bug set counts; GateCaught counts only the curated bug PRs `prs`. */
function bugSetOf(entries: LedgerEntry[], prs: Set<number>): ModelReport['BugSet'] {
    const run = entries.filter((e) => e.Status === 'Assessed');
    const matched = run.filter((e) => e.Match !== null);
    const status = (s: string): number => matched.filter((e) => e.Match?.Status === s).length;
    const reportedMatched = matched.filter((e) => e.Match?.ReportedMatched === true);
    return {
        PRs: prs.size, Run: run.length, Failed: entries.filter((e) => e.Status === 'Failed').length,
        Caught: RateOf(reportedMatched.length, matched.length), GateCaught: RateOf(reportedMatched.filter((e) => prs.has(e.PR)).length, prs.size),
        AnyWeakMatched: status('Matched'), MatchedOnFixMerge: matched.filter((e) => e.Match?.Status === 'Matched' && e.Match.Head === 'FixMerge').length,
        NotMatched: status('NotMatched'), NoCatch: status('NoCatch'), ApplyFailed: status('ApplyFailed'), PrepareFailed: status('PrepareFailed'),
        NotYetMatched: run.length - matched.length,
    };
}

function cleanSetOf(entries: LedgerEntry[], prs: number, data: Map<string, RunData>): ModelReport['CleanSet'] {
    const run = entries.filter((e) => e.Status === 'Assessed');
    const reported = run.map((e) => runData(e, data).flatMap((r) => r.Catches).filter((c) => c.Reported)).filter((cs) => cs.length > 0);
    const any = (label: (l: HumanLabel | null) => boolean): number => reported.filter((cs) => cs.some((c) => label(c.Label))).length;
    const pending = any((l) => l === null);
    return {
        PRs: prs, Run: run.length, Failed: entries.filter((e) => e.Status === 'Failed').length, Reported: reported.length,
        Labeled: reported.length - pending, Pending: pending,
        FalseAlarms: RateOf(any((l) => l === 'Intended' || l === 'TestFault'), run.length), RealBugs: any((l) => l === 'Bug'),
    };
}

/** The ledger cost of every entry, and the recorded and table-priced cost of the tokens of each entry's current run, in total and per model. */
function costOf(entries: LedgerEntry[], runPRs: number, matched: number, data: Map<string, RunData>, prices: Settings['Prices']): ModelReport['Cost'] {
    const total = entries.reduce((s, e) => s + e.CostUSD, 0);
    const runIDs = new Set(entries.flatMap((e) => (e.RunID === null ? [] : [e.RunID])));
    const usage = [...runIDs].flatMap((id) => data.get(id)?.Run?.TokensByModel ?? []);
    const unpriced = [...new Set(usage.filter((u) => !prices[u.Model]).map((u) => u.Model))].sort();
    const byModel: ModelReport['Cost']['ByModel'] = {};
    for (const u of usage) {
        const m = byModel[u.Model] ?? { RecordedUSD: 0, TableUSD: 0 };
        byModel[u.Model] = { RecordedUSD: m.RecordedUSD + u.CostUSD, TableUSD: m.TableUSD + TableCostOf(u, prices) };
    }
    return {
        TotalUSD: total, PerPR: runPRs === 0 ? null : total / runPRs, PerMatchedCatch: matched === 0 ? null : total / matched,
        RecordedUSD: usage.reduce((s, u) => s + u.CostUSD, 0), TableUSD: usage.reduce((s, u) => s + TableCostOf(u, prices), 0), ByModel: byModel, UnpricedModels: unpriced,
    };
}

/** Cost of one usage row at the per-1M-token prices, cache reads at the cached-input price; the recorded cost when the model has no price. */
export function TableCostOf(u: TokenUsage, prices: Settings['Prices']): number {
    const p = prices[u.Model];
    if (!p) return u.CostUSD;
    return (u.InputTokens * p.Input + u.OutputTokens * p.Output + u.CacheReadTokens * p.CachedInput) / 1_000_000;
}

/** Catches of run clean PRs with a label, and of run bug PRs whose test the match ran. */
function truthsOf(assessed: LedgerEntry[], data: Map<string, RunData>): Truth[] {
    return assessed.flatMap((e) => runData(e, data).flatMap((r) => (e.Set === 'Clean' ? labelTruths(r.Catches) : matchTruths(r.Catches, e))));
}

function labelTruths(catches: LabeledCatch[]): Truth[] {
    return catches.flatMap((c) => (c.Label === null ? [] : [{ Catch: c, Score: c.Label === 'Bug' ? 1 as const : -1 as const, Intended: c.Label !== 'Bug' }]));
}

function matchTruths(catches: LabeledCatch[], e: LedgerEntry): Truth[] {
    const tests = new UUIDMap(Object.entries(e.Match?.Tests ?? {}));
    return catches.flatMap((c) => {
        const matched = tests.Get(c.CandidateTestID);
        return matched === undefined ? [] : [{ Catch: c, Score: matched ? 1 as const : -1 as const, Intended: false }];
    });
}

/**
 * Per bucket judge: agreement of its score with the truth, and its High buckets on Intended or TestFault labels
 * and Low buckets on bugs. Scores are shifted by +1 to the categories 0..2 that the kappa needs; errored judges
 * (null bucket) are left out of that catch's pair.
 */
function judgesOf(truths: Truth[]): ModelReport['Judges'] {
    const models = [...new Set(truths.flatMap((t) => t.Catch.JudgeBuckets.map((b) => b.Model)))].sort();
    return models.map((model) => {
        const rated = truths.flatMap((t) => {
            const b = t.Catch.JudgeBuckets.find((j) => j.Model === model)?.Bucket ?? null;
            return b === null ? [] : [{ Truth: t, Bucket: b }];
        });
        return {
            Model: model, Agreement: GetAgreement(rated.map((r) => [r.Truth.Score + 1, BUCKET_SCORE[r.Bucket] + 1])),
            HighOnIntended: rated.filter((r) => r.Bucket === 'High' && r.Truth.Intended).length,
            LowOnBug: rated.filter((r) => r.Bucket === 'Low' && r.Truth.Score === 1).length,
        };
    });
}

function tpProbOf(catches: LabeledCatch[]): ModelReport['TPProb'] {
    const of = (label: HumanLabel): { N: number; Mean: number | null } => {
        const values = catches.flatMap((c) => (c.Label === label && c.TPProb !== null ? [c.TPProb] : []));
        return { N: values.length, Mean: MeanOf(values) };
    };
    return { Bug: of('Bug'), Intended: of('Intended'), TestFault: of('TestFault') };
}

/** The report as Markdown: a header, then one section per model with each rate followed by its 95% interval. */
export function RenderMarkdown(r: GateReport): string {
    return [`# Gate-1 report`, '', `Generated ${r.GeneratedAt}.`, '', ...r.Models.flatMap(renderModel)].join('\n') + '\n';
}

function renderModel(m: ModelReport): string[] {
    const b = m.BugSet; const c = m.CleanSet;
    return [
        `## ${MarkdownText(m.Model)}`, '', `Ledgers: ${m.Ledgers.map(MarkdownText).join(', ')}`, '',
        `### Bug set`, '', `- ${prLine(b)}`, `- Caught (reported and matched, of run PRs with a match result): ${rate(b.Caught)}`,
        `- Gate caught (reported and matched, of every curated bug PR): ${rate(b.GateCaught)}`, ...(b.PRs > 0 ? [`- ${gateInputs(b)}`] : []),
        `- Any weak catch matched: ${b.AnyWeakMatched} (${b.MatchedOnFixMerge} on the fix merge); not matched: ${b.NotMatched}; no catch: ${b.NoCatch}; fix did not apply: ${b.ApplyFailed}; fix did not prepare: ${b.PrepareFailed}`,
        ...(b.NotYetMatched > 0 ? [`- Warning: ${b.NotYetMatched} run PR${b.NotYetMatched === 1 ? ' has' : 's have'} no match result yet; run \`backtest match\` and report again`] : []), '',
        `### Clean set`, '', `- ${prLine(c)}`, `- With a reported catch: ${c.Reported}; labeled ${c.Labeled}; pending ${c.Pending}`,
        `- False alarms (Intended or TestFault): ${rate(c.FalseAlarms)}`, `- Real bugs found: ${c.RealBugs}`, '',
        ...renderCost(m), ...renderSessions(m), ...renderCounts('Drop rules', m.Drops), ...renderJudges(m), '',
    ];
}

/** PRs in the corpus slices, run, failed, and not run (neither run nor failed). */
function prLine(s: { PRs: number; Run: number; Failed: number }): string {
    return `PRs: ${s.PRs}; run ${s.Run}; failed ${s.Failed}; not run ${notRun(s)}`;
}

function notRun(s: { PRs: number; Run: number; Failed: number }): number { return Math.max(0, s.PRs - s.Run - s.Failed); }

/** What keeps the gate value from being final: failed, not run, not yet matched, apply-failed and prepare-failed bug PRs; "gate inputs complete" when there are none. Rendered when the slices hold a bug PR. */
function gateInputs(b: ModelReport['BugSet']): string {
    const counts = [b.Failed, notRun(b), b.NotYetMatched, b.ApplyFailed, b.PrepareFailed];
    if (counts.every((n) => n === 0)) return 'gate inputs complete';
    return `gate blocked: ${counts[0]} failed, ${counts[1]} not run, ${counts[2]} not yet matched, ${counts[3]} apply failed, ${counts[4]} prepare failed (needs a person)`;
}

function renderCost(m: ModelReport): string[] {
    const k = m.Cost;
    const models = Object.entries(k.ByModel).sort(([a], [b]) => a.localeCompare(b)).map(([model, c]) => `- ${MarkdownText(model)}: recorded ${usd(c.RecordedUSD)}; at table prices ${usd(c.TableUSD)}`);
    return [`### Cost`, '', `- Total, every attempt: ${usd(k.TotalUSD)}; current runs recorded ${usd(k.RecordedUSD)}, at table prices ${usd(k.TableUSD)}`, ...models,
        `- Per run PR: ${k.PerPR === null ? 'n/a' : usd(k.PerPR)}; per matched bug PR: ${k.PerMatchedCatch === null ? 'n/a' : usd(k.PerMatchedCatch)}`,
        ...(k.UnpricedModels.length > 0 ? [`- Unpriced models: ${k.UnpricedModels.map(MarkdownText).join(', ')} (recorded cost used at table prices)`] : []), ''];
}

/** Text on one Markdown line: CR and LF become spaces, and a leading heading, list, quote or ordered-list marker is escaped. */
export function MarkdownText(text: string): string {
    return text.replace(/[\r\n]/g, ' ').replace(/^([#>*+-]|\d+[.)])/, '\\$1');
}

function renderSessions(m: ModelReport): string[] {
    const f = m.AnalyzerFallbacks;
    const noFile = f.NoFile > 0 ? `; ${f.NoFile} runs have no generation file` : '';
    return renderCounts('Session end reasons', m.Sessions, [`- Analyzer fallbacks (no risk notes): ${f.Fallbacks} of ${f.Runs} runs with a generation file${noFile}`]);
}

/** A count section; `extra` lines follow the count rows. */
function renderCounts(title: string, counts: Record<string, number>, extra: string[] = []): string[] {
    const rows = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `- ${MarkdownText(k)}: ${n}`);
    return [`### ${title}`, '', ...(rows.length > 0 ? rows : ['- none']), ...extra, ''];
}

function renderJudges(m: ModelReport): string[] {
    const judges = m.Judges.map((j) => `- ${MarkdownText(j.Model)}: ${agreement(j.Agreement)}; High on Intended/TestFault ${j.HighOnIntended}; Low on bugs ${j.LowOnBug}`);
    const tp = (['Bug', 'Intended', 'TestFault'] as const).map((l) => `- TPProb on ${l}: n=${m.TPProb[l].N}, mean ${m.TPProb[l].Mean === null ? 'n/a' : m.TPProb[l].Mean.toFixed(2)}`);
    return [`### Judge calibration`, '', ...(judges.length > 0 ? judges : ['- no judged catch with a known truth']), ...tp];
}

function agreement(a: AgreementResult): string {
    if (a.Withheld) return `agreement withheld (n=${a.SampleSize} < ${a.MinimumSample})`;
    const kappa = a.Kappa === null || a.Kappa === undefined ? 'n/a' : a.Kappa.toFixed(2);
    return `kappa ${kappa}, alpha ${a.Alpha === undefined ? 'n/a' : a.Alpha.toFixed(2)} (n=${a.SampleSize})`;
}

function rate(r: RateWithInterval): string {
    if (r.Rate === null) return `${r.K}/${r.N} = n/a`;
    return `${r.K}/${r.N} = ${pct(r.Rate)} (95% CI ${pct(r.Low)}–${pct(r.High)})`;
}
function pct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function usd(v: number): string { return `$${v.toFixed(2)}`; }
