import { LogError } from '@memberjunction/core';
import { GeocodeRequest, IGeocodingProvider, ProviderGeocodeResult, ReverseGeocodeRequest } from './types';

/**
 * Abstract base class for geocoding providers. Holds shared HTTP and
 * config-lookup helpers so concrete providers only implement the API-specific
 * request/response mapping.
 */
export abstract class BaseGeocodingProvider implements IGeocodingProvider {
    public abstract readonly Name: string;
    public abstract readonly SupportedCountries: 'global' | readonly string[];
    public abstract readonly AllowsPersistentStorage: boolean;

    public abstract IsConfigured(): boolean;
    public abstract Geocode(req: GeocodeRequest): Promise<ProviderGeocodeResult | null>;
    public abstract ReverseGeocode(req: ReverseGeocodeRequest): Promise<ProviderGeocodeResult | null>;

    /**
     * Resolve a credential from env vars first, then mj.config.cjs.
     * Mirrors the existing GeoCodeSyncService.getGoogleApiKey() pattern but
     * generalized so each provider can declare its own env/config keys.
     *
     * @param envKeys Ordered list of env var names to try (e.g. ['GEOCODIO_API_KEY']).
     * @param configPath Dotted path within __mj_config_apiIntegrations
     *        (e.g. 'geocodio.apiKey' or 'google.geocoding.apiKey').
     */
    protected resolveCredential(envKeys: string[], configPath: string): string | null {
        for (const key of envKeys) {
            const v = process.env[key];
            if (v && v.trim().length > 0) return v.trim();
        }
        try {
            const cfg = (globalThis as Record<string, unknown>)['__mj_config_apiIntegrations'] as Record<string, unknown> | undefined;
            if (!cfg) return null;
            const segments = configPath.split('.');
            let cursor: unknown = cfg;
            for (const seg of segments) {
                if (cursor && typeof cursor === 'object' && seg in (cursor as Record<string, unknown>)) {
                    cursor = (cursor as Record<string, unknown>)[seg];
                } else {
                    return null;
                }
            }
            return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
        } catch {
            return null;
        }
    }

    /**
     * Fetch JSON from a provider API with consistent error logging. Returns
     * null on non-2xx responses (so callers treat HTTP errors as "no result"
     * rather than throwing); throws on network/parse errors so the scheduled
     * job can mark the row as 'failed' and retry later.
     */
    protected async fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
        const response = await fetch(url, init);
        if (!response.ok) {
            LogError(`${this.Name} geocoder HTTP ${response.status}: ${response.statusText}`);
            return null;
        }
        return await response.json() as T;
    }

    /**
     * Helper for subclasses: clamp a numeric confidence to 0.0–1.0,
     * returning null if the input is null/undefined/NaN.
     */
    protected normalizeConfidence(raw: number | null | undefined): number | null {
        if (raw == null || isNaN(raw)) return null;
        if (raw < 0) return 0;
        if (raw > 1) return 1;
        return raw;
    }
}
