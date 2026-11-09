import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Settings } from '../settings';
import type { BaseCatchStore } from '../contracts/BaseCatchStore';
import type { Run, TokenUsage } from '../types';
import { GitRepo } from '../git/GitRepo';
import { FileCatchStore } from '../store/FileCatchStore';
import { RedactTail, type RedactionCheck } from '../sandbox/Redaction';
import { DefaultRedaction } from '../pipeline/Deps';
import { RunAll, RunAllError } from '../pipeline/Run';
import { IsValidRunID, RunDir } from '../pipeline/RunDir';
import { LoadCorpus, RevisionsOf, type Corpus, type Slice } from '../corpus/Corpus';
import { LedgerFile, LedgerID, type BacktestLedger, type LedgerEntry } from './Ledger';

/** The run stops after this many Failed entries in a row, so an outage does not mark the whole corpus Failed. */
const MAX_FAILED_IN_ROW = 3;

/** The pipeline, the repository, the cost lookup and the redaction check, injected so tests run no git, container or provider. */
export interface BacktestDeps {
    RunAll: typeof RunAll;
    Repo: Pick<GitRepo, 'FirstParent' | 'Fetch'>;
    /** The USD cost recorded for a run; null when neither the store nor the run folder has the run. */
    CostOfRun: (runID: string) => Promise<number | null>;
    /** The Backtest runs of `pr` on `headSHA` that started at or after `since` and whose IDs are not in `knownRunIDs`, with their recorded cost. */
    OrphanRunCost: (pr: number, headSHA: string, knownRunIDs: Set<string>, since: string) => Promise<OrphanRun[]>;
    Redaction: RedactionCheck;
}

/**
 * One backtest call: the corpus slice and set, the generator model, the spending cap in USD and, optionally, the only PRs to run.
 * `RetryFailed` sets the Failed entries (within `Only`) back to Pending before the run; an entry's cost accumulates across attempts.
 */
export interface BacktestOptions {
    CorpusPath: string; Slice: Slice; Set: 'Bug' | 'Clean' | 'Both'; Model: string; MaxUsd: number; Only?: number[]; RetryFailed?: boolean;
    RepoRoot: string; Settings: Settings; StoreDir: string; Deps?: BacktestDeps;
}

/** A run the ledger does not name and the USD cost its generation file records. */
export interface OrphanRun { RunID: string; CostUSD: number; }

/** A corpus PR selected for the backtest and its landing commit. */
interface SelectedPR { PR: number; Set: 'Bug' | 'Clean'; MergeSHA: string; }

/**
 * Creates or resumes the ledger; runs each Pending entry serially with Settings.GeneratorModel = Model and Trigger 'Backtest';
 * records each run's cost from the injected cost lookup; stops with a message when the ledger's cost reaches MaxUsd. Returns the ledger.
 *
 * Resume: refuses a ledger made for another corpus path, model, slice or set. Appends a Pending entry for each corpus PR of the
 * slice and set that the ledger lacks; entries whose PR left the slice stay as recorded and are named on stderr. A Pending entry
 * with a StartedAt was cut off mid-run: the cost of its orphan runs is added to it and it is run again.
 * Each entry is written with its StartedAt before its run starts.
 * The cap counts the cost of the whole ledger, including every attempt of a retried entry, and is checked before each run, so the last run can take the total above it.
 * The run stops after 3 Failed entries in a row and leaves the rest Pending.
 */
export async function BacktestStep(o: BacktestOptions): Promise<BacktestLedger> {
    const deps = o.Deps ?? defaultDeps(o);
    await deps.Repo.Fetch('next');
    const file = new LedgerFile(o.RepoRoot, LedgerID(o.CorpusPath, o.Slice, o.Set, o.Model), deps.Redaction);
    const selected = selectedPRs(LoadCorpus(o.CorpusPath), o);
    const ledger = file.Exists() ? await resumeLedger(file.Read(), selected, o, deps) : await createLedger(selected, o, deps);
    await recoverOrphans(ledger, deps);
    if (o.RetryFailed) retryFailed(ledger, o.Only);
    reportSkipped(ledger, o.Only);
    file.Write(ledger);
    await runPending(ledger, file, o, deps);
    return ledger;
}

/** The cost of a run from the store, else from the run folder's generation file, else null. */
export function DefaultCostOfRun(store: Pick<BaseCatchStore, 'GetRun'>, repoRoot: string, redaction: RedactionCheck): (runID: string) => Promise<number | null> {
    return async (runID) => {
        const run = await store.GetRun(runID);
        if (run) return sumCost(run.TokensByModel);
        const dir = new RunDir(repoRoot, runID, redaction);
        return existsSync(join(dir.Path, 'generation.json')) ? sumCost(dir.ReadGeneration().Run.TokensByModel) : null;
    };
}

/** Finds orphan runs in the generation file of each folder under `<repo root>/.jit-catch/runs`; a folder without a readable generation file is skipped. */
export function DefaultOrphanRunCost(repoRoot: string, redaction: RedactionCheck): BacktestDeps['OrphanRunCost'] {
    return async (pr, headSHA, knownRunIDs, since) => {
        const runs = join(repoRoot, '.jit-catch', 'runs');
        if (!existsSync(runs)) return [];
        const out: OrphanRun[] = [];
        for (const id of readdirSync(runs).filter((n) => IsValidRunID(n) && !knownRunIDs.has(n)).sort()) {
            const run = readRun(new RunDir(repoRoot, id, redaction));
            if (run && run.Trigger === 'Backtest' && run.PRNumber === pr && run.HeadSHA === headSHA && run.StartedAt >= since) out.push({ RunID: id, CostUSD: sumCost(run.TokensByModel) });
        }
        return out;
    };
}

/** The run recorded in the folder's generation file, or null when it has none or it does not parse. */
function readRun(dir: RunDir): Run | null {
    if (!existsSync(join(dir.Path, 'generation.json'))) return null;
    try { return dir.ReadGeneration().Run; } catch { return null; }
}

function defaultDeps(o: BacktestOptions): BacktestDeps {
    const redaction = DefaultRedaction();
    return {
        RunAll, Repo: new GitRepo(o.RepoRoot), CostOfRun: DefaultCostOfRun(new FileCatchStore(o.StoreDir, redaction), o.RepoRoot, redaction),
        OrphanRunCost: DefaultOrphanRunCost(o.RepoRoot, redaction), Redaction: redaction,
    };
}

function sumCost(tokens: TokenUsage[]): number { return tokens.reduce((s, u) => s + u.CostUSD, 0); }

/** The corpus PRs of the slice and set: bug PRs first, then clean PRs, in corpus order. */
function selectedPRs(corpus: Corpus, o: BacktestOptions): SelectedPR[] {
    return [
        ...(o.Set === 'Clean' ? [] : corpus.Bug.filter((b) => b.Slice === o.Slice).map((b) => ({ PR: b.BugPR, Set: 'Bug' as const, MergeSHA: b.BugMergeSHA }))),
        ...(o.Set === 'Bug' ? [] : corpus.Clean.filter((c) => c.Slice === o.Slice).map((c) => ({ PR: c.PR, Set: 'Clean' as const, MergeSHA: c.MergeSHA }))),
    ];
}

/** A Pending entry on the PR's landing commit and its first parent. */
async function pendingEntry(p: SelectedPR, repo: BacktestDeps['Repo']): Promise<LedgerEntry> {
    let revisions: { BaseSHA: string; HeadSHA: string };
    try { revisions = await RevisionsOf(p.MergeSHA, repo); }
    catch (e) { throw new Error(`PR #${p.PR}: cannot find the first parent of ${p.MergeSHA}: ${firstLine(e)}`, { cause: e }); }
    return { PR: p.PR, Set: p.Set, ...revisions, RunID: null, Status: 'Pending', Error: null, CostUSD: 0, StartedAt: null, EndedAt: null, Match: null };
}

async function pendingEntries(prs: SelectedPR[], repo: BacktestDeps['Repo']): Promise<LedgerEntry[]> {
    const entries: LedgerEntry[] = [];
    for (const p of prs) entries.push(await pendingEntry(p, repo));
    return entries;
}

async function createLedger(selected: SelectedPR[], o: BacktestOptions, deps: BacktestDeps): Promise<BacktestLedger> {
    return {
        ID: LedgerID(o.CorpusPath, o.Slice, o.Set, o.Model), CorpusPath: resolve(o.CorpusPath), Slice: o.Slice, Set: o.Set, Model: o.Model,
        CreatedAt: new Date().toISOString(), Entries: await pendingEntries(selected, deps.Repo),
    };
}

/** Checks the ledger matches the options, appends the selected PRs it lacks and names the entries that are no longer selected. */
async function resumeLedger(ledger: BacktestLedger, selected: SelectedPR[], o: BacktestOptions, deps: BacktestDeps): Promise<BacktestLedger> {
    const mismatches = [
        resolve(ledger.CorpusPath) !== resolve(o.CorpusPath) ? `CorpusPath ${ledger.CorpusPath}` : null,
        ledger.Model !== o.Model ? `Model ${ledger.Model}` : null,
        ledger.Slice !== o.Slice ? `Slice ${ledger.Slice}` : null,
        ledger.Set !== o.Set ? `Set ${ledger.Set}` : null,
    ].filter((m) => m !== null);
    if (mismatches.length > 0) throw new Error(`backtest ledger ${ledger.ID} was made for ${mismatches.join(', ')}; it is not resumed with other options`);
    const known = new Set(ledger.Entries.map((e) => e.PR));
    ledger.Entries.push(...await pendingEntries(selected.filter((p) => !known.has(p.PR)), deps.Repo));
    const chosen = new Set(selected.map((p) => p.PR));
    const gone = ledger.Entries.filter((e) => !chosen.has(e.PR)).map((e) => `#${e.PR}`);
    if (gone.length > 0) process.stderr.write(`backtest ${ledger.ID}: PRs no longer in the ${o.Slice} ${o.Set} corpus stay as recorded: ${gone.join(', ')}\n`);
    return ledger;
}

/**
 * For each Pending entry with a StartedAt: adds the cost of its orphan runs, with one stderr line per run, and clears StartedAt,
 * so the entry runs again and the same orphan is not counted twice.
 */
async function recoverOrphans(ledger: BacktestLedger, deps: BacktestDeps): Promise<void> {
    const known = new Set(ledger.Entries.map((e) => e.RunID).filter((id): id is string => id !== null));
    for (const e of ledger.Entries) {
        if (e.Status !== 'Pending' || e.StartedAt === null) continue;
        for (const orphan of await deps.OrphanRunCost(e.PR, e.HeadSHA, known, e.StartedAt)) {
            e.CostUSD += orphan.CostUSD;
            process.stderr.write(`backtest ${ledger.ID}: PR #${e.PR}: recovered ${orphan.CostUSD.toFixed(2)} USD of run ${orphan.RunID}, cut off before it was recorded\n`);
        }
        e.StartedAt = null;
    }
}

/** Sets the Failed entries (within `only`) back to Pending with no run, error, match or times; the recorded cost stays. */
function retryFailed(ledger: BacktestLedger, only: number[] | undefined): void {
    for (const e of ledger.Entries) {
        if (e.Status !== 'Failed' || (only && !only.includes(e.PR))) continue;
        Object.assign(e, { Status: 'Pending', RunID: null, Error: null, Match: null, StartedAt: null, EndedAt: null });
    }
}

/** Prints one line for each `only` PR that will not run. */
function reportSkipped(ledger: BacktestLedger, only: number[] | undefined): void {
    for (const pr of only ?? []) {
        const e = ledger.Entries.find((x) => x.PR === pr);
        const why = !e ? 'not in the ledger' : e.Status === 'Failed' ? 'Failed (--retry-failed runs it again)' : e.Status === 'Assessed' ? 'Assessed' : null;
        if (why) process.stdout.write(`backtest ${ledger.ID}: PR #${pr} skipped: ${why}\n`);
    }
}

/** Runs the Pending entries (within `Only`) one at a time, writing the ledger after each, until the cap or the failure limit stops it. */
async function runPending(ledger: BacktestLedger, file: LedgerFile, o: BacktestOptions, deps: BacktestDeps): Promise<void> {
    let failedInRow = 0;
    for (const entry of ledger.Entries.filter((e) => e.Status === 'Pending' && (!o.Only || o.Only.includes(e.PR)))) {
        if (failedInRow >= MAX_FAILED_IN_ROW) {
            process.stderr.write(`backtest ${ledger.ID}: stopped after ${MAX_FAILED_IN_ROW} failed runs in a row; the rest stay Pending\n`);
            return;
        }
        if (stopForSpend(ledger, o.MaxUsd)) return;
        entry.StartedAt = new Date().toISOString();
        file.Write(ledger);
        await runOne(entry, o, deps);
        file.Write(ledger);
        report(ledger, entry);
        failedInRow = entry.Status === 'Failed' ? failedInRow + 1 : 0;
    }
}

function totalCost(ledger: BacktestLedger): number { return ledger.Entries.reduce((s, e) => s + e.CostUSD, 0); }

/** True, after printing why, when the ledger's cost has reached `maxUsd`. */
function stopForSpend(ledger: BacktestLedger, maxUsd: number): boolean {
    const total = totalCost(ledger);
    if (total < maxUsd) return false;
    process.stdout.write(`backtest ${ledger.ID}: stopped, ${total.toFixed(2)} USD reached --max-usd ${maxUsd}\n`);
    return true;
}

/**
 * Runs the pipeline for one entry and records its run, status and end time, and adds the run's cost to the entry's. A run that failed
 * after it had an ID keeps its run ID and cost; when neither the store nor the run folder has its cost, the usage the error carries is the cost.
 */
async function runOne(entry: LedgerEntry, o: BacktestOptions, deps: BacktestDeps): Promise<void> {
    let runID: string | null = null;
    let usage: TokenUsage[] = [];
    try {
        runID = (await deps.RunAll({
            PR: entry.PR, BaseSHA: entry.BaseSHA, HeadSHA: entry.HeadSHA, Trigger: 'Backtest',
            RepoRoot: o.RepoRoot, Settings: { ...o.Settings, GeneratorModel: o.Model }, StoreDir: o.StoreDir,
        })).RunID;
        entry.Status = 'Assessed';
    } catch (e) {
        if (e instanceof RunAllError) { runID = e.RunID; usage = e.Usage ?? []; }
        entry.Status = 'Failed';
        entry.Error = errorLine(e instanceof RunAllError ? e.cause : e, deps.Redaction);
    }
    entry.RunID = runID;
    entry.CostUSD += runID ? (await costOf(runID, deps)) ?? sumCost(usage) : 0;
    entry.EndedAt = new Date().toISOString();
}

/** The run's cost, null when it has none recorded; 0, with one stderr line, when the lookup fails. */
async function costOf(runID: string, deps: BacktestDeps): Promise<number | null> {
    try { return await deps.CostOfRun(runID); }
    catch (e) {
        process.stderr.write(`backtest: cost of run ${runID} unknown, recorded as 0: ${errorLine(e, deps.Redaction)}\n`);
        return 0;
    }
}

/** The first non-empty line of the error with this process's secrets replaced. */
function firstLine(e: unknown): string {
    const message = e instanceof Error ? e.message : String(e);
    return RedactTail(message.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? 'failed');
}

/** `firstLine`, withheld when it still holds a secret the redaction check knows. */
function errorLine(e: unknown, redaction: RedactionCheck): string {
    const line = firstLine(e);
    const match = redaction.Check(line);
    return match ? `[error withheld: ${match.Kind}]` : line;
}

function report(ledger: BacktestLedger, entry: LedgerEntry): void {
    const outcome = entry.Status === 'Failed' ? `failed: ${entry.Error}` : `run ${entry.RunID}`;
    process.stdout.write(`backtest ${ledger.ID}: PR #${entry.PR} → ${outcome} (${entry.CostUSD.toFixed(2)} USD, total ${totalCost(ledger).toFixed(2)})\n`);
}
