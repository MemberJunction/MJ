import ts from 'typescript';
import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';

const ACCESS_RE = /\b(CanRead|CanCreate|CanUpdate|CanDelete|canRead|canCreate|canUpdate|canDelete|RowLevelSecurity|RLS|Permission|Permissions|Role|Roles|Authorize|IsAuthorized)\b/;
/**
 * §9.1: the test checks access for roles, users or entities that the diff does not mention, and the answer changed.
 * The strings are the string literals inside calls whose callee name (the last name in the callee) is an access check. The rule fires only when the diff mentions none of them.
 */
export class AccessChange extends BaseCatchRule {
    public get Name(): string { return 'AccessChange'; }
    public get Kind(): RuleKind { return 'Boost'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const ast = c.Ast; if (!ast) return { Fired: false, Reason: 'no program' };
        const literals = accessLiterals(ast.SourceFile, (n) => ast.Text(n));
        if (literals === null) return { Fired: false, Reason: 'no access check in the test' };
        if (literals.length === 0) return { Fired: false, Reason: 'the access check names no role or entity' };
        const diffText = changedLinesText(c);
        const mentioned = literals.filter((l) => diffText.includes(l));
        return mentioned.length === 0
            ? { Fired: true, Reason: `access changed for ${literals.join(', ')}, which the diff does not mention` }
            : { Fired: false, Reason: `the diff mentions ${mentioned[0]}` };
    }
}
/** String literals inside access-check calls; null when the test has no access-check call. */
function accessLiterals(sf: ts.SourceFile, text: (n: ts.Node) => string): string[] | null {
    let found = false; const out = new Set<string>();
    const collect = (n: ts.Node): void => { if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { if (n.text.trim() !== '') out.add(n.text); } ts.forEachChild(n, collect); };
    const visit = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ACCESS_RE.test(calleeName(n.expression, text))) { found = true; n.arguments.forEach(collect); }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return found ? [...out] : null;
}
/** The added and removed lines of every hunk in the PR, joined by newlines. */
function changedLinesText(c: CatchContext): string {
    return c.Analysis.ChangedFiles.flatMap((f) => f.Hunks).flatMap((h) => h.Lines).filter((l) => l.startsWith('+') || l.startsWith('-')).join('\n');
}
/** The last name of a callee: `b` for `a.b`, otherwise the callee text. */
function calleeName(e: ts.Expression, text: (n: ts.Node) => string): string { return ts.isPropertyAccessExpression(e) ? e.name.text : text(e); }
