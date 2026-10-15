/**
 * @fileoverview Reads a persisted Feature Pipeline run result. A run's `MJ: Process Runs.ResultSummary` holds a
 * {@link FeaturePipelineRunResult} as JSON; the reader lives beside the type so the Explorer's Feature Pipelines card reads it
 * the same way wherever it is shown (the integration checks keep their own stricter reader).
 * @module @memberjunction/record-set-processor-base
 */
import { SafeJSONParse } from '@memberjunction/global';
import type { FeaturePipelineRunResult } from './types';

/** Reads the `ResultSummary` of a Feature Pipeline run. */
export class FeaturePipelineRunResults {
    /**
     * The run result held in a `ResultSummary`, or null when the text is empty, is not JSON, or is not a Feature
     * Pipeline result (a run from before result summaries, another work type's summary): recognised by the four run
     * counts every result carries.
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
