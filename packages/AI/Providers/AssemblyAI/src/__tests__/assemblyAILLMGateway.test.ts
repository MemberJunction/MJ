import { describe, it, expect, vi, afterEach } from 'vitest';
import { AssemblyAILLMGateway, type LLMEvent, type LLMRequest, type LLMTransport } from '../voice/assemblyAILLMGateway';

const REQUEST: LLMRequest = {
    Model: 'gemma-4-31b',
    Messages: [{ role: 'user', content: 'hi' }],
    Tools: [{ Name: 'get_weather', Description: 'd', ParametersSchema: { type: 'object', properties: {} } }],
    MaxOutputTokens: 500,
};

/** A transport that plays the given chunk lists, one per attempt; an Error entry throws. */
function scripted(...attempts: Array<Array<unknown> | Error>): { transport: LLMTransport; bodies: Array<Record<string, unknown>>; signals: AbortSignal[] } {
    const bodies: Array<Record<string, unknown>> = [];
    const signals: AbortSignal[] = [];
    const transport: LLMTransport = async (body, signal) => {
        bodies.push(body as unknown as Record<string, unknown>);
        signals.push(signal);
        const script = attempts[bodies.length - 1];
        if (script instanceof Error) throw script;
        return (async function* () {
            for (const c of script ?? []) {
                if (c instanceof Error) throw c;
                yield c as never;
            }
        })();
    };
    return { transport, bodies, signals };
}
const text = (content: string) => ({ choices: [{ delta: { content } }] });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

async function collect(gateway: AssemblyAILLMGateway, signal = new AbortController().signal, request = REQUEST): Promise<LLMEvent[]> {
    const out: LLMEvent[] = [];
    for await (const e of gateway.Stream(request, signal)) out.push(e);
    return out;
}

describe('AssemblyAILLMGateway', () => {
    afterEach(() => vi.useRealTimers());

    it('streams text and then usage', async () => {
        const { transport } = scripted([text('Hel'), text('lo'), { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }]);
        expect(await collect(new AssemblyAILLMGateway(transport))).toEqual([
            { Kind: 'text', Text: 'Hel' },
            { Kind: 'text', Text: 'lo' },
            { Kind: 'usage', InputTokens: 10, OutputTokens: 2 },
        ]);
    });

    it('sends the model, tools, and a token cap', async () => {
        const { transport, bodies } = scripted([text('x')]);
        await collect(new AssemblyAILLMGateway(transport));
        expect(bodies[0]).toMatchObject({
            model: 'gemma-4-31b',
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: 500,
            tools: [{ type: 'function', function: { name: 'get_weather', description: 'd', parameters: { type: 'object', properties: {} } } }],
        });
    });

    it('sends no tools key when there are none', async () => {
        const { transport, bodies } = scripted([text('x')]);
        await collect(new AssemblyAILLMGateway(transport), undefined, { ...REQUEST, Tools: [] });
        expect('tools' in bodies[0]).toBe(false);
    });

    it('assembles tool calls from deltas by index, in order', async () => {
        const { transport } = scripted([
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'get_weather', arguments: '{"ci' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 1, id: 'b', function: { name: 'other', arguments: '' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ty":"Paris"}' } }] } }] },
        ]);
        expect(await collect(new AssemblyAILLMGateway(transport))).toEqual([
            { Kind: 'toolCalls', Calls: [{ CallID: 'a', Name: 'get_weather', Arguments: '{"city":"Paris"}' }, { CallID: 'b', Name: 'other', Arguments: '{}' }] },
        ]);
    });

    it('makes up an id when the provider sends none', async () => {
        const { transport } = scripted([{ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'x', arguments: '{}' } }] } }] }]);
        const [event] = await collect(new AssemblyAILLMGateway(transport));
        expect(event.Kind === 'toolCalls' && event.Calls[0].CallID.length > 0).toBe(true);
    });

    it.each([429, 500, 503])('tries again once on HTTP %d before anything streamed', async (status) => {
        const { transport, bodies } = scripted(httpError(status), [text('ok')]);
        expect(await collect(new AssemblyAILLMGateway(transport))).toEqual([{ Kind: 'text', Text: 'ok' }]);
        expect(bodies).toHaveLength(2);
    });

    it('does not retry a bad request', async () => {
        const { transport, bodies } = scripted(httpError(400));
        await expect(collect(new AssemblyAILLMGateway(transport))).rejects.toThrow('HTTP 400');
        expect(bodies).toHaveLength(1);
    });

    it('gives up after the second failure', async () => {
        const { transport, bodies } = scripted(httpError(503), httpError(503));
        await expect(collect(new AssemblyAILLMGateway(transport))).rejects.toThrow('HTTP 503');
        expect(bodies).toHaveLength(2);
    });

    it('does not retry once text has streamed, since it may have been spoken', async () => {
        const { transport, bodies } = scripted([text('Half a'), httpError(500)]);
        await expect(collect(new AssemblyAILLMGateway(transport))).rejects.toThrow('HTTP 500');
        expect(bodies).toHaveLength(1);
    });

    it('stops quietly when the caller aborts', async () => {
        const abort = new AbortController();
        const transport: LLMTransport = async (_body, signal) =>
            (async function* () {
                yield text('one') as never;
                signal.throwIfAborted(); // as a real request does: it was aborted while this chunk was being handled
                yield text('two') as never;
            })();
        const out: LLMEvent[] = [];
        for await (const e of new AssemblyAILLMGateway(transport).Stream(REQUEST, abort.signal)) {
            out.push(e);
            abort.abort();
        }
        expect(out).toEqual([{ Kind: 'text', Text: 'one' }]);
    });

    it('fails when the first token takes too long, after its retry', async () => {
        vi.useFakeTimers();
        let attempts = 0;
        const transport: LLMTransport = (_body, signal) => {
            attempts++;
            return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('transport aborted'))));
        };
        const run = expect(collect(new AssemblyAILLMGateway(transport))).rejects.toThrow(/no reply within/);
        await vi.advanceTimersByTimeAsync(60_000);
        await run;
        expect(attempts).toBe(2);
    });
});
