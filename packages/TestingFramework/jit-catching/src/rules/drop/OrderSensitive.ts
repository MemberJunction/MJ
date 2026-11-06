import ts from 'typescript';
import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
const ORDER_CALLS = new Set(['JSON.stringify', 'Object.keys', 'Object.entries']);
/** §9.1: the expect() argument itself is a JSON.stringify, Object.keys or Object.entries call, or a template that stringifies an object. */
export class OrderSensitive extends BaseCatchRule {
    public get Name(): string { return 'OrderSensitive'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const ast = c.Ast; if (!ast) return { Fired: false, Reason: 'no AST' };
        for (const raw of ast.ExpectArguments()) {
            const arg = unwrap(raw);
            if (ts.isCallExpression(arg) && ORDER_CALLS.has(ast.Text(arg.expression))) return { Fired: true, Reason: `line ${ast.LineOf(arg)} asserts on ${ast.Text(arg).slice(0, 40)}` };
            if (ts.isTemplateExpression(arg) && arg.templateSpans.some((s) => ts.isObjectLiteralExpression(s.expression))) return { Fired: true, Reason: `line ${ast.LineOf(arg)} stringifies an object` };
        }
        return { Fired: false, Reason: 'no order-dependent assertion' };
    }
}
/** Strips parentheses and `await` around an expression. */
function unwrap(e: ts.Expression): ts.Expression {
    let cur = e;
    while (ts.isParenthesizedExpression(cur) || ts.isAwaitExpression(cur)) cur = cur.expression;
    return cur;
}
