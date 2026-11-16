import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { UUIDsEqual } from '@memberjunction/global';
import { AllRunsAgreeVerdict } from '../verdict/AllRunsAgreeVerdict';
import { RuleFilter } from '../rules/RuleFilter';
import { AllRules } from '../rules/index';
import { JudgePanel, type PanelResult } from '../judges/JudgePanel';
import { TpProbJudge } from '../judges/TpProbJudge';
import { BucketJudge } from '../judges/BucketJudge';
import { CallerCheck, type CallerCheckResult } from '../judges/CallerCheck';
import { CreateLLM } from '../judges/ProviderFactory';
import { GitRepo } from '../git/GitRepo';
import { FileCatchStore } from '../store/FileCatchStore';
import { RankCatches, SelectReported } from '../ranking/Ranker';
import { StableID } from '../ids';
import type { BaseCatchStore } from '../contracts/BaseCatchStore';
import type { RedactionCheck } from '../sandbox/Redaction';
import type { Settings } from '../settings';
import type { ExecutionFile, GenerationFile } from '../schemas';
import type { CandidateTest, Catch, CatchContext, PromotionCandidate, TokenUsage } from '../types';
import { CheckedBaseRootDir, RunDir } from './RunDir';
import { CheckedBaseSourceDir } from './BaseSnapshot';
import { DefaultRedaction } from './Deps';
import { PreflightEnv } from './Preflight';
import { SumTokens } from './Generate';
import { RunWithConcurrency } from './concurrency';

export interface AssessDeps {
    JudgePanel: Pick<JudgePanel, 'Judge'>;
    Rules: Pick<RuleFilter, 'Apply'>;
    Store: BaseCatchStore;
    Redaction: RedactionCheck;
    /** The caller check; when absent and the check is enabled, one is built from the settings. */
    CallerCheck?: Pick<CallerCheck, 'Check'>;
}
/** `Env` is the environment the preflight check reads; it defaults to `process.env`. */
export interface AssessOptions { RunID: string; RepoRoot: string; Settings: Settings; StoreDir: string; Deps?: AssessDeps; Env?: NodeJS.ProcessEnv; }

const MAX_PROMOTIONS = 3;
/** Caller checks in flight at the same time. */
const CHECK_CONCURRENCY = 4;

/**
 * Job 3: checks the environment, reads `generation.json` and `execution.json`, gives every executed test a verdict, filters weak catches with
 * the rules (which read the base worktree, or the run's base source snapshot when the worktree is gone) and judges the survivors, ranks and selects with the Label threshold,
 * runs the caller check (when enabled) on the selected catches and keeps only those it does not reject,
 * offers up to three promotion candidates, saves everything to the store (the run with the judges' tokens added to
 * its tokens per role and model, and the generation sessions) and writes `assessment.json`. A catch's ID comes from its run and test, so running the step
 * again on the same run replaces the earlier catches in the store.
 */
export async function AssessStep(o: AssessOptions): Promise<{ Catches: Catch[]; Promotions: PromotionCandidate[] }> {
    PreflightEnv(o.Settings, o.Env ?? process.env, 'Assess');
    const redaction = o.Deps?.Redaction ?? DefaultRedaction();
    const dir = new RunDir(o.RepoRoot, o.RunID, redaction);
    const gen = dir.ReadGeneration(); const exec = dir.ReadExecution();
    if (exec.RunID !== gen.Run.ID) throw new Error(`execution.json is for run ${exec.RunID}, not ${gen.Run.ID}`);
    const rulesRoot = existsSync(join(dir.Path, 'work', 'base')) ? CheckedBaseRootDir(dir, gen.BaseRootDir) : CheckedBaseSourceDir(dir, gen.BaseSourceDir ?? '');
    const d = o.Deps ?? defaultDeps(o, redaction);
    const assessed: Catch[] = []; const judgeUsage: TokenUsage[] = []; const contexts = new Map<string, CatchContext>();
    for (const t of exec.Tests) assessed.push(await assessTest(gen, exec, t, d, judgeUsage, rulesRoot, contexts));
    const selected = SelectReported(RankCatches(assessed), o.Settings.Thresholds.Label, 'Label');
    const catches = o.Settings.Judges.CallerCheck.Enabled ? await checkReported(selected, contexts, d.CallerCheck ?? defaultCallerCheck(o), judgeUsage) : selected;
    const promotions = promotionsOf(gen, exec, catches);
    await save(d.Store, gen, exec, catches, promotions, judgeUsage);
    dir.WriteAssessment({ RunID: gen.Run.ID, Catches: catches, Promotions: promotions });
    process.stdout.write(Summary(gen, exec, catches, promotions));
    return { Catches: catches, Promotions: promotions };
}

/**
 * Verdict for one test; for a weak catch also the rule outcome and, when no drop rule fired, the panel's scores.
 * The rules read the sources under `rulesRoot`. The panel's token usage is appended to `judgeUsage`, and the context of a judged catch is kept in `contexts` by catch ID, without its TypeScript program.
 */
async function assessTest(gen: GenerationFile, exec: ExecutionFile, t: CandidateTest, d: AssessDeps, judgeUsage: TokenUsage[], rulesRoot: string, contexts: Map<string, CatchContext>): Promise<Catch> {
    const mine = exec.Results.filter((r) => UUIDsEqual(r.CandidateTestID, t.ID)).sort((a, b) => a.RunIndex - b.RunIndex);
    const baseRuns = mine.filter((r) => r.Revision === 'Base'); const headRuns = mine.filter((r) => r.Revision === 'Head');
    const verdict = new AllRunsAgreeVerdict(exec.TypeErrors[t.ID] ?? { Base: null, Head: null }).Classify(baseRuns, headRuns);
    const c: Catch = { ID: StableID('catch', gen.Run.ID, t.ID), RunID: gen.Run.ID, CandidateTestID: t.ID, Verdict: verdict, DroppedByRule: null, Boosts: [], TPProb: null, JudgeBuckets: [], Median: null, Rank: null, Reported: false, CommentID: null, Check: null };
    if (verdict.Label !== 'WeakCatch') return c;
    const ctx: CatchContext = { Run: gen.Run, Analysis: gen.Analysis, Test: t, Base: baseRuns, Head: headRuns, Verdict: verdict, BaseRootDir: rulesRoot, Boosts: [] };
    const filter = d.Rules.Apply(ctx);
    ctx.Boosts = filter.Boosts;
    if (filter.DroppedBy !== null) return { ...c, DroppedByRule: filter.DroppedBy, Boosts: filter.Boosts };
    const panel: PanelResult = await d.JudgePanel.Judge(ctx);
    contexts.set(c.ID, { ...ctx, Ast: undefined });
    judgeUsage.push(...panel.Usage.map((u) => ({ ...u, Role: 'Judge' as const })));
    return { ...c, Boosts: filter.Boosts, TPProb: panel.TPProb, JudgeBuckets: panel.Buckets, Median: panel.Median };
}

/**
 * Runs the caller check on every reported catch, at most four at a time, and stores its answer in `Check`. A catch stays
 * reported when the check says Bug, when the check failed, or when the check is not High-confident and the judges' median is High.
 * The check's token usage is appended to `usage` with the role `Check`.
 */
async function checkReported(catches: Catch[], contexts: Map<string, CatchContext>, check: Pick<CallerCheck, 'Check'>, usage: TokenUsage[]): Promise<Catch[]> {
    const reported = catches.flatMap((c) => { const ctx = contexts.get(c.ID); return c.Reported && ctx ? [{ ID: c.ID, Ctx: ctx }] : []; });
    const results = await RunWithConcurrency(reported, CHECK_CONCURRENCY, (x) => check.Check(x.Ctx));
    const byID = new Map(reported.map((x, i) => [x.ID, results[i]]));
    usage.push(...results.map((r) => ({ ...r.Usage, Role: 'Check' as const })));
    return catches.map((c) => {
        const r = byID.get(c.ID);
        if (!r) return c;
        return { ...c, Reported: keepsReported(r, c), Check: { Label: r.Label, Confidence: r.Confidence, Reason: r.Reason, Model: r.Model } };
    });
}

function keepsReported(r: CallerCheckResult, c: Catch): boolean {
    return r.Label === 'Bug' || r.Label === null || (r.Confidence !== 'High' && c.Median === 'High');
}

/** A caller check on the configured vendor and model that reads the repository at `RepoRoot`; its provider is created on the first check. */
function defaultCallerCheck(o: AssessOptions): Pick<CallerCheck, 'Check'> {
    const s = o.Settings.Judges.CallerCheck;
    let check: CallerCheck | null = null;
    return { Check: (c) => (check ??= new CallerCheck(CreateLLM(s.Vendor), s.Model, new GitRepo(o.RepoRoot), o.Settings.Prices[s.Model] ?? null)).Check(c) };
}

/** Tests that pass on both revisions and cover changed lines, most lines first, at most three. */
function promotionsOf(gen: GenerationFile, exec: ExecutionFile, catches: Catch[]): PromotionCandidate[] {
    const passing = new Set(catches.filter((c) => c.Verdict.Label === 'PassesBoth').map((c) => c.CandidateTestID));
    return exec.Coverage.filter((c) => passing.has(c.CandidateTestID) && c.CoveredChangedLines > 0)
        .sort((a, b) => b.CoveredChangedLines - a.CoveredChangedLines).slice(0, MAX_PROMOTIONS)
        .map((c) => ({ CandidateTestID: c.CandidateTestID, RunID: gen.Run.ID, NewlyCoveredLines: c.CoveredChangedLines, State: 'Offered' }));
}

async function save(store: BaseCatchStore, gen: GenerationFile, exec: ExecutionFile, catches: Catch[], promotions: PromotionCandidate[], judgeUsage: TokenUsage[]): Promise<void> {
    await store.SaveRun({ ...gen.Run, Status: 'Assessed', EndedAt: new Date().toISOString(), TokensByModel: SumTokens([...gen.Run.TokensByModel, ...judgeUsage]) });
    await store.SaveSessions(gen.Sessions);
    await store.SaveCandidateTests(gen.Tests);
    await store.SaveExecutionResults(exec.Results);
    await store.SaveCatches(catches);
    await store.SavePromotionCandidates(promotions);
}

/** The printed summary: one header line, one line per ranked catch, and the promotion count. */
function Summary(gen: GenerationFile, exec: ExecutionFile, catches: Catch[], promotions: PromotionCandidate[]): string {
    const weak = catches.filter((c) => c.Verdict.Label === 'WeakCatch');
    const dropped = weak.filter((c) => c.DroppedByRule !== null).length;
    const reported = catches.filter((c) => c.Reported).length;
    const pr = gen.Run.PRNumber === null ? 'local' : `PR #${gen.Run.PRNumber}`;
    const lines = [`run ${gen.Run.ID} · ${pr} · ${exec.Tests.length} tests · ${weak.length} weak catches · ${dropped} dropped · ${reported} reported`];
    const tests = new Map(exec.Tests.map((t) => [t.ID, t]));
    for (const c of catches.filter((x) => x.Rank !== null)) {
        const pkgDir = tests.get(c.CandidateTestID)?.FilePath.replace(/\/src\/__tests__\/jit\/.*$/, '') ?? '?';
        lines.push(`#${c.Rank} [${[c.Median ?? 'unjudged', ...c.Boosts].join(' · ')}] ${pkgDir} … "${c.Verdict.Reason}"  (test ${c.CandidateTestID})`);
    }
    lines.push(`promotion candidates: ${promotions.length}`);
    return `${lines.join('\n')}\n`;
}

/** The real rules, the file store, and a judge panel whose providers are created on the first weak catch to judge. */
function defaultDeps(o: AssessOptions, redaction: RedactionCheck): AssessDeps {
    let panel: JudgePanel | null = null;
    const build = (): JudgePanel => new JudgePanel([
        new TpProbJudge(CreateLLM('OpenAI'), o.Settings.Judges.TpProbModel, o.Settings.Prices[o.Settings.Judges.TpProbModel] ?? null),
        ...o.Settings.Judges.BucketModels.map((b) => new BucketJudge(CreateLLM(b.Vendor), b.Model, o.Settings.Prices[b.Model] ?? null, b.Vendor)),
    ], o.Settings.Judges.Staged);
    return { JudgePanel: { Judge: (c) => (panel ??= build()).Judge(c) }, Rules: new RuleFilter(AllRules()), Store: new FileCatchStore(o.StoreDir, redaction), Redaction: redaction };
}
