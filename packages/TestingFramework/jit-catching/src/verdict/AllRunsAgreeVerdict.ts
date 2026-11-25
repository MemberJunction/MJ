import { BaseVerdictRule } from '../contracts/BaseVerdictRule';
import type { ExecutionResult, Verdict } from '../types';

/** §7 verdict table. All repeats on each side must agree; compile status comes from the type check. */
export class AllRunsAgreeVerdict extends BaseVerdictRule {
    constructor(private readonly typeErrors: { Base: string | null; Head: string | null }) { super(); }

    public Classify(base: ExecutionResult[], head: ExecutionResult[]): Verdict {
        if (this.typeErrors.Base !== null) return { Label: 'Invalid', Timeout: false, Reason: `does not compile on base: ${this.typeErrors.Base.split('\n')[0]}` };
        if (base.length === 0 || head.length === 0) return { Label: 'Invalid', Timeout: false, Reason: 'missing runs' };
        if (!base.every((r) => r.Status === 'Pass')) return { Label: 'Invalid', Timeout: false, Reason: `base: ${summarize(base)}` };
        if (this.typeErrors.Head !== null) return { Label: 'ApiChanged', Timeout: false, Reason: `does not compile on head: ${this.typeErrors.Head.split('\n')[0]}` };
        if (head.some((r) => r.Status === 'RunnerError')) return { Label: 'Invalid', Timeout: false, Reason: `head: RunnerError — ${head.find((r) => r.Status === 'RunnerError')?.Failure?.Message ?? ''}` };
        if (head.every((r) => r.Status === 'Pass')) return { Label: 'PassesBoth', Timeout: false, Reason: 'passes on both revisions' };
        if (head.every((r) => r.Status === 'Timeout')) return { Label: 'WeakCatch', Timeout: true, Reason: 'times out on head in every run' };
        if (head.every((r) => r.Status === 'Fail') && sameFailure(head)) return { Label: 'WeakCatch', Timeout: false, Reason: head[0].Failure?.Assertion ?? head[0].Failure?.Message ?? 'fails on head' };
        return { Label: 'Flaky', Timeout: false, Reason: `head: ${summarize(head)}` };
    }
}
function sameFailure(rs: ExecutionResult[]): boolean {
    const key = (r: ExecutionResult) => `${r.TestName}|${r.Failure?.ErrorName}|${r.Failure?.Assertion}|${r.Failure?.Actual}`;
    return new Set(rs.map(key)).size === 1;
}
function summarize(rs: ExecutionResult[]): string { return rs.map((r) => r.Status).join('/'); }
