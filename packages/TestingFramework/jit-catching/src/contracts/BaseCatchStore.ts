import type { CandidateTest, Catch, ExecutionResult, Feedback, PromotionCandidate, Run, SessionRecord } from '../types';

/** Persists runs, generation sessions, tests, results, catches and feedback. Writes are append-only; reads return the latest record per ID. */
export abstract class BaseCatchStore {
    public abstract SaveRun(run: Run): Promise<void>;
    public abstract SaveCandidateTests(tests: CandidateTest[]): Promise<void>;
    public abstract SaveExecutionResults(results: ExecutionResult[]): Promise<void>;
    public abstract SaveCatches(catches: Catch[]): Promise<void>;
    public abstract SaveFeedback(feedback: Feedback): Promise<void>;
    public abstract SavePromotionCandidates(candidates: PromotionCandidate[]): Promise<void>;
    public abstract SaveSessions(sessions: SessionRecord[]): Promise<void>;
    public abstract GetRun(id: string): Promise<Run | null>;
    public abstract ListRuns(): Promise<Run[]>;
    public abstract ListCatches(runId: string): Promise<Catch[]>;
    public abstract ListFeedback(catchId: string): Promise<Feedback[]>;
    public abstract ListSessions(runId: string): Promise<SessionRecord[]>;
}
