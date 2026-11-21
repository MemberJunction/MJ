/**
 * @fileoverview Reads the parts of a model's answer that are not outputs. Pure; no dependency on
 * @memberjunction/core or database entities.
 * @module @memberjunction/feature-pipelines
 */

/** A model's parsed answer, as a Feature Pipeline driver returns it. */
export class ModelAnswer {
    /**
     * The model's reasoning: a top-level key named "reasoning" in any case (a model may answer `Reasoning`) holding a
     * non-empty string. Empty or whitespace-only reasoning, a non-string value, or an answer that is not an object is
     * none (undefined), so every reader records the same thing for the same answer.
     * @param answer - the parsed answer; `unknown` on purpose, a model's JSON of any shape
     */
    public static Reasoning(answer: unknown): string | undefined {
        if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
            return undefined;
        }
        const record: Record<string, unknown> = { ...answer };
        const key = Object.keys(record).find((k) => k.toLowerCase() === 'reasoning');
        const value = key === undefined ? undefined : record[key];
        return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
    }
}
