/**
 * Regression test for the 2026-08-29 memory-leak audit (Round 12): `URLMetadataExtractorAction`
 * threw away a `SafeFetch` response on two separate branches — a non-2xx status, and a non-HTML
 * content type — without ever reading or cancelling the body. Under Node's native `fetch`
 * (undici), an unconsumed response body pins its connection out of the keep-alive pool until GC
 * finalizes it.
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

const safeFetchMock = vi.fn();
const drainResponseBodyMock = vi.fn();

vi.mock('@memberjunction/network-utils', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/network-utils');
    return {
        ...actual,
        SafeFetch: (...args: unknown[]) => safeFetchMock(...args),
        DrainResponseBody: (...args: unknown[]) => drainResponseBodyMock(...args),
    };
});

import { URLMetadataExtractorAction } from '../custom/web/url-metadata-extractor.action';

/** Exposes the protected entry point without weakening its type. */
class TestableURLMetadataExtractorAction extends URLMetadataExtractorAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams;
}

describe('URLMetadataExtractorAction — response body draining', () => {
    beforeEach(() => {
        safeFetchMock.mockReset();
        drainResponseBodyMock.mockReset();
    });

    it('drains the response body before returning on a non-2xx status', async () => {
        safeFetchMock.mockResolvedValue({
            status: 500,
            statusText: 'Server Error',
            headers: { get: () => null },
        });
        const action = new TestableURLMetadataExtractorAction();

        const result = await action.RunForTest(paramsFor({ URL: 'https://example.com/article' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('HTTP_500');
        expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
    });

    it('drains the response body before returning on a non-HTML content type', async () => {
        safeFetchMock.mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: { get: (name: string) => (name === 'content-type' ? 'application/pdf' : null) },
        });
        const action = new TestableURLMetadataExtractorAction();

        const result = await action.RunForTest(paramsFor({ URL: 'https://example.com/file.pdf' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('NOT_HTML');
        expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
    });

    it('does not drain the body on a successful HTML response — it reads the body itself', async () => {
        safeFetchMock.mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: { get: (name: string) => (name === 'content-type' ? 'text/html' : null) },
            text: async () => '<html><head><title>Hi</title></head><body></body></html>',
        });
        const action = new TestableURLMetadataExtractorAction();

        const result = await action.RunForTest(paramsFor({ URL: 'https://example.com/article' }));

        expect(result.Success).toBe(true);
        expect(drainResponseBodyMock).not.toHaveBeenCalled();
    });
});
