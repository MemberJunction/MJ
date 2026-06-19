import {
    BaseEngine,
    BaseEnginePropertyConfig,
    IMetadataProvider,
    UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJAIBridgeProviderEntity,
    MJAIBridgeAgentIdentityEntity,
    MJAIBridgeProviderChannelEntity,
} from '@memberjunction/core-entities';
import { RegisterForStartup } from '@memberjunction/core';

/**
 * Cross-platform, **metadata-only** engine for the Realtime Bridge plane.
 *
 * `AIBridgeEngineBase` mirrors `AIEngineBase` exactly: it is a {@link BaseEngine} subclass that
 * caches the bridge registry rows (providers + their capability flags, agent identities, and the
 * provider→channel junction) and exposes synchronous resolution helpers over them. It performs
 * **no execution** — spinning up bot connections, host affinity, the janitor, and the realtime
 * session wiring all live in `AIBridgeEngine` (the server package) which extends this base. Keeping
 * the metadata layer free of execution lets it be used anywhere (client or server) and stay reactive
 * via the inherited {@link BaseEngine} event integration.
 *
 * Because the cached datasets are small reference tables, all lookups filter the in-memory arrays
 * client-side rather than issuing RunViews.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §2 (layer cake) — the
 * `AIBridgeEngineBase` / `AIBridgeEngine` pair.
 */
@RegisterForStartup()
export class AIBridgeEngineBase extends BaseEngine<AIBridgeEngineBase> {
    private _providers: MJAIBridgeProviderEntity[] = [];
    private _agentIdentities: MJAIBridgeAgentIdentityEntity[] = [];
    private _providerChannels: MJAIBridgeProviderChannelEntity[] = [];

    /**
     * Loads (or refreshes) the bridge metadata cache.
     *
     * Registers the three bridge reference datasets as locally-cached and delegates to the
     * inherited {@link BaseEngine.Load}, which wires up event-driven invalidation so the caches stay
     * fresh as rows change. Idempotent — a no-op when already loaded unless `forceRefresh` is set.
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
                EntityName: 'MJ: AI Bridge Providers',
                CacheLocal: true,
            },
            {
                PropertyName: '_agentIdentities',
                EntityName: 'MJ: AI Bridge Agent Identities',
                CacheLocal: true,
            },
            {
                PropertyName: '_providerChannels',
                EntityName: 'MJ: AI Bridge Provider Channels',
                CacheLocal: true,
            },
        ];
        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    /**
     * All cached `MJ: AI Bridge Providers` rows (the platform registry + capability flags).
     */
    public get Providers(): MJAIBridgeProviderEntity[] {
        return this._providers;
    }

    /**
     * All cached `MJ: AI Bridge Agent Identities` rows (which agents are reachable where —
     * calendar mailboxes, phone numbers, account ids).
     */
    public get AgentIdentities(): MJAIBridgeAgentIdentityEntity[] {
        return this._agentIdentities;
    }

    /**
     * All cached `MJ: AI Bridge Provider Channels` rows (the provider→channel junction declaring
     * which channels each provider contributes by default).
     */
    public get ProviderChannels(): MJAIBridgeProviderChannelEntity[] {
        return this._providerChannels;
    }

    /**
     * Resolves a provider by its display name, case-insensitively and trim-tolerant.
     *
     * @param name The provider name (e.g. `'Zoom'`, `'Twilio'`).
     * @returns The matching provider row, or `undefined` if none matches.
     */
    public ProviderByName(name: string): MJAIBridgeProviderEntity | undefined {
        const target = (name ?? '').trim().toLowerCase();
        if (target.length === 0) {
            return undefined;
        }
        return this._providers.find(p => (p.Name ?? '').trim().toLowerCase() === target);
    }

    /**
     * Resolves a provider by its `DriverClass` (the `ClassFactory` key used to instantiate the
     * concrete bridge driver), case-insensitively and trim-tolerant.
     *
     * @param driverClass The driver class key (e.g. `'ZoomBridge'`).
     * @returns The matching provider row, or `undefined` if none matches.
     */
    public ProviderByDriverClass(driverClass: string): MJAIBridgeProviderEntity | undefined {
        const target = (driverClass ?? '').trim().toLowerCase();
        if (target.length === 0) {
            return undefined;
        }
        return this._providers.find(p => (p.DriverClass ?? '').trim().toLowerCase() === target);
    }

    /**
     * Resolves an agent identity by its value (an email address, phone number, or account id),
     * case-insensitively and trim-tolerant. This is the seam used to route an inbound invite/call
     * (addressed to a mailbox or DID) to the owning agent.
     *
     * Only `IsActive` identities are considered. When `providerId` is supplied, the match is
     * additionally scoped to that provider.
     *
     * @param identityValue The address to resolve (e.g. `'sage@org.com'`, `'+15551234567'`).
     * @param providerId Optional provider scope; when set, only identities on that provider match.
     * @returns The matching active identity row, or `undefined` if none matches.
     */
    public IdentityByValue(
        identityValue: string,
        providerId?: string,
    ): MJAIBridgeAgentIdentityEntity | undefined {
        const target = (identityValue ?? '').trim().toLowerCase();
        if (target.length === 0) {
            return undefined;
        }
        return this._agentIdentities.find(
            i =>
                i.IsActive === true &&
                (i.IdentityValue ?? '').trim().toLowerCase() === target &&
                (providerId === undefined || UUIDsEqual(i.ProviderID, providerId)),
        );
    }

    /**
     * Returns the active agent identities for a given agent, optionally scoped to one provider.
     *
     * @param agentId The agent's ID.
     * @param providerId Optional provider scope.
     * @returns The agent's active identity rows (possibly empty).
     */
    public IdentitiesForAgent(
        agentId: string,
        providerId?: string,
    ): MJAIBridgeAgentIdentityEntity[] {
        return this._agentIdentities.filter(
            i =>
                i.IsActive === true &&
                UUIDsEqual(i.AgentID, agentId) &&
                (providerId === undefined || UUIDsEqual(i.ProviderID, providerId)),
        );
    }

    /**
     * Returns the channels a provider contributes, ordered by `Sequence` (ascending).
     *
     * @param providerId The provider's ID.
     * @returns The provider's channel-junction rows, sorted by sequence.
     */
    public ChannelsForProvider(providerId: string): MJAIBridgeProviderChannelEntity[] {
        return this._providerChannels
            .filter(pc => UUIDsEqual(pc.ProviderID, providerId))
            .sort((a, b) => a.Sequence - b.Sequence);
    }

    /**
     * Returns the channels a provider AUTO-ATTACHES on connect (its `IsDefault` channels), ordered
     * by `Sequence`. The engine attaches these to a session when the bridge connects.
     *
     * @param providerId The provider's ID.
     * @returns The provider's default channel-junction rows, sorted by sequence.
     */
    public DefaultChannelsForProvider(providerId: string): MJAIBridgeProviderChannelEntity[] {
        return this.ChannelsForProvider(providerId).filter(pc => pc.IsDefault === true);
    }

    /**
     * The singleton accessor (via {@link BaseEngine}'s global object store).
     */
    public static get Instance(): AIBridgeEngineBase {
        return super.getInstance<AIBridgeEngineBase>();
    }
}
