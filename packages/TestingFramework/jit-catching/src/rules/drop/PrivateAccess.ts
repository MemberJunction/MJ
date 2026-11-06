import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';

/** §9.1: drops a catch whose test reads, writes or calls a member that is private or protected in base, however it reaches it. */
export class PrivateAccess extends BaseCatchRule {
    public get Name(): string { return 'PrivateAccess'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const ast = c.Ast; if (!ast) return { Fired: false, Reason: 'no AST' };
        for (const m of ast.MemberAccesses()) {
            const v = ast.DeclarationVisibility(m.Receiver, m.Name);
            if (v === 'private' || v === 'protected') return { Fired: true, Reason: `line ${ast.LineOf(m.Node)} reaches ${v} member ${m.Name}` };
        }
        return { Fired: false, Reason: 'only public members used' };
    }
}
