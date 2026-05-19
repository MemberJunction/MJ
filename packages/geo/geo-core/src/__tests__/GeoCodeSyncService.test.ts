import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const { mockRunViewFn, mockGetEntityObject, mockSave, mockDelete, mockNewRecord } = vi.hoisted(() => {
    const mockRunViewFn = vi.fn();
    const mockSave = vi.fn().mockResolvedValue(true);
    const mockDelete = vi.fn().mockResolvedValue(true);
    const mockNewRecord = vi.fn();
    const mockGetEntityObject = vi.fn().mockResolvedValue({
        NewRecord: mockNewRecord,
        Save: mockSave,
        EntityID: '',
        RecordID: '',
        LocationType: '',
        Status: '',
        RetryCount: 0,
        SourceFieldHash: '',
        GeocodedAt: null,
        Latitude: 0,
        Longitude: 0,
        Precision: '',
        CountryID: '',
        StateProvinceID: '',
        GeocodingSource: '',
        ErrorMessage: '',
        Set: vi.fn(),
        Get: vi.fn(),
    });
    return { mockRunViewFn, mockGetEntityObject, mockSave, mockDelete, mockNewRecord };
});

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        get Entities() { return []; }
        GetEntityObject = mockGetEntityObject;
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        BaseEntity: class {},
        EntityFieldInfo: class {},
        EntityInfo: class {},
        Metadata: MockMetadata,
        RunView: MockRunView,
        UserInfo: class {},
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class {
        static getInstance() { return new this(); }
    },
    // RegisterClass is a class decorator used by the geocoding providers.
    // We don't exercise the MJ class-factory registry in these tests, so a no-op
    // factory that returns the original class is sufficient.
    RegisterClass: () => (target: unknown) => target,
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: () => null,
            },
        },
    },
}));

const mockResolveCountry = vi.fn();
const mockResolveState = vi.fn();

vi.mock('@memberjunction/core-entities', () => ({
    MJRecordGeoCodeEntity: class {},
    MJCountryEntity: class {},
    MJStateProvinceEntity: class {},
    GeoDataEngine: {
        Instance: {
            // GeoDataEngine is loaded on-demand — SyncIfChanged() awaits Config() before
            // calling any sync resolver. Mock as a no-op resolved Promise.
            Config: vi.fn().mockResolvedValue(undefined),
            ResolveCountry: (...args: unknown[]) => mockResolveCountry(...args),
            ResolveState: (...args: unknown[]) => mockResolveState(...args),
        },
    },
}));

// Mock fetch for Google API tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GeoCodeSyncService } from '../GeoCodeSyncService';
import type { BaseEntity, EntityInfo, EntityFieldInfo, UserInfo } from '@memberjunction/core';

function createMockEntityInfo(overrides: Partial<EntityInfo> = {}): EntityInfo {
    return {
        ID: 'entity-123',
        Name: 'Members',
        SupportsGeoCoding: true,
        Fields: [
            { Name: 'City', ExtendedType: 'GeoCity' },
            { Name: 'State', ExtendedType: 'GeoStateProvince' },
            { Name: 'Country', ExtendedType: 'GeoCountry' },
        ] as EntityFieldInfo[],
        FirstPrimaryKey: { Name: 'ID' },
        ...overrides,
    } as EntityInfo;
}

function createMockEntity(fields: Record<string, unknown>, entityInfo?: EntityInfo): BaseEntity {
    return {
        Get: vi.fn((name: string) => fields[name] ?? null),
        EntityInfo: entityInfo ?? createMockEntityInfo(),
        PrimaryKey: {
            KeyValuePairs: [{ FieldName: 'ID', Value: 'record-456' }],
            ToString: () => 'ID=record-456',
        },
    } as unknown as BaseEntity;
}

function createMockUser(): UserInfo {
    return { ID: 'user-789', Name: 'Test User', Email: 'test@test.com' } as unknown as UserInfo;
}

describe('GeoCodeSyncService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockReset();
    });

    describe('BuildMappingsFromMetadata', () => {
        it('should return empty array for entity with no geo fields', () => {
            const entityInfo = createMockEntityInfo({
                Fields: [
                    { Name: 'Name', ExtendedType: null },
                    { Name: 'Email', ExtendedType: 'Email' },
                ] as EntityFieldInfo[],
            });
            const result = GeoCodeSyncService.BuildMappingsFromMetadata(entityInfo);
            expect(result).toEqual([]);
        });

        it('should return Primary mapping with all geo fields', () => {
            const entityInfo = createMockEntityInfo();
            const result = GeoCodeSyncService.BuildMappingsFromMetadata(entityInfo);
            expect(result).toHaveLength(1);
            expect(result[0].LocationType).toBe('Primary');
            expect(result[0].Fields).toEqual(['City', 'State', 'Country']);
        });

        it('should include GeoAddress, GeoPostalCode, GeoLatitude, GeoLongitude', () => {
            const entityInfo = createMockEntityInfo({
                Fields: [
                    { Name: 'Address', ExtendedType: 'GeoAddress' },
                    { Name: 'Zip', ExtendedType: 'GeoPostalCode' },
                    { Name: 'Lat', ExtendedType: 'GeoLatitude' },
                    { Name: 'Lng', ExtendedType: 'GeoLongitude' },
                ] as EntityFieldInfo[],
            });
            const result = GeoCodeSyncService.BuildMappingsFromMetadata(entityInfo);
            expect(result[0].Fields).toEqual(['Address', 'Zip', 'Lat', 'Lng']);
        });

        it('should not include non-geo ExtendedTypes', () => {
            const entityInfo = createMockEntityInfo({
                Fields: [
                    { Name: 'City', ExtendedType: 'GeoCity' },
                    { Name: 'Email', ExtendedType: 'Email' },
                    { Name: 'Phone', ExtendedType: 'Tel' },
                ] as EntityFieldInfo[],
            });
            const result = GeoCodeSyncService.BuildMappingsFromMetadata(entityInfo);
            expect(result[0].Fields).toEqual(['City']);
        });
    });

    describe('HasGeoFields', () => {
        it('should return true for geo-enabled entity with geo fields', () => {
            const entityInfo = createMockEntityInfo();
            expect(GeoCodeSyncService.HasGeoFields(entityInfo)).toBe(true);
        });

        it('should return false for entity with SupportsGeoCoding=false', () => {
            const entityInfo = createMockEntityInfo({ SupportsGeoCoding: false });
            expect(GeoCodeSyncService.HasGeoFields(entityInfo)).toBe(false);
        });

        it('should return false for entity with no geo fields', () => {
            const entityInfo = createMockEntityInfo({
                Fields: [{ Name: 'Name', ExtendedType: null }] as EntityFieldInfo[],
            });
            expect(GeoCodeSyncService.HasGeoFields(entityInfo)).toBe(false);
        });
    });

    describe('SyncIfChanged', () => {
        it('should skip if entity has no geo fields', async () => {
            const entityInfo = createMockEntityInfo({
                Fields: [{ Name: 'Name', ExtendedType: null }] as EntityFieldInfo[],
            });
            const entity = createMockEntity({}, entityInfo);
            const user = createMockUser();

            await GeoCodeSyncService.Instance.SyncIfChanged(entity, user);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('should check for existing geocode row', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
            const entity = createMockEntity({ City: 'Denver', State: 'CO', Country: 'US' });
            const user = createMockUser();

            await GeoCodeSyncService.Instance.SyncIfChanged(entity, user);

            // Should have called RunView to find existing RecordGeoCode
            expect(mockRunViewFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    EntityName: 'MJ: Record Geo Codes',
                }),
                user
            );
        });

        it('should skip if existing geocode hash matches and status is success', async () => {
            // Return an existing successful geocode with matching hash
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{
                    SourceFieldHash: expect.any(String),
                    Status: 'success',
                }]
            });

            const entity = createMockEntity({ City: 'Denver', State: 'CO', Country: 'US' });
            const user = createMockUser();

            await GeoCodeSyncService.Instance.SyncIfChanged(entity, user);

            // Should NOT have called GetEntityObject to create a new row
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });
    });

    describe('Google Geocoding (via extractGeoFieldValues + buildAddressString)', () => {
        it('should build address string from geo fields in correct order', () => {
            const entity = createMockEntity({
                City: 'Denver',
                State: 'Colorado',
                Country: 'US',
            });

            // Access private method via prototype
            const service = GeoCodeSyncService.Instance;
            const values = (service as Record<string, Function>)['extractGeoFieldValues'](entity);
            const address = (service as Record<string, Function>)['buildAddressString'](values);

            expect(address).toBe('Denver, Colorado, US');
        });

        it('should return null for empty geo fields', () => {
            const entity = createMockEntity({});
            const service = GeoCodeSyncService.Instance;
            const values = (service as Record<string, Function>)['extractGeoFieldValues'](entity);
            const address = (service as Record<string, Function>)['buildAddressString'](values);

            expect(address).toBeNull();
        });

        it('should skip empty/null field values', () => {
            const entity = createMockEntity({
                City: '',
                State: 'CO',
                Country: null,
            });
            const service = GeoCodeSyncService.Instance;
            const values = (service as Record<string, Function>)['extractGeoFieldValues'](entity);
            const address = (service as Record<string, Function>)['buildAddressString'](values);

            expect(address).toBe('CO');
        });
    });

    describe('GoogleGeocodingProvider', () => {
        // Note: Google-specific logic now lives in GoogleGeocodingProvider.
        // These tests exercise it directly and replace the prior private-method
        // tests against GeoCodeSyncService.geocodeViaGoogle().
        beforeEach(() => {
            process.env.GOOGLE_GEOCODING_API_KEY = 'test-api-key';
        });
        afterEach(() => {
            delete process.env.GOOGLE_GEOCODING_API_KEY;
        });

        it('should call Google API and return result with ROOFTOP precision', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    status: 'OK',
                    results: [{
                        geometry: { location: { lat: 39.7392, lng: -104.9903 }, location_type: 'ROOFTOP' },
                        address_components: [],
                        formatted_address: 'Denver, CO, USA',
                    }],
                }),
            });
            const { GoogleGeocodingProvider } = await import('../providers/GoogleGeocodingProvider');
            const provider = new GoogleGeocodingProvider();
            const result = await provider.Geocode({ AddressString: 'Denver, CO' });
            expect(result).not.toBeNull();
            expect(result!.Latitude).toBe(39.7392);
            expect(result!.Longitude).toBe(-104.9903);
            expect(result!.Precision).toBe('exact');
            expect(result!.Confidence).toBe(1.0);
        });

        it('should return null on ZERO_RESULTS', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ status: 'ZERO_RESULTS', results: [] }),
            });
            const { GoogleGeocodingProvider } = await import('../providers/GoogleGeocodingProvider');
            const provider = new GoogleGeocodingProvider();
            const result = await provider.Geocode({ AddressString: 'nonexistent' });
            expect(result).toBeNull();
        });

        it('should return null on HTTP failure', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
            const { GoogleGeocodingProvider } = await import('../providers/GoogleGeocodingProvider');
            const provider = new GoogleGeocodingProvider();
            const result = await provider.Geocode({ AddressString: 'Denver' });
            expect(result).toBeNull();
        });

        it('should map APPROXIMATE location type to state_province precision', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    status: 'OK',
                    results: [{
                        geometry: { location: { lat: 39.5, lng: -105.5 }, location_type: 'APPROXIMATE' },
                        address_components: [],
                        formatted_address: 'Colorado, USA',
                    }],
                }),
            });
            const { GoogleGeocodingProvider } = await import('../providers/GoogleGeocodingProvider');
            const provider = new GoogleGeocodingProvider();
            const result = await provider.Geocode({ AddressString: 'Colorado' });
            expect(result!.Precision).toBe('state_province');
        });
    });

    describe('geocodeViaReferenceData', () => {
        beforeEach(() => {
            mockResolveCountry.mockReset();
            mockResolveState.mockReset();
        });

        it('should return state centroid when country and state match', () => {
            mockResolveCountry.mockReturnValue({ ID: 'country-us', Latitude: 38.0, Longitude: -97.0 });
            mockResolveState.mockReturnValue({ ID: 'state-co', Latitude: 39.0, Longitude: -105.5 });

            const service = GeoCodeSyncService.Instance;
            const result = (service as Record<string, Function>)['geocodeViaReferenceData'](
                { GeoCountry: 'US', GeoStateProvince: 'CO' }
            );

            expect(result).not.toBeNull();
            expect(result.Latitude).toBe(39.0);
            expect(result.Precision).toBe('state_province');
            expect(result.CountryID).toBe('country-us');
            expect(result.StateProvinceID).toBe('state-co');
            expect(result.Source).toBe('reference_data');
        });

        it('should fall back to country centroid when state not found', () => {
            mockResolveCountry.mockReturnValue({ ID: 'country-us', Latitude: 38.0, Longitude: -97.0 });
            mockResolveState.mockReturnValue(null);

            const service = GeoCodeSyncService.Instance;
            const result = (service as Record<string, Function>)['geocodeViaReferenceData'](
                { GeoCountry: 'US', GeoStateProvince: 'XX' }
            );

            expect(result).not.toBeNull();
            expect(result.Precision).toBe('country');
            expect(result.CountryID).toBe('country-us');
        });

        it('should return null when no country or state provided', () => {
            const service = GeoCodeSyncService.Instance;
            const result = (service as Record<string, Function>)['geocodeViaReferenceData'](
                {}
            );
            expect(result).toBeNull();
        });
    });

    describe('Google credential resolution', () => {
        // Credential resolution now lives in BaseGeocodingProvider.resolveCredential(),
        // exercised here through GoogleGeocodingProvider.IsConfigured().
        const originalEnv = process.env;

        beforeEach(() => {
            process.env = { ...originalEnv };
            delete process.env.GOOGLE_GEOCODING_API_KEY;
            delete process.env.GOOGLE_MAPS_API_KEY;
        });

        it('should be configured when GOOGLE_GEOCODING_API_KEY is set', async () => {
            process.env.GOOGLE_GEOCODING_API_KEY = 'test-key-1';
            const { GoogleGeocodingProvider } = await import('../providers/GoogleGeocodingProvider');
            const provider = new GoogleGeocodingProvider();
            expect(provider.IsConfigured()).toBe(true);
        });

        it('should fall back to GOOGLE_MAPS_API_KEY', async () => {
            process.env.GOOGLE_MAPS_API_KEY = 'test-key-2';
            const { GoogleGeocodingProvider } = await import('../providers/GoogleGeocodingProvider');
            const provider = new GoogleGeocodingProvider();
            expect(provider.IsConfigured()).toBe(true);
        });

        it('should not be configured when no env var set', async () => {
            const { GoogleGeocodingProvider } = await import('../providers/GoogleGeocodingProvider');
            const provider = new GoogleGeocodingProvider();
            expect(provider.IsConfigured()).toBe(false);
        });

        afterEach(() => {
            process.env = originalEnv;
        });
    });
});
