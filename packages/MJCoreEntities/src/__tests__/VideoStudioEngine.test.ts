import { describe, it, expect, vi, beforeEach } from 'vitest';

let backing: Record<string, unknown[]> = {};
let loadedConfigs: Array<Array<Record<string, unknown>>> = [];

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class MockBaseEngine {
        static getInstance<T>(): T {
            const ctor = this as unknown as { _testInstance?: T; new (): T };
            if (!ctor._testInstance) ctor._testInstance = new ctor();
            return ctor._testInstance;
        }
        async Load(configs: Array<Record<string, unknown>>): Promise<void> {
            loadedConfigs.push(configs);
        }
        GetConfigData<T>(prop: string): T[] {
            return (backing[prop] ?? []) as T[];
        }
        ObserveProperty(prop: string) {
            return { prop };
        }
    },
    LogError: () => undefined,
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    UserInfo: class {},
}));

import { BrandKitEngine } from '../engines/BrandKitEngine';
import { VideoStudioEngine } from '../engines/VideoStudioEngine';

const COMPANY_A_ID = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const COMPANY_B_ID = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';
const ORG_EXPLAINER_ID = 'DF2CD84A-F5E8-4105-8F2F-24F42EC519C7';
const COMPANY_A_EXPLAINER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_LAUNCH_ID = '887C0E01-9B95-4622-BC77-16CECBCC1B08';

function makeArchetype(overrides: Record<string, unknown>) {
    return {
        ID: ORG_EXPLAINER_ID,
        Name: 'Topic Explainer',
        CompanyID: null,
        Status: 'Active',
        ...overrides,
    };
}

describe('VideoStudioEngine', () => {
    beforeEach(() => {
        backing = {};
        loadedConfigs = [];
    });

    it('Config loads MJ: Video Archetypes with CacheLocal: true and calls BrandKitEngine.Instance.Config with the same three arguments', async () => {
        const brandKitConfigSpy = vi.spyOn(BrandKitEngine.Instance, 'Config');
        const fakeUser = { ID: 'user-1' } as never;
        const fakeProvider = { ProviderType: 'Database' } as never;

        await VideoStudioEngine.Instance.Config(true, fakeUser, fakeProvider);

        expect(loadedConfigs[0]).toEqual([
            {
                Type: 'entity',
                EntityName: 'MJ: Video Archetypes',
                PropertyName: '_archetypes',
                CacheLocal: true,
            },
        ]);
        expect(brandKitConfigSpy).toHaveBeenCalledWith(true, fakeUser, fakeProvider);
    });

    it('GetArchetypesForCompany returns Active org-wide and company archetypes sorted by Name, with company archetype overriding org-wide of the same Name', () => {
        backing._archetypes = [
            makeArchetype({ ID: ORG_EXPLAINER_ID, Name: 'Topic Explainer', CompanyID: null, Status: 'Active' }),
            makeArchetype({ ID: ORG_LAUNCH_ID, Name: 'Product Launch', CompanyID: null, Status: 'Active' }),
            makeArchetype({ ID: COMPANY_A_EXPLAINER_ID, Name: '  topic explainer ', CompanyID: COMPANY_A_ID, Status: 'Active' }),
            makeArchetype({ ID: 'comp-a-custom', Name: 'Member Onboarding', CompanyID: COMPANY_A_ID, Status: 'Active' }),
            makeArchetype({ ID: 'comp-b-only', Name: 'Company B Story', CompanyID: COMPANY_B_ID, Status: 'Active' }),
            makeArchetype({ ID: 'inactive-arch', Name: 'Announcement', CompanyID: null, Status: 'Inactive' }),
            makeArchetype({ ID: 'inactive-comp', Name: 'Product Launch', CompanyID: COMPANY_A_ID, Status: 'Inactive' }),
        ];

        const companyAList = VideoStudioEngine.Instance.GetArchetypesForCompany(COMPANY_A_ID.toLowerCase());
        expect(companyAList.map(a => a.ID)).toEqual([
            'comp-a-custom',
            ORG_LAUNCH_ID,
            COMPANY_A_EXPLAINER_ID,
        ]);

        const orgList = VideoStudioEngine.Instance.GetArchetypesForCompany(null);
        expect(orgList.map(a => a.ID)).toEqual([ORG_LAUNCH_ID, ORG_EXPLAINER_ID]);
    });

    it('GetArchetypeByName trims and ignores case, returning the company override when applicable and null when none matches', () => {
        backing._archetypes = [
            makeArchetype({ ID: ORG_EXPLAINER_ID, Name: 'Topic Explainer', CompanyID: null, Status: 'Active' }),
            makeArchetype({ ID: COMPANY_A_EXPLAINER_ID, Name: 'Topic Explainer', CompanyID: COMPANY_A_ID, Status: 'Active' }),
        ];

        expect(
            VideoStudioEngine.Instance.GetArchetypeByName('  TOPIC EXPLAINER  ', COMPANY_A_ID)?.ID
        ).toBe(COMPANY_A_EXPLAINER_ID);
        expect(
            VideoStudioEngine.Instance.GetArchetypeByName('topic explainer', null)?.ID
        ).toBe(ORG_EXPLAINER_ID);
        expect(VideoStudioEngine.Instance.GetArchetypeByName('Nonexistent', COMPANY_A_ID)).toBeNull();
        expect(VideoStudioEngine.Instance.GetArchetypeByName('   ', null)).toBeNull();
    });

    it('exposes Archetypes$ via ObserveProperty("_archetypes")', () => {
        expect(VideoStudioEngine.Instance.Archetypes$).toEqual({ prop: '_archetypes' });
    });
});
