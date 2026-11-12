import { UUIDsEqual } from '@memberjunction/global';
import { AllRunsAgreeVerdict } from '../verdict/AllRunsAgreeVerdict';
import type { RedactionCheck } from '../sandbox/Redaction';
import type { Settings } from '../settings';
import type { ExecutionFile, GenerationFile } from '../schemas';
import type { CandidateTest, ChangedLines, ExecutionResult, ExecutionTimings, PreparedRevision, Verdict } from '../types';
import { CheckedBaseRootDir, RunDir } from './RunDir';
import { DefaultRedaction, DefaultRunTarget, type PipelineTarget } from './Deps';
import { Seconds, Timed } from './Timing';

export interface ExecuteDeps {
    Target: PipelineTarget;
    Redaction: RedactionCheck;
    /** Builds the sandbox image; called once before Prepare when given. */
    EnsureImage?: () => Promise<void>;
    /** The clock the stage timers read; `Date.now` when not given. */
    Now?: () => number;
}
export interface ExecuteOptions { RunID: string; RepoRoot: string; Settings: Settings; Deps?: ExecuteDeps; }

type TypeErrors = ExecutionFile['TypeErrors'];

/**
 * Job 2: prepares head, writes the produced tests into the base worktree kept by job 1 and into head, type-checks
 * and runs them on both, measures coverage on head for tests that pass on both when `Settings.Coverage` is on, and writes `execution.json` with the time of each stage,
 * which it also prints on one stdout line.
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
    const now = d.Now ?? Date.now;
    const prepared = await Timed(now, () => d.Target.Prepare({ Kind: 'Head', SHA: gen.Run.HeadSHA }));
    const head = prepared.Result;
    let timings: ExecutionTimings;
    try {
        const executed = await executeOn(d.Target, gen, tests, base, head, o.Settings, { Now: now, PrepareHeadMs: prepared.Ms });
        timings = executed.Timings;
        dir.WriteExecution({ ...executed.File, Timings: timings });
    } finally {
        await d.Target.Cleanup(head);
    }
    process.stdout.write(`run ${o.RunID}: ${tests.length} tests run ${o.Settings.Repeats}× on base and head\n`);
    process.stdout.write(`run ${o.RunID}: stages prepare head ${Seconds(timings.PrepareHeadMs)}, build head ${Seconds(timings.BuildHeadMs)}, type-check ${Seconds(timings.TypeCheckMs)}, `
        + `run ${Seconds(timings.RunMs)}, coverage ${Seconds(timings.CoverageMs)}\n`);
}

/**
 * Build head, write, type-check and run the tests on both revisions, then measure coverage for tests that pass on both when `settings.Coverage` is on.
 * Returns the file contents and the stage times: `clock.PrepareHeadMs` and the others on `clock.Now`, with `CoverageMs` 0 when coverage is not measured.
 */
async function executeOn(target: PipelineTarget, gen: GenerationFile, tests: CandidateTest[], base: PreparedRevision, head: PreparedRevision, settings: Settings,
    clock: { Now: () => number; PrepareHeadMs: number }): Promise<{ File: ExecutionFile; Timings: ExecutionTimings }> {
    const built = await Timed(clock.Now, () => target.BuildPackages(head, [...new Set(tests.map((t) => t.Package))]));
    await target.WriteTests(base, tests);
    await target.WriteTests(head, tests);
    const checked = await Timed(clock.Now, async () => ({ Base: await target.TypeCheck(base, tests), Head: await target.TypeCheck(head, tests) }));
    const typeErrors: TypeErrors = Object.fromEntries(tests.map((t) => [t.ID, { Base: checked.Result.Base.get(t.ID) ?? null, Head: checked.Result.Head.get(t.ID) ?? null }]));
    const ran = await Timed(clock.Now, async () => [...await target.Run(base, tests, settings.Repeats), ...await target.Run(head, tests, settings.Repeats)]);
    const results = ran.Result;
    const passing = tests.filter((t) => verdictOf(t.ID, results, typeErrors) === 'PassesBoth');
    const covered = settings.Coverage && passing.length ? await Timed(clock.Now, () => target.Coverage(head, passing, ChangedLinesOf(gen))) : { Result: [], Ms: 0 };
    return {
        File: { RunID: gen.Run.ID, Tests: tests, Results: results, Coverage: covered.Result, TypeErrors: typeErrors },
        Timings: { PrepareHeadMs: clock.PrepareHeadMs, BuildHeadMs: built.Ms, TypeCheckMs: checked.Ms, RunMs: ran.Ms, CoverageMs: covered.Ms },
    };
}

function verdictOf(id: string, results: ExecutionResult[], typeErrors: TypeErrors): Verdict['Label'] {
    const mine = results.filter((r) => UUIDsEqual(r.CandidateTestID, id));
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
