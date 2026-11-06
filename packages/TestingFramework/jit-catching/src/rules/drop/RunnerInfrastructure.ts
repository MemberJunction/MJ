import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
const PATTERNS = [/Cannot find module/, /Hook timed out/, /EADDRINUSE/, /ENOENT: no such file or directory/, /Failed to resolve import/, /ERR_MODULE_NOT_FOUND/];
export class RunnerInfrastructure extends BaseCatchRule {
    public get Name(): string { return 'RunnerInfrastructure'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const msg = c.Head[0]?.Failure?.Message ?? '';
        const hit = PATTERNS.find((p) => p.test(msg));
        return hit ? { Fired: true, Reason: `runner problem: ${hit.source}` } : { Fired: false, Reason: '' };
    }
}
