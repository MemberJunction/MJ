import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
/** §9.1: the PR's intent (logging, config) should only add, so a changed result is more likely a bug. */
export class AdditiveChangeBrokeOutput extends BaseCatchRule {
    public get Name(): string { return 'AdditiveChangeBrokeOutput'; }
    public get Kind(): RuleKind { return 'Boost'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const i = c.Analysis.IntentType; const fired = i === 'logging' || i === 'config';
        return { Fired: fired, Reason: fired ? `intent ${i} should only add` : '' };
    }
}
