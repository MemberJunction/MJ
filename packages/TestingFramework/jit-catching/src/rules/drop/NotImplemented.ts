import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
/** §9.1: the head throws a "not implemented" error (not an assertion that mentions it). */
export class NotImplemented extends BaseCatchRule {
    public get Name(): string { return 'NotImplemented'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const f = c.Head[0]?.Failure;
        if (!f || f.Assertion !== null) return { Fired: false, Reason: 'head failure is not a thrown error' };
        return /not implemented/i.test(f.Message) ? { Fired: true, Reason: 'head throws "not implemented"' } : { Fired: false, Reason: 'thrown error is not "not implemented"' };
    }
}
