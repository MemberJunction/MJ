import { RegisterClass } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import { BaseGeocodingProvider } from './BaseGeocodingProvider';
import { GeocodeRequest, ProviderGeocodeResult, ReverseGeocodeRequest } from './types';
import { GeocodePrecision } from '../types';

interface GoogleAddressComponent {
    long_name: string;
    short_name: string;
    types: string[];
}

interface GoogleGeocodingResponse {
    results: Array<{
        address_components: GoogleAddressComponent[];
        formatted_address: string;
        geometry: {
            location: { lat: number; lng: number };
            location_type: string;
        };
    }>;
    status: string;
    error_message?: string;
}

/**
 * Google Maps Geocoding API provider.
 *
 * Note on persistent storage: Google Maps Platform ToS technically forbid
 * indefinite storage of geocoding results unless displayed on a Google Map.
 * We expose `AllowsPersistentStorage = true` for backwards compatibility
 * (the existing system already persists Google results) but customers with
 * strict compliance posture should use Geocod.io or HERE as the default.
 */
@RegisterClass(BaseGeocodingProvider, 'google')
export class GoogleGeocodingProvider extends BaseGeocodingProvider {
    public readonly Name = 'google';
    public readonly SupportedCountries = 'global' as const;
    public readonly AllowsPersistentStorage = true;

    public IsConfigured(): boolean {
        return this.getApiKey() != null;
    }

    public async Geocode(req: GeocodeRequest): Promise<ProviderGeocodeResult | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;
        const params = new URLSearchParams({ address: req.AddressString, key: apiKey });
        if (req.CountryCode) params.set('region', req.CountryCode.toLowerCase());
        const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
        const data = await this.fetchJson<GoogleGeocodingResponse>(url);
        if (!data) return null;
        if (data.status !== 'OK' || !data.results?.length) {
            LogStatus(`Google geocoder returned status "${data.status}" for "${req.AddressString}"`);
            return null;
        }
        return this.toResult(data.results[0]);
    }

    public async ReverseGeocode(req: ReverseGeocodeRequest): Promise<ProviderGeocodeResult | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${req.Latitude},${req.Longitude}&key=${apiKey}`;
        const data = await this.fetchJson<GoogleGeocodingResponse>(url);
        if (!data || data.status !== 'OK' || !data.results?.length) return null;
        return this.toResult(data.results[0]);
    }

    private getApiKey(): string | null {
        return this.resolveCredential(
            ['GOOGLE_GEOCODING_API_KEY', 'GOOGLE_MAPS_API_KEY'],
            'google.geocoding.apiKey'
        );
    }

    private toResult(r: GoogleGeocodingResponse['results'][0]): ProviderGeocodeResult {
        const comp = (type: string, useShort = false): string | null => {
            const c = r.address_components.find(x => x.types.includes(type));
            if (!c) return null;
            return useShort ? c.short_name : c.long_name;
        };

        const streetNumber = comp('street_number');
        const route = comp('route');
        const line1 = [streetNumber, route].filter(Boolean).join(' ') || null;

        // Map Google's location_type to our enum + a normalized confidence proxy.
        let precision: GeocodePrecision = 'city';
        let confidence: number | null = null;
        switch (r.geometry.location_type) {
            case 'ROOFTOP':            precision = 'exact'; confidence = 1.0; break;
            case 'RANGE_INTERPOLATED': precision = 'exact'; confidence = 0.85; break;
            case 'GEOMETRIC_CENTER':   precision = 'city'; confidence = 0.5; break;
            case 'APPROXIMATE':        precision = 'state_province'; confidence = 0.3; break;
        }

        return {
            Latitude: r.geometry.location.lat,
            Longitude: r.geometry.location.lng,
            Precision: precision,
            Confidence: confidence,
            FormattedAddress: r.formatted_address,
            CountryCode: comp('country', true),
            StateProvinceCode: comp('administrative_area_level_1', true),
            StateProvinceName: comp('administrative_area_level_1'),
            City: comp('locality') ?? comp('postal_town'),
            PostalCode: comp('postal_code'),
            Line1: line1,
            Line2: comp('subpremise')
        };
    }
}
