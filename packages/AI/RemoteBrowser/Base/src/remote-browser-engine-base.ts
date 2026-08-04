import {
    BaseEngine,
    BaseEnginePropertyConfig,
    IMetadataProvider,
    RegisterForStartup,
    UserInfo,
} from '@memberjunction/core';
import { MJAIRemoteBrowserProviderEntity } from '@memberjunction/core-entities';
import { IRemoteBrowserProviderFeatures } from './remote-browser-features';

/**
 * Cross-platform, **metadata-only** engine for the Remote Browser plane.
 *
 * `RemoteBrowserEngineBase` mirrors `AIBridgeEngineBase` (and `AIEngineBase`) exactly: it is a
 * {@link BaseEngine} subclass that caches the remote-browser provider registry rows (backends + their
 * capability flags) and exposes synchronous resolution helpers over them. It performs **no
 * execution** — live browser sessions, control arbitration, and the viewport→screen-track encode all
 * live in `RemoteBrowserEngine` (the server package) which *composes over* this base. Keeping the
 * metadata layer free of execution lets it be used anywhere (client or server) and stay reactive via
 * the inherited {@link BaseEngine} event integration.
 *
 * Because the cached dataset is a small reference table, all lookups filter the in-memory array
 * client-side rather than issuing RunViews.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d-i — the
 * `RemoteBrowserEngineBase` / `RemoteBrowserEngine` pair.
 */
@RegisterForStartup()
export class RemoteBrowserEngineBase extends BaseEngine<RemoteBrowserEngineBase> {
    private _providers: MJAIRemoteBrowserProviderEntity[] = [];

    /**
     * Loads (or refreshes) the remote-browser metadata cache.
     *
     * Registers the provider registry as locally-cached and delegates to the inherited
     * {@link BaseEngine.Load}, which wires up event-driven invalidation so the cache stays fresh as
     * rows change. Idempotent — a no-op when already loaded unless `forceRefresh` is set.
     *
     * @param forceRefresh When `true`, reloads even if already loaded.
     * @param contextUser Required on the server side for proper data isolation.
     * @param provider Optional explicit metadata provider (multi-provider scenarios); defaults to the engine's provider.
     * @returns A promise that resolves once the cache is populated.
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const params: Array<Partial<BaseEnginePropertyConfig>> = [
            {
                PropertyName: '_providers',
                EntityName: 'MJ: AI Remote Browser Providers',
                CacheLocal: true,
            },
        ];
        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    /**
     * All cached `MJ: AI Remote Browser Providers` rows (the backend registry + capability flags).
     */
    public get Providers(): MJAIRemoteBrowserProviderEntity[] {
        return this._providers;
    }

    /**
     * Resolves a backend by its display name, case-insensitively and trim-tolerant.
     *
     * @param name The backend name (e.g. `'Browserbase'`, `'Self-Hosted Chrome'`).
     * @returns The matching provider row, or `undefined` if none matches.
     */
    public ProviderByName(name: string): MJAIRemoteBrowserProviderEntity | undefined {
        const target = (name ?? '').trim().toLowerCase();
        if (target.length === 0) {
            return undefined;
        }
        return this._providers.find(p => (p.Name ?? '').trim().toLowerCase() === target);
    }

    /**
     * Resolves a backend by its `DriverClass` (the `ClassFactory` key used to instantiate the concrete
     * provider driver via `MJGlobal.ClassFactory.CreateInstance(BaseRemoteBrowserProvider, driverClass)`),
     * case-insensitively and trim-tolerant.
     *
     * @param driverClass The driver class key (e.g. `'BrowserbaseRemoteBrowser'`).
     * @returns The matching provider row, or `undefined` if none matches.
     */
    public ProviderByDriverClass(driverClass: string): MJAIRemoteBrowserProviderEntity | undefined {
        const target = (driverClass ?? '').trim().toLowerCase();
        if (target.length === 0) {
            return undefined;
        }
        return this._providers.find(p => (p.DriverClass ?? '').trim().toLowerCase() === target);
    }

    /**
     * Returns the backends currently available for use (those with `Status === 'Active'`). Disabled
     * backends cannot start new remote-browser sessions and are excluded.
     *
     * @returns The active provider rows.
     */
    public ActiveProviders(): MJAIRemoteBrowserProviderEntity[] {
        return this._providers.filter(p => p.Status === 'Active');
    }

    /**
     * Null-safely reads a backend's typed capability flags from its `SupportedFeaturesObject`
     * accessor, substituting an empty (all-unsupported) set when none are declared.
     *
     * @param provider The provider row to read.
     * @returns The backend's capability flags, or an empty object when none are declared.
     */
    public FeaturesFor(
        provider: MJAIRemoteBrowserProviderEntity,
    ): IRemoteBrowserProviderFeatures {
        return provider.SupportedFeaturesObject ?? {};
    }

    /**
     * The singleton accessor (via {@link BaseEngine}'s global object store).
     */
    public static get Instance(): RemoteBrowserEngineBase {
        return super.getInstance<RemoteBrowserEngineBase>();
    }
}
