import { describe, it, expect, vi } from 'vitest';
import {
    CreateLongRunningFetch,
    CreateLongRunningFetchDispatcher,
    DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS,
    InstallGlobalLongRunningFetchDispatcher,
    ResolveLongRunningFetchDispatcherOptions,
    type FetchDispatcherLike,
    type ResolvedUndiciAgentOptions,
    type UndiciModuleLike,
} from '../generic/httpDispatcher';

describe('httpDispatcher (long-running undici transport helpers)', () => {
    it('resolves safe long-running defaults and accepts explicit 0 timeouts to defer to AbortSignal', () => {
        const defaults = ResolveLongRunningFetchDispatcherOptions();
        expect(defaults).toEqual({
            headersTimeout: DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
            bodyTimeout: DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
            connectTimeout: DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS,
            keepAliveTimeout: DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS,
            keepAliveMaxTimeout: DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS,
        });

        const zeroed = ResolveLongRunningFetchDispatcherOptions({
            headersTimeoutMs: 0,
            bodyTimeoutMs: 0,
            connectTimeoutMs: 45_000,
        });
        expect(zeroed.headersTimeout).toBe(0);
        expect(zeroed.bodyTimeout).toBe(0);
        expect(zeroed.connectTimeout).toBe(45_000);

        // Negative or non-finite inputs fall back safely.
        const sanitized = ResolveLongRunningFetchDispatcherOptions({
            headersTimeoutMs: -500,
            bodyTimeoutMs: Number.NaN,
        });
        expect(sanitized.headersTimeout).toBe(DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS);
        expect(sanitized.bodyTimeout).toBe(DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS);
    });

    it('constructs an undici Agent dispatcher with resolved timeout options and degrades cleanly without undici', () => {
        expect(CreateLongRunningFetchDispatcher(undefined, null)).toBeNull();

        let capturedOptions: ResolvedUndiciAgentOptions | null = null;
        class FakeUndiciAgent implements FetchDispatcherLike {
            public readonly closed = vi.fn(async () => undefined);
            public constructor(opts: ResolvedUndiciAgentOptions) {
                capturedOptions = opts;
            }
            public async close(): Promise<void> {
                await this.closed();
            }
        }
        const fakeUndici: UndiciModuleLike = { Agent: FakeUndiciAgent };

        const dispatcher = CreateLongRunningFetchDispatcher({ headersTimeoutMs: 2_400_000, bodyTimeoutMs: 0 }, fakeUndici);
        expect(dispatcher).toBeInstanceOf(FakeUndiciAgent);
        expect(capturedOptions?.headersTimeout).toBe(2_400_000);
        expect(capturedOptions?.bodyTimeout).toBe(0);
    });

    it('attaches dispatcher to CreateLongRunningFetch requests while preserving AbortSignal and custom dispatcher', async () => {
        const createdDispatcher: FetchDispatcherLike = { close: vi.fn(async () => undefined) };
        const fakeUndici: UndiciModuleLike = {
            Agent: class {
                public constructor() {
                    return createdDispatcher;
                }
            } as unknown as UndiciModuleLike['Agent'],
        };

        const mockResponse = new Response('ok', { status: 200 });
        const baseFetch = vi.fn(async () => mockResponse);
        const wrappedFetch = CreateLongRunningFetch({ headersTimeoutMs: 0 }, baseFetch, fakeUndici);

        const controller = new AbortController();
        await wrappedFetch('https://api.example.com/v1/chat', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'content-type': 'application/json' },
        });

        expect(baseFetch).toHaveBeenCalledTimes(1);
        const [, init] = baseFetch.mock.calls[0] as [string, { dispatcher?: FetchDispatcherLike; signal?: AbortSignal }];
        expect(init.dispatcher).toBe(createdDispatcher);
        expect(init.signal).toBe(controller.signal);

        // Explicit per-call dispatcher is preserved rather than clobbered.
        const customDispatcher: FetchDispatcherLike = {};
        await wrappedFetch('https://api.example.com/v1/chat', { dispatcher: customDispatcher });
        const [, secondInit] = baseFetch.mock.calls[1] as [string, { dispatcher?: FetchDispatcherLike }];
        expect(secondInit.dispatcher).toBe(customDispatcher);
    });

    it('installs and cleanly restores the global undici dispatcher', async () => {
        const originalGlobal: FetchDispatcherLike = { close: vi.fn(async () => undefined) };
        let currentGlobal: FetchDispatcherLike = originalGlobal;
        const closeMock = vi.fn(async () => undefined);

        class FakeAgent implements FetchDispatcherLike {
            public constructor(public readonly options: ResolvedUndiciAgentOptions) {}
            public close = closeMock;
        }
        const fakeUndici: UndiciModuleLike = {
            Agent: FakeAgent,
            getGlobalDispatcher: () => currentGlobal,
            setGlobalDispatcher: (d) => {
                currentGlobal = d;
            },
        };

        const install = InstallGlobalLongRunningFetchDispatcher({ headersTimeoutMs: 0, bodyTimeoutMs: 0 }, fakeUndici);
        expect(install.Installed).toBe(true);
        expect(install.Dispatcher).toBeInstanceOf(FakeAgent);
        expect(currentGlobal).toBe(install.Dispatcher);

        await install.Restore();
        expect(currentGlobal).toBe(originalGlobal);
        expect(closeMock).toHaveBeenCalledTimes(1);

        // Idempotent second restore.
        await install.Restore();
        expect(closeMock).toHaveBeenCalledTimes(1);
    });
});
