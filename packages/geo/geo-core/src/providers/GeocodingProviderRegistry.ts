import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseGeocodingProvider } from './BaseGeocodingProvider';
import { IGeocodingProvider } from './types';
import { GoogleGeocodingProvider } from './GoogleGeocodingProvider';
import { GeocodioGeocodingProvider } from './GeocodioGeocodingProvider';
import { HereGeocodingProvider } from './HereGeocodingProvider';

/**
 * Singleton registry of geocoding providers. Resolves the configured provider
 * by name and gracefully falls back when the requested one isn't configured.
 *
 * Built-in providers (Google, Geocod.io, HERE) are auto-registered on first
 * access. Custom providers can be registered via Register() — they should
 * extend BaseGeocodingProvider and be decorated with @RegisterClass for the
 * MJ class factory if you want them resolvable by name across packages.
 */
export class GeocodingProviderRegistry extends BaseSingleton<GeocodingProviderRegistry> {
    private providers = new Map<string, IGeocodingProvider>();
    private builtInsRegistered = false;

    public constructor() {
        super();
    }

    public static get Instance(): GeocodingProviderRegistry {
        return GeocodingProviderRegistry.getInstance<GeocodingProviderRegistry>();
    }

    /** Register a provider instance under its Name. */
    public Register(provider: IGeocodingProvider): void {
        this.providers.set(provider.Name.toLowerCase(), provider);
    }

    /**
     * Look up a provider by name. Returns null if no provider is registered
     * under that name or the provider isn't configured (no API key).
     */
    public Get(name: string): IGeocodingProvider | null {
        this.ensureBuiltInsRegistered();
        const provider = this.providers.get(name.toLowerCase());
        if (!provider) return null;
        if (!provider.IsConfigured()) return null;
        return provider;
    }

    /** All registered providers regardless of configuration state. */
    public All(): IGeocodingProvider[] {
        this.ensureBuiltInsRegistered();
        return Array.from(this.providers.values());
    }

    /** All providers that have credentials configured. */
    public AllConfigured(): IGeocodingProvider[] {
        return this.All().filter(p => p.IsConfigured());
    }

    /**
     * Resolve the provider to use given an optional explicit name. Resolution order:
     *
     * 1. If `requestedName` is supplied → return it if configured; if not, log a
     *    warning and continue.
     * 2. The configured default from `__mj_config_apiIntegrations.geocoding.defaultProvider`.
     * 3. The first configured provider in priority order: geocodio → here → google.
     *    (Geocod.io first because it has the most generous free tier for US data;
     *    HERE second for global; Google last because of ToS storage restrictions.)
     * 4. null if nothing is configured.
     */
    public Resolve(requestedName?: string | null): IGeocodingProvider | null {
        this.ensureBuiltInsRegistered();
        if (requestedName) {
            const explicit = this.Get(requestedName);
            if (explicit) return explicit;
            LogStatus(`GeocodingProviderRegistry: requested provider "${requestedName}" is not configured; falling back to default.`);
        }
        const configuredDefault = this.readDefaultFromConfig();
        if (configuredDefault) {
            const fromConfig = this.Get(configuredDefault);
            if (fromConfig) return fromConfig;
            LogError(`GeocodingProviderRegistry: default provider "${configuredDefault}" from config is not configured.`);
        }
        for (const name of ['geocodio', 'here', 'google']) {
            const fallback = this.Get(name);
            if (fallback) return fallback;
        }
        return null;
    }

    private readDefaultFromConfig(): string | null {
        try {
            const cfg = (globalThis as Record<string, unknown>)['__mj_config_apiIntegrations'] as Record<string, unknown> | undefined;
            const geo = cfg?.['geocoding'] as Record<string, unknown> | undefined;
            const v = geo?.['defaultProvider'];
            return typeof v === 'string' && v.length > 0 ? v : null;
        } catch {
            return null;
        }
    }

    /**
     * Register the three built-in providers on first access. We do this lazily
     * (rather than at module load) so consumers who only want one provider
     * don't pay for class instantiation of the others until needed.
     *
     * Uses MJGlobal.ClassFactory to honor any @RegisterClass overrides, so
     * downstream packages can substitute their own implementations.
     */
    private ensureBuiltInsRegistered(): void {
        if (this.builtInsRegistered) return;
        this.builtInsRegistered = true;
        const factory = MJGlobal.Instance.ClassFactory;
        const builtIns: Array<[string, new () => BaseGeocodingProvider]> = [
            ['google', GoogleGeocodingProvider],
            ['geocodio', GeocodioGeocodingProvider],
            ['here', HereGeocodingProvider]
        ];
        for (const [name, ctor] of builtIns) {
            try {
                const instance = factory.CreateInstance<BaseGeocodingProvider>(BaseGeocodingProvider, name)
                    ?? new ctor();
                this.providers.set(name, instance);
            } catch (e: unknown) {
                LogError(`GeocodingProviderRegistry: failed to instantiate built-in provider "${name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
}
