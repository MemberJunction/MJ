import { BaseCatchRule } from '../../contracts/BaseCatchRule';
import type { CatchContext, RuleKind, RuleOutcome } from '../../types';
/** §9.1: the head failure's first frame is inside a vi.mock factory or a setup hook. */
export class BrokenMock extends BaseCatchRule {
    public get Name(): string { return 'BrokenMock'; }
    public get Kind(): RuleKind { return 'Drop'; }
    public Evaluate(c: CatchContext): RuleOutcome {
        const ast = c.Ast; const line = FailingTestLine(c); if (!ast || line === null) return { Fired: false, Reason: 'no frame in the test file' };
        for (const kind of ['vi.mock', 'beforeEach', 'beforeAll'] as const) for (const r of ast.RangesOf(kind)) if (line >= r.Start && line <= r.End) return { Fired: true, Reason: `failure at line ${line} is inside ${kind}` };
        return { Fired: false, Reason: 'failure is in a test body' };
    }
}
/** Line number of the first stack frame that points into the test file, or null. Shared by BrokenMock and TestOwnError. */
export function FailingTestLine(c: CatchContext): number | null {
    const frame = c.Head[0]?.Failure?.StackExcerpt ?? ''; const file = c.Test.FilePath.split('/').pop() ?? '';
    const m = new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):\\d+`).exec(frame);
    return m ? Number(m[1]) : null;
}
