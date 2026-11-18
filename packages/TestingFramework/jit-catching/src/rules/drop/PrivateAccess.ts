import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';

/** §9.1, D43: drops a catch whose test reaches a private member, or a protected member other than through `this` or `super` inside a subclass the test declares. */
export class PrivateAccess extends BaseCatchRule {
    public get Name(): string { return 'PrivateAccess'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const ast = c.Ast; if (!ast) return { Fired: false, Reason: 'no AST' };
        for (const m of ast.MemberAccesses()) {
            const v = ast.DeclarationVisibility(m.Receiver, m.Name);
            if (v === 'private' || (v === 'protected' && !ast.ProtectedAccessFromTestSubclass(m))) return { Fired: true, Reason: `line ${ast.LineOf(m.Node)} reaches ${v} member ${m.Name}` };
        }
        return { Fired: false, Reason: 'only public members used' };
    }
}
