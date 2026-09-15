/**
 * Tests for WebSearchEngine provider selection.
 *
 * Selection is where this engine's real behaviour lives — the HTTP mapping in each driver is
 * mechanical, but "which provider served this, and why" is the thing that can be silently wrong.
 * Three properties matter most and each has a way of passing while broken:
 *
 *  - **Failover must be conditional.** A transient failure should move on; a permanent one must
 *    not, or a malformed query costs five paid API calls and the real error is buried behind
 *    four identical ones.
 *  - **An explicit provider must never be substituted.** The failure mode is invisible: results
 *    keep arriving, from a vendor nobody chose.
 *  - **Attempts must be recorded on the SUCCESS path.** If the primary rate-limits every call
 *    and the secondary quietly serves everything, nothing looks wrong while the bill moves.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const runViewMock = vi.fn();

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunView: class {
        public static FromMetadataProvider() {
            return new (this as unknown as new () => { RunView: typeof runViewMock })();
        }
        public RunView(...args: unknown[]) {
            return runViewMock(...args);
        }
    },
}));

const createInstanceMock = vi.fn();

vi.mock('@memberjunction/global', () => {
    class BaseSingleton {
        private static _instances = new Map<string, unknown>();
        public static getInstance<T>(this: new () => T): T {
            const key = (this as unknown as { name: string }).name;
            if (!BaseSingleton._instances.has(key)) {
                BaseSingleton._instances.set(key, new this());
            }
            return BaseSingleton._instances.get(key) as T;
        }
    }
    return {
        BaseSingleton,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: (...args: unknown[]) => createInstanceMock(...args),
                    GetAllRegistrations: () => [],
                },
            },
        },
    };
});

vi.mock('@memberjunction/credentials', () => ({
    CredentialEngine: {
        Instance: {
            Config: vi.fn(),
            getCredentialById: vi.fn(),
            getCredential: vi.fn(),
        },
    },
}));

// Type-only at runtime — the engine's provider records are MJWebSearchProviderEntity, and the
// fakes below satisfy the shape the engine actually reads.
vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/network-utils', () => ({
    HttpGet: vi.fn(),
    HttpPost: vi.fn(),
    IsHttpError: () => false,
}));

import { WebSearchEngine } from '../WebSearchEngine';
import { BaseWebSearchProvider } from '../BaseWebSearchProvider';
import type {
    WebSearchCapabilities,
    WebSearchParams,
    WebSearchProviderResponse,
} from '../types';

const USER = { ID: 'u1', Name: 'Test' } as unknown as UserInfo;

const FULL_CAPS: WebSearchCapabilities = {
    Answer: true,
    DomainFilter: true,
    Freshness: true,
    Region: true,
    MaxResultsCap: 20,
};

/** A driver whose behaviour each test dictates outright. */
class FakeProvider extends BaseWebSearchProvider {
    public readonly Capabilities: WebSearchCapabilities;
    public callCount = 0;

    constructor(
        private readonly behaviour: () => Promise<WebSearchProviderResponse> | WebSearchProviderResponse,
        capabilities: Partial<WebSearchCapabilities> = {},
        private readonly available = true,
    ) {
        super();
        this.Capabilities = { ...FULL_CAPS, ...capabilities };
    }

    public async CheckAvailability(): Promise<void> {
        if (this.available) {
            this.MarkAvailable();
        } else {
            this.MarkUnavailable('no credential in test');
        }
    }

    public async ExecuteSearch(_params: WebSearchParams): Promise<WebSearchProviderResponse> {
        this.callCount++;
        return this.behaviour();
    }
}

function hit(url: string) {
    return { Title: `t-${url}`, URL: url, Snippet: 's' };
}

const ok = (url = 'https://example.org/a') => (): WebSearchProviderResponse => ({
    Success: true,
    Hits: [hit(url)],
});
const transient = (msg = 'rate limited') => (): WebSearchProviderResponse => ({
    Success: false,
    Hits: [],
    FailureKind: 'transient',
    ErrorMessage: msg,
});
const permanent = (msg = 'query too long') => (): WebSearchProviderResponse => ({
    Success: false,
    Hits: [],
    FailureKind: 'permanent',
    ErrorMessage: msg,
});

/**
 * Wire a set of providers into the engine as if they had been loaded from metadata.
 * Records are returned in Priority order, as the engine's own ExtraFilter/OrderBy would.
 */
function configureProviders(
    specs: Array<{ name: string; driver: string; priority: number; provider: FakeProvider }>,
) {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({
        Success: true,
        Results: [...specs]
            .sort((a, b) => a.priority - b.priority)
            .map((s) => ({
                Name: s.name,
                DriverClass: s.driver,
                Priority: s.priority,
                ProviderConfig: null,
                CredentialID: null,
                MaxResultsOverride: null,
            })),
    });
    createInstanceMock.mockReset();
    createInstanceMock.mockImplementation((_base: unknown, key: string) => {
        const match = specs.find((s) => s.driver === key);
        return match ? match.provider : null;
    });
}

/** Each test needs a clean engine; BaseSingleton deliberately caches one. */
async function freshEngine(): Promise<WebSearchEngine> {
    const engine = WebSearchEngine.Instance;
    await engine.Config(true, USER);
    return engine;
}

describe('WebSearchEngine selection', () => {
    beforeEach(() => {
        runViewMock.mockReset();
        createInstanceMock.mockReset();
    });

    describe('priority ordering', () => {
        it('serves from the lowest Priority value available', async () => {
            const primary = new FakeProvider(ok('https://primary'));
            const secondary = new FakeProvider(ok('https://secondary'));
            configureProviders([
                { name: 'Secondary', driver: 'SecondaryDriver', priority: 20, provider: secondary },
                { name: 'Primary', driver: 'PrimaryDriver', priority: 10, provider: primary },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q' }, USER);

            expect(result.Success).toBe(true);
            expect(result.ProviderUsed).toBe('Primary');
            expect(secondary.callCount).toBe(0);
        });

        it('skips a provider that reported itself unavailable', async () => {
            const unavailable = new FakeProvider(ok('https://never'), {}, false);
            const usable = new FakeProvider(ok('https://used'));
            configureProviders([
                { name: 'NoKey', driver: 'NoKeyDriver', priority: 10, provider: unavailable },
                { name: 'Usable', driver: 'UsableDriver', priority: 20, provider: usable },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q' }, USER);

            expect(result.ProviderUsed).toBe('Usable');
            expect(unavailable.callCount).toBe(0);
        });
    });

    describe('failover', () => {
        it('moves to the next provider on a TRANSIENT failure', async () => {
            const first = new FakeProvider(transient('429'));
            const second = new FakeProvider(ok('https://second'));
            configureProviders([
                { name: 'First', driver: 'FirstDriver', priority: 10, provider: first },
                { name: 'Second', driver: 'SecondDriver', priority: 20, provider: second },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q' }, USER);

            expect(result.Success).toBe(true);
            expect(result.ProviderUsed).toBe('Second');
            expect(first.callCount).toBe(1);
        });

        it('STOPS on a permanent failure instead of burning the remaining providers', async () => {
            const first = new FakeProvider(permanent('query too long'));
            const second = new FakeProvider(ok());
            configureProviders([
                { name: 'First', driver: 'FirstDriver', priority: 10, provider: first },
                { name: 'Second', driver: 'SecondDriver', priority: 20, provider: second },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q' }, USER);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_REQUEST');
            expect(result.ErrorMessage).toContain('query too long');
            expect(second.callCount).toBe(0);
        });

        it('treats a driver that throws as transient rather than failing the search', async () => {
            const thrower = new FakeProvider(() => {
                throw new Error('boom');
            });
            const healthy = new FakeProvider(ok('https://healthy'));
            configureProviders([
                { name: 'Thrower', driver: 'ThrowerDriver', priority: 10, provider: thrower },
                { name: 'Healthy', driver: 'HealthyDriver', priority: 20, provider: healthy },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q' }, USER);

            expect(result.Success).toBe(true);
            expect(result.ProviderUsed).toBe('Healthy');
            expect(result.Attempts[0]).toMatchObject({ Succeeded: false, FailureKind: 'transient' });
        });

        it('reports ALL_PROVIDERS_FAILED with every attempt when none succeeds', async () => {
            configureProviders([
                { name: 'A', driver: 'ADriver', priority: 10, provider: new FakeProvider(transient('a down')) },
                { name: 'B', driver: 'BDriver', priority: 20, provider: new FakeProvider(transient('b down')) },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q' }, USER);

            expect(result.ResultCode).toBe('ALL_PROVIDERS_FAILED');
            expect(result.Attempts).toHaveLength(2);
            expect(result.ErrorMessage).toContain('a down');
            expect(result.ErrorMessage).toContain('b down');
        });
    });

    describe('explicit provider — never substitutes', () => {
        it('uses the named provider even when a higher-priority one is available', async () => {
            const primary = new FakeProvider(ok('https://primary'));
            const named = new FakeProvider(ok('https://named'));
            configureProviders([
                { name: 'Primary', driver: 'PrimaryDriver', priority: 10, provider: primary },
                { name: 'Named', driver: 'NamedDriver', priority: 50, provider: named },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q', Provider: 'Named' }, USER);

            expect(result.ProviderUsed).toBe('Named');
            expect(primary.callCount).toBe(0);
        });

        it('resolves by DriverClass as well as by Name, case-insensitively', async () => {
            configureProviders([
                { name: 'Named', driver: 'NamedDriver', priority: 10, provider: new FakeProvider(ok()) },
            ]);

            const result = await (await freshEngine()).Search(
                { Query: 'q', Provider: 'nameddriver' },
                USER,
            );

            expect(result.Success).toBe(true);
        });

        it('FAILS rather than falling back when the named provider is unknown', async () => {
            const fallback = new FakeProvider(ok());
            configureProviders([
                { name: 'Real', driver: 'RealDriver', priority: 10, provider: fallback },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q', Provider: 'Nope' }, USER);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('PROVIDER_NOT_FOUND');
            expect(fallback.callCount).toBe(0);
        });

        it('reports PROVIDER_UNAVAILABLE — not NOT_FOUND — for a configured provider with no credential', async () => {
            configureProviders([
                { name: 'NoKey', driver: 'NoKeyDriver', priority: 10, provider: new FakeProvider(ok(), {}, false) },
                { name: 'Other', driver: 'OtherDriver', priority: 20, provider: new FakeProvider(ok()) },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q', Provider: 'NoKey' }, USER);

            // The distinction matters: "you never configured this" and "its key is missing"
            // are different problems with different fixes.
            expect(result.ResultCode).toBe('PROVIDER_UNAVAILABLE');
            expect(result.ErrorMessage).toContain('no credential in test');
        });

        it('fails when the named provider cannot produce a requested answer', async () => {
            configureProviders([
                {
                    name: 'HitsOnly',
                    driver: 'HitsOnlyDriver',
                    priority: 10,
                    provider: new FakeProvider(ok(), { Answer: false }),
                },
            ]);

            const result = await (await freshEngine()).Search(
                { Query: 'q', Provider: 'HitsOnly', IncludeAnswer: true },
                USER,
            );

            expect(result.ResultCode).toBe('PROVIDER_LACKS_CAPABILITY');
        });
    });

    describe('capability filtering', () => {
        it('skips answer-incapable providers when IncludeAnswer is set', async () => {
            const hitsOnly = new FakeProvider(ok('https://hits'), { Answer: false });
            const answerer = new FakeProvider(
                () => ({ Success: true, Hits: [hit('https://ans')], Answer: 'the answer' }),
                { Answer: true },
            );
            configureProviders([
                { name: 'HitsOnly', driver: 'HitsOnlyDriver', priority: 10, provider: hitsOnly },
                { name: 'Answerer', driver: 'AnswererDriver', priority: 20, provider: answerer },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q', IncludeAnswer: true }, USER);

            expect(result.ProviderUsed).toBe('Answerer');
            expect(result.Answer).toBe('the answer');
            expect(hitsOnly.callCount).toBe(0);
        });

        it('reports NO_ELIGIBLE_PROVIDER when nothing can answer', async () => {
            configureProviders([
                {
                    name: 'HitsOnly',
                    driver: 'HitsOnlyDriver',
                    priority: 10,
                    provider: new FakeProvider(ok(), { Answer: false }),
                },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q', IncludeAnswer: true }, USER);

            expect(result.ResultCode).toBe('NO_ELIGIBLE_PROVIDER');
        });
    });

    describe('observability and edge cases', () => {
        it('records attempts on the SUCCESS path, including the ones that failed first', async () => {
            configureProviders([
                { name: 'Flaky', driver: 'FlakyDriver', priority: 10, provider: new FakeProvider(transient('429')) },
                { name: 'Good', driver: 'GoodDriver', priority: 20, provider: new FakeProvider(ok()) },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'q' }, USER);

            expect(result.Success).toBe(true);
            expect(result.Attempts).toHaveLength(2);
            expect(result.Attempts[0]).toMatchObject({ ProviderName: 'Flaky', Succeeded: false });
            expect(result.Attempts[1]).toMatchObject({ ProviderName: 'Good', Succeeded: true, HitCount: 1 });
        });

        it('treats zero hits as success, not as a reason to fail over', async () => {
            const empty = new FakeProvider(() => ({ Success: true, Hits: [] }));
            const next = new FakeProvider(ok());
            configureProviders([
                { name: 'Empty', driver: 'EmptyDriver', priority: 10, provider: empty },
                { name: 'Next', driver: 'NextDriver', priority: 20, provider: next },
            ]);

            const result = await (await freshEngine()).Search({ Query: 'obscure' }, USER);

            expect(result.Success).toBe(true);
            expect(result.Hits).toHaveLength(0);
            expect(next.callCount).toBe(0);
        });

        it('requires a non-blank query before touching any provider', async () => {
            const provider = new FakeProvider(ok());
            configureProviders([{ name: 'A', driver: 'ADriver', priority: 10, provider }]);

            const result = await (await freshEngine()).Search({ Query: '   ' }, USER);

            expect(result.ResultCode).toBe('MISSING_QUERY');
            expect(provider.callCount).toBe(0);
        });

        it('distinguishes "none configured" from a search failure', async () => {
            configureProviders([]);

            const result = await (await freshEngine()).Search({ Query: 'q' }, USER);

            expect(result.ResultCode).toBe('NO_PROVIDERS_CONFIGURED');
            expect(result.ErrorMessage).toContain('MJ: Web Search Providers');
        });

        it('does not report "none configured" when the metadata load actually errored', async () => {
            // RunView does not throw — if the engine ignored .Success it would report a database
            // failure as an empty, correctly-configured provider set.
            //
            // The assertion here is the RESULT CODE, not merely `Success === false`. A failed
            // load also leaves the provider list empty, so the engine reported
            // NO_PROVIDERS_CONFIGURED — which is `Success: false` too. An earlier version of this
            // test asserted only `Success === false` and `runViewMock` having been called, and so
            // passed against exactly the behaviour its name says it rules out.
            runViewMock.mockReset();
            runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'db down', Results: [] });
            createInstanceMock.mockReset();

            const engine = WebSearchEngine.Instance;
            await engine.Config(true, USER);
            const result = await engine.Search({ Query: 'q' }, USER);

            expect(result.ResultCode).toBe('PROVIDER_LOAD_FAILED');
            expect(result.ResultCode).not.toBe('NO_PROVIDERS_CONFIGURED');
            // The operator has to be able to tell the two apart from the message alone.
            expect(result.ErrorMessage).toContain('db down');
            expect(result.ErrorMessage).not.toContain('Add an Active record');
        });

        it('reports a load failure on EVERY later search, not just the one that logged it', async () => {
            // The LogError fires once, at load. Callers keep arriving after it. If the failure
            // reason were not held as state, the first search would be diagnosable and every
            // subsequent one would silently degrade to "nothing is configured".
            runViewMock.mockReset();
            runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'db down', Results: [] });
            createInstanceMock.mockReset();

            const engine = WebSearchEngine.Instance;
            await engine.Config(true, USER);

            const first = await engine.Search({ Query: 'q' }, USER);
            const second = await engine.Search({ Query: 'q' }, USER);

            expect(first.ResultCode).toBe('PROVIDER_LOAD_FAILED');
            expect(second.ResultCode).toBe('PROVIDER_LOAD_FAILED');
        });

        it('clears a stale load failure once a refresh succeeds', async () => {
            runViewMock.mockReset();
            runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'db down', Results: [] });
            createInstanceMock.mockReset();

            const engine = WebSearchEngine.Instance;
            await engine.Config(true, USER);
            expect((await engine.Search({ Query: 'q' }, USER)).ResultCode).toBe('PROVIDER_LOAD_FAILED');

            // The database comes back. A recovered engine must not keep answering with the old
            // reason — the error is per-load state, not a latch.
            configureProviders([
                { name: 'Brave', driver: 'BraveWebSearchProvider', priority: 10, provider: new FakeProvider(ok()) },
            ]);
            await engine.Config(true, USER);

            const result = await engine.Search({ Query: 'q' }, USER);
            expect(result.Success).toBe(true);
            expect(result.ProviderUsed).toBe('Brave');
        });
    });
});
