import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';

const EMPTY = new Set(['null', 'undefined', '[]', '{}', "''", '""']);
/** §9.1: head returns an empty value where a value was expected, from a call (the first one asserted on) that the diff does not touch. */
export class UnexpectedEmpty extends BaseCatchRule {
    public get Name(): string { return 'UnexpectedEmpty'; }
    public get Kind(): RuleKind { return 'Boost'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const f = c.Head[0]?.Failure;
        if (!f?.Actual || !f.Expected || !EMPTY.has(f.Actual.trim()) || EMPTY.has(f.Expected.trim())) return { Fired: false, Reason: 'head value is not unexpectedly empty' };
        const callee = /expect\(\s*(?:await\s+)?[\w.]*?\.?(\w+)\s*\(/.exec(c.Test.Source)?.[1] ?? null;
        if (callee === null) return { Fired: false, Reason: 'no call asserted on' };
        if (new RegExp(`\\b${callee}\\b`).test(changedLinesText(c))) return { Fired: false, Reason: 'the diff touches the asserted expression' };
        return { Fired: true, Reason: `${callee}() now returns ${f.Actual.trim()} and the diff does not touch it` };
    }
}
/** The added and removed lines of every hunk in the PR, joined by newlines. */
function changedLinesText(c: CatchContext): string {
    return c.Analysis.ChangedFiles.flatMap((f) => f.Hunks).flatMap((h) => h.Lines).filter((l) => l.startsWith('+') || l.startsWith('-')).join('\n');
}
