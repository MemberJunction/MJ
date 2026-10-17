import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
    BrandKitEngine,
    MJBrandKitEntity,
    MJVideoArchetypeEntity,
    VideoStudioEngine,
} from '@memberjunction/core-entities';
import {
    VIDEO_STUDIO_SPEC_VERSION,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import { ValidateVideoGenerationSpecAsync } from '../validate-spec-async.js';

const COMPANY_A_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_B_ID = '22222222-2222-4222-8222-222222222222';
const KIT_ORG_ACTIVE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const KIT_CO_A_ACTIVE_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const KIT_CO_B_ACTIVE_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const KIT_INACTIVE_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const ARCHETYPE_KPI_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const ARCHETYPE_CO_B_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const UNKNOWN_UUID = '99999999-9999-4999-8999-999999999999';

const FILE_READABLE_1 = 'cccccccc-0000-4000-8000-000000000001';
const FILE_READABLE_2 = 'cccccccc-0000-4000-8000-000000000002';
const FILE_UNREADABLE = 'dddddddd-0000-4000-8000-000000000001';

function createContextUser(): UserInfo {
    return {
        ID: 'eeeeeeee-0000-4000-8000-000000000001',
        Name: 'Validator Test User',
        Email: 'validator@example.com',
    } as unknown as UserInfo;
}

function makeCleanBriefingSpec(): VideoGenerationSpec {
    return {
        SpecVersion: VIDEO_STUDIO_SPEC_VERSION,
        Status: 'Briefing',
        Archetype: {
            Name: 'KPI Briefing',
        },
        Film: {
            OneSentence: 'Show how Q3 revenue grew by 28% year over year.',
            Audience: 'Executive leadership',
            Purpose: 'Quarterly board update',
            DurationSeconds: 10,
            Formats: ['16:9'],
        },
        Assets: {
            Required: [],
            Approved: [],
            Generate: [],
            NeverInvent: ['company logo', 'ARR metrics'],
        },
        Style: {
            Palette: [],
            Typography: [],
            Composition: '',
            Pacing: {
                AvgSecondsBetweenChanges: 0,
                HoldRules: '',
            },
            MotionRules: [],
            Keep: [],
            Avoid: [],
            References: [],
        },
        Beats: [],
        StateList: [],
        DataBindings: [],
        Audio: {
            Captions: 'Burned',
            Cues: [],
        },
        Render: {
            Renderer: 'HyperFrames',
            RendererVersion: '0.1.8',
            Fps: 30,
            Seed: 42,
            Quality: 'standard',
        },
        Deliverables: {
            Formats: ['16:9'],
            Poster: true,
            ContactSheets: true,
            Source: true,
            Captions: true,
        },
        Interaction: {
            Mode: 'Autonomous',
            MaxRepairRounds: 2,
        },
        Review: {
            Gates: [],
            Rounds: [],
        },
    };
}

function seedEngines(): void {
    const kits: Partial<MJBrandKitEntity>[] = [
        {
            ID: KIT_ORG_ACTIVE_ID,
            Name: 'Org Default Kit',
            CompanyID: null,
            IsDefault: true,
            Status: 'Active',
        },
        {
            ID: KIT_CO_A_ACTIVE_ID,
            Name: 'Company A Kit',
            CompanyID: COMPANY_A_ID,
            IsDefault: true,
            Status: 'Active',
        },
        {
            ID: KIT_CO_B_ACTIVE_ID,
            Name: 'Company B Kit',
            CompanyID: COMPANY_B_ID,
            IsDefault: true,
            Status: 'Active',
        },
        {
            ID: KIT_INACTIVE_ID,
            Name: 'Retired Kit',
            CompanyID: null,
            IsDefault: false,
            Status: 'Inactive',
        },
    ];

    const archetypes: Partial<MJVideoArchetypeEntity>[] = [
        {
            ID: ARCHETYPE_KPI_ID,
            Name: 'KPI Briefing',
            CompanyID: null,
            Status: 'Active',
        },
        {
            ID: ARCHETYPE_CO_B_ID,
            Name: 'Company B Custom Archetype',
            CompanyID: COMPANY_B_ID,
            Status: 'Active',
        },
    ];

    const bkInternal = BrandKitEngine.Instance as unknown as {
        _brandKits: MJBrandKitEntity[];
    };
    bkInternal._brandKits = kits as MJBrandKitEntity[];

    const vsInternal = VideoStudioEngine.Instance as unknown as {
        _archetypes: MJVideoArchetypeEntity[];
    };
    vsInternal._archetypes = archetypes as MJVideoArchetypeEntity[];
}

describe('ValidateVideoGenerationSpecAsync', () => {
    let contextUser: UserInfo;
    let runViewSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        contextUser = createContextUser();
        seedEngines();
        vi.spyOn(BrandKitEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(VideoStudioEngine.Instance, 'Config').mockResolvedValue(undefined);
        runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: '',
            UserViewRunID: '',
        } as RunViewResult<{ ID: string }>);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('1. passes pure validator errors through unchanged and makes no RunView when no file IDs are present', async () => {
        const cleanSpec = makeCleanBriefingSpec();
        const cleanResult = await ValidateVideoGenerationSpecAsync(cleanSpec, 'Briefing', contextUser);
        expect(cleanResult.Valid).toBe(true);
        expect(cleanResult.Errors).toEqual([]);
        expect(runViewSpy).not.toHaveBeenCalled();

        const brokenSpec = makeCleanBriefingSpec();
        (brokenSpec as { SpecVersion: string }).SpecVersion = '0.9';
        brokenSpec.Film.DurationSeconds = 0;

        const brokenResult = await ValidateVideoGenerationSpecAsync(brokenSpec, 'Briefing', contextUser);
        expect(brokenResult.Valid).toBe(false);
        expect(brokenResult.Errors.map((e) => e.Code)).toEqual(['InvalidSpecVersion', 'InvalidFilmDuration']);
        expect(brokenResult.Errors.map((e) => e.Path)).toEqual(['SpecVersion', 'Film.DurationSeconds']);
        expect(runViewSpy).not.toHaveBeenCalled();
    });

    it('2. validates BrandKitID scope and status (in scope -> valid, other company -> BrandKitNotInScope, unknown or Inactive -> BrandKitNotFound)', async () => {
        // In-scope company kit
        const inScopeCompanySpec = makeCleanBriefingSpec();
        inScopeCompanySpec.CompanyID = COMPANY_A_ID;
        inScopeCompanySpec.BrandKitID = KIT_CO_A_ACTIVE_ID.toUpperCase();
        const inScopeRes = await ValidateVideoGenerationSpecAsync(inScopeCompanySpec, 'Briefing', contextUser);
        expect(inScopeRes.Valid).toBe(true);
        expect(inScopeRes.Errors).toEqual([]);

        // In-scope org-wide kit for Company A
        const inScopeOrgSpec = makeCleanBriefingSpec();
        inScopeOrgSpec.CompanyID = COMPANY_A_ID;
        inScopeOrgSpec.BrandKitID = KIT_ORG_ACTIVE_ID;
        const orgRes = await ValidateVideoGenerationSpecAsync(inScopeOrgSpec, 'Briefing', contextUser);
        expect(orgRes.Valid).toBe(true);

        // Another company's active kit -> BrandKitNotInScope
        const otherCompanySpec = makeCleanBriefingSpec();
        otherCompanySpec.CompanyID = COMPANY_A_ID;
        otherCompanySpec.BrandKitID = KIT_CO_B_ACTIVE_ID;
        const outOfScopeRes = await ValidateVideoGenerationSpecAsync(otherCompanySpec, 'Briefing', contextUser);
        expect(outOfScopeRes.Valid).toBe(false);
        expect(outOfScopeRes.Errors).toEqual([
            expect.objectContaining({
                Code: 'BrandKitNotInScope',
                Path: 'BrandKitID',
            }),
        ]);

        // Inactive kit -> BrandKitNotFound
        const inactiveSpec = makeCleanBriefingSpec();
        inactiveSpec.BrandKitID = KIT_INACTIVE_ID;
        const inactiveRes = await ValidateVideoGenerationSpecAsync(inactiveSpec, 'Briefing', contextUser);
        expect(inactiveRes.Valid).toBe(false);
        expect(inactiveRes.Errors).toEqual([
            expect.objectContaining({
                Code: 'BrandKitNotFound',
                Path: 'BrandKitID',
            }),
        ]);

        // Unknown kit -> BrandKitNotFound
        const unknownSpec = makeCleanBriefingSpec();
        unknownSpec.BrandKitID = UNKNOWN_UUID;
        const unknownRes = await ValidateVideoGenerationSpecAsync(unknownSpec, 'Briefing', contextUser);
        expect(unknownRes.Valid).toBe(false);
        expect(unknownRes.Errors).toEqual([
            expect.objectContaining({
                Code: 'BrandKitNotFound',
                Path: 'BrandKitID',
            }),
        ]);
    });

    it('3. validates Archetype by ID and by name (trimmed, case-insensitive via the engine) and emits ArchetypeNotFound when unknown', async () => {
        // By ID (valid)
        const byIdValid = makeCleanBriefingSpec();
        byIdValid.Archetype = { ArchetypeID: ARCHETYPE_KPI_ID.toUpperCase(), Name: 'KPI Briefing' };
        const idValidRes = await ValidateVideoGenerationSpecAsync(byIdValid, 'Briefing', contextUser);
        expect(idValidRes.Valid).toBe(true);

        // By ID (unknown or out of company scope)
        const byIdUnknown = makeCleanBriefingSpec();
        byIdUnknown.CompanyID = COMPANY_A_ID;
        byIdUnknown.Archetype = { ArchetypeID: ARCHETYPE_CO_B_ID, Name: 'KPI Briefing' };
        const idUnknownRes = await ValidateVideoGenerationSpecAsync(byIdUnknown, 'Briefing', contextUser);
        expect(idUnknownRes.Valid).toBe(false);
        expect(idUnknownRes.Errors).toEqual([
            expect.objectContaining({
                Code: 'ArchetypeNotFound',
                Path: 'Archetype',
            }),
        ]);

        // By Name (trimmed and case-insensitive via VideoStudioEngine.GetArchetypeByName)
        const byNameTrimmed = makeCleanBriefingSpec();
        byNameTrimmed.Archetype = { Name: '  kpi briefing  ' };
        const nameTrimmedRes = await ValidateVideoGenerationSpecAsync(byNameTrimmed, 'Briefing', contextUser);
        expect(nameTrimmedRes.Valid).toBe(true);

        // By Name (unknown)
        const byNameUnknown = makeCleanBriefingSpec();
        byNameUnknown.Archetype = { Name: 'Nonexistent Archetype' };
        const nameUnknownRes = await ValidateVideoGenerationSpecAsync(byNameUnknown, 'Briefing', contextUser);
        expect(nameUnknownRes.Valid).toBe(false);
        expect(nameUnknownRes.Errors).toEqual([
            expect.objectContaining({
                Code: 'ArchetypeNotFound',
                Path: 'Archetype',
            }),
        ]);
    });

    it('4. validates file IDs across all spec paths: unreadable ID at two paths, bad UUID excluded from filter, deduplication, 501 IDs chunked into two RunViews, and contextUser passed', async () => {
        const spec = makeCleanBriefingSpec();
        spec.Assets.Approved = [
            {
                Key: 'logo-1',
                Kind: 'Logo',
                FileID: FILE_UNREADABLE,
                Source: 'Logo file',
                Provenance: 'Supplied',
                Usage: 'Watermark',
                MustUse: false,
            },
            {
                Key: 'bad-asset',
                Kind: 'Image',
                FileID: 'not-a-valid-uuid',
                Source: 'Broken asset',
                Provenance: 'Supplied',
                Usage: 'Hero',
                MustUse: false,
            },
            {
                Key: 'dup-asset-a',
                Kind: 'Image',
                FileID: FILE_READABLE_1.toLowerCase(),
                Source: 'Readable A',
                Provenance: 'Supplied',
                Usage: 'Card',
                MustUse: false,
            },
            {
                Key: 'dup-asset-b',
                Kind: 'Image',
                FileID: FILE_READABLE_1.toUpperCase(),
                Source: 'Readable B (same file)',
                Provenance: 'Supplied',
                Usage: 'Card 2',
                MustUse: false,
            },
        ];
        spec.DataSnapshot = {
            FileID: FILE_READABLE_2,
            AsOf: '2026-10-16T00:00:00Z',
            Sources: ['View: MJ: Users'],
        };
        spec.Output = {
            Videos: {},
            PosterFileID: FILE_UNREADABLE,
            RenderMetadata: {
                Renderer: 'HyperFrames',
                RendererVersion: '0.1.8',
                Seed: 42,
                Fps: 30,
                DurationByFormat: { '16:9': 10 },
                RenderedAt: '2026-10-16T00:00:00Z',
            },
        };

        runViewSpy.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: FILE_READABLE_1 }, { ID: FILE_READABLE_2 }],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
            UserViewRunID: '',
        } as RunViewResult<{ ID: string }>);

        const result = await ValidateVideoGenerationSpecAsync(spec, 'Briefing', contextUser);
        expect(result.Valid).toBe(false);

        // 1 RunView call with contextUser
        expect(runViewSpy).toHaveBeenCalledTimes(1);
        const [viewParams, passedUser] = runViewSpy.mock.calls[0] as [RunViewParams, UserInfo];
        expect(passedUser).toBe(contextUser);
        expect(viewParams.EntityName).toBe('MJ: Files');
        expect(viewParams.Fields).toEqual(['ID']);
        expect(viewParams.ResultType).toBe('simple');

        // Bad UUID left out of filter; duplicate FILE_READABLE_1 included only once
        const extraFilter = String(viewParams.ExtraFilter);
        expect(extraFilter).not.toContain('not-a-valid-uuid');
        const quotedIds = Array.from(extraFilter.matchAll(/'([^']+)'/g), (m) => m[1].toLowerCase());
        expect(quotedIds).toEqual([
            FILE_UNREADABLE.toLowerCase(),
            FILE_READABLE_1.toLowerCase(),
            FILE_READABLE_2.toLowerCase(),
        ]);

        // Errors: 1 InvalidFileID + 2 FileNotReadable (at both paths using FILE_UNREADABLE)
        expect(result.Errors).toEqual([
            expect.objectContaining({
                Code: 'InvalidFileID',
                Path: 'Assets.Approved[1].FileID',
            }),
            expect.objectContaining({
                Code: 'FileNotReadable',
                Path: 'Assets.Approved[0].FileID',
            }),
            expect.objectContaining({
                Code: 'FileNotReadable',
                Path: 'Output.PosterFileID',
            }),
        ]);

        // 501 unique file IDs -> two RunView calls (500 + 1)
        runViewSpy.mockClear();
        const manyFilesSpec = makeCleanBriefingSpec();
        const generatedIds: string[] = [];
        for (let i = 1; i <= 501; i++) {
            const hex = i.toString(16).padStart(12, '0');
            generatedIds.push(`eeeeeeee-1111-4111-8111-${hex}`);
        }
        manyFilesSpec.Review.Rounds = [
            {
                Round: 1,
                Timestamp: '2026-10-16T00:00:00Z',
                ContactSheetFileIDs: {
                    '16:9': generatedIds,
                },
                Defects: [],
            },
        ];

        runViewSpy
            .mockResolvedValueOnce({
                Success: true,
                Results: generatedIds.slice(0, 500).map((id) => ({ ID: id })),
                RowCount: 500,
                TotalRowCount: 500,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserViewRunID: '',
            } as RunViewResult<{ ID: string }>)
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: generatedIds[500] }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserViewRunID: '',
            } as RunViewResult<{ ID: string }>);

        const manyRes = await ValidateVideoGenerationSpecAsync(manyFilesSpec, 'Briefing', contextUser);
        expect(manyRes.Valid).toBe(true);
        expect(runViewSpy).toHaveBeenCalledTimes(2);
    });

    it('5. fails closed with AsyncValidationFailed (Valid: false, no throw) when RunView returns Success: false or an engine Config rejects', async () => {
        // RunView returns Success: false
        const specWithFile = makeCleanBriefingSpec();
        specWithFile.DataSnapshot = {
            FileID: FILE_READABLE_1,
            AsOf: '2026-10-16T00:00:00Z',
            Sources: ['View: MJ: Users'],
        };

        runViewSpy.mockResolvedValueOnce({
            Success: false,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: 'Database connection lost',
            UserViewRunID: '',
        } as RunViewResult<{ ID: string }>);

        const rvFailResult = await ValidateVideoGenerationSpecAsync(specWithFile, 'Briefing', contextUser);
        expect(rvFailResult.Valid).toBe(false);
        expect(rvFailResult.Errors).toEqual([
            expect.objectContaining({
                Code: 'AsyncValidationFailed',
                Message: expect.stringContaining('Database connection lost'),
            }),
        ]);

        // BrandKitEngine.Config rejects
        vi.spyOn(BrandKitEngine.Instance, 'Config').mockRejectedValueOnce(new Error('BrandKitEngine load failed'));
        const engineFailResult = await ValidateVideoGenerationSpecAsync(makeCleanBriefingSpec(), 'Briefing', contextUser);
        expect(engineFailResult.Valid).toBe(false);
        expect(engineFailResult.Errors).toEqual([
            expect.objectContaining({
                Code: 'AsyncValidationFailed',
                Message: expect.stringContaining('BrandKitEngine load failed'),
            }),
        ]);
    });
});
