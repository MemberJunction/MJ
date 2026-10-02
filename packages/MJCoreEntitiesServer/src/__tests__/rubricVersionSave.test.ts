import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core-entities', () => {
    class MJRubricVersionEntity {
        public ID = 'draft';
        public Status = 'Draft';
        public LoadedStatus = 'Draft';
        public RubricID = 'rubric-1';
        public BasedOnVersionID: string | null = 'base';
        public ProviderToUse: { RunView: (params: { EntityName: string; ExtraFilter: string }) => Promise<{ Success: boolean; Results: unknown[] }> } | null = null;
        public ContextCurrentUser = { ID: 'user-1' };
        public SuperSaveCalled = false;
        public IsSaved = true;
        public MajorVersion: number | null = null;
        public MinorVersion: number | null = null;
        public PatchVersion: number | null = null;
        public PublishedAt: Date | null = null;
        public PublishedByUserID: string | null = null;
        public RetiredAt: Date | null = null;
        public AppliedBump: string | null = null;
        public async ValidateAsync(): Promise<{ Success: boolean; Errors: unknown[] }> {
            return { Success: true, Errors: [] };
        }
        public GetFieldByName(name: string): { Dirty: boolean; OldValue: string; Value: string } | null {
            if (name !== 'Status') return null;
            return { Dirty: this.Status !== this.LoadedStatus, OldValue: this.LoadedStatus, Value: this.Status };
        }
        public async Save(): Promise<boolean> {
            this.SuperSaveCalled = true;
            return true;
        }
    }
    return { MJRubricVersionEntity };
});

import { MJRubricVersionEntityServer } from '../custom/MJRubricVersionEntityServer.server.js';

describe('MJRubricVersionEntityServer.Save', () => {
    it('publishes a 3.1.4 base as 4.0.0 when Status is set, and stamps PublishedAt', async () => {
        const version = new MJRubricVersionEntityServer();
        const host = version as unknown as {
            Status: string;
            ProviderToUse: { RunView: (params: { EntityName: string; ExtraFilter: string }) => Promise<{ Success: boolean; Results: unknown[] }> };
            MajorVersion: number | null;
            MinorVersion: number | null;
            PatchVersion: number | null;
            PublishedAt: Date | null;
            PublishedByUserID: string | null;
            AppliedBump: string | null;
            SuperSaveCalled: boolean;
        };
        host.ProviderToUse = {
            async RunView(params) {
                const id = params.ExtraFilter.match(/ID='([^']+)'/)?.[1];
                const versionId = params.ExtraFilter.match(/RubricVersionID='([^']+)'/)?.[1];
                if (params.EntityName === 'MJ: Rubric Versions') {
                    if (id === 'base') return { Success: true, Results: [{ ID: 'base', MajorVersion: 3, MinorVersion: 1, PatchVersion: 4, NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 100 }] };
                    return { Success: true, Results: [{ ID: 'draft', MajorVersion: null, MinorVersion: null, PatchVersion: null, NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 100 }] };
                }
                if (params.EntityName === 'MJ: Rubric Criteria') {
                    const weight = versionId === 'draft' ? 2 : 1;
                    return { Success: true, Results: [{ ID: `${versionId}-c`, Key: 'clarity', Name: 'Clarity', NodeType: 'Criterion', ScaleID: 'scale', Weight: weight, IsAdvisory: false, IsGate: false, EvidenceRequired: false, RationaleRequired: false, Sequence: 0 }] };
                }
                if (params.EntityName === 'MJ: Rubric Criterion Levels') {
                    return { Success: true, Results: [{ CriterionID: `${versionId}-c`, ScaleLevelID: 'high', Descriptor: 'Easy to follow' }] };
                }
                if (params.EntityName === 'MJ: Rubric Scales') return { Success: true, Results: [{ ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true }] };
                if (params.EntityName === 'MJ: Rubric Scale Levels') return { Success: true, Results: [{ ID: 'high', Label: 'High', Value: 1, NormalizedValue: 1, Sequence: 0 }] };
                return { Success: true, Results: [] };
            },
        };
        host.Status = 'Published';
        await version.Save();
        expect(host.MajorVersion).toBe(4);
        expect(host.MinorVersion).toBe(0);
        expect(host.PatchVersion).toBe(0);
        expect(host.AppliedBump).toBe('Major');
        expect(host.PublishedAt).toBeInstanceOf(Date);
        expect(host.PublishedByUserID).toBe('user-1');
        expect(host.SuperSaveCalled).toBe(true);
    });

    it('stamps RetiredAt when a published version is retired', async () => {
        const version = new MJRubricVersionEntityServer();
        const host = version as unknown as {
            Status: string;
            LoadedStatus: string;
            RetiredAt: Date | null;
            SuperSaveCalled: boolean;
        };
        host.LoadedStatus = 'Published';
        host.Status = 'Retired';
        await version.Save();
        expect(host.RetiredAt).toBeInstanceOf(Date);
        expect(host.SuperSaveCalled).toBe(true);
    });

    it('refuses a new version that is not Draft, and a frozen version moving back to Draft', async () => {
        const created = new MJRubricVersionEntityServer();
        const createdHost = created as unknown as { IsSaved: boolean; Status: string };
        createdHost.IsSaved = false;
        createdHost.Status = 'Published';
        const refused = await created.ValidateAsync();
        expect(refused.Success).toBe(false);
        expect(refused.Errors[0]?.Type).toBe('Failure');

        const retired = new MJRubricVersionEntityServer();
        const retiredHost = retired as unknown as { IsSaved: boolean; LoadedStatus: string; Status: string };
        retiredHost.IsSaved = true;
        retiredHost.LoadedStatus = 'Published';
        retiredHost.Status = 'Retired';
        const allowed = await retired.ValidateAsync();
        expect(allowed.Success).toBe(true);

        const back = new MJRubricVersionEntityServer();
        const backHost = back as unknown as { IsSaved: boolean; LoadedStatus: string; Status: string };
        backHost.IsSaved = true;
        backHost.LoadedStatus = 'Retired';
        backHost.Status = 'Draft';
        const draftAgain = await back.ValidateAsync();
        expect(draftAgain.Success).toBe(false);
        expect(draftAgain.Errors[0]?.Type).toBe('Failure');
    });

    it('numbers from the highest non-draft version when BasedOnVersionID is null', async () => {
        const version = new MJRubricVersionEntityServer();
        const host = version as unknown as {
            Status: string;
            BasedOnVersionID: string | null;
            ProviderToUse: { RunView: (params: { EntityName: string; ExtraFilter: string }) => Promise<{ Success: boolean; Results: unknown[] }> };
            MajorVersion: number | null;
            MinorVersion: number | null;
            PatchVersion: number | null;
            AppliedBump: string | null;
        };
        host.BasedOnVersionID = null;
        host.ProviderToUse = {
            async RunView(params) {
                const id = params.ExtraFilter.match(/ID='([^']+)'/)?.[1];
                const versionId = params.ExtraFilter.match(/RubricVersionID='([^']+)'/)?.[1];
                if (params.EntityName === 'MJ: Rubric Versions') {
                    if (params.ExtraFilter.includes('Status <>')) {
                        return { Success: true, Results: [
                            { ID: 'older', Status: 'Published', MajorVersion: 1, MinorVersion: 0, PatchVersion: 0 },
                            { ID: 'newer', Status: 'Retired', MajorVersion: 2, MinorVersion: 0, PatchVersion: 0 },
                            { ID: 'scratch', Status: 'Draft', MajorVersion: 9, MinorVersion: 0, PatchVersion: 0 },
                        ] };
                    }
                    if (id === 'newer') return { Success: true, Results: [{ ID: 'newer', Status: 'Retired', MajorVersion: 2, MinorVersion: 0, PatchVersion: 0, NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 100 }] };
                    return { Success: true, Results: [{ ID: 'draft', Status: 'Draft', MajorVersion: null, MinorVersion: null, PatchVersion: null, NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 100 }] };
                }
                if (params.EntityName === 'MJ: Rubric Criteria') {
                    const weight = versionId === 'draft' ? 2 : 1;
                    return { Success: true, Results: [{ ID: `${versionId}-c`, Key: 'clarity', Name: 'Clarity', NodeType: 'Criterion', ScaleID: 'scale', Weight: weight, IsAdvisory: false, IsGate: false, EvidenceRequired: false, RationaleRequired: false, Sequence: 0 }] };
                }
                if (params.EntityName === 'MJ: Rubric Scales') return { Success: true, Results: [{ ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true }] };
                if (params.EntityName === 'MJ: Rubric Scale Levels') return { Success: true, Results: [{ ID: 'high', Label: 'High', Value: 1, NormalizedValue: 1, Sequence: 0 }] };
                return { Success: true, Results: [] };
            },
        };
        host.Status = 'Published';
        await version.Save();
        expect(host.AppliedBump).toBe('Major');
        expect(host.MajorVersion).toBe(3);
        expect(host.MinorVersion).toBe(0);
        expect(host.PatchVersion).toBe(0);
    });
});
