import { AllRunsAgreeVerdict } from '../verdict/AllRunsAgreeVerdict';
import type { RedactionCheck } from '../sandbox/Redaction';
import type { Settings } from '../settings';
import type { ExecutionFile, GenerationFile } from '../schemas';
import type { CandidateTest, ChangedLines, ExecutionResult, PreparedRevision, Verdict } from '../types';
import { CheckedBaseRootDir, RunDir } from './RunDir';
import { DefaultRedaction, DefaultRunTarget, type PipelineTarget } from './Deps';

export interface ExecuteDeps {
    Target: PipelineTarget;
    Redaction: RedactionCheck;
    /** Builds the sandbox image; called once before Prepare when given. */
    EnsureImage?: () => Promise<void>;
}
export interface ExecuteOptions { RunID: string; RepoRoot: string; Settings: Settings; Deps?: ExecuteDeps; }

type TypeErrors = ExecutionFile['TypeErrors'];

/**
 * Job 2: prepares head, writes the produced tests into the base worktree kept by job 1 and into head, type-checks
 * and runs them on both, measures coverage on head for tests that pass on both, and writes `execution.json`.
 * Head is removed at the end. An error from the target (such as an `InfrastructureError`) ends the step with no file.
 */
export async function ExecuteStep(o: ExecuteOptions): Promise<void> {
    const redaction = o.Deps?.Redaction ?? DefaultRedaction();
    const dir = new RunDir(o.RepoRoot, o.RunID, redaction);
    const gen = dir.ReadGeneration();
    const baseRoot = CheckedBaseRootDir(dir, gen.BaseRootDir);
    const d = o.Deps ?? defaultDeps(o, dir, redaction);
    const tests = gen.Tests.filter((t) => t.GenerationOutcome === 'Produced');
    if (tests.length === 0) { dir.WriteExecution(emptyExecution(gen)); process.stdout.write(`run ${o.RunID}: no produced tests to execute\n`); return; }
    const base: PreparedRevision = { Ref: { Kind: 'Base', SHA: gen.Run.BaseSHA }, RootDir: baseRoot };
    await d.EnsureImage?.();
    const head = await d.Target.Prepare({ Kind: 'Head', SHA: gen.Run.HeadSHA });
    try {
        dir.WriteExecution(await executeOn(d.Target, gen, tests, base, head, o.Settings.Repeats));
    } finally {
        await d.Target.Cleanup(head);
    }
    process.stdout.write(`run ${o.RunID}: ${tests.length} tests run ${o.Settings.Repeats}× on base and head\n`);
}

/** Build head, write, type-check and run the tests on both revisions, then measure coverage for tests that pass on both. */
async function executeOn(target: PipelineTarget, gen: GenerationFile, tests: CandidateTest[], base: PreparedRevision, head: PreparedRevision, repeats: number): Promise<ExecutionFile> {
    await target.BuildPackages(head, [...new Set(tests.map((t) => t.Package))]);
    await target.WriteTests(base, tests);
    await target.WriteTests(head, tests);
    const baseTypes = await target.TypeCheck(base, tests);
    const headTypes = await target.TypeCheck(head, tests);
    const typeErrors: TypeErrors = Object.fromEntries(tests.map((t) => [t.ID, { Base: baseTypes.get(t.ID) ?? null, Head: headTypes.get(t.ID) ?? null }]));
    const results = [...await target.Run(base, tests, repeats), ...await target.Run(head, tests, repeats)];
    const passing = tests.filter((t) => verdictOf(t.ID, results, typeErrors) === 'PassesBoth');
    const coverage = passing.length ? await target.Coverage(head, passing, ChangedLinesOf(gen)) : [];
    return { RunID: gen.Run.ID, Tests: tests, Results: results, Coverage: coverage, TypeErrors: typeErrors };
}

function verdictOf(id: string, results: ExecutionResult[], typeErrors: TypeErrors): Verdict['Label'] {
    const mine = results.filter((r) => r.CandidateTestID === id);
    return new AllRunsAgreeVerdict(typeErrors[id]).Classify(mine.filter((r) => r.Revision === 'Base'), mine.filter((r) => r.Revision === 'Head')).Label;
}

/** Added line numbers at head per changed file, from the analysis. */
export function ChangedLinesOf(gen: GenerationFile): ChangedLines {
    return Object.fromEntries(gen.Analysis.ChangedFiles.map((f) => [f.Path, f.AddedLines]));
}

function emptyExecution(gen: GenerationFile): ExecutionFile { return { RunID: gen.Run.ID, Tests: [], Results: [], Coverage: [], TypeErrors: {} }; }

function defaultDeps(o: ExecuteOptions, dir: RunDir, redaction: RedactionCheck): ExecuteDeps {
    const rt = DefaultRunTarget(o.RepoRoot, dir.Path, o.Settings);
    return { Target: rt.Target, Redaction: redaction, EnsureImage: rt.EnsureImage };
}
