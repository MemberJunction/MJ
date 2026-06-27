import { RegisterClass } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import { BaseGeocodingProvider } from './BaseGeocodingProvider';
import { GeocodeRequest, ProviderGeocodeResult, ReverseGeocodeRequest } from './types';
import { GeocodePrecision } from '../types';

interface GeocodioAddressComponents {
    number?: string;
    predirectional?: string;
    street?: string;
    suffix?: string;
    secondaryunit?: string;
    secondarynumber?: string;
    formatted_street?: string;
    city?: string;
    county?: string;
    state?: string;
    zip?: string;
    country?: string;
}

interface GeocodioResult {
    address_components: GeocodioAddressComponents;
    formatted_address: string;
    location: { lat: number; lng: number };
    accuracy: number;
    accuracy_type: string;
    source?: string;
}

interface GeocodioResponse {
    results: GeocodioResult[];
    error?: string;
}

/**
 * Geocod.io provider. US, Canada, UK, and Australia only — not global.
 * Free tier: 2,500 lookups/day. Permanent storage permitted by ToS.
 */
@RegisterClass(BaseGeocodingProvider, 'geocodio')
export class GeocodioGeocodingProvider extends BaseGeocodingProvider {
    public readonly Name = 'geocodio';
    public readonly SupportedCountries = ['US', 'CA', 'GB', 'AU'] as const;
    public readonly AllowsPersistentStorage = true;

    public IsConfigured(): boolean {
        return this.getApiKey() != null;
    }

    public async Geocode(req: GeocodeRequest): Promise<ProviderGeocodeResult | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;
        const params = new URLSearchParams({ q: req.AddressString, api_key: apiKey, limit: '1' });
        if (req.CountryCode) params.set('country', req.CountryCode);
        const url = `https://api.geocod.io/v1.7/geocode?${params.toString()}`;
        const data = await this.fetchJson<GeocodioResponse>(url);
        if (!data) return null;
        if (data.error || !data.results?.length) {
            if (data.error) LogStatus(`Geocod.io: ${data.error}`);
            return null;
        }
        return this.toResult(data.results[0]);
    }

    public async ReverseGeocode(req: ReverseGeocodeRequest): Promise<ProviderGeocodeResult | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;
        const url = `https://api.geocod.io/v1.7/reverse?q=${req.Latitude},${req.Longitude}&api_key=${apiKey}&limit=1`;
        const data = await this.fetchJson<GeocodioResponse>(url);
        if (!data || !data.results?.length) return null;
        return this.toResult(data.results[0]);
    }

    private getApiKey(): string | null {
        return this.resolveCredential(['GEOCODIO_API_KEY'], 'geocodio.apiKey');
    }

    private toResult(r: GeocodioResult): ProviderGeocodeResult {
        // Geocod.io accuracy_type maps cleanly to our precision enum.
        // accuracy is already 0.0–1.0.
        let precision: GeocodePrecision = 'city';
        switch (r.accuracy_type) {
            case 'rooftop':
            case 'point':
            case 'range_interpolation':
            case 'nearest_rooftop_match':
                precision = 'exact'; break;
            case 'street_center':
            case 'intersection':
                precision = 'exact'; break;
            case 'place':
                precision = 'city'; break;
            case 'county':
                precision = 'county'; break;
            case 'state':
                precision = 'state_province'; break;
            default:
                precision = r.address_components.zip ? 'postal_code' : 'city';
        }

        const c = r.address_components;
        const line1 = c.formatted_street
            ? [c.number, c.formatted_street].filter(Boolean).join(' ')
            : [c.number, c.predirectional, c.street, c.suffix].filter(Boolean).join(' ');
        const line2 = c.secondaryunit
            ? [c.secondaryunit, c.secondarynumber].filter(Boolean).join(' ')
            : null;

        return {
            Latitude: r.location.lat,
            Longitude: r.location.lng,
            Precision: precision,
            Confidence: this.normalizeConfidence(r.accuracy),
            FormattedAddress: r.formatted_address,
            CountryCode: c.country ?? null,
            StateProvinceCode: c.state ?? null,
            StateProvinceName: c.state ?? null,
            City: c.city ?? null,
            PostalCode: c.zip ?? null,
            Line1: line1 || null,
            Line2: line2
        };
    }
}
