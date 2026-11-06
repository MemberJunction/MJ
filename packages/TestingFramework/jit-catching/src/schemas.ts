import { z } from 'zod';

const sha = z.string().regex(/^[0-9a-f]{7,40}$/);
const iso = z.iso.datetime();
export const TriggerSchema = z.enum(['Nightly', 'Label', 'Recheck', 'Backtest', 'Local']);
export const BucketSchema = z.enum(['High', 'Medium', 'Low']);
export const TokenUsageSchema = z.object({ Model: z.string(), InputTokens: z.number().int().nonnegative(), OutputTokens: z.number().int().nonnegative(), CacheReadTokens: z.number().int().nonnegative(), CostUSD: z.number().nonnegative() });

export const RunSchema = z.object({
    ID: z.string().min(1), Trigger: TriggerSchema, PRNumber: z.number().int().positive().nullable(), BaseSHA: sha, HeadSHA: sha,
    Status: z.enum(['Generated', 'Executed', 'Assessed', 'Failed']), GeneratorModel: z.string(), TokensByModel: z.array(TokenUsageSchema),
    RunnerMinutes: z.number().nonnegative(), StartedAt: iso, EndedAt: iso.nullable(),
});

export const DiffHunkSchema = z.object({ Path: z.string(), OldStart: z.number().int(), OldLines: z.number().int(), NewStart: z.number().int(), NewLines: z.number().int(), Lines: z.array(z.string()) });
export const ChangedFileSchema = z.object({ Path: z.string(), Package: z.string().nullable(), AddedLines: z.array(z.number().int().positive()), RemovedLineCount: z.number().int().nonnegative(), Hunks: z.array(DiffHunkSchema) });
export const RiskSchema = z.object({ ID: z.string(), File: z.string(), Symbol: z.string(), WhatCouldBreak: z.string(), HowObserved: z.string() });
export const ChangeAnalysisSchema = z.object({
    RunID: z.string(), IntentType: z.enum(['feature', 'fix', 'refactor', 'perf', 'dead_code_removal', 'logging', 'config', 'other']),
    Summary: z.string(), Risks: z.array(RiskSchema), PackagesToTest: z.array(z.string()).max(3), ChangedFiles: z.array(ChangedFileSchema),
    CommitPrefix: z.string().nullable(), RiskScore: z.number(), Title: z.string(), Body: z.string(),
});

/** Generated tests may live only under a package's `src/__tests__/jit/` and must use the `.jit.test.ts` suffix. Every path segment here and in `MutantEditSchema.File` starts with a letter, digit or underscore, so `.` and `..` are never segments. */
export const JitTestPath = z.string().regex(/^packages\/(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)+src\/__tests__\/jit\/[0-9a-f-]{36}\.jit\.test\.ts$/);
export const MutantEditSchema = z.object({ File: z.string().regex(/^packages\/(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)+src\/(?!__tests__\/)(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.ts$/), Find: z.string().min(1), Replace: z.string() });
export const MutantSchema = z.object({ Edits: z.array(MutantEditSchema).min(1), Patch: z.string() });
export const FailureDetailSchema = z.object({ Assertion: z.string().nullable(), Expected: z.string().nullable(), Actual: z.string().nullable(), Message: z.string(), StackExcerpt: z.string().nullable(), ErrorName: z.string().nullable() });

export const CandidateTestSchema = z.object({
    ID: z.string(), RunID: z.string(), Package: z.string(), Method: z.enum(['DodgyDiff', 'IntentAware']), RiskID: z.string().nullable(), RiskText: z.string().nullable(),
    Mutant: MutantSchema.nullable(), MutantFailure: FailureDetailSchema.nullable(), FilePath: JitTestPath, Source: z.string(),
    GenerationOutcome: z.enum(['Produced', 'Failed']), FailureReason: z.string().nullable(), Tokens: TokenUsageSchema, TranscriptURL: z.string().nullable(),
});

export const ExecutionResultSchema = z.object({
    CandidateTestID: z.string(), Revision: z.enum(['Base', 'Head', 'Mutant']), RunIndex: z.number().int().nonnegative(),
    Status: z.enum(['Pass', 'Fail', 'Timeout', 'CompileError', 'RunnerError']), TestName: z.string().nullable(), Failure: FailureDetailSchema.nullable(), DurationMs: z.number().nonnegative(),
}).refine((r) => (r.Status === 'Pass') === (r.Failure === null), { error: 'Failure is required exactly when Status is not Pass' });

export const VerdictSchema = z.object({ Label: z.enum(['WeakCatch', 'PassesBoth', 'ApiChanged', 'Invalid', 'Flaky']), Timeout: z.boolean(), Reason: z.string() });
export const JudgeBucketSchema = z.object({ Model: z.string(), Bucket: BucketSchema, Reason: z.string() });
export const CatchSchema = z.object({
    ID: z.string(), RunID: z.string(), CandidateTestID: z.string(), Verdict: VerdictSchema, DroppedByRule: z.string().nullable(), Boosts: z.array(z.string()),
    TPProb: z.number().min(-1).max(1).nullable(), JudgeBuckets: z.array(JudgeBucketSchema), Median: BucketSchema.nullable(), Rank: z.number().int().nullable(), Reported: z.boolean(), CommentID: z.string().nullable(),
});
export const FeedbackSchema = z.object({ CatchID: z.string(), User: z.string(), Answer: z.enum(['Bug', 'Intended', 'TestFault', 'AuthorChangedPR']), Source: z.enum(['Comment', 'Label', 'Recheck']), At: iso });
export const PromotionCandidateSchema = z.object({ CandidateTestID: z.string(), RunID: z.string(), NewlyCoveredLines: z.number().int().nonnegative(), State: z.enum(['Offered', 'Added']) });
export const CoverageResultSchema = z.object({ CandidateTestID: z.string(), CoveredChangedLines: z.number().int().nonnegative() });

// ---- files passed between jobs (§5.4) ----
export const GenerationFileSchema = z.object({ Run: RunSchema, Analysis: ChangeAnalysisSchema, Tests: z.array(CandidateTestSchema) });
export const ExecutionFileSchema = z.object({ RunID: z.string(), Tests: z.array(CandidateTestSchema), Results: z.array(ExecutionResultSchema), Coverage: z.array(CoverageResultSchema) })
    .refine((f) => { const ids = new Set(f.Tests.map((t) => t.ID)); return f.Results.every((r) => ids.has(r.CandidateTestID)); }, { error: 'every result must name a test in Tests' });
export const AssessmentFileSchema = z.object({ RunID: z.string(), Catches: z.array(CatchSchema), Promotions: z.array(PromotionCandidateSchema) });
