import { AllRunsAgreeVerdict } from '../verdict/AllRunsAgreeVerdict';
import { RuleFilter } from '../rules/RuleFilter';
import { AllRules } from '../rules/index';
import { JudgePanel, type PanelResult } from '../judges/JudgePanel';
import { TpProbJudge } from '../judges/TpProbJudge';
import { BucketJudge } from '../judges/BucketJudge';
import { CreateLLM } from '../judges/ProviderFactory';
import { FileCatchStore } from '../store/FileCatchStore';
import { RankCatches, SelectReported } from '../ranking/Ranker';
import { NewID } from '../ids';
import type { BaseCatchStore } from '../contracts/BaseCatchStore';
import type { RedactionCheck } from '../sandbox/Redaction';
import type { Settings } from '../settings';
import type { ExecutionFile, GenerationFile } from '../schemas';
import type { CandidateTest, Catch, CatchContext, PromotionCandidate } from '../types';
import { RunDir } from './RunDir';
import { DefaultRedaction } from './Deps';

export interface AssessDeps {
    JudgePanel: Pick<JudgePanel, 'Judge'>;
    Rules: Pick<RuleFilter, 'Apply'>;
    Store: BaseCatchStore;
    Redaction: RedactionCheck;
}
export interface AssessOptions { RunID: string; RepoRoot: string; Settings: Settings; StoreDir: string; Deps?: AssessDeps; }

const MAX_PROMOTIONS = 3;

/**
 * Job 3: reads `generation.json` and `execution.json`, gives every executed test a verdict, filters weak catches with
 * the rules (which read the base worktree) and judges the survivors, ranks and selects with the Label threshold,
 * offers up to three promotion candidates, saves everything to the store and writes `assessment.json`.
 */
export async function AssessStep(o: AssessOptions): Promise<{ Catches: Catch[]; Promotions: PromotionCandidate[] }> {
    const redaction = o.Deps?.Redaction ?? DefaultRedaction();
    const d = o.Deps ?? defaultDeps(o, redaction);
    const dir = new RunDir(o.RepoRoot, o.RunID, redaction);
    const gen = dir.ReadGeneration(); const exec = dir.ReadExecution();
    if (exec.RunID !== gen.Run.ID) throw new Error(`execution.json is for run ${exec.RunID}, not ${gen.Run.ID}`);
    const assessed: Catch[] = [];
    for (const t of exec.Tests) assessed.push(await assessTest(gen, exec, t, d));
    const catches = SelectReported(RankCatches(assessed), o.Settings.Thresholds.Label, 'Label');
    const promotions = promotionsOf(gen, exec, catches);
    await save(d.Store, gen, exec, catches, promotions);
    dir.WriteAssessment({ RunID: gen.Run.ID, Catches: catches, Promotions: promotions });
    process.stdout.write(Summary(gen, exec, catches, promotions));
    return { Catches: catches, Promotions: promotions };
}

/** Verdict for one test; for a weak catch also the rule outcome and, when no drop rule fired, the panel's scores. */
async function assessTest(gen: GenerationFile, exec: ExecutionFile, t: CandidateTest, d: AssessDeps): Promise<Catch> {
    const mine = exec.Results.filter((r) => r.CandidateTestID === t.ID).sort((a, b) => a.RunIndex - b.RunIndex);
    const baseRuns = mine.filter((r) => r.Revision === 'Base'); const headRuns = mine.filter((r) => r.Revision === 'Head');
    const verdict = new AllRunsAgreeVerdict(exec.TypeErrors[t.ID] ?? { Base: null, Head: null }).Classify(baseRuns, headRuns);
    const c: Catch = { ID: NewID(), RunID: gen.Run.ID, CandidateTestID: t.ID, Verdict: verdict, DroppedByRule: null, Boosts: [], TPProb: null, JudgeBuckets: [], Median: null, Rank: null, Reported: false, CommentID: null };
    if (verdict.Label !== 'WeakCatch') return c;
    const ctx: CatchContext = { Run: gen.Run, Analysis: gen.Analysis, Test: t, Base: baseRuns, Head: headRuns, Verdict: verdict, BaseRootDir: gen.BaseRootDir, Boosts: [] };
    const filter = d.Rules.Apply(ctx);
    ctx.Boosts = filter.Boosts;
    if (filter.DroppedBy !== null) return { ...c, DroppedByRule: filter.DroppedBy, Boosts: filter.Boosts };
    const panel: PanelResult = await d.JudgePanel.Judge(ctx);
    return { ...c, Boosts: filter.Boosts, TPProb: panel.TPProb, JudgeBuckets: panel.Buckets, Median: panel.Median };
}

/** Tests that pass on both revisions and cover changed lines, most lines first, at most three. */
function promotionsOf(gen: GenerationFile, exec: ExecutionFile, catches: Catch[]): PromotionCandidate[] {
    const passing = new Set(catches.filter((c) => c.Verdict.Label === 'PassesBoth').map((c) => c.CandidateTestID));
    return exec.Coverage.filter((c) => passing.has(c.CandidateTestID) && c.CoveredChangedLines > 0)
        .sort((a, b) => b.CoveredChangedLines - a.CoveredChangedLines).slice(0, MAX_PROMOTIONS)
        .map((c) => ({ CandidateTestID: c.CandidateTestID, RunID: gen.Run.ID, NewlyCoveredLines: c.CoveredChangedLines, State: 'Offered' }));
}

async function save(store: BaseCatchStore, gen: GenerationFile, exec: ExecutionFile, catches: Catch[], promotions: PromotionCandidate[]): Promise<void> {
    await store.SaveRun({ ...gen.Run, Status: 'Assessed', EndedAt: new Date().toISOString() });
    await store.SaveCandidateTests(gen.Tests);
    await store.SaveExecutionResults(exec.Results);
    await store.SaveCatches(catches);
    await store.SavePromotionCandidates(promotions);
}

/** The printed summary: one header line, one line per ranked catch, and the promotion count. */
export function Summary(gen: GenerationFile, exec: ExecutionFile, catches: Catch[], promotions: PromotionCandidate[]): string {
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
        new TpProbJudge(CreateLLM('OpenAI'), o.Settings.Judges.TpProbModel),
        ...o.Settings.Judges.BucketModels.map((b) => new BucketJudge(CreateLLM(b.Vendor), b.Model)),
    ]);
    return { JudgePanel: { Judge: (c) => (panel ??= build()).Judge(c) }, Rules: new RuleFilter(AllRules()), Store: new FileCatchStore(o.StoreDir, redaction), Redaction: redaction };
}
