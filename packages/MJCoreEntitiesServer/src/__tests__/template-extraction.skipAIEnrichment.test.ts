/**
 * Verifies the template extraction pipeline's AI opt-out: with skipAIEnrichment the AI prompt
 * runner is never constructed, yet parameters are still extracted deterministically.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const { mockExecutePrompt, mockConfig } = vi.hoisted(() => ({
    mockExecutePrompt: vi.fn().mockResolvedValue({ success: false }),
    mockConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class {
        ExecutePrompt = mockExecutePrompt;
    },
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: mockConfig,
            Prompts: [{ Name: 'Template Parameter Extraction', Category: 'MJ: System' }],
        },
    },
}));

import { RunTemplateExtractionPipeline } from '../custom/template-extraction';

const user = { ID: 'u-1' } as UserInfo;

describe('RunTemplateExtractionPipeline AI opt-out', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('makes no prompt call and still extracts parameters when skipAIEnrichment is true', async () => {
        const result = await RunTemplateExtractionPipeline('Hello {{ name }}', 'T', user, true);
        expect(mockExecutePrompt).not.toHaveBeenCalled();
        expect(mockConfig).not.toHaveBeenCalled();
        expect(result.parameters.map(p => p.name)).toContain('name');
    });

    it('runs the prompt when skipAIEnrichment is false', async () => {
        await RunTemplateExtractionPipeline('Hello {{ name }}', 'T', user, false);
        expect(mockExecutePrompt).toHaveBeenCalledTimes(1);
    });
});
