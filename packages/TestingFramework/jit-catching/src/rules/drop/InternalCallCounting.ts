import ts from 'typescript';
import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { TestAst } from '../TestAst';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
const COUNT_MATCHERS = new Set(['toHaveBeenCalledTimes', 'toHaveBeenCalledWith', 'toHaveBeenNthCalledWith', 'toHaveBeenLastCalledWith']);
/** §9.1: call-count assertions on a spy of an instance or prototype method (not an exported module function). Spies are matched by symbol. */
export class InternalCallCounting extends BaseCatchRule {
    public get Name(): string { return 'InternalCallCounting'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const ast = c.Ast; if (!ast) return { Fired: false, Reason: 'no AST' };
        const internalSpies = collectInternalSpies(ast);
        for (const expectCall of ast.CallsTo(['expect'])) {
            const arg = expectCall.arguments[0]; const matcher = matcherOf(expectCall);
            if (!arg || !ts.isIdentifier(arg) || !matcher || !COUNT_MATCHERS.has(matcher)) continue;
            const sym = ast.Checker.getSymbolAtLocation(arg);
            if (sym && internalSpies.has(sym)) return { Fired: true, Reason: `line ${ast.LineOf(expectCall)}: ${matcher} on internal spy ${arg.text}` };
        }
        return { Fired: false, Reason: 'no call counting on internal spies' };
    }
}
/** Symbols of variables that hold a `vi.spyOn` spy (possibly through a `.mockX(...)` chain) whose target is not a namespace import. */
function collectInternalSpies(ast: TestAst): Set<ts.Symbol> {
    const out = new Set<ts.Symbol>();
    for (const call of ast.CallsTo(['vi.spyOn'])) {
        const target = call.arguments[0]; if (!target) continue;
        const isModuleNamespace = ts.isIdentifier(target) && ast.Checker.getSymbolAtLocation(target)?.declarations?.some((d) => ts.isNamespaceImport(d));
        if (isModuleNamespace) continue;
        let top: ts.Node = call;
        while ((ts.isPropertyAccessExpression(top.parent) || ts.isCallExpression(top.parent)) && top.parent.expression === top) top = top.parent;
        const decl = top.parent;
        if (ts.isVariableDeclaration(decl) && decl.initializer === top && ts.isIdentifier(decl.name)) {
            const sym = ast.Checker.getSymbolAtLocation(decl.name); if (sym) out.add(sym);
        }
    }
    return out;
}
/** Name of the matcher called on `expect(x)`, skipping a `.not`. */
function matcherOf(expectCall: ts.CallExpression): string | null {
    let p: ts.Node = expectCall.parent;
    if (ts.isPropertyAccessExpression(p) && p.name.text === 'not') p = p.parent;
    return ts.isPropertyAccessExpression(p) ? p.name.text : null;
}
