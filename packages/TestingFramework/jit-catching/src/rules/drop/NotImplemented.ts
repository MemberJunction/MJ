import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
export class NotImplemented extends BaseCatchRule {
    public get Name(): string { return 'NotImplemented'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const msg = c.Head[0]?.Failure?.Message ?? '';
        return /not implemented/i.test(msg) ? { Fired: true, Reason: 'head throws "not implemented"' } : { Fired: false, Reason: '' };
    }
}
