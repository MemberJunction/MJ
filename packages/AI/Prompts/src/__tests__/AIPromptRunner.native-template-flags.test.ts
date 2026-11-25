/**
 * The Loop system prompt reads `_NATIVE_TOOL_CALLING` and `_NATIVE_CONTROL_FLOW` unconditionally,
 * so template parameter extraction marks both required. The runner must set them on every
 * hierarchical run, including one that declares no tools, or the template fails to render.
 */
import { describe, it, expect } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import { NativeToolCallingDecision } from '../nativeToolCallingGate';
import { AIPromptParams } from '@memberjunction/ai-core-plus';

class TestRunner extends AIPromptRunner {
    public Apply(data: Record<string, unknown> | undefined, decision: NativeToolCallingDecision | null): Record<string, unknown> {
        return this.ApplyNativeTemplateFlags(data, decision);
    }
    public Finalize(params: AIPromptParams, decision: NativeToolCallingDecision | null): Promise<void> {
        return (this as unknown as { finalizeTemplateData(p: AIPromptParams, d: NativeToolCallingDecision | null): Promise<void> }).finalizeTemplateData(params, decision);
    }
}

describe('ApplyNativeTemplateFlags', () => {
    const runner = new TestRunner();

    it('sets the envelope values when no tools were declared and the caller set nothing', () => {
        expect(runner.Apply(undefined, null)).toEqual({ _NATIVE_TOOL_CALLING: false, _NATIVE_CONTROL_FLOW: 'envelope' });
    });

    it('keeps the caller data alongside the envelope values', () => {
        expect(runner.Apply({ agentName: 'Sage' }, null)).toEqual({
            agentName: 'Sage',
            _NATIVE_TOOL_CALLING: false,
            _NATIVE_CONTROL_FLOW: 'envelope'
        });
    });

    it('keeps values the caller supplied when no tools were declared', () => {
        expect(runner.Apply({ _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'implicit' }, null)).toEqual({
            _NATIVE_TOOL_CALLING: true,
            _NATIVE_CONTROL_FLOW: 'implicit'
        });
    });

    it("uses the gate's decision when tools were declared, over anything the caller set", () => {
        const decision: NativeToolCallingDecision = { useNativeTools: true, mode: 'NativeImplicit', controlFlow: 'implicit', toolResults: true };
        expect(runner.Apply({ _NATIVE_TOOL_CALLING: false, _NATIVE_CONTROL_FLOW: 'envelope' }, decision)).toEqual({
            _NATIVE_TOOL_CALLING: true,
            _NATIVE_CONTROL_FLOW: 'implicit'
        });
    });
});

describe('OnTemplateDataFinalized — a caller that rendered from the data before a model was selected', () => {
    const runner = new TestRunner();
    const decision: NativeToolCallingDecision = { useNativeTools: true, mode: 'NativeImplicit', controlFlow: 'implicit', toolResults: true };

    it('is called once the native flags are set, so it can render again with them', async () => {
        const params = new AIPromptParams();
        params.data = { agentName: 'Sage' };
        const seen: Array<Record<string, unknown> | undefined> = [];
        params.OnTemplateDataFinalized = async (finalParams) => {
            seen.push({ ...finalParams.data });
            finalParams.PreRenderedChildTemplates = { agentPrompt: 'rendered for the native path' };
        };

        await runner.Finalize(params, decision);

        expect(seen).toEqual([{ agentName: 'Sage', _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'implicit' }]);
        // The runner reads the pre-rendered children after the callback, so it sees the new render.
        expect(params.PreRenderedChildTemplates).toEqual({ agentPrompt: 'rendered for the native path' });
    });

    it('is optional', async () => {
        const params = new AIPromptParams();
        await runner.Finalize(params, null);
        expect(params.data).toEqual({ _NATIVE_TOOL_CALLING: false, _NATIVE_CONTROL_FLOW: 'envelope' });
    });
});
