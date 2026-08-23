/**
 * Tests for PerplexitySearchAction — regression coverage for a silently-dead default model.
 *
 * The action shipped with a default `Model` of `llama-3.1-sonar-small-128k-online`, an identifier
 * Perplexity retired in February 2025. Any caller that omitted `Model` — which is every agent that
 * discovers the action from metadata, since `Model` is optional — sent a request Perplexity rejects
 * as an invalid model. Nothing in the codebase pinned the value, so the breakage was invisible until
 * someone actually ran the action against the live API.
 *
 * The guard below is deliberately two-sided: it pins the current default AND fails on any
 * `llama-3.1-sonar-*` identifier, so re-introducing a retired model from an old doc or example
 * breaks the build rather than the runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

const postMock = vi.fn();

vi.mock('axios', () => ({
    default: {
        post: (...args: unknown[]) => postMock(...args),
        isAxiosError: () => false,
    },
}));

const getApiIntegrationsConfigMock = vi.fn();

vi.mock('../config', () => ({
    getApiIntegrationsConfig: () => getApiIntegrationsConfigMock(),
}));

import { PerplexitySearchAction } from '../custom/web/perplexity-search.action';

/** Exposes the protected entry point without weakening its type. */
class TestablePerplexitySearchAction extends PerplexitySearchAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

/** The request body the action posted, as Perplexity would receive it. */
function lastRequestBody(): Record<string, unknown> {
    expect(postMock).toHaveBeenCalled();
    return postMock.mock.calls[postMock.mock.calls.length - 1][1] as Record<string, unknown>;
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams;
}

describe('PerplexitySearchAction', () => {
    beforeEach(() => {
        postMock.mockReset();
        postMock.mockResolvedValue({
            data: {
                choices: [{ message: { content: 'a grounded answer' }, finish_reason: 'stop' }],
                citations: ['https://example.com/source'],
                usage: { total_tokens: 42 },
            },
        });
        getApiIntegrationsConfigMock.mockReset();
        getApiIntegrationsConfigMock.mockReturnValue({ perplexityApiKey: 'pplx-test-key' });
    });

    it('defaults to a current Sonar model when Model is omitted', async () => {
        const action = new TestablePerplexitySearchAction();
        const result = await action.RunForTest(paramsFor({ Query: 'quantum error correction' }));

        expect(result.Success).toBe(true);
        expect(lastRequestBody().model).toBe('sonar');
    });

    it('never defaults to a retired llama-3.1-sonar-* identifier', async () => {
        const action = new TestablePerplexitySearchAction();
        await action.RunForTest(paramsFor({ Query: 'anything' }));

        expect(String(lastRequestBody().model)).not.toMatch(/^llama-3\.1-sonar-/);
    });

    it('honors an explicitly supplied Model', async () => {
        const action = new TestablePerplexitySearchAction();
        await action.RunForTest(paramsFor({ Query: 'deep dive', Model: 'sonar-pro' }));

        expect(lastRequestBody().model).toBe('sonar-pro');
    });

    it('reports a missing API key rather than calling the API', async () => {
        getApiIntegrationsConfigMock.mockReturnValue({});
        const action = new TestablePerplexitySearchAction();
        const result = await action.RunForTest(paramsFor({ Query: 'anything' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_API_KEY');
        expect(postMock).not.toHaveBeenCalled();
    });

    it('requires a Query', async () => {
        const action = new TestablePerplexitySearchAction();
        const result = await action.RunForTest(paramsFor({}));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_QUERY');
        expect(postMock).not.toHaveBeenCalled();
    });
});
