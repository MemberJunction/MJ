import ts from 'typescript';
import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
/** §9.1: the assertion compares JSON.stringify output, Object.keys order, or a stringified object. */
export class OrderSensitive extends BaseCatchRule {
    public get Name(): string { return 'OrderSensitive'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const ast = c.Ast; if (!ast) return { Fired: false, Reason: 'no AST' };
        for (const arg of ast.ExpectArguments()) {
            const text = ast.Text(arg);
            if (/\bJSON\.stringify\s*\(|\bObject\.keys\s*\(|\bObject\.entries\s*\(/.test(text)) return { Fired: true, Reason: `line ${ast.LineOf(arg)} asserts on ${text.slice(0, 40)}` };
            if (ts.isTemplateExpression(arg) && arg.templateSpans.some((s) => ts.isObjectLiteralExpression(s.expression))) return { Fired: true, Reason: `line ${ast.LineOf(arg)} stringifies an object` };
        }
        return { Fired: false, Reason: 'no order-dependent assertion' };
    }
}
