import type { CandidateTest, ChangedLines, CoverageResult, ExecutionResult, PreparedRevision, RevisionRef } from '../types';

/** Prepares one revision of the code and runs candidate tests against it. */
export abstract class BaseCatchTarget {
    public abstract Prepare(revision: RevisionRef, packages?: string[]): Promise<PreparedRevision>;
    public abstract Run(revision: PreparedRevision, tests: CandidateTest[], repeats: number): Promise<ExecutionResult[]>;
    public abstract Coverage(revision: PreparedRevision, tests: CandidateTest[], changed: ChangedLines): Promise<CoverageResult[]>;
}
