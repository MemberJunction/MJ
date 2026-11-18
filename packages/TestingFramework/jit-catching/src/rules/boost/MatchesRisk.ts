import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
/** §9.1: head fails with the same assertion and actual value as the risk's mutant did. A thrown-error pair (no assertion) also needs the same error name. */
export class MatchesRisk extends BaseCatchRule {
    public get Name(): string { return 'MatchesRisk'; }
    public get Kind(): RuleKind { return 'Boost'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const m = c.Test.MutantFailure; const h = c.Head[0]?.Failure; if (!m || !h) return { Fired: false, Reason: 'no mutant' };
        const sameError = m.Assertion !== null || (m.ErrorName !== null && m.ErrorName === h.ErrorName);
        const fired = sameError && m.Assertion === h.Assertion && m.Actual === h.Actual;
        return { Fired: fired, Reason: fired ? 'head fails exactly as the mutant did' : 'head fails differently from the mutant' };
    }
}
