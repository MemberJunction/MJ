import type { BaseCatchRule } from '../contracts/BaseCatchRule';
import type { CatchContext, RuleOutcome } from '../types';
import { TestAst } from './TestAst';

export interface FilterResult { DroppedBy: string | null; Boosts: string[]; Outcomes: Record<string, RuleOutcome>; }
/** Runs drop rules first (the first to fire wins), then every boost rule. Every outcome is recorded so over-strict rules can be found (§9.1). */
export class RuleFilter {
    constructor(private readonly rules: BaseCatchRule[]) {}
    public Apply(c: CatchContext): FilterResult {
        if (!c.Ast) c.Ast = TestAst.Load(c.Test.Source, c.BaseRootDir, c.Test.FilePath.replace(/\/src\/__tests__\/jit\/.*$/, ''), c.Test.FilePath);
        const outcomes: Record<string, RuleOutcome> = {}; let droppedBy: string | null = null;
        for (const r of this.rules.filter((x) => x.Kind === 'Drop')) { outcomes[r.Name] = r.Evaluate(c); if (outcomes[r.Name].Fired) { droppedBy = r.Name; break; } }
        const boosts: string[] = [];
        for (const r of this.rules.filter((x) => x.Kind === 'Boost')) { outcomes[r.Name] = r.Evaluate(c); if (outcomes[r.Name].Fired) boosts.push(r.Name); }
        return { DroppedBy: droppedBy, Boosts: boosts, Outcomes: outcomes };
    }
}
