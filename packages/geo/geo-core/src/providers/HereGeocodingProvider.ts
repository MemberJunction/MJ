import { RegisterClass } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import { BaseGeocodingProvider } from './BaseGeocodingProvider';
import { GeocodeRequest, ProviderGeocodeResult, ReverseGeocodeRequest } from './types';
import { GeocodePrecision } from '../types';

interface HereAddress {
    label?: string;
    countryCode?: string;
    countryName?: string;
    stateCode?: string;
    state?: string;
    county?: string;
    city?: string;
    district?: string;
    street?: string;
    postalCode?: string;
    houseNumber?: string;
}

interface HereItem {
    title: string;
    id: string;
    resultType: string;
    address: HereAddress;
    position: { lat: number; lng: number };
    scoring?: {
        queryScore: number;
        fieldScore?: Record<string, number>;
    };
}

interface HereResponse {
    items: HereItem[];
}

/**
 * HERE Geocoding & Search API provider. Global coverage.
 * Free tier (Freemium plan): 250k requests/month. Permanent storage permitted.
 *
 * Uses /v1/discover for forward geocoding because it accepts free-form input
 * (better for messy CRM data) and /v1/revgeocode for reverse.
 */
@RegisterClass(BaseGeocodingProvider, 'here')
export class HereGeocodingProvider extends BaseGeocodingProvider {
    public readonly Name = 'here';
    public readonly SupportedCountries = 'global' as const;
    public readonly AllowsPersistentStorage = true;

    public IsConfigured(): boolean {
        return this.getApiKey() != null;
    }

    public async Geocode(req: GeocodeRequest): Promise<ProviderGeocodeResult | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;
        // HERE's /discover requires either an `at` (lat,lng bias point) or an `in`
        // (country/circle/bbox) filter. Use country bias when available, else fall
        // back to a global circle centered on 0,0 with a huge radius.
        const params = new URLSearchParams({ q: req.AddressString, limit: '1', apiKey });
        if (req.CountryCode) {
            params.set('in', `countryCode:${req.CountryCode.toUpperCase()}`);
        } else {
            params.set('at', '0,0');
        }
        const url = `https://discover.search.hereapi.com/v1/discover?${params.toString()}`;
        const data = await this.fetchJson<HereResponse>(url);
        if (!data?.items?.length) {
            LogStatus(`HERE geocoder returned no results for "${req.AddressString}"`);
            return null;
        }
        return this.toResult(data.items[0]);
    }

    public async ReverseGeocode(req: ReverseGeocodeRequest): Promise<ProviderGeocodeResult | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;
        const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${req.Latitude},${req.Longitude}&limit=1&apiKey=${apiKey}`;
        const data = await this.fetchJson<HereResponse>(url);
        if (!data?.items?.length) return null;
        return this.toResult(data.items[0]);
    }

    private getApiKey(): string | null {
        return this.resolveCredential(['HERE_API_KEY', 'HERE_MAPS_API_KEY'], 'here.apiKey');
    }

    private toResult(item: HereItem): ProviderGeocodeResult {
        let precision: GeocodePrecision = 'city';
        switch (item.resultType) {
            case 'houseNumber':
            case 'place':
            case 'pointOfInterest':
                precision = 'exact'; break;
            case 'street':
                precision = 'exact'; break;
            case 'postalCodePoint':
                precision = 'postal_code'; break;
            case 'locality':
            case 'administrativeArea':
                precision = item.address.city ? 'city' : 'state_province'; break;
            default:
                precision = 'city';
        }

        // HERE's queryScore is already 0.0–1.0.
        const confidence = this.normalizeConfidence(item.scoring?.queryScore ?? null);
        const a = item.address;
        const line1 = [a.houseNumber, a.street].filter(Boolean).join(' ') || null;

        return {
            Latitude: item.position.lat,
            Longitude: item.position.lng,
            Precision: precision,
            Confidence: confidence,
            FormattedAddress: a.label ?? null,
            CountryCode: a.countryCode ?? null,
            StateProvinceCode: a.stateCode ?? null,
            StateProvinceName: a.state ?? null,
            City: a.city ?? null,
            PostalCode: a.postalCode ?? null,
            Line1: line1,
            Line2: null
        };
    }
}
