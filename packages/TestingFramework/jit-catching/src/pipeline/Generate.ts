import { join } from 'node:path';
import { GitHub, type PullRequestInfo } from '../git/GitHub';
import { GitRepo } from '../git/GitRepo';
import { ChangeAnalyzer, type PullRequestText } from '../analyzer/ChangeAnalyzer';
import { ClaudeAgentGenerator } from '../generator/ClaudeAgentGenerator';
import { NoUsage, SessionError } from '../generator/UsageCounter';
import { CreateLLM } from '../judges/ProviderFactory';
import type { PackageMap } from '../analyzer/PackageMap';
import type { BaseTestGenerator } from '../contracts/BaseTestGenerator';
import type { RedactionCheck } from '../sandbox/Redaction';
import type { Settings } from '../settings';
import type { ChangeAnalysis, GenerationRequest, GenerationResult, Run, SessionRecord, TokenUsage, Trigger } from '../types';
import { NewID, NewRunID } from '../ids';
import { RedactTail } from '../sandbox/Redaction';
import { RunDir } from './RunDir';
import { RunWithConcurrency } from './concurrency';
import { DefaultRedaction, DefaultRunTarget, type PipelineTarget } from './Deps';
import { PreflightEnv } from './Preflight';

/** The tools that write into one run's folder, built once the run ID is known. */
export interface GenerateTools {
    Target: Pick<PipelineTarget, 'Prepare' | 'BuildPackages'>;
    Analyzer: Pick<ChangeAnalyzer, 'Analyze' | 'Usage'>;
    Generator: Pick<BaseTestGenerator, 'Generate'>;
    PackageMap: Pick<PackageMap, 'Get' | 'PackageForPath'>;
    /** Builds the sandbox image; called once before the first Prepare. */
    EnsureImage: () => Promise<void>;
}
export interface GenerateDeps {
    GitHub: Pick<GitHub, 'GetPullRequest'>;
    Repo: Pick<GitRepo, 'Fetch' | 'MergeBase' | 'Subject'>;
    Redaction: RedactionCheck;
    ForRun: (dir: RunDir) => GenerateTools;
}
/**
 * With `PR` null, `HeadSHA` is required. With `PR` set, `HeadSHA` (when given) replaces the PR's head and the PR still gives the title and body.
 * `BaseSHA` defaults to the merge base of head and `origin/next`.
 * `Env` is the environment the preflight check reads; it defaults to `process.env`.
 */
export interface GenerateOptions { PR: number | null; BaseSHA?: string; HeadSHA?: string; Trigger: Trigger; RepoRoot: string; Settings: Settings; Deps?: GenerateDeps; Env?: NodeJS.ProcessEnv; }

/**
 * Job 1: checks the environment, resolves the revisions, prepares and builds base, analyses the change, runs one generation session per
 * (package, method[, risk]) and writes `generation.json` with one record per session and the analyzer's and the sessions' tokens per role and model. The base worktree stays for the execute and assess jobs.
 */
export async function GenerateStep(o: GenerateOptions): Promise<{ RunID: string }> {
    PreflightEnv(o.Settings, o.Env ?? process.env, 'Generate');
    const d = o.Deps ?? DefaultGenerateDeps(o);
    const pr = o.PR !== null ? await d.GitHub.GetPullRequest(o.PR) : null;
    const { BaseSHA, HeadSHA } = await resolveRevisions(o, d, pr);
    const run: Run = { ID: NewRunID(o.PR, HeadSHA), Trigger: o.Trigger, PRNumber: o.PR, BaseSHA, HeadSHA, Status: 'Generated', GeneratorModel: o.Settings.GeneratorModel,
        TokensByModel: [], RunnerMinutes: 0, StartedAt: new Date().toISOString(), EndedAt: null };
    const dir = new RunDir(o.RepoRoot, run.ID, d.Redaction);
    dir.Create();
    const t = d.ForRun(dir);
    await t.EnsureImage();
    const base = await t.Target.Prepare({ Kind: 'Base', SHA: BaseSHA });
    const analysis = await t.Analyzer.Analyze(run, await pullRequestText(d, pr, HeadSHA));
    await t.Target.BuildPackages(base, analysis.PackagesToTest);
    const requests = buildRequests(run, analysis, base.RootDir, o.Settings, t.PackageMap);
    const results = await RunWithConcurrency(requests, o.Settings.Limits.ParallelSessions, (r) => generateOrFail(t, r));
    const tests = results.flatMap((r) => r.Tests);
    const sessions: SessionRecord[] = requests.map((r, i) => ({ RunID: run.ID, Package: r.Package, Method: r.Method, RiskID: r.Risk?.ID ?? null, EndReason: results[i].EndReason,
        Turns: results[i].Turns, Tokens: results[i].Tokens, TranscriptURL: results[i].TranscriptPath,
        Produced: results[i].Tests.filter((x) => x.GenerationOutcome === 'Produced').length, Failed: results[i].Tests.filter((x) => x.GenerationOutcome === 'Failed').length }));
    run.TokensByModel = SumTokens([{ ...t.Analyzer.Usage, Role: 'Analyzer' }, ...results.map((r) => ({ ...r.Tokens, Role: 'Generator' as const }))]); run.EndedAt = new Date().toISOString();
    dir.WriteGeneration({ Run: run, Analysis: analysis, Tests: tests, BaseRootDir: base.RootDir, Sessions: sessions });
    const produced = tests.filter((x) => x.GenerationOutcome === 'Produced').length;
    process.stdout.write(`run ${run.ID}: ${produced} produced, ${tests.length - produced} failed, ${requests.length} sessions\n`);
    return { RunID: run.ID };
}

/**
 * Head from `HeadSHA`, else from the PR; base from `BaseSHA` or the merge base with `origin/next`.
 * A PR with an explicit head is a landing commit on `next`, so `next` is fetched for it; otherwise the PR ref or the head is fetched, and `next` only for the merge base.
 */
async function resolveRevisions(o: GenerateOptions, d: GenerateDeps, pr: PullRequestInfo | null): Promise<{ BaseSHA: string; HeadSHA: string }> {
    const head = o.HeadSHA ?? pr?.HeadSHA;
    if (!head) throw new Error('generate needs --pr or --head');
    const landing = pr !== null && o.HeadSHA !== undefined;
    if (landing) await d.Repo.Fetch('next');
    else await d.Repo.Fetch(pr ? `refs/pull/${pr.Number}/head` : head).catch(() => undefined);
    if (o.BaseSHA) return { BaseSHA: o.BaseSHA, HeadSHA: head };
    if (!landing) await d.Repo.Fetch('next');
    return { BaseSHA: await d.Repo.MergeBase('origin/next', head), HeadSHA: head };
}

/** The PR's title and body, or the head commit's subject and an empty body when there is no PR. */
async function pullRequestText(d: GenerateDeps, pr: PullRequestInfo | null, headSHA: string): Promise<PullRequestText> {
    if (pr) return { Title: pr.Title, Body: pr.Body };
    return { Title: await d.Repo.Subject(headSHA), Body: '' };
}

/** Per package to test: one DodgyDiff request, then one IntentAware request per risk in that package, up to `RisksPerPackage`. */
function buildRequests(run: Run, analysis: ChangeAnalysis, baseRoot: string, settings: Settings, map: Pick<PackageMap, 'Get' | 'PackageForPath'>): GenerationRequest[] {
    const requests: GenerationRequest[] = [];
    for (const pkg of analysis.PackagesToTest) {
        const info = map.Get(pkg); if (!info) throw new Error(`unknown package ${pkg}`);
        const common = { Run: run, Analysis: analysis, Package: pkg, PackageDir: join(baseRoot, info.Dir), BaseRootDir: baseRoot, Model: settings.GeneratorModel, Limits: settings.Limits };
        requests.push({ ...common, Method: 'DodgyDiff', Risk: null });
        const risks = analysis.Risks.filter((r) => map.PackageForPath(r.File)?.Name === pkg).slice(0, settings.Limits.RisksPerPackage);
        for (const risk of risks) requests.push({ ...common, Method: 'IntentAware', Risk: risk });
    }
    return requests;
}

/**
 * Runs one generation session. A session that throws becomes one failed test for its request, with the redacted
 * first line of the error as reason, the tokens a `SessionError` carries (zero otherwise) and end reason `error`, so the other sessions still finish.
 */
async function generateOrFail(t: GenerateTools, r: GenerationRequest): Promise<GenerationResult> {
    try { return await t.Generator.Generate(r); }
    catch (e) {
        const message = (e instanceof Error ? e.message : String(e)).split('\n')[0].trim();
        const dir = t.PackageMap.Get(r.Package)?.Dir; const id = NewID();
        if (!dir) throw e;
        const tokens: TokenUsage = e instanceof SessionError ? e.Usage : NoUsage(r.Model);
        return { Tokens: tokens, TranscriptPath: null, EndReason: 'error', Turns: 0, Tests: [{ ID: id, RunID: r.Run.ID, Package: r.Package, Method: r.Method, RiskID: r.Risk?.ID ?? null,
            RiskText: r.Risk ? `${r.Risk.WhatCouldBreak} (${r.Risk.Symbol})` : null, Mutant: null, MutantFailure: null, FilePath: `${dir}/src/__tests__/jit/${id}.jit.test.ts`,
            Source: '', GenerationOutcome: 'Failed', FailureReason: `generation session failed: ${RedactTail(message)}`, Tokens: tokens, TranscriptURL: null }] };
    }
}

/** Token usage summed per role and model, in first-seen order. A summed record keeps `Role` when its usages have one. */
export function SumTokens(usages: TokenUsage[]): TokenUsage[] {
    const byKey = new Map<string, TokenUsage>();
    for (const u of usages) {
        const key = `${u.Role ?? ''}|${u.Model}`;
        const s = byKey.get(key) ?? { Model: u.Model, ...(u.Role ? { Role: u.Role } : {}), InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 };
        byKey.set(key, { ...s, InputTokens: s.InputTokens + u.InputTokens, OutputTokens: s.OutputTokens + u.OutputTokens, CacheReadTokens: s.CacheReadTokens + u.CacheReadTokens, CostUSD: s.CostUSD + u.CostUSD });
    }
    return [...byKey.values()];
}

/** The real dependencies: `gh`, the host repo, and per run the target, the analyzer and the Agent SDK generator. */
export function DefaultGenerateDeps(o: Pick<GenerateOptions, 'RepoRoot' | 'Settings'>): GenerateDeps {
    const repo = new GitRepo(o.RepoRoot);
    return {
        GitHub: new GitHub(), Repo: repo, Redaction: DefaultRedaction(),
        ForRun: (dir) => {
            const rt = DefaultRunTarget(o.RepoRoot, dir.Path, o.Settings, repo);
            return {
                Target: rt.Target, PackageMap: rt.PackageMap, EnsureImage: rt.EnsureImage,
                Analyzer: new ChangeAnalyzer({ Repo: repo, PackageMap: rt.PackageMap, LLM: CreateLLM('Anthropic'), Model: o.Settings.AnalyzerModel, Settings: o.Settings }),
                Generator: new ClaudeAgentGenerator({ Sandbox: rt.Sandbox, ScratchRoot: join(dir.Path, 'scratch'), Settings: o.Settings, PackageMap: rt.PackageMap, TranscriptDir: dir.TranscriptDir }),
            };
        },
    };
}
