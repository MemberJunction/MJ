import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
/** §9.1: the test calls Save() or Create() and head reports false or an error that names Save/Create. */
export class SaveFailure extends BaseCatchRule {
    public get Name(): string { return 'SaveFailure'; }
    public get Kind(): RuleKind { return 'Boost'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const f = c.Head[0]?.Failure; const saves = /\.(Save|Create)\s*\(/.test(c.Test.Source);
        const fired = saves && !!f && (f.Actual?.trim() === 'false' || /Save|Create/.test(f.Message));
        return { Fired: fired, Reason: fired ? 'entity Save()/Create() fails on head' : '' };
    }
}
