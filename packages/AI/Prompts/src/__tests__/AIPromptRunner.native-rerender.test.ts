/**
 * Failover re-renders the prompt when it changes the tool-calling path.
 *
 * The template's native wording is set from the first candidate's decision. A failover attempt
 * re-resolves the decision; when it lands on another path — envelope after native, or the hybrid
 * after implicit — the prompt is rendered again for that path, so the model is never taught a
 * protocol it is not being asked to use. An attempt on the same path keeps the text it has.
 */
import { describe, it, expect, vi } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import { RecordToolCallingDecision, type NativeToolCallingDecision } from '../nativeToolCallingGate';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { ChatParams } from '@memberjunction/ai';

interface RerenderInternals {
    registerNativeRerender(params: AIPromptParams, render: (data: Record<string, unknown>) => Promise<string>): void;
    rerenderForNativeDecision(rendered: string, chatParams: ChatParams, params: AIPromptParams, model: { Name: string }): Promise<string>;
}

const decision = (useNativeTools: boolean, controlFlow: 'implicit' | 'envelope'): NativeToolCallingDecision =>
    ({ useNativeTools, controlFlow, mode: useNativeTools ? (controlFlow === 'implicit' ? 'NativeImplicit' : 'Native') : 'Envelope', toolResults: useNativeTools } as NativeToolCallingDecision);

function setup(renderedFor: NativeToolCallingDecision) {
    const internals = new AIPromptRunner() as unknown as RerenderInternals;
    const params = new AIPromptParams();
    params.data = { _NATIVE_TOOL_CALLING: renderedFor.useNativeTools, _NATIVE_CONTROL_FLOW: renderedFor.controlFlow, other: 'kept' };
    const render = vi.fn(async (data: Record<string, unknown>) => `rendered for ${String(data._NATIVE_TOOL_CALLING)}/${String(data._NATIVE_CONTROL_FLOW)} (${String(data.other)})`);
    internals.registerNativeRerender(params, render);
    const attempt = (onPath: NativeToolCallingDecision) => {
        const chatParams = new ChatParams();
        RecordToolCallingDecision(chatParams, onPath);
        return internals.rerenderForNativeDecision('original text', chatParams, params, { Name: 'Fallback Model' });
    };
    return { attempt, render, params };
}

describe('rerenderForNativeDecision', () => {
    it('keeps the text when the attempt takes the path the prompt was rendered for', async () => {
        const { attempt, render } = setup(decision(true, 'implicit'));

        expect(await attempt(decision(true, 'implicit'))).toBe('original text');
        expect(render).not.toHaveBeenCalled();
    });

    it('re-renders for the envelope when a failover lands on a model without native tools', async () => {
        const { attempt } = setup(decision(true, 'implicit'));

        expect(await attempt(decision(false, 'envelope'))).toBe('rendered for false/envelope (kept)');
    });

    it('re-renders for the hybrid when a failover moves from implicit to envelope control flow', async () => {
        const { attempt } = setup(decision(true, 'implicit'));

        expect(await attempt(decision(true, 'envelope'))).toBe('rendered for true/envelope (kept)');
    });

    it('leaves the shared params untouched', async () => {
        const { attempt, params } = setup(decision(true, 'implicit'));

        await attempt(decision(false, 'envelope'));

        expect(params.data._NATIVE_TOOL_CALLING).toBe(true);
        expect(params.data._NATIVE_CONTROL_FLOW).toBe('implicit');
    });
});

describe('rerenderForNativeDecision — when the re-render fails', () => {
    it('sends the prompt as first rendered, and does not fail the attempt', async () => {
        const internals = new AIPromptRunner() as unknown as RerenderInternals;
        const params = new AIPromptParams();
        params.data = { _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'implicit' };
        internals.registerNativeRerender(params, async () => { throw new Error('template exploded'); });
        const chatParams = new ChatParams();
        RecordToolCallingDecision(chatParams, decision(false, 'envelope'));

        expect(await internals.rerenderForNativeDecision('original text', chatParams, params, { Name: 'Fallback Model' })).toBe('original text');
    });
});

describe('the parallel path — a per-task copy of the params', () => {
    interface ShareInternals extends RerenderInternals {
        ShareNativeRerender(original: AIPromptParams, copy: AIPromptParams): void;
    }

    it('re-renders through the copy once the renderer is shared with it', async () => {
        const internals = new AIPromptRunner() as unknown as ShareInternals;
        const params = new AIPromptParams();
        params.data = { _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'implicit' };
        internals.registerNativeRerender(params, async (data) => `rendered for ${String(data._NATIVE_TOOL_CALLING)}`);
        const copy: AIPromptParams = Object.assign(Object.create(Object.getPrototypeOf(params)), params);
        const chatParams = new ChatParams();
        RecordToolCallingDecision(chatParams, decision(false, 'envelope'));

        // A different runner instance, as each parallel task gets.
        const other = new AIPromptRunner() as unknown as ShareInternals;
        expect(await other.rerenderForNativeDecision('original text', chatParams, copy, { Name: 'M' })).toBe('original text');
        internals.ShareNativeRerender(params, copy);
        expect(await other.rerenderForNativeDecision('original text', chatParams, copy, { Name: 'M' })).toBe('rendered for false');
    });
});

describe('retryWithToolsStripped — the retry is taught the envelope', () => {
    interface RetryInternals extends RerenderInternals {
        retryWithToolsStripped(
            llm: unknown, chatParams: ChatParams, bound: { TimedOut: () => boolean; Dispose: () => void },
            model: unknown, vendorId: string | null, prompt: unknown, reason: string, params: AIPromptParams, renderedPrompt: string
        ): Promise<unknown>;
    }

    it('swaps the native-worded system prompt for one rendered for the envelope, keeping what was appended to it', async () => {
        const runner = new AIPromptRunner() as unknown as RetryInternals;
        const params = new AIPromptParams();
        params.data = { _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'implicit' };
        runner.registerNativeRerender(params, async (data) => `# Actions catalog (${String(data._NATIVE_TOOL_CALLING)}/${String(data._NATIVE_CONTROL_FLOW)})`);
        let seen: ChatParams | undefined;
        const llm = { ChatCompletion: async (p: ChatParams) => { seen = p; return { success: true }; } };
        const chatParams = new ChatParams();
        chatParams.messages = [{ role: 'system', content: 'Call the tools.\n\nPrefill instruction' }, { role: 'user', content: 'Go' }];
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await runner.retryWithToolsStripped(llm, chatParams, { TimedOut: () => false, Dispose: () => undefined },
            { Name: 'M', ID: 'm' }, null, { Name: 'P', AssistantPrefill: null }, 'tools rejected', params, 'Call the tools.');
        warn.mockRestore();

        expect(seen?.messages[0].content).toBe('# Actions catalog (false/envelope)\n\nPrefill instruction');
    });
});
