import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

interface ModelSpecificInternals {
    resolveModelSpecificResponseFormat(
        prompt: MJAIPromptEntityExtended,
        modelSelectionPrompt?: MJAIPromptEntityExtended,
    ): unknown;
}

function makePrompt(overrides: { Name: string; ModelSpecificResponseFormat?: string | null }): MJAIPromptEntityExtended {
    return {
        Name: overrides.Name,
        ModelSpecificResponseFormat: overrides.ModelSpecificResponseFormat ?? null,
    } as unknown as MJAIPromptEntityExtended;
}

describe('AIPromptRunner — modelSelectionPrompt.ModelSpecificResponseFormat fallback', () => {
    let runner: AIPromptRunner;
    let internals: ModelSpecificInternals;

    beforeEach(() => {
        runner = new AIPromptRunner();
        internals = runner as unknown as ModelSpecificInternals;
    });

    it('inherits ModelSpecificResponseFormat from modelSelectionPrompt when prompt leaves it unset', () => {
        const systemLoopPrompt = makePrompt({ Name: 'System Loop Prompt', ModelSpecificResponseFormat: null });
        const agentPrompt = makePrompt({
            Name: 'Koala Prompt',
            ModelSpecificResponseFormat: '{"thinkingConfig":{"thinkingLevel":"MINIMAL"}}',
        });

        const resolved = internals.resolveModelSpecificResponseFormat(systemLoopPrompt, agentPrompt);

        expect(resolved).toEqual({ thinkingConfig: { thinkingLevel: 'MINIMAL' } });
    });

    it('prefers prompt.ModelSpecificResponseFormat over modelSelectionPrompt when both are set', () => {
        const mainPrompt = makePrompt({
            Name: 'Main Prompt',
            ModelSpecificResponseFormat: '{"thinkingConfig":{"thinkingLevel":"HIGH"}}',
        });
        const selectionPrompt = makePrompt({
            Name: 'Selection Prompt',
            ModelSpecificResponseFormat: '{"thinkingConfig":{"thinkingLevel":"MINIMAL"}}',
        });

        const resolved = internals.resolveModelSpecificResponseFormat(mainPrompt, selectionPrompt);

        expect(resolved).toEqual({ thinkingConfig: { thinkingLevel: 'HIGH' } });
    });

    it('returns undefined when neither prompt sets ModelSpecificResponseFormat', () => {
        const mainPrompt = makePrompt({ Name: 'Main Prompt', ModelSpecificResponseFormat: null });
        const selectionPrompt = makePrompt({ Name: 'Selection Prompt', ModelSpecificResponseFormat: null });

        expect(internals.resolveModelSpecificResponseFormat(mainPrompt, selectionPrompt)).toBeUndefined();
    });

    it('warns and returns undefined on invalid JSON without throwing', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mainPrompt = makePrompt({ Name: 'Main Prompt', ModelSpecificResponseFormat: null });
        const badSelectionPrompt = makePrompt({
            Name: 'Broken Selection Prompt',
            ModelSpecificResponseFormat: '{not-json',
        });

        const resolved = internals.resolveModelSpecificResponseFormat(mainPrompt, badSelectionPrompt);

        expect(resolved).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Broken Selection Prompt'),
            expect.anything(),
        );
        warnSpy.mockRestore();
    });
});
