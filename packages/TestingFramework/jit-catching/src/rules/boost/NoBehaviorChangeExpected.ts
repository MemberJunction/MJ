import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
/** §9.1: the PR's intent (refactor, perf, dead code removal) should not change behavior, so a changed result is more likely a bug. */
export class NoBehaviorChangeExpected extends BaseCatchRule {
    public get Name(): string { return 'NoBehaviorChangeExpected'; }
    public get Kind(): RuleKind { return 'Boost'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const i = c.Analysis.IntentType; const fired = i === 'refactor' || i === 'perf' || i === 'dead_code_removal';
        return { Fired: fired, Reason: fired ? `intent ${i} should not change behavior` : '' };
    }
}
