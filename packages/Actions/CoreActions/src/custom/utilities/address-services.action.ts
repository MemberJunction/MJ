import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import axios from "axios";
import { getApiIntegrationsConfig } from "../../config";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface AddressComponent {
    City?: string;
    State?: string;
    PostalCode?: string;
    Country?: string;
    CountryCode?: string;
    Line1?: string;
    Line2?: string;
    Latitude?: number;
    Longitude?: number;
    FormattedAddress?: string;
}

interface GoogleGeocodingResult {
    results: Array<{
        address_components: Array<{
            long_name: string;
            short_name: string;
            types: string[];
        }>;
        formatted_address: string;
        geometry: {
            location: {
                lat: number;
                lng: number;
            };
        };
    }>;
    status: string;
    error_message?: string;
}

interface GoogleAddressValidationResponse {
    result: {
        verdict: {
            addressComplete: boolean;
            hasUnconfirmedComponents: boolean;
            validationGranularity: string;
        };
        address: {
            formattedAddress: string;
            postalAddress: {
                regionCode: string;
                languageCode: string;
                postalCode: string;
                administrativeArea: string;
                locality: string;
                addressLines: string[];
            };
            addressComponents: Array<{
                componentName: { text: string; languageCode: string };
                componentType: string;
                confirmationLevel: string;
            }>;
        };
        geocode: {
            location: {
                latitude: number;
                longitude: number;
            };
        };
        uspsData?: {
            dpvConfirmation: string;
            carrierRoute: string;
            dpvFootnote: string;
        };
    };
}

// ---------------------------------------------------------------------------
// Helper: extract structured address from Google Geocoding result
// ---------------------------------------------------------------------------

function extractAddress(result: GoogleGeocodingResult['results'][0]): AddressComponent {
    const address: AddressComponent = {
        FormattedAddress: result.formatted_address,
        Latitude: result.geometry.location.lat,
        Longitude: result.geometry.location.lng,
    };

    for (const component of result.address_components) {
        const types = component.types;
        if (types.includes('street_number')) {
            address.Line1 = component.long_name;
        } else if (types.includes('route')) {
            address.Line1 = address.Line1
                ? `${address.Line1} ${component.long_name}`
                : component.long_name;
        } else if (types.includes('subpremise')) {
            address.Line2 = component.long_name;
        } else if (types.includes('locality')) {
            address.City = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
            address.State = component.short_name;
        } else if (types.includes('postal_code')) {
            address.PostalCode = component.long_name;
        } else if (types.includes('country')) {
            address.Country = component.long_name;
            address.CountryCode = component.short_name;
        }
    }

    return address;
}

// ---------------------------------------------------------------------------
// Helper: get Google API key from config
// ---------------------------------------------------------------------------

function getGoogleApiKey(): string | undefined {
    const config = getApiIntegrationsConfig();
    return config.google?.geocoding?.apiKey
        || process.env.GOOGLE_GEOCODING_API_KEY
        || process.env.GOOGLE_MAPS_API_KEY;
}

// ---------------------------------------------------------------------------
// 1. Postal Code Lookup
// ---------------------------------------------------------------------------

/**
 * Looks up city, state, and coordinates from a postal code using
 * the Google Geocoding API.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Postal Code Lookup',
 *   Params: [
 *     { Name: 'PostalCode', Value: '70115' },
 *     { Name: 'Country', Value: 'US' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Postal Code Lookup")
export class PostalCodeLookupAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const postalCode = params.Params.find(p => p.Name.toLowerCase() === 'postalcode')?.Value;
        if (!postalCode) {
            return { Success: false, ResultCode: 'MISSING_POSTAL_CODE', Message: 'PostalCode parameter is required' };
        }

        const apiKey = getGoogleApiKey();
        if (!apiKey) {
            return { Success: false, ResultCode: 'MISSING_API_KEY', Message: 'Google Geocoding API key not found. Set google.geocoding.apiKey in mj.config.cjs or GOOGLE_GEOCODING_API_KEY environment variable.' };
        }

        const country = params.Params.find(p => p.Name.toLowerCase() === 'country')?.Value || '';

        try {
            // Use the components parameter to restrict results to the specified country
            const queryParams: Record<string, string> = { address: postalCode, key: apiKey };
            if (country) {
                queryParams.components = `country:${country}`;
            }

            const response = await axios.get<GoogleGeocodingResult>(
                'https://maps.googleapis.com/maps/api/geocode/json',
                { params: queryParams, timeout: 10000 }
            );

            if (response.data.status !== 'OK' || !response.data.results.length) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `No results found for postal code "${postalCode}". Google status: ${response.data.status}`
                };
            }

            const address = extractAddress(response.data.results[0]);

            // Update the Country param in-place (it's type Both)
            const countryParam = params.Params.find(p => p.Name.toLowerCase() === 'country');
            if (countryParam) {
                countryParam.Value = address.Country || '';
            }

            params.Params.push(
                { Name: 'City', Value: address.City || '', Type: 'Output' },
                { Name: 'State', Value: address.State || '', Type: 'Output' },
                { Name: 'CountryCode', Value: address.CountryCode || '', Type: 'Output' },
                { Name: 'Latitude', Value: address.Latitude, Type: 'Output' },
                { Name: 'Longitude', Value: address.Longitude, Type: 'Output' },
            );

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(address, null, 2)
            };
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'API_ERROR',
                Message: `Google Geocoding API error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}

// ---------------------------------------------------------------------------
// 2. Geocode Address
// ---------------------------------------------------------------------------

/**
 * Converts a free-form address string into structured address components
 * and geographic coordinates using the Google Geocoding API.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Geocode Address',
 *   Params: [
 *     { Name: 'Address', Value: '1600 Amphitheatre Parkway, Mountain View, CA' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Geocode Address")
export class GeocodeAddressAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const address = params.Params.find(p => p.Name.toLowerCase() === 'address')?.Value;
        if (!address) {
            return { Success: false, ResultCode: 'MISSING_ADDRESS', Message: 'Address parameter is required' };
        }

        const apiKey = getGoogleApiKey();
        if (!apiKey) {
            return { Success: false, ResultCode: 'MISSING_API_KEY', Message: 'Google Geocoding API key not found. Set google.geocoding.apiKey in mj.config.cjs or GOOGLE_GEOCODING_API_KEY environment variable.' };
        }

        try {
            const response = await axios.get<GoogleGeocodingResult>(
                'https://maps.googleapis.com/maps/api/geocode/json',
                { params: { address, key: apiKey }, timeout: 10000 }
            );

            if (response.data.status !== 'OK' || !response.data.results.length) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `No results found for address "${address}". Google status: ${response.data.status}`
                };
            }

            const result = extractAddress(response.data.results[0]);

            params.Params.push(
                { Name: 'Line1', Value: result.Line1 || '', Type: 'Output' },
                { Name: 'Line2', Value: result.Line2 || '', Type: 'Output' },
                { Name: 'City', Value: result.City || '', Type: 'Output' },
                { Name: 'State', Value: result.State || '', Type: 'Output' },
                { Name: 'PostalCode', Value: result.PostalCode || '', Type: 'Output' },
                { Name: 'Country', Value: result.Country || '', Type: 'Output' },
                { Name: 'CountryCode', Value: result.CountryCode || '', Type: 'Output' },
                { Name: 'Latitude', Value: result.Latitude, Type: 'Output' },
                { Name: 'Longitude', Value: result.Longitude, Type: 'Output' },
                { Name: 'FormattedAddress', Value: result.FormattedAddress || '', Type: 'Output' },
            );

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result, null, 2)
            };
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'API_ERROR',
                Message: `Google Geocoding API error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}

// ---------------------------------------------------------------------------
// 3. Reverse Geocode
// ---------------------------------------------------------------------------

/**
 * Converts geographic coordinates (latitude/longitude) into a structured
 * address using the Google Geocoding API.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Reverse Geocode',
 *   Params: [
 *     { Name: 'Latitude', Value: 37.4224764 },
 *     { Name: 'Longitude', Value: -122.0842499 }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Reverse Geocode")
export class ReverseGeocodeAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const lat = params.Params.find(p => p.Name.toLowerCase() === 'latitude')?.Value;
        const lng = params.Params.find(p => p.Name.toLowerCase() === 'longitude')?.Value;

        if (lat === undefined || lat === null || lng === undefined || lng === null) {
            return { Success: false, ResultCode: 'MISSING_COORDINATES', Message: 'Both Latitude and Longitude parameters are required' };
        }

        const latitude = Number(lat);
        const longitude = Number(lng);
        if (isNaN(latitude) || isNaN(longitude)) {
            return { Success: false, ResultCode: 'INVALID_COORDINATES', Message: 'Latitude and Longitude must be valid numbers' };
        }

        const apiKey = getGoogleApiKey();
        if (!apiKey) {
            return { Success: false, ResultCode: 'MISSING_API_KEY', Message: 'Google Geocoding API key not found. Set google.geocoding.apiKey in mj.config.cjs or GOOGLE_GEOCODING_API_KEY environment variable.' };
        }

        try {
            const response = await axios.get<GoogleGeocodingResult>(
                'https://maps.googleapis.com/maps/api/geocode/json',
                { params: { latlng: `${latitude},${longitude}`, key: apiKey }, timeout: 10000 }
            );

            if (response.data.status !== 'OK' || !response.data.results.length) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `No address found for coordinates (${latitude}, ${longitude}). Google status: ${response.data.status}`
                };
            }

            const result = extractAddress(response.data.results[0]);

            params.Params.push(
                { Name: 'Line1', Value: result.Line1 || '', Type: 'Output' },
                { Name: 'Line2', Value: result.Line2 || '', Type: 'Output' },
                { Name: 'City', Value: result.City || '', Type: 'Output' },
                { Name: 'State', Value: result.State || '', Type: 'Output' },
                { Name: 'PostalCode', Value: result.PostalCode || '', Type: 'Output' },
                { Name: 'Country', Value: result.Country || '', Type: 'Output' },
                { Name: 'CountryCode', Value: result.CountryCode || '', Type: 'Output' },
                { Name: 'FormattedAddress', Value: result.FormattedAddress || '', Type: 'Output' },
            );

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result, null, 2)
            };
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'API_ERROR',
                Message: `Google Geocoding API error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}

// ---------------------------------------------------------------------------
// 4. Validate Address
// ---------------------------------------------------------------------------

/**
 * Validates and standardizes an address using the Google Address Validation API.
 * Returns corrected address fields, deliverability verdict, and USPS data for
 * US addresses.
 *
 * Requires the Address Validation API to be enabled in your Google Cloud project.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Validate Address',
 *   Params: [
 *     { Name: 'Line1', Value: '1600 Amphitheatre Pkwy' },
 *     { Name: 'City', Value: 'Mountain View' },
 *     { Name: 'State', Value: 'CA' },
 *     { Name: 'PostalCode', Value: '94043' },
 *     { Name: 'Country', Value: 'US' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Validate Address")
export class ValidateAddressAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const getParam = (name: string): string =>
            params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase())?.Value || '';

        const line1 = getParam('Line1');
        const line2 = getParam('Line2');
        const city = getParam('City');
        const state = getParam('State');
        const postalCode = getParam('PostalCode');
        const country = getParam('Country') || 'US';

        if (!line1 && !city && !postalCode) {
            return { Success: false, ResultCode: 'MISSING_ADDRESS', Message: 'At least one of Line1, City, or PostalCode is required' };
        }

        const apiKey = getGoogleApiKey();
        if (!apiKey) {
            return { Success: false, ResultCode: 'MISSING_API_KEY', Message: 'Google Geocoding API key not found. Set google.geocoding.apiKey in mj.config.cjs or GOOGLE_GEOCODING_API_KEY environment variable.' };
        }

        const addressLines: string[] = [];
        if (line1) addressLines.push(line1);
        if (line2) addressLines.push(line2);

        const requestBody = {
            address: {
                regionCode: country.length === 2 ? country.toUpperCase() : undefined,
                locality: city || undefined,
                administrativeArea: state || undefined,
                postalCode: postalCode || undefined,
                addressLines: addressLines.length > 0 ? addressLines : undefined,
            },
            enableUspsCass: country.toUpperCase() === 'US',
        };

        try {
            const response = await axios.post<GoogleAddressValidationResponse>(
                `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`,
                requestBody,
                { timeout: 10000 }
            );

            const result = response.data.result;
            if (!result) {
                return { Success: false, ResultCode: 'EMPTY_RESPONSE', Message: 'Empty response from Google Address Validation API' };
            }

            const postal = result.address.postalAddress;
            const geo = result.geocode?.location;
            const verdict = result.verdict;

            const validationResult = {
                CorrectedLine1: postal.addressLines?.[0] || '',
                CorrectedLine2: postal.addressLines?.[1] || '',
                CorrectedCity: postal.locality || '',
                CorrectedState: postal.administrativeArea || '',
                CorrectedPostalCode: postal.postalCode || '',
                CorrectedCountry: postal.regionCode || '',
                FormattedAddress: result.address.formattedAddress || '',
                Latitude: geo?.latitude,
                Longitude: geo?.longitude,
                IsComplete: verdict.addressComplete,
                HasUnconfirmedComponents: verdict.hasUnconfirmedComponents,
                ValidationGranularity: verdict.validationGranularity,
                Deliverable: verdict.validationGranularity === 'PREMISE' || verdict.validationGranularity === 'SUB_PREMISE',
                DPVConfirmation: result.uspsData?.dpvConfirmation || '',
            };

            params.Params.push(
                { Name: 'CorrectedLine1', Value: validationResult.CorrectedLine1, Type: 'Output' },
                { Name: 'CorrectedLine2', Value: validationResult.CorrectedLine2, Type: 'Output' },
                { Name: 'CorrectedCity', Value: validationResult.CorrectedCity, Type: 'Output' },
                { Name: 'CorrectedState', Value: validationResult.CorrectedState, Type: 'Output' },
                { Name: 'CorrectedPostalCode', Value: validationResult.CorrectedPostalCode, Type: 'Output' },
                { Name: 'CorrectedCountry', Value: validationResult.CorrectedCountry, Type: 'Output' },
                { Name: 'FormattedAddress', Value: validationResult.FormattedAddress, Type: 'Output' },
                { Name: 'Latitude', Value: validationResult.Latitude, Type: 'Output' },
                { Name: 'Longitude', Value: validationResult.Longitude, Type: 'Output' },
                { Name: 'IsComplete', Value: validationResult.IsComplete, Type: 'Output' },
                { Name: 'Deliverable', Value: validationResult.Deliverable, Type: 'Output' },
                { Name: 'ValidationGranularity', Value: validationResult.ValidationGranularity, Type: 'Output' },
                { Name: 'DPVConfirmation', Value: validationResult.DPVConfirmation, Type: 'Output' },
            );

            return {
                Success: true,
                ResultCode: validationResult.Deliverable ? 'DELIVERABLE' : 'UNDELIVERABLE',
                Message: JSON.stringify(validationResult, null, 2)
            };
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 403) {
                return {
                    Success: false,
                    ResultCode: 'API_NOT_ENABLED',
                    Message: 'Google Address Validation API is not enabled or credentials are invalid. Enable it at https://console.cloud.google.com/apis/library/addressvalidation.googleapis.com'
                };
            }
            return {
                Success: false,
                ResultCode: 'API_ERROR',
                Message: `Google Address Validation API error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
