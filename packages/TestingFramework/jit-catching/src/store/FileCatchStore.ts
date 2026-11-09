import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import { BaseCatchStore } from '../contracts/BaseCatchStore';
import type { CandidateTest, Catch, ExecutionResult, Feedback, PromotionCandidate, Run, SessionRecord } from '../types';
import { CandidateTestSchema, CatchSchema, ExecutionResultSchema, FeedbackSchema, PromotionCandidateSchema, RunSchema, SessionRecordSchema } from '../schemas';
import type { RedactionCheck } from '../sandbox/Redaction';

/** JSONL files, one per record type; append-only, last record per key wins (§11, D21). */
export class FileCatchStore extends BaseCatchStore {
    constructor(private readonly dir: string, private readonly redaction: RedactionCheck) { super(); mkdirSync(dir, { recursive: true }); }

    public async SaveRun(run: Run): Promise<void> { this.append('runs', [run], RunSchema); }
    public async SaveCandidateTests(tests: CandidateTest[]): Promise<void> { this.append('candidate-tests', tests, CandidateTestSchema); }
    public async SaveExecutionResults(results: ExecutionResult[]): Promise<void> { this.append('execution-results', results, ExecutionResultSchema); }
    public async SaveCatches(catches: Catch[]): Promise<void> { this.append('catches', catches, CatchSchema); }
    public async SaveFeedback(feedback: Feedback): Promise<void> { this.append('feedback', [feedback], FeedbackSchema); }
    public async SavePromotionCandidates(candidates: PromotionCandidate[]): Promise<void> { this.append('promotion-candidates', candidates, PromotionCandidateSchema); }
    public async SaveSessions(sessions: SessionRecord[]): Promise<void> { this.append('sessions', sessions, SessionRecordSchema); }
    public async GetRun(id: string): Promise<Run | null> { return this.latest('runs', RunSchema, (r) => r.ID).get(id) ?? null; }
    public async ListRuns(): Promise<Run[]> { return [...this.latest('runs', RunSchema, (r) => r.ID).values()]; }
    public async ListCatches(runId: string): Promise<Catch[]> { return [...this.latest('catches', CatchSchema, (c) => c.ID).values()].filter((c) => c.RunID === runId); }
    public async ListFeedback(catchId: string): Promise<Feedback[]> { return [...this.latest('feedback', FeedbackSchema, (f) => `${f.CatchID}|${f.User}|${f.At}`).values()].filter((f) => f.CatchID === catchId); }

    public async ListSessions(runId: string): Promise<SessionRecord[]> {
        return [...this.latest('sessions', SessionRecordSchema, (s) => `${s.RunID}|${s.Package}|${s.Method}|${s.RiskID ?? ''}`).values()].filter((s) => s.RunID === runId);
    }

    private append<T>(name: string, records: T[], schema: ZodType<T>): void {
        const lines = records.map((r) => JSON.stringify(schema.parse(r)));          // validate all before writing any
        for (const l of lines) this.redaction.AssertClean(l, `${name} record`);
        appendFileSync(join(this.dir, `${name}.jsonl`), lines.map((l) => `${l}\n`).join(''));
    }
    private latest<T>(name: string, schema: ZodType<T>, key: (r: T) => string): Map<string, T> {
        const p = join(this.dir, `${name}.jsonl`); const out = new Map<string, T>();
        if (!existsSync(p)) return out;
        for (const line of readFileSync(p, 'utf8').split('\n')) if (line.trim()) { const r = schema.parse(JSON.parse(line)); out.set(key(r), r); }
        return out;
    }
}
