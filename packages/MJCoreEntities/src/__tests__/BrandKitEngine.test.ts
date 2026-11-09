import { describe, it, expect, vi, beforeEach } from 'vitest';

let backing: Record<string, unknown[]> = {};
let loadedConfigs: Array<Record<string, unknown>> = [];
const logErrorSpy = vi.fn();

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class MockBaseEngine {
        static getInstance<T>(): T {
            const ctor = this as unknown as { _testInstance?: T; new (): T };
            if (!ctor._testInstance) ctor._testInstance = new ctor();
            return ctor._testInstance;
        }
        async Load(configs: Array<Record<string, unknown>>): Promise<void> {
            loadedConfigs = configs;
        }
        GetConfigData<T>(prop: string): T[] {
            return (backing[prop] ?? []) as T[];
        }
        ObserveProperty(prop: string) {
            return { prop };
        }
    },
    LogError: (...args: unknown[]) => logErrorSpy(...args),
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    UserInfo: class {},
}));

import { BrandKitEngine, DEFAULT_BRAND_GENERATION_POLICY } from '../engines/BrandKitEngine';
import type { MJBrandKitEntity } from '../generated/entity_subclasses';

const ORG_KIT_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_A_ID = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const COMPANY_B_ID = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';
const COMPANY_A_KIT_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_B_KIT_ID = '33333333-3333-4333-8333-333333333333';
const INACTIVE_KIT_ID = '44444444-4444-4444-8444-444444444444';

function makeKit(overrides: Record<string, unknown>) {
    return {
        ID: ORG_KIT_ID,
        Name: 'MemberJunction',
        CompanyID: null,
        IsDefault: false,
        Status: 'Active',
        GenerationPolicy: null,
        GenerationPolicyObject: null,
        ...overrides,
    };
}

function makeAsset(overrides: Record<string, unknown>) {
    return {
        ID: '55555555-5555-4555-8555-555555555555',
        BrandKitID: ORG_KIT_ID,
        Name: 'Primary Logo',
        Sequence: 1,
        IsGenerationReference: false,
        ...overrides,
    };
}

describe('BrandKitEngine', () => {
    beforeEach(() => {
        backing = {};
        loadedConfigs = [];
        logErrorSpy.mockClear();
    });

    it('Config passes the two expected entity configs with CacheLocal: true', async () => {
        await BrandKitEngine.Instance.Config(false);
        expect(loadedConfigs).toEqual([
            {
                Type: 'entity',
                EntityName: 'MJ: Brand Kits',
                PropertyName: '_brandKits',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Brand Kit Assets',
                PropertyName: '_brandKitAssets',
                CacheLocal: true,
            },
        ]);
    });

    it('GetKitsForCompany returns company kits first (by Name) then org-wide kits, excluding other companies and Inactive kits, comparing companyId case-insensitively', () => {
        backing._brandKits = [
            makeKit({ ID: 'org-z', Name: 'Zeta Org Kit', CompanyID: null, Status: 'Active' }),
            makeKit({ ID: 'org-a', Name: 'Alpha Org Kit', CompanyID: null, Status: 'Active' }),
            makeKit({ ID: COMPANY_A_KIT_ID, Name: 'Zulu Company A Kit', CompanyID: COMPANY_A_ID.toUpperCase(), Status: 'Active' }),
            makeKit({ ID: 'comp-a-2', Name: 'Bravo Company A Kit', CompanyID: COMPANY_A_ID.toLowerCase(), Status: 'Active' }),
            makeKit({ ID: COMPANY_B_KIT_ID, Name: 'Company B Kit', CompanyID: COMPANY_B_ID, Status: 'Active' }),
            makeKit({ ID: INACTIVE_KIT_ID, Name: 'Inactive Company A Kit', CompanyID: COMPANY_A_ID, Status: 'Inactive' }),
            makeKit({ ID: 'inactive-org', Name: 'Inactive Org Kit', CompanyID: null, Status: 'Inactive' }),
        ];

        const kits = BrandKitEngine.Instance.GetKitsForCompany(COMPANY_A_ID.toLowerCase());
        expect(kits.map(k => k.Name)).toEqual([
            'Bravo Company A Kit',
            'Zulu Company A Kit',
            'Alpha Org Kit',
            'Zeta Org Kit',
        ]);
    });

    describe('GetDefaultKit', () => {
        it('returns company default when present, falls back to org-wide default, returns null when none, and ignores Inactive defaults', () => {
            backing._brandKits = [
                makeKit({ ID: INACTIVE_KIT_ID, Name: 'Inactive Company A Default', CompanyID: COMPANY_A_ID, IsDefault: true, Status: 'Inactive' }),
                makeKit({ ID: ORG_KIT_ID, Name: 'Org Default', CompanyID: null, IsDefault: true, Status: 'Active' }),
                makeKit({ ID: COMPANY_A_KIT_ID, Name: 'Company A Default', CompanyID: COMPANY_A_ID, IsDefault: true, Status: 'Active' }),
            ];

            expect(BrandKitEngine.Instance.GetDefaultKit(COMPANY_A_ID.toLowerCase())?.ID).toBe(COMPANY_A_KIT_ID);
            expect(BrandKitEngine.Instance.GetDefaultKit(COMPANY_B_ID)?.ID).toBe(ORG_KIT_ID);
            expect(BrandKitEngine.Instance.GetDefaultKit(null)?.ID).toBe(ORG_KIT_ID);

            backing._brandKits = [
                makeKit({ ID: INACTIVE_KIT_ID, Name: 'Inactive Org Default', CompanyID: null, IsDefault: true, Status: 'Inactive' }),
            ];
            expect(BrandKitEngine.Instance.GetDefaultKit(COMPANY_A_ID)).toBeNull();
            expect(BrandKitEngine.Instance.GetDefaultKit(null)).toBeNull();
        });
    });

    describe('GetAssets and GetGenerationReferenceAssets', () => {
        beforeEach(() => {
            backing._brandKitAssets = [
                makeAsset({ ID: 'a1', BrandKitID: ORG_KIT_ID, Name: 'Zeta Asset', Sequence: 2, IsGenerationReference: true }),
                makeAsset({ ID: 'a2', BrandKitID: ORG_KIT_ID, Name: 'Beta Asset', Sequence: 1, IsGenerationReference: false }),
                makeAsset({ ID: 'a3', BrandKitID: ORG_KIT_ID, Name: 'Alpha Asset', Sequence: 2, IsGenerationReference: true }),
                makeAsset({ ID: 'a4', BrandKitID: COMPANY_A_KIT_ID, Name: 'Other Kit Asset', Sequence: 1, IsGenerationReference: true }),
            ];
        });

        it('GetAssets orders by Sequence ascending then Name', () => {
            const assets = BrandKitEngine.Instance.GetAssets(ORG_KIT_ID.toLowerCase());
            expect(assets.map(a => a.Name)).toEqual(['Beta Asset', 'Alpha Asset', 'Zeta Asset']);
        });

        it('GetGenerationReferenceAssets returns only IsGenerationReference assets in the same order', () => {
            const refs = BrandKitEngine.Instance.GetGenerationReferenceAssets(ORG_KIT_ID);
            expect(refs.map(a => a.Name)).toEqual(['Alpha Asset', 'Zeta Asset']);
        });
    });

    describe('GetEffectiveGenerationPolicy', () => {
        it('returns defaults (images true, video true, people false) when kit is null or policy is NULL or {}', () => {
            expect(DEFAULT_BRAND_GENERATION_POLICY).toEqual({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
            });

            expect(BrandKitEngine.Instance.GetEffectiveGenerationPolicy(null)).toEqual({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
            });

            const nullPolicyKit = makeKit({ GenerationPolicyObject: null }) as unknown as MJBrandKitEntity;
            expect(BrandKitEngine.Instance.GetEffectiveGenerationPolicy(nullPolicyKit)).toEqual({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
            });

            const emptyPolicyKit = makeKit({ GenerationPolicyObject: {} }) as unknown as MJBrandKitEntity;
            expect(BrandKitEngine.Instance.GetEffectiveGenerationPolicy(emptyPolicyKit)).toEqual({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
            });
        });

        it('honors boolean AllowSyntheticPeople: true and treats non-boolean values as false', () => {
            const allowPeopleKit = makeKit({
                GenerationPolicyObject: {
                    AllowSyntheticPeople: true,
                    AvoidSubjects: ['competitors', 42, 'stock handshakes'],
                    StylePrompt: 'Clean editorial lighting',
                    MaxGenerationCostPerRun: 12.5,
                },
            }) as unknown as MJBrandKitEntity;

            expect(BrandKitEngine.Instance.GetEffectiveGenerationPolicy(allowPeopleKit)).toEqual({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: true,
                AvoidSubjects: ['competitors', 'stock handshakes'],
                StylePrompt: 'Clean editorial lighting',
                MaxGenerationCostPerRun: 12.5,
            });

            const stringPeopleKit = makeKit({
                GenerationPolicyObject: { AllowSyntheticPeople: 'yes' },
            }) as unknown as MJBrandKitEntity;

            expect(BrandKitEngine.Instance.GetEffectiveGenerationPolicy(stringPeopleKit)).toEqual({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
            });
        });

        it('fails closed (all three booleans false, LogError called once, no throw) when GenerationPolicyObject throws', () => {
            const throwingKit = {
                ID: ORG_KIT_ID,
                Name: 'Broken Kit',
                get GenerationPolicyObject(): never {
                    throw new SyntaxError('Unexpected token in JSON');
                },
            } as unknown as MJBrandKitEntity;

            const policy = BrandKitEngine.Instance.GetEffectiveGenerationPolicy(throwingKit);
            expect(policy).toEqual({
                AllowGeneratedImages: false,
                AllowGeneratedVideo: false,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
            });
            expect(logErrorSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('Reactivity', () => {
        it('returns updated answer from GetDefaultKit when backing array is replaced and exposes BrandKits$ via ObserveProperty', () => {
            backing._brandKits = [
                makeKit({ ID: ORG_KIT_ID, Name: 'Initial Default', CompanyID: null, IsDefault: true, Status: 'Active' }),
            ];
            expect(BrandKitEngine.Instance.GetDefaultKit(null)?.Name).toBe('Initial Default');

            backing._brandKits = [
                makeKit({ ID: 'new-default', Name: 'Updated Default', CompanyID: null, IsDefault: true, Status: 'Active' }),
            ];
            expect(BrandKitEngine.Instance.GetDefaultKit(null)?.Name).toBe('Updated Default');

            expect(BrandKitEngine.Instance.BrandKits$).toEqual({ prop: '_brandKits' });
            expect(BrandKitEngine.Instance.BrandKitAssets$).toEqual({ prop: '_brandKitAssets' });
        });
    });
});
