/**
 * @fileoverview Reads a persisted Feature Pipeline run result (`MJ: Process Runs.ResultSummary`).
 * @module @memberjunction/record-set-processor-base
 */
import { SafeJSONParse } from '@memberjunction/global';
import type { FeaturePipelineRunResult } from './types';

/** Reads the `ResultSummary` of a Feature Pipeline run. */
export class FeaturePipelineRunResults {
    /**
     * The run result held in a `ResultSummary`, or null when the text is empty, not JSON, or not a Feature Pipeline
     * result (recognised by its four run counts).
     * @param text - the `ResultSummary` column
     */
    public static Parse(text: string | null | undefined): FeaturePipelineRunResult | null {
        const parsed = text ? SafeJSONParse<FeaturePipelineRunResult>(text) : null;
        const isResult =
            !!parsed &&
            typeof parsed === 'object' &&
            typeof parsed.Attempted === 'number' &&
            typeof parsed.Upserted === 'number' &&
            typeof parsed.Unchanged === 'number' &&
            typeof parsed.Previewed === 'number';
        return isResult ? parsed : null;
    }
}
