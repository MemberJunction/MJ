import type { CatchContext, RuleKind, RuleOutcome } from '../types';

/** A deterministic check over one weak catch. */
export abstract class BaseCatchRule {
    public abstract get Name(): string;
    public abstract get Kind(): RuleKind;
    public abstract Evaluate(context: CatchContext): RuleOutcome;
}
