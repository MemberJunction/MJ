/**
 * @fileoverview Base class for web search drivers.
 *
 * Each driver wraps one external search vendor and normalises its response into
 * {@link WebSearchHit}. Drivers are discovered at runtime via `@RegisterClass` and the
 * `MJ: Web Search Providers` metadata entity, whose `DriverClass` column is the registration key.
 *
 * @module @memberjunction/web-search-engine
 */

import { LogError, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    RegisteredWebSearchProviderInfo,
    WebSearchCapabilities,
    WebSearchParams,
    WebSearchProviderConfig,
    WebSearchProviderResponse,
} from './types';

/**
 * Abstract base for a web search driver.
 *
 * Subclasses register with `@RegisterClass(BaseWebSearchProvider, 'DriverClassName')` to become
 * discoverable by {@link WebSearchEngine}.
 *
 * Lifecycle, per provider record, at engine config time:
 * 1. `WebSearchEngine` loads Active `MJ: Web Search Providers` records
 * 2. ClassFactory creates an instance from `DriverClass`
 * 3. {@link Initialize} receives the record's configuration and any decrypted credential values
 * 4. {@link CheckAvailability} verifies the driver is actually operational
 * 5. If {@link IsAvailable} is true, the driver joins the selection pool
 *
 * A driver that cannot work — no API key, missing optional dependency — must **self-disable in
 * `CheckAvailability` rather than throw**. An unconfigured vendor is a normal state in a product
 * shipped to many hosts, not an error, and the engine simply routes around it.
 */
export abstract class BaseWebSearchProvider {
    /** What this driver can do. Declared by the class, never read from the database. */
    public abstract readonly Capabilities: WebSearchCapabilities;

    /** Configuration from the metadata record, set during {@link Initialize}. */
    protected config: WebSearchProviderConfig | null = null;

    private _available = false;
    private _unavailableReason: string | null = null;

    /**
     * Receive configuration from the provider's metadata record.
     *
     * The default stores it; override to do additional setup, and call `super.Initialize(...)`.
     */
    public async Initialize(config: WebSearchProviderConfig, _contextUser: UserInfo): Promise<void> {
        this.config = config;
    }

    /**
     * Determine whether this driver can serve requests, calling {@link MarkAvailable} or
     * {@link MarkUnavailable} exactly once.
     *
     * Must not throw for the ordinary "not configured here" case — see the class note.
     */
    public abstract CheckAvailability(contextUser: UserInfo): Promise<void>;

    /** Whether this driver may participate in searches. False until `CheckAvailability` says otherwise. */
    public IsAvailable(): boolean {
        return this._available;
    }

    /** Why this driver is unavailable, for diagnostics. Null when it is available. */
    public get UnavailableReason(): string | null {
        return this._available ? null : this._unavailableReason;
    }

    /** Execute a search. Called only when {@link IsAvailable} is true. */
    public abstract ExecuteSearch(
        params: WebSearchParams,
        contextUser: UserInfo,
    ): Promise<WebSearchProviderResponse>;

    /** Mark this driver operational. Call from {@link CheckAvailability}. */
    protected MarkAvailable(): void {
        this._available = true;
        this._unavailableReason = null;
    }

    /** Mark this driver unusable, with a reason an administrator can act on. */
    protected MarkUnavailable(reason: string): void {
        this._available = false;
        this._unavailableReason = reason;
    }

    /**
     * Read a credential value, preferring the decrypted `MJ: Credentials` record and falling back
     * to an environment variable.
     *
     * The fallback exists because the web search actions this engine supersedes read their keys
     * from `mj.config.cjs` / the environment, and a host upgrading should not have to migrate its
     * secrets into the Credential store on the same day it gains the engine.
     *
     * @param credentialKey - key within the credential record's decrypted values, e.g. `apiKey`
     * @param envVarName - environment variable consulted when no credential value is present
     */
    protected GetSecret(credentialKey: string, envVarName: string): string | undefined {
        const fromCredential = this.config?.CredentialValues?.[credentialKey];
        if (typeof fromCredential === 'string' && fromCredential.trim().length > 0) {
            return fromCredential.trim();
        }
        const fromEnv = process.env[envVarName];
        return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : undefined;
    }

    /** Read a non-secret setting from the record's `ProviderConfig` JSON. */
    protected GetConfigValue<T>(key: string): T | undefined {
        const value = this.config?.ProviderConfig?.[key];
        return value === undefined ? undefined : (value as T);
    }

    /**
     * The effective result cap: the caller's request, bounded by the metadata override (when set)
     * and then by the vendor's own hard cap.
     *
     * Clamped rather than rejected — a caller asking for 50 wants as many as possible, and most
     * vendors reject the whole request when asked for more than they serve.
     */
    protected ResolveMaxResults(requested: number | undefined, fallback = 10): number {
        const asked = Math.floor(requested ?? this.config?.MaxResultsOverride ?? fallback);
        const metadataCap = this.config?.MaxResultsOverride ?? Number.MAX_SAFE_INTEGER;
        return Math.min(Math.max(asked, 1), metadataCap, this.Capabilities.MaxResultsCap);
    }

    /**
     * Enumerate every registered driver with its capabilities, for admin UI dropdowns.
     *
     * Instantiates each registration to read `Capabilities`, so a driver's constructor must stay
     * side-effect free.
     */
    public static GetAvailableProviders(): RegisteredWebSearchProviderInfo[] {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseWebSearchProvider);
        const result: RegisteredWebSearchProviderInfo[] = [];
        // The same class loaded through two module paths registers twice; dedupe by key so the
        // admin dropdown does not show a driver more than once.
        const seen = new Set<string>();
        for (const registration of registrations ?? []) {
            const key = registration.Key;
            if (!key || seen.has(key)) {
                continue;
            }
            seen.add(key);
            try {
                const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseWebSearchProvider>(
                    BaseWebSearchProvider,
                    key,
                );
                if (instance) {
                    result.push({ DriverClass: key, Capabilities: instance.Capabilities });
                }
            } catch (e) {
                // One malformed registration must not blank the whole catalog the admin UI reads.
                LogError(
                    `BaseWebSearchProvider.GetAvailableProviders: could not instantiate "${key}"`,
                    undefined,
                    e,
                );
            }
        }
        return result;
    }
}
