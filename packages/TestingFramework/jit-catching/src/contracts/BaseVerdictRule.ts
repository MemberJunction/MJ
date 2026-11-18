import type { ExecutionResult, Verdict } from '../types';

/** Turns the base and head results of one test into a verdict. */
export abstract class BaseVerdictRule {
    public abstract Classify(base: ExecutionResult[], head: ExecutionResult[]): Verdict;
}
