import ts from 'typescript';
import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
import { FailingTestLine } from './BrokenMock';
/** §9.1: a ReferenceError or TypeError raised on a test-file line that calls nothing (so the code under test was not reached). */
export class TestOwnError extends BaseCatchRule {
    public get Name(): string { return 'TestOwnError'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const name = c.Head[0]?.Failure?.ErrorName; if (name !== 'ReferenceError' && name !== 'TypeError') return { Fired: false, Reason: 'not a Reference/TypeError' };
        const ast = c.Ast; const line = FailingTestLine(c); if (!ast || line === null) return { Fired: false, Reason: 'no frame in the test file' };
        let hasCall = false;
        const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && ast.LineOf(n) === line && !/^expect\b/.test(ast.Text(n.expression))) hasCall = true; ts.forEachChild(n, visit); };
        visit(ast.SourceFile);
        return hasCall ? { Fired: false, Reason: `line ${line} calls into code` } : { Fired: true, Reason: `${name} at line ${line}, which calls nothing` };
    }
}
