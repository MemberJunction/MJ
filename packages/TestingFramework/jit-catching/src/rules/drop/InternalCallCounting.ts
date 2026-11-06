import ts from 'typescript';
import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
const COUNT_MATCHERS = new Set(['toHaveBeenCalledTimes', 'toHaveBeenCalledWith', 'toHaveBeenNthCalledWith', 'toHaveBeenLastCalledWith']);
/** §9.1: call-count assertions on a spy of an instance or prototype method (not an exported module function). */
export class InternalCallCounting extends BaseCatchRule {
    public get Name(): string { return 'InternalCallCounting'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const ast = c.Ast; if (!ast) return { Fired: false, Reason: 'no AST' };
        const internalSpies = new Set<string>();
        for (const call of ast.CallsTo(['vi.spyOn'])) {
            const target = call.arguments[0]; if (!target) continue;
            const isModuleNamespace = ts.isIdentifier(target) && ast.Checker.getSymbolAtLocation(target)?.declarations?.some((d) => ts.isNamespaceImport(d));
            if (isModuleNamespace) continue;
            const decl = call.parent; if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) internalSpies.add(decl.name.text);
        }
        for (const expectCall of ast.CallsTo(['expect'])) {
            const arg = expectCall.arguments[0]; const matcher = expectCall.parent;
            if (!arg || !ts.isIdentifier(arg) || !internalSpies.has(arg.text) || !ts.isPropertyAccessExpression(matcher) || !COUNT_MATCHERS.has(matcher.name.text)) continue;
            return { Fired: true, Reason: `line ${ast.LineOf(expectCall)}: ${matcher.name.text} on internal spy ${arg.text}` };
        }
        return { Fired: false, Reason: 'no call counting on internal spies' };
    }
}
