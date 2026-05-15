import { GeocodePrecision } from '../types';

/**
 * Forward (address-to-coordinates) geocoding request.
 * Providers receive both a pre-built single-line address string and the
 * structured components (when available). Providers may use either form
 * depending on their API shape.
 */
export interface GeocodeRequest {
    /** Pre-built single-line address, e.g. "123 Main St, Springfield, IL 62701, USA". */
    AddressString: string;
    /** Optional structured components. Empty/missing when not provided. */
    Address?: string;
    City?: string;
    StateProvince?: string;
    PostalCode?: string;
    Country?: string;
    /** ISO 3166-1 alpha-2 country code (e.g. "US"), used for region-bias / routing. */
    CountryCode?: string;
}

/**
 * Reverse (coordinates-to-address) geocoding request.
 */
export interface ReverseGeocodeRequest {
    Latitude: number;
    Longitude: number;
}

/**
 * Provider-agnostic geocoding result. Providers normalize their native
 * response into this shape. Confidence is normalized to 0.0–1.0; precision
 * uses the GeocodePrecision enum from the persistence layer.
 */
export interface ProviderGeocodeResult {
    Latitude: number;
    Longitude: number;
    Precision: GeocodePrecision;
    /** Normalized 0.0–1.0 confidence score. null if the provider doesn't surface one. */
    Confidence: number | null;
    FormattedAddress: string | null;
    /** ISO 3166-1 alpha-2 country code returned by the provider. */
    CountryCode: string | null;
    /** State/province code/abbreviation returned by the provider. */
    StateProvinceCode: string | null;
    StateProvinceName: string | null;
    City: string | null;
    PostalCode: string | null;
    /** Street line 1 if the provider parsed it out. */
    Line1: string | null;
    /** Street line 2 (apt/unit/suite) if the provider parsed it out. */
    Line2: string | null;
}

/**
 * Common interface all geocoding providers implement. New providers are
 * registered via GeocodingProviderRegistry.Register() — no core changes needed.
 */
export interface IGeocodingProvider {
    /** Stable identifier used in config and the GeocodingSource enum (e.g. 'google', 'geocodio', 'here'). */
    readonly Name: string;
    /**
     * 'global' if the provider supports all countries, otherwise an array of
     * ISO 3166-1 alpha-2 codes. Used for routing decisions when a country is
     * known up-front.
     */
    readonly SupportedCountries: 'global' | readonly string[];
    /**
     * True if the provider's free tier / ToS permits indefinite persistent
     * storage of geocoding results. Used to gate use for RecordGeoCode persistence.
     */
    readonly AllowsPersistentStorage: boolean;
    /** True if API credentials are configured and the provider is ready to call. */
    IsConfigured(): boolean;
    /** Forward geocode. Returns null when the provider can't resolve the address. Throws on transient API errors. */
    Geocode(req: GeocodeRequest): Promise<ProviderGeocodeResult | null>;
    /** Reverse geocode. Returns null when the provider can't resolve coordinates. Throws on transient API errors. */
    ReverseGeocode(req: ReverseGeocodeRequest): Promise<ProviderGeocodeResult | null>;
}
