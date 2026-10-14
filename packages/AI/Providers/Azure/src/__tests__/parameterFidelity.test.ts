/**
 * Parameter fidelity for AzureLLM. Runs the REAL BaseLLM.ChatCompletion and mocks only the Azure SDK boundary, so each
 * test compares what DescribeSentParameters reports with the request body the driver actually posted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatParams, type VendorCallParameters } from '@memberjunction/ai';

/** The request body the driver posts (the fields these tests read). */
interface AzurePostedBody {
    model: string;
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    max_completion_tokens?: number;
    seed?: number;
}

/** Every request body the driver posted, in order. */
const postedBodies = vi.hoisted((): AzurePostedBody[] => []);

vi.mock('@azure-rest/ai-inference', () => ({
    default: () => ({
        path: () => ({
            post: async (args: { body: AzurePostedBody }) => {
                postedBodies.push(args.body);
                if (args.body.stream === true) {
                    return { body: (async function* () { /* an empty stream */ })() };
                }
                return { body: { choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop', index: 0 }], usage: { prompt_tokens: 1, completion_tokens: 1 } } };
            }
        })
    })
}));
vi.mock('@azure/core-auth', () => ({ AzureKeyCredential: class { constructor(public readonly key: string) {} } }));
vi.mock('@azure/identity', () => ({ DefaultAzureCredential: class {} }));

import { AzureLLM } from '../models/azure';

const newLLM = (): AzureLLM => {
    const llm = new AzureLLM('k');
    llm.SetAdditionalSettings({ endpoint: 'https://fidelity.example.com' });
    return llm;
};
const chatParams = (o: Partial<ChatParams>): ChatParams =>
    Object.assign(new ChatParams(), { model: 'gpt-4.1', messages: [{ role: 'user', content: 'x' }] }, o);
const streaming = { streaming: true, streamingCallbacks: { OnContent: () => undefined } };

/** The fidelity view of a posted body: the token cap is whichever of the two fields was sent. */
const fidelityOf = (body: AzurePostedBody): VendorCallParameters => ({
    VendorModelName: body.model,
    Temperature: body.temperature ?? null,
    MaxTokens: body.max_completion_tokens ?? body.max_tokens ?? null,
    Seed: body.seed ?? null
});

describe('AzureLLM parameter fidelity', () => {
    beforeEach(() => { postedBodies.length = 0; });

    // Reasoning models reject a temperature or top_p other than 1 and reject `max_tokens` (OpenAI API, GPT-6 Astra:
    // "Unsupported parameter: 'max_tokens' ... Use 'max_completion_tokens' instead").
    it.each(['gpt-6-astra', 'gpt-5-mini', 'o3'])('%s is sent no temperature 0, no top_p, and max_completion_tokens, on both paths', async (model) => {
        const llm = newLLM();
        const configured = { model, temperature: 0, topP: 0.5, maxOutputTokens: 200 };
        await llm.ChatCompletion(chatParams(configured));
        await llm.ChatCompletion(chatParams({ ...configured, ...streaming }));
        for (const body of postedBodies) {
            expect(body.temperature).toBeUndefined();
            expect(body.top_p).toBeUndefined();
            expect(body.max_tokens).toBeUndefined();
            expect(body.max_completion_tokens).toBe(200);
            expect(llm.DescribeSentParameters(chatParams(configured))).toEqual(fidelityOf(body));
        }
    });

    it('sends a reasoning model a configured temperature and top_p of 1, its defaults, unchanged', async () => {
        const r = await newLLM().ChatCompletion(chatParams({ model: 'gpt-6-astra', temperature: 1, topP: 1 }));
        expect(postedBodies[0]).toMatchObject({ temperature: 1, top_p: 1 });
        expect(r.parameterFidelity?.Status).toBe('sent-unchanged');
    });

    it('reports a dropped reasoning-model temperature as not sent', async () => {
        const r = await newLLM().ChatCompletion(chatParams({ model: 'gpt-6-astra', temperature: 0 }));
        expect(r.parameterFidelity?.Status).toBe('refused');
    });

    it('sends other models temperature 0, the 0.95 top_p default and max_tokens, on both paths', async () => {
        const llm = newLLM();
        const configured = { temperature: 0, maxOutputTokens: 200, seed: 7 };
        await llm.ChatCompletion(chatParams(configured));
        await llm.ChatCompletion(chatParams({ ...configured, ...streaming }));
        for (const body of postedBodies) {
            expect(body).toMatchObject({ temperature: 0, top_p: 0.95, max_tokens: 200 });
            expect(body.max_completion_tokens).toBeUndefined();
            expect(llm.DescribeSentParameters(chatParams(configured))).toEqual(fidelityOf(body));
        }
    });
});
