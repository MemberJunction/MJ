/** Record and contract types shared by every part. Field names follow MJ entity conventions (§11). */

import type { TestAst } from './rules/TestAst';

export type Trigger = 'Nightly' | 'Label' | 'Recheck' | 'Backtest' | 'Local';
export type RunStatus = 'Generated' | 'Executed' | 'Assessed' | 'Failed';
export type RevisionKind = 'Base' | 'Head' | 'Mutant';
export type GenerationMethod = 'DodgyDiff' | 'IntentAware';
export type IntentType = 'feature' | 'fix' | 'refactor' | 'perf' | 'dead_code_removal' | 'logging' | 'config' | 'other';
export type ExecutionStatus = 'Pass' | 'Fail' | 'Timeout' | 'CompileError' | 'RunnerError';
export type VerdictLabel = 'WeakCatch' | 'PassesBoth' | 'ApiChanged' | 'Invalid' | 'Flaky';
export type Bucket = 'High' | 'Medium' | 'Low';
export type FeedbackAnswer = 'Bug' | 'Intended' | 'TestFault' | 'AuthorChangedPR';
export type RuleKind = 'Drop' | 'Boost';
export type Vendor = 'Anthropic' | 'OpenAI' | 'Gemini';

/** InputTokens = uncached input + cache-creation tokens; CacheReadTokens = cache reads (priced as cached input). */
export interface TokenUsage { Model: string; InputTokens: number; OutputTokens: number; CacheReadTokens: number; CostUSD: number; }

export interface Run {
    ID: string; Trigger: Trigger; PRNumber: number | null; BaseSHA: string; HeadSHA: string; Status: RunStatus;
    GeneratorModel: string; TokensByModel: TokenUsage[]; RunnerMinutes: number; StartedAt: string; EndedAt: string | null;
}

export interface DiffHunk { Path: string; OldStart: number; OldLines: number; NewStart: number; NewLines: number; Lines: string[]; }
export interface ChangedFile { Path: string; Package: string | null; AddedLines: number[]; RemovedLineCount: number; Hunks: DiffHunk[]; }
export interface Risk { ID: string; File: string; Symbol: string; WhatCouldBreak: string; HowObserved: string; }
export interface ChangeAnalysis {
    RunID: string; IntentType: IntentType; Summary: string; Risks: Risk[]; PackagesToTest: string[];
    ChangedFiles: ChangedFile[]; CommitPrefix: string | null; RiskScore: number; Title: string; Body: string;
}

export interface MutantEdit { File: string; Find: string; Replace: string; }
export interface Mutant { Edits: MutantEdit[]; Patch: string; }
export interface FailureDetail {
    Assertion: string | null; Expected: string | null; Actual: string | null; Message: string; StackExcerpt: string | null; ErrorName: string | null;
}

export interface CandidateTest {
    ID: string; RunID: string; Package: string; Method: GenerationMethod; RiskID: string | null; RiskText: string | null;
    Mutant: Mutant | null; MutantFailure: FailureDetail | null; FilePath: string; Source: string;
    GenerationOutcome: 'Produced' | 'Failed'; FailureReason: string | null; Tokens: TokenUsage; TranscriptURL: string | null;
}

export interface ExecutionResult {
    CandidateTestID: string; Revision: RevisionKind; RunIndex: number; Status: ExecutionStatus; TestName: string | null;
    Failure: FailureDetail | null; DurationMs: number;
}

export interface Verdict { Label: VerdictLabel; Timeout: boolean; Reason: string; }
export interface JudgeBucket { Model: string; Bucket: Bucket; Reason: string; }

export interface Catch {
    ID: string; RunID: string; CandidateTestID: string; Verdict: Verdict; DroppedByRule: string | null; Boosts: string[];
    TPProb: number | null; JudgeBuckets: JudgeBucket[]; Median: Bucket | null; Rank: number | null; Reported: boolean; CommentID: string | null;
}

export interface Feedback { CatchID: string; User: string; Answer: FeedbackAnswer; Source: 'Comment' | 'Label' | 'Recheck'; At: string; }
export interface PromotionCandidate { CandidateTestID: string; RunID: string; NewlyCoveredLines: number; State: 'Offered' | 'Added'; }

// ---- contract value types (§5.2) ----
export interface RevisionRef { Kind: RevisionKind; SHA: string; }
/** A checked-out, installed and built revision. `RootDir` is the worktree root on the host. */
export interface PreparedRevision { Ref: RevisionRef; RootDir: string; }
/** Repo-relative path → changed (added) line numbers at head. */
export type ChangedLines = Record<string, number[]>;
export interface CoverageResult { CandidateTestID: string; CoveredChangedLines: number; }

export interface CatchContext {
    Run: Run; Analysis: ChangeAnalysis; Test: CandidateTest; Base: ExecutionResult[]; Head: ExecutionResult[]; Verdict: Verdict;
    /** Base worktree root, for rules that need the TypeScript program. */
    BaseRootDir: string; Boosts: string[];
    /** The program over the test and base sources, filled once per catch by the rule filter. */
    Ast?: TestAst;
}
export interface RuleOutcome { Fired: boolean; Reason: string; }
export interface JudgeScore { Judge: string; Model: string; Score: number; Bucket: Bucket | null; Reason: string; }

export interface GenerationLimits {
    TestsPerPackage: number; RisksPerPackage: number; TestsPerRisk: number; PackagesPerPR: number; ParallelSessions: number;
    TurnsPerSession: number; TokensPerSession: number; UsdPerSession: number;
}
export interface GenerationRequest {
    Run: Run; Analysis: ChangeAnalysis; Package: string; PackageDir: string; BaseRootDir: string; Method: GenerationMethod;
    Risk: Risk | null; Model: string; Limits: GenerationLimits;
}
export interface GenerationResult { Tests: CandidateTest[]; Tokens: TokenUsage; TranscriptPath: string | null; }
