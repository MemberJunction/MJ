import type { CatchContext, JudgeScore } from '../types';

/** One LLM judge's score for one weak catch. */
export abstract class BaseCatchJudge {
    public abstract get Name(): string;
    public abstract Judge(context: CatchContext): Promise<JudgeScore>;
}
