import ts from 'typescript';
import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { TestAst } from '../TestAst';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
import { FirstFrameTestLine } from './BrokenMock';
/**
 * §9.1: a ReferenceError or TypeError whose first frame is a test-file line that calls nothing, so the code under test was not reached.
 * A call or `new` counts on every line it spans, except lines only inside a function passed to it. For a TypeError, a value on the line that the
 * test got from a call also counts.
 */
export class TestOwnError extends BaseCatchRule {
    public get Name(): string { return 'TestOwnError'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const name = c.Head[0]?.Failure?.ErrorName; if (name !== 'ReferenceError' && name !== 'TypeError') return { Fired: false, Reason: 'not a Reference/TypeError' };
        const ast = c.Ast; const line = FirstFrameTestLine(c); if (!ast || line === null) return { Fired: false, Reason: 'first frame is not in the test file' };
        if (lineHasCall(ast, line)) return { Fired: false, Reason: `line ${line} calls into code` };
        if (name === 'TypeError' && lineUsesCallResult(ast, line)) return { Fired: false, Reason: `line ${line} uses a value returned by a call` };
        return { Fired: true, Reason: `${name} at line ${line}, which calls nothing` };
    }
}
function endLine(ast: TestAst, n: ts.Node): number { return ast.SourceFile.getLineAndCharacterOfPosition(n.getEnd()).line + 1; }
function spans(ast: TestAst, n: ts.Node, line: number): boolean { return line >= ast.LineOf(n) && line <= endLine(ast, n); }
function isCallLike(n: ts.Node): n is ts.CallExpression | ts.NewExpression { return ts.isCallExpression(n) || ts.isNewExpression(n); }
/** True when the line touches a call's start, callee or non-function arguments; a line only inside a function passed to the call does not count. */
function callTouchesLine(ast: TestAst, n: ts.CallExpression | ts.NewExpression, line: number): boolean {
    if (!spans(ast, n, line)) return false;
    const parts: ts.Node[] = [n.expression, ...(n.arguments ?? []).filter((a) => !ts.isFunctionLike(a))];
    return ast.LineOf(n) === line || parts.some((p) => spans(ast, p, line));
}
/** True when a call or `new` other than an `expect(...)` chain touches the line. */
function lineHasCall(ast: TestAst, line: number): boolean {
    let found = false;
    const visit = (n: ts.Node): void => {
        if (found) return;
        if (isCallLike(n) && !/^expect\b/.test(ast.Text(n.expression)) && callTouchesLine(ast, n, line)) { found = true; return; }
        ts.forEachChild(n, visit);
    };
    visit(ast.SourceFile);
    return found;
}
function containsCall(n: ts.Node): boolean { return isCallLike(n) || (ts.forEachChild(n, (k) => containsCall(k) || undefined) ?? false); }
/** True when an identifier on the line is declared in the test file with an initializer that contains a call or `new`. */
function lineUsesCallResult(ast: TestAst, line: number): boolean {
    let found = false;
    const visit = (n: ts.Node): void => {
        if (found) return;
        if (ts.isIdentifier(n) && ast.LineOf(n) === line) {
            const decls = ast.Checker.getSymbolAtLocation(n)?.declarations ?? [];
            found = decls.some((d) => d.getSourceFile() === ast.SourceFile && ts.isVariableDeclaration(d) && d.initializer !== undefined && containsCall(d.initializer));
        }
        ts.forEachChild(n, visit);
    };
    visit(ast.SourceFile);
    return found;
}
