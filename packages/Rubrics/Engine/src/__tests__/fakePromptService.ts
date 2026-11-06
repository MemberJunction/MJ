import type { RubricPromptOutput, RubricPromptRequest, RubricPromptService } from '../evaluatorServices.js';

/**
 * A prompt service for unit tests. Criteria render as "rendered <key>"; Run answers with `reply`
 * (the default throws, for tests that never call the model) and records every request.
 */
export function FakePromptService(reply?: (input: RubricPromptRequest) => Promise<RubricPromptOutput>): RubricPromptService & { Requests: RubricPromptRequest[] } {
    const requests: RubricPromptRequest[] = [];
    return {
        Requests: requests,
        async Run(input) {
            requests.push(input);
            if (!reply) throw new Error('This test does not expect a model call.');
            return reply(input);
        },
        async RenderCriteria(input) {
            return input.Items.map(item => `rendered ${item.Criterion.Key}`);
        },
        async Preview() {
            return '';
        },
    };
}
