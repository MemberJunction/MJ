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
/** Matches `<test file name>:<line>:<col>` where the name is not the tail of a longer file name. */
function testFramePattern(c: CatchContext): RegExp {
    const file = c.Test.FilePath.split('/').pop() ?? '';
    return new RegExp(`(?:^|[\\s/(])${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):\\d+`);
}
/** Line number of the first stack frame that points into the test file, or null. Shared by BrokenMock and TestOwnError. */
export function FailingTestLine(c: CatchContext): number | null {
    const m = testFramePattern(c).exec(c.Head[0]?.Failure?.StackExcerpt ?? '');
    return m ? Number(m[1]) : null;
}
/** Line number of the first stack frame (the first non-empty line, in any format) when that frame is in the test file; null otherwise. */
export function FirstFrameTestLine(c: CatchContext): number | null {
    const first = (c.Head[0]?.Failure?.StackExcerpt ?? '').split('\n').find((l) => l.trim() !== '');
    const m = first ? testFramePattern(c).exec(first) : null;
    return m ? Number(m[1]) : null;
}
