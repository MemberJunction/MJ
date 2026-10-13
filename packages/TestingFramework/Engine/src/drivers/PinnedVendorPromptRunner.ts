/**
 * @fileoverview A prompt runner that will not fail over away from the cell's pinned vendor.
 * @module @memberjunction/testing-engine
 */

import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { FailoverConfiguration } from '@memberjunction/ai-prompts';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Disables cross-vendor failover for a matrix cell that pinned a (model, vendor).
 *
 * **Why an eval run must not fail over.** A cell IS a vendor: `gpt-oss-120b · Cerebras · native`
 * means "this model, on Cerebras, with tools". The Loop agent-type system prompt ships
 * `FailoverStrategy = 'SameModelDifferentVendor'`, which is the right production behavior — a
 * transient Cerebras outage should not fail a user's agent run — and exactly the wrong measurement
 * behavior, because the row still lands in the results table under the Cerebras label.
 *
 * That is not hypothetical. An aborted comparison run recorded 27 results whose actual
 * failure was `Invalid Vertex AI credentials JSON`: a transient error on the pinned Google vendor
 * failed over to Vertex, whose credential in this environment is malformed. Those rows scored as
 * Google cells producing no output. A pinned run that fails is a data point; a pinned run that
 * silently measures somewhere else is a corrupted one.
 *
 * `getFailoverConfiguration` is `protected` and documented as the override point for exactly this,
 * so no production surface changes — the harness declines a behavior rather than the runner
 * growing a switch for it.
 */
export class PinnedVendorPromptRunner extends AIPromptRunner {
    protected override getFailoverConfiguration(prompt: MJAIPromptEntityExtended): FailoverConfiguration {
        return { ...super.getFailoverConfiguration(prompt), strategy: 'None' };
    }
}
