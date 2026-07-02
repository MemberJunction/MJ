import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The engine base extends `BaseEngine` (a `BaseSingleton`) and reads strongly-typed accessors off
 * `MJAIRemoteBrowserProviderEntity`. To unit-test the pure resolution logic without a DB we provide:
 *  - a featherweight `BaseEngine` whose constructor is a no-op and whose `getInstance` returns a
 *    per-subclass singleton (mirrors the real Global-Object-Store behavior closely enough for tests);
 *  - a `RegisterForStartup` no-op decorator;
 *  - a constructable `MJAIRemoteBrowserProviderEntity` double exposing exactly the typed accessors the
 *    engine reads (`Name`, `DriverClass`, `Status`, `SupportedFeaturesObject`).
 *
 * The mock classes are declared INSIDE the `vi.mock` factories because those factories are hoisted to
 * the top of the file — referencing module-scope variables from them would hit a TDZ error.
 *
 * The engine code under test never calls `.Get()`/`.Set()` — it reads the typed properties — so the
 * double only needs to surface those properties.
 */

interface ProviderShape {
    Name: string;
    DriverClass: string;
    Status: 'Active' | 'Disabled';
    SupportedFeaturesObject: Record<string, boolean> | null;
}

vi.mock('@memberjunction/core', () => {
    const singletons = new Map<unknown, unknown>();
    class MockBaseEngine {
        public constructor() {
            /* no-op */
        }
        protected async Load(): Promise<void> {
            /* no-op — tests inject the cache directly */
        }
        protected static getInstance<U>(this: new () => U): U {
            if (!singletons.has(this)) {
                singletons.set(this, new this());
            }
            return singletons.get(this) as U;
        }
    }
    return {
        BaseEngine: MockBaseEngine,
        BaseEnginePropertyConfig: class {},
        RegisterForStartup: () => (_target: unknown) => undefined,
        // UserInfo / IMetadataProvider are TYPE-only imports (erased) — no runtime stub needed.
    };
});

vi.mock('@memberjunction/core-entities', () => {
    class MockRemoteBrowserProviderEntity {
        public Name: string = '';
        public DriverClass: string = '';
        public Status: 'Active' | 'Disabled' = 'Active';
        public SupportedFeaturesObject: Record<string, boolean> | null = null;
        constructor(init: Partial<ProviderShape>) {
            Object.assign(this, init);
        }
    }
    return { MJAIRemoteBrowserProviderEntity: MockRemoteBrowserProviderEntity };
});

// Import AFTER the mocks are registered.
import { RemoteBrowserEngineBase } from '../remote-browser-engine-base';
import { MJAIRemoteBrowserProviderEntity } from '@memberjunction/core-entities';

/**
 * A test subclass that injects providers straight into the private cache, bypassing `Config()`/`Load()`
 * (which would need a DB). It reaches the engine's private field via a narrowly-scoped structural
 * type — no `any`.
 */
class TestEngine extends RemoteBrowserEngineBase {
    public seed(providers: MJAIRemoteBrowserProviderEntity[]): void {
        const sink = this as unknown as { _providers: MJAIRemoteBrowserProviderEntity[] };
        sink._providers = providers;
    }
}

function provider(init: Partial<ProviderShape>): MJAIRemoteBrowserProviderEntity {
    return new MJAIRemoteBrowserProviderEntity(init) as unknown as MJAIRemoteBrowserProviderEntity;
}

describe('RemoteBrowserEngineBase — resolution helpers', () => {
    let engine: TestEngine;

    beforeEach(() => {
        engine = new TestEngine();
        engine.seed([
            provider({
                Name: 'Self-Hosted Chrome',
                DriverClass: 'SelfHostedChromeRemoteBrowser',
                Status: 'Active',
                SupportedFeaturesObject: { RawCdpControl: true, ScreenStreaming: true },
            }),
            provider({
                Name: 'Browserbase',
                DriverClass: 'BrowserbaseRemoteBrowser',
                Status: 'Active',
                SupportedFeaturesObject: { RawCdpControl: true, NativeAIControl: true, LiveView: true },
            }),
            provider({
                Name: 'Steel',
                DriverClass: 'SteelRemoteBrowser',
                Status: 'Disabled',
                SupportedFeaturesObject: null,
            }),
        ]);
    });

    it('Providers returns the full seeded set', () => {
        expect(engine.Providers).toHaveLength(3);
    });

    it('ProviderByName matches case-insensitively and trim-tolerant', () => {
        expect(engine.ProviderByName('Browserbase')?.DriverClass).toBe('BrowserbaseRemoteBrowser');
        expect(engine.ProviderByName('browserbase')?.DriverClass).toBe('BrowserbaseRemoteBrowser');
        expect(engine.ProviderByName('  BROWSERBASE  ')?.DriverClass).toBe('BrowserbaseRemoteBrowser');
    });

    it('ProviderByName returns undefined for empty/unknown names', () => {
        expect(engine.ProviderByName('')).toBeUndefined();
        expect(engine.ProviderByName('   ')).toBeUndefined();
        expect(engine.ProviderByName('Nonexistent')).toBeUndefined();
    });

    it('ProviderByDriverClass matches case-insensitively and trim-tolerant', () => {
        expect(engine.ProviderByDriverClass('SteelRemoteBrowser')?.Name).toBe('Steel');
        expect(engine.ProviderByDriverClass('steelremotebrowser')?.Name).toBe('Steel');
        expect(engine.ProviderByDriverClass(' SteelRemoteBrowser ')?.Name).toBe('Steel');
    });

    it('ProviderByDriverClass returns undefined for empty/unknown keys', () => {
        expect(engine.ProviderByDriverClass('')).toBeUndefined();
        expect(engine.ProviderByDriverClass('UnknownDriver')).toBeUndefined();
    });

    it('ActiveProviders excludes Disabled backends', () => {
        const active = engine.ActiveProviders();
        expect(active).toHaveLength(2);
        expect(active.map(p => p.Name).sort()).toEqual(['Browserbase', 'Self-Hosted Chrome']);
    });

    it('FeaturesFor returns the typed flags, or an empty object when none are declared', () => {
        const bb = engine.ProviderByName('Browserbase');
        const steel = engine.ProviderByName('Steel');
        expect(bb).toBeDefined();
        expect(steel).toBeDefined();
        if (bb) {
            expect(engine.FeaturesFor(bb).NativeAIControl).toBe(true);
            expect(engine.FeaturesFor(bb).LiveView).toBe(true);
        }
        if (steel) {
            // null SupportedFeaturesObject → empty object, every flag reads undefined (fail-closed)
            expect(engine.FeaturesFor(steel)).toEqual({});
            expect(engine.FeaturesFor(steel).RawCdpControl).toBeUndefined();
        }
    });

    it('Instance returns a singleton', () => {
        const a = RemoteBrowserEngineBase.Instance;
        const b = RemoteBrowserEngineBase.Instance;
        expect(a).toBe(b);
    });
});
