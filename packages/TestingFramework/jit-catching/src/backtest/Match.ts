import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GroupByUUID, IndexByUUID, UUIDSet } from '@memberjunction/global';
import type { Settings } from '../settings';
import type { BaseCatchStore } from '../contracts/BaseCatchStore';
import type { GitRepo } from '../git/GitRepo';
import { InfrastructureError, type VitestCatchTarget } from '../target/VitestCatchTarget';
import type { RedactionCheck } from '../sandbox/Redaction';
import type { CandidateTest, Catch, ExecutionResult, PreparedRevision } from '../types';
import { FileCatchStore } from '../store/FileCatchStore';
import { DefaultRedaction, DefaultRunTarget } from '../pipeline/Deps';
import { IsWeakUndropped } from '../pipeline/Label';
import { RunDir } from '../pipeline/RunDir';
import { LoadCorpus, type Corpus } from '../corpus/Corpus';
import { ErrorLine } from './ErrorText';
import { LedgerFile, type BacktestLedger, type LedgerEntry, type MatchRecord } from './Ledger';

/** The target methods the match check calls. */
export type MatchTarget = Pick<VitestCatchTarget, 'Prepare' | 'BuildPackages' | 'WriteTests' | 'Run' | 'Cleanup'>;

/** The target, repository, store and redaction check, injected so tests run no git, container or store on disk. */
export interface MatchDeps {
    Target: MatchTarget;
    Repo: Pick<GitRepo, 'Diff' | 'FirstParent' | 'CommitWithPatch'>;
    Store: Pick<BaseCatchStore, 'ListCatches'>;
    Redaction: RedactionCheck;
    /** Builds the sandbox image; called before head is prepared when given. */
    EnsureImage?: () => Promise<void>;
    /** Removes the pnpm store and fetch folders of the target; called after head is cleaned up when given. */
    RemoveStore?: () => Promise<void>;
}

export interface MatchOptions { LedgerID: string; CorpusPath: string; RepoRoot: string; Settings: Settings; StoreDir: string; Deps?: MatchDeps; }

/**
 * For every Bug entry that is Assessed and has no Match: the weak, non-dropped catches of its run; none → NoCatch.
 * Else commits head plus the fix PR's diff with the host git in a scratch worktree under `<run dir>/match/work`
 * (ApplyFailed when it does not apply), then prepares that commit in the sandbox (Head 'Patched'). When that prepare
 * throws an InfrastructureError, it prepares the fix PR's merge commit instead (Head 'FixMerge'); when that throws one too,
 * the entry is PrepareFailed with the error and the step goes on. On the prepared head it builds the tested packages,
 * writes and runs those tests Settings.Repeats times; a test that passes every time matches. Host git never runs in the prepared worktree. ReportedMatched is true
 * when a Reported catch matched. The ledger is written after every entry; any other error from the target cleans head up (when prepared), removes the store and ends the step.
 */
export async function MatchStep(o: MatchOptions): Promise<BacktestLedger> {
    const redaction = o.Deps?.Redaction ?? DefaultRedaction();
    const file = new LedgerFile(o.RepoRoot, o.LedgerID, redaction);
    if (!file.Exists()) throw new Error(`no backtest ledger ${o.LedgerID} at ${file.Path}`);
    const ledger = file.Read();
    const fixes = fixMergeSHAs(LoadCorpus(o.CorpusPath));
    reportNotAssessed(ledger);
    for (const entry of ledger.Entries.filter(isToMatch)) {
        const fix = fixes.get(entry.PR);
        if (!fix) { process.stderr.write(`match ${ledger.ID}: PR #${entry.PR} has no bug pair in ${o.CorpusPath}; skipped\n`); continue; }
        entry.Match = await matchOne(entry, fix, o, o.Deps ?? defaultDeps(o, entry, redaction));
        file.Write(ledger);
        process.stdout.write(`match ${ledger.ID}: PR #${entry.PR} → ${entry.Match.Status}${entry.Match.ReportedMatched ? ' (reported catch matched)' : ''}\n`);
    }
    return ledger;
}

/** The real target of one entry, with worktrees and a pnpm store under `<run dir>/match`. */
function defaultDeps(o: MatchOptions, entry: LedgerEntry, redaction: RedactionCheck): MatchDeps {
    const dir = new RunDir(o.RepoRoot, entry.RunID ?? '', redaction);
    const rt = DefaultRunTarget(o.RepoRoot, join(dir.Path, 'match'), o.Settings);
    return { Target: rt.Target, Repo: rt.Repo, Store: new FileCatchStore(o.StoreDir, redaction), Redaction: redaction, EnsureImage: rt.EnsureImage, RemoveStore: () => rt.Target.RemoveStore() };
}

/** Bug PR → the merge SHA of the PR that fixed it. */
function fixMergeSHAs(corpus: Corpus): Map<number, string> { return new Map(corpus.Bug.map((b) => [b.BugPR, b.FixMergeSHA])); }

function isToMatch(e: LedgerEntry): boolean { return e.Set === 'Bug' && e.Status === 'Assessed' && e.Match === null && e.RunID !== null; }

/** One stderr line naming the unmatched Bug entries that are not Assessed. */
function reportNotAssessed(ledger: BacktestLedger): void {
    const prs = ledger.Entries.filter((e) => e.Set === 'Bug' && e.Match === null && e.Status !== 'Assessed').map((e) => `#${e.PR}`);
    if (prs.length > 0) process.stderr.write(`match ${ledger.ID}: skipped, not Assessed: ${prs.join(', ')}\n`);
}

/** The match record of one entry: NoCatch, or the outcome of its catches' tests on head plus the fix. */
async function matchOne(entry: LedgerEntry, fixSHA: string, o: MatchOptions, deps: MatchDeps): Promise<MatchRecord> {
    const runID = entry.RunID ?? '';
    const catches = (await deps.Store.ListCatches(runID)).filter(IsWeakUndropped);
    const tests = catches.length > 0 ? testsOf(catches, new RunDir(o.RepoRoot, runID, deps.Redaction)) : [];
    if (tests.length === 0) return record('NoCatch');
    const fixed = await fixedCommit(entry.HeadSHA, fixSHA, new RunDir(o.RepoRoot, runID, deps.Redaction), deps.Repo);
    if (fixed === null) return record('ApplyFailed');
    await deps.EnsureImage?.();
    let head: PreparedRevision | null = null;
    try {
        const prepared = await prepareHead(entry.PR, fixed, fixSHA, o.LedgerID, deps);
        if ('Error' in prepared) return record('PrepareFailed', {}, false, { Head: 'FixMerge', Error: prepared.Error });
        head = prepared.Revision;
        return { ...await runOnFixedHead(deps.Target, head, tests, catches, o.Settings.Repeats), Head: prepared.Head };
    } finally {
        if (head) await deps.Target.Cleanup(head);
        await deps.RemoveStore?.();
    }
}

/** A prepared head and which head it is, or the error text when neither head prepares. */
type HeadOutcome = { Revision: PreparedRevision; Head: NonNullable<MatchRecord['Head']> } | { Error: string };

/**
 * Prepares the patched head `fixed`; on an InfrastructureError names it on stderr and prepares the fix merge `fixSHA`.
 * Returns the error text when the fix merge throws an InfrastructureError too; any other error is rethrown.
 */
async function prepareHead(pr: number, fixed: string, fixSHA: string, ledgerID: string, deps: MatchDeps): Promise<HeadOutcome> {
    try { return { Revision: await deps.Target.Prepare({ Kind: 'Head', SHA: fixed }), Head: 'Patched' }; }
    catch (e) {
        if (!(e instanceof InfrastructureError)) throw e;
        const first = ErrorLine(e, deps.Redaction).split('\n')[0];
        process.stderr.write(`match ${ledgerID}: PR #${pr}: the fix on head does not prepare (${first}); trying the fix merge ${fixSHA.slice(0, 7)}\n`);
    }
    try { return { Revision: await deps.Target.Prepare({ Kind: 'Head', SHA: fixSHA }), Head: 'FixMerge' }; }
    catch (e) {
        if (!(e instanceof InfrastructureError)) throw e;
        return { Error: ErrorLine(e, deps.Redaction) };
    }
}

/** The candidate tests of the catches, from the run's `execution.json`, in catch order; a test missing there is named on stderr and left out. */
function testsOf(catches: Catch[], dir: RunDir): CandidateTest[] {
    const byID = IndexByUUID(dir.ReadExecution().Tests);
    const tests: CandidateTest[] = [];
    for (const c of catches) {
        const t = byID.Get(c.CandidateTestID);
        if (t) tests.push(t);
        else process.stderr.write(`match: run ${dir.RunID}: test ${c.CandidateTestID} of catch ${c.ID} is not in execution.json; left out\n`);
    }
    return tests;
}

/** The commit of `headSHA` plus the fix PR's diff, built with `<run dir>/match/work/fix.patch` and the scratch worktree `<run dir>/match/work/fix`; null when the diff does not apply. */
async function fixedCommit(headSHA: string, fixSHA: string, dir: RunDir, repo: MatchDeps['Repo']): Promise<string | null> {
    const patch = await repo.Diff(await repo.FirstParent(fixSHA), fixSHA);
    const work = join(dir.Path, 'match', 'work');
    mkdirSync(work, { recursive: true });
    const patchFile = join(work, 'fix.patch');
    writeFileSync(patchFile, patch);
    return repo.CommitWithPatch(headSHA, patchFile, join(work, 'fix'));
}

/** Builds, writes and runs the tests on the prepared fixed head and records which passed every repeat. */
async function runOnFixedHead(target: MatchTarget, head: PreparedRevision, tests: CandidateTest[], catches: Catch[], repeats: number): Promise<MatchRecord> {
    await target.BuildPackages(head, [...new Set(tests.map((t) => t.Package))]);
    await target.WriteTests(head, tests);
    const passing = passedEveryRepeat(tests, await target.Run(head, tests, repeats), repeats);
    const outcome: Record<string, boolean> = Object.fromEntries(tests.map((t) => [t.ID, passing.Has(t.ID)]));
    const reported = catches.some((c) => c.Reported && passing.Has(c.CandidateTestID));
    return record(passing.Size > 0 ? 'Matched' : 'NotMatched', outcome, reported);
}

/** The IDs of the tests with `repeats` head results, all Pass. */
function passedEveryRepeat(tests: CandidateTest[], results: ExecutionResult[], repeats: number): UUIDSet {
    const byTest = GroupByUUID(results.filter((r) => r.Revision === 'Head'), (r) => r.CandidateTestID);
    return new UUIDSet(tests.filter((t) => {
        const mine = byTest.Get(t.ID) ?? [];
        return mine.length >= repeats && mine.every((r) => r.Status === 'Pass');
    }).map((t) => t.ID));
}

function record(status: MatchRecord['Status'], tests: Record<string, boolean> = {}, reportedMatched = false, extra: Pick<MatchRecord, 'Head' | 'Error'> = {}): MatchRecord {
    return { Status: status, ReportedMatched: reportedMatched, Tests: tests, ...extra, At: new Date().toISOString() };
}
