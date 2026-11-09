import type { Settings } from '../settings';
import type { BaseCatchStore } from '../contracts/BaseCatchStore';
import { GitRepo } from '../git/GitRepo';
import { FileCatchStore } from '../store/FileCatchStore';
import { RedactTail, type RedactionCheck } from '../sandbox/Redaction';
import { DefaultRedaction } from '../pipeline/Deps';
import { RunAll } from '../pipeline/Run';
import { LoadCorpus, RevisionsOf, type Slice } from '../corpus/Corpus';
import { LedgerFile, LedgerID, type BacktestLedger, type LedgerEntry } from './Ledger';

/** The pipeline, the repository, the store and the redaction check, injected so tests run no git, container or provider. */
export interface BacktestDeps { RunAll: typeof RunAll; Repo: Pick<GitRepo, 'FirstParent' | 'Fetch'>; Store: Pick<BaseCatchStore, 'GetRun'>; Redaction: RedactionCheck; }

/** One backtest call: the corpus slice and set, the generator model, the spending limit in USD and, optionally, the only PRs to run. */
export interface BacktestOptions {
    CorpusPath: string; Slice: Slice; Set: 'Bug' | 'Clean' | 'Both'; Model: string; MaxUsd: number; Only?: number[];
    RepoRoot: string; Settings: Settings; StoreDir: string; Deps?: BacktestDeps;
}

/**
 * Creates or resumes the ledger; runs each Pending entry serially with Settings.GeneratorModel = Model and Trigger 'Backtest';
 * records cost from the stored run; stops with a message when the ledger's cost reaches MaxUsd. Returns the ledger.
 */
export async function BacktestStep(o: BacktestOptions): Promise<BacktestLedger> {
    const deps = o.Deps ?? defaultDeps(o);
    await deps.Repo.Fetch('next');
    const file = new LedgerFile(o.RepoRoot, LedgerID(o.CorpusPath, o.Slice, o.Set, o.Model), deps.Redaction);
    const ledger = file.Exists() ? file.Read() : await createLedger(o, deps);
    file.Write(ledger);
    for (const entry of pendingEntries(ledger, o.Only)) {
        if (stopForSpend(ledger, o.MaxUsd)) break;
        await runOne(entry, o, deps);
        file.Write(ledger);
        report(ledger, entry);
    }
    return ledger;
}

function defaultDeps(o: BacktestOptions): BacktestDeps {
    const redaction = DefaultRedaction();
    return { RunAll, Repo: new GitRepo(o.RepoRoot), Store: new FileCatchStore(o.StoreDir, redaction), Redaction: redaction };
}

/** A new ledger with one Pending entry per corpus PR of the slice and set: bug PRs first, then clean PRs, in corpus order. */
async function createLedger(o: BacktestOptions, deps: BacktestDeps): Promise<BacktestLedger> {
    const corpus = LoadCorpus(o.CorpusPath);
    const prs: { PR: number; Set: 'Bug' | 'Clean'; MergeSHA: string }[] = [
        ...(o.Set === 'Clean' ? [] : corpus.Bug.filter((b) => b.Slice === o.Slice).map((b) => ({ PR: b.BugPR, Set: 'Bug' as const, MergeSHA: b.BugMergeSHA }))),
        ...(o.Set === 'Bug' ? [] : corpus.Clean.filter((c) => c.Slice === o.Slice).map((c) => ({ PR: c.PR, Set: 'Clean' as const, MergeSHA: c.MergeSHA }))),
    ];
    const entries: LedgerEntry[] = [];
    for (const p of prs) {
        const { BaseSHA, HeadSHA } = await RevisionsOf(p.MergeSHA, deps.Repo);
        entries.push({ PR: p.PR, Set: p.Set, BaseSHA, HeadSHA, RunID: null, Status: 'Pending', Error: null, CostUSD: 0, StartedAt: null, EndedAt: null, Match: null });
    }
    return { ID: LedgerID(o.CorpusPath, o.Slice, o.Set, o.Model), CorpusPath: o.CorpusPath, Slice: o.Slice, Set: o.Set, Model: o.Model, CreatedAt: new Date().toISOString(), Entries: entries };
}

/** The Pending entries, limited to the PRs in `only` when it is given. */
function pendingEntries(ledger: BacktestLedger, only: number[] | undefined): LedgerEntry[] {
    return ledger.Entries.filter((e) => e.Status === 'Pending' && (!only || only.includes(e.PR)));
}

function totalCost(ledger: BacktestLedger): number { return ledger.Entries.reduce((s, e) => s + e.CostUSD, 0); }

/** True, after printing why, when the ledger's cost has reached `maxUsd`. */
function stopForSpend(ledger: BacktestLedger, maxUsd: number): boolean {
    const total = totalCost(ledger);
    if (total < maxUsd) return false;
    process.stdout.write(`backtest ${ledger.ID}: stopped, ${total.toFixed(2)} USD reached --max-usd ${maxUsd}\n`);
    return true;
}

/** Runs the pipeline for one entry and records its run, status, cost and times on the entry. */
async function runOne(entry: LedgerEntry, o: BacktestOptions, deps: BacktestDeps): Promise<void> {
    entry.StartedAt = new Date().toISOString();
    try {
        const { RunID } = await deps.RunAll({
            PR: entry.PR, BaseSHA: entry.BaseSHA, HeadSHA: entry.HeadSHA, Trigger: 'Backtest',
            RepoRoot: o.RepoRoot, Settings: { ...o.Settings, GeneratorModel: o.Model }, StoreDir: o.StoreDir,
        });
        entry.RunID = RunID;
        entry.CostUSD = (await deps.Store.GetRun(RunID))?.TokensByModel.reduce((s, u) => s + u.CostUSD, 0) ?? 0;
        entry.Status = 'Assessed';
    } catch (e) {
        entry.Status = 'Failed';
        entry.Error = errorLine(e, deps.Redaction);
    }
    entry.EndedAt = new Date().toISOString();
}

/** The first non-empty line of the error with this process's secrets replaced; withheld when it still holds a secret. */
function errorLine(e: unknown, redaction: RedactionCheck): string {
    const message = e instanceof Error ? e.message : String(e);
    const line = RedactTail(message.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? 'failed');
    const match = redaction.Check(line);
    return match ? `[error withheld: ${match.Kind}]` : line;
}

function report(ledger: BacktestLedger, entry: LedgerEntry): void {
    const outcome = entry.Status === 'Failed' ? `failed: ${entry.Error}` : `run ${entry.RunID}`;
    process.stdout.write(`backtest ${ledger.ID}: PR #${entry.PR} → ${outcome} (${entry.CostUSD.toFixed(2)} USD, total ${totalCost(ledger).toFixed(2)})\n`);
}
