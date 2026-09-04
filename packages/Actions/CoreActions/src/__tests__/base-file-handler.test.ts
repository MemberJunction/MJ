/**
 * Regression test for the 2026-08-29 memory-leak audit (Round 12): `BaseFileHandlerAction`'s
 * URL-download path threw on a non-2xx `fetch` response without ever reading or cancelling its
 * body. Under Node's native `fetch` (undici), an unconsumed response body pins its connection
 * out of the keep-alive pool until GC finalizes it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/core', () => ({ RunView: class RunView {} }));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/storage', () => ({ FileStorageEngine: class FileStorageEngine {} }));

const drainResponseBodyMock = vi.fn();

vi.mock('@memberjunction/network-utils', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/network-utils');
    return {
        ...actual,
        DrainResponseBody: (...args: unknown[]) => drainResponseBodyMock(...args),
    };
});

import { BaseFileHandlerAction } from '../custom/utilities/base-file-handler';

/** Exposes the protected entry point without weakening its type. */
class TestableFileHandlerAction extends BaseFileHandlerAction {
    public GetFileContentForTest(params: RunActionParams, dataParamName: string) {
        return this.getFileContent(params, dataParamName);
    }
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams;
}

describe('BaseFileHandlerAction.loadFromURL — response body draining', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
        drainResponseBodyMock.mockReset();
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('drains the response body before throwing on a non-2xx status', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        })) as unknown as typeof fetch;

        const action = new TestableFileHandlerAction();
        await expect(
            action.GetFileContentForTest(paramsFor({ FileURL: 'https://example.com/missing.txt' }), 'Data')
        ).rejects.toThrow('Failed to load file from URL');

        expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
    });

    it('does not drain the body on a successful response — it reads the body itself', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => null },
            text: async () => 'file contents',
        })) as unknown as typeof fetch;

        const action = new TestableFileHandlerAction();
        const result = await action.GetFileContentForTest(paramsFor({ FileURL: 'https://example.com/file.txt' }), 'Data');

        expect(result.content).toBe('file contents');
        expect(drainResponseBodyMock).not.toHaveBeenCalled();
    });
});
