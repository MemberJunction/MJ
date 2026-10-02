/**
 * @fileoverview A decision runner that never fails over away from the candidate it selected.
 * @module @memberjunction/testing-engine
 */

import { AIDecisionRunner } from '@memberjunction/ai-prompts';
import type { FailoverConfiguration } from '@memberjunction/ai-prompts';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Turns off failover for a Decision Eval cell, as `PinnedVendorPromptRunner` does for a Prompt Eval
 * cell.
 *
 * A cell that pins a model is a measurement of that model. `AIDecisionRunner` fails over according
 * to the decision prompt's `FailoverStrategy`, which is right in production and wrong here: a run
 * answered by another candidate still lands under the pinned cell's label. With failover off, a
 * pinned candidate that fails is a failed run, which is a data point; one that silently answered
 * elsewhere would be a corrupted one.
 *
 * `getFailoverConfiguration` is the runner's documented override point, so no production surface
 * changes. Model pinning itself uses the runner's own mechanism, `AIDecisionParams.override`.
 */
export class PinnedDecisionRunner extends AIDecisionRunner {
    protected override getFailoverConfiguration(prompt: MJAIPromptEntityExtended): FailoverConfiguration {
        return { ...super.getFailoverConfiguration(prompt), strategy: 'None' };
    }
}
