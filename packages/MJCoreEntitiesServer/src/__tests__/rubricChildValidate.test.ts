import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core-entities', () => {
    class BaseRow {
        public ProviderToUse: { RunView: (params: { EntityName: string }) => Promise<{ Success: boolean; Results: unknown[] }> } | null = null;
        public ContextCurrentUser = { ID: 'user-1' };
        public async ValidateAsync(): Promise<{ Success: boolean; Errors: unknown[] }> {
            return { Success: true, Errors: [] };
        }
    }
    class MJRubricCriterionEntity extends BaseRow {
        public RubricVersionID = 'version-1';
    }
    class MJRubricCriterionLevelEntity extends BaseRow {
        public CriterionID = 'criterion-1';
    }
    class MJRubricBandEntity extends BaseRow {
        public RubricVersionID = 'version-1';
    }
    class MJRubricEvaluationEntity extends BaseRow {
        public IsSaved = true;
        public Status = 'Draft';
        public LoadedStatus = 'Draft';
        public GetFieldByName(name: string): { Dirty: boolean; OldValue: string; Value: string } | null {
            if (name !== 'Status') return null;
            return { Dirty: this.Status !== this.LoadedStatus, OldValue: this.LoadedStatus, Value: this.Status };
        }
    }
    return { MJRubricCriterionEntity, MJRubricCriterionLevelEntity, MJRubricBandEntity, MJRubricEvaluationEntity };
});

import { MJRubricBandEntityServer } from '../custom/MJRubricBandEntityServer.server.js';
import { MJRubricCriterionEntityServer } from '../custom/MJRubricCriterionEntityServer.server.js';
import { MJRubricCriterionLevelEntityServer } from '../custom/MJRubricCriterionLevelEntityServer.server.js';
import { MJRubricEvaluationEntityServer } from '../custom/MJRubricEvaluationEntityServer.server.js';

function versions(status: string) {
    return {
        async RunView(params: { EntityName: string }) {
            if (params.EntityName === 'MJ: Rubric Criteria') {
                return { Success: true, Results: [{ ID: 'criterion-1', RubricVersionID: 'version-1' }] };
            }
            return { Success: true, Results: [{ ID: 'version-1', Status: status }] };
        },
    };
}

describe('rubric child and evaluation validation', () => {
    it('refuses a criterion, a level, and a band on a published version', async () => {
        const criterion = new MJRubricCriterionEntityServer();
        (criterion as unknown as { ProviderToUse: ReturnType<typeof versions> }).ProviderToUse = versions('Published');
        const criterionResult = await criterion.ValidateAsync();
        expect(criterionResult.Success).toBe(false);
        expect(criterionResult.Errors[0]?.Type).toBe('Failure');

        const level = new MJRubricCriterionLevelEntityServer();
        (level as unknown as { ProviderToUse: ReturnType<typeof versions> }).ProviderToUse = versions('Retired');
        const levelResult = await level.ValidateAsync();
        expect(levelResult.Success).toBe(false);
        expect(levelResult.Errors[0]?.Type).toBe('Failure');

        const band = new MJRubricBandEntityServer();
        (band as unknown as { ProviderToUse: ReturnType<typeof versions> }).ProviderToUse = versions('Published');
        const bandResult = await band.ValidateAsync();
        expect(bandResult.Success).toBe(false);
        expect(bandResult.Errors[0]?.Type).toBe('Failure');

        const draftBand = new MJRubricBandEntityServer();
        (draftBand as unknown as { ProviderToUse: ReturnType<typeof versions> }).ProviderToUse = versions('Draft');
        expect((await draftBand.ValidateAsync()).Success).toBe(true);
    });

    it('refuses a criterion level when the version lookup fails or returns no row', async () => {
        const failed = new MJRubricCriterionLevelEntityServer();
        (failed as unknown as { ProviderToUse: { RunView: (params: { EntityName: string }) => Promise<{ Success: boolean; Results: unknown[] }> } }).ProviderToUse = {
            async RunView(params) {
                if (params.EntityName === 'MJ: Rubric Criteria') {
                    return { Success: true, Results: [{ ID: 'criterion-1', RubricVersionID: 'version-1' }] };
                }
                return { Success: false, Results: [] };
            },
        };
        const failedResult = await failed.ValidateAsync();
        expect(failedResult.Success).toBe(false);
        expect(failedResult.Errors[0]?.Type).toBe('Failure');

        const empty = new MJRubricCriterionLevelEntityServer();
        (empty as unknown as { ProviderToUse: { RunView: (params: { EntityName: string }) => Promise<{ Success: boolean; Results: unknown[] }> } }).ProviderToUse = {
            async RunView(params) {
                if (params.EntityName === 'MJ: Rubric Criteria') {
                    return { Success: true, Results: [{ ID: 'criterion-1', RubricVersionID: 'version-1' }] };
                }
                return { Success: true, Results: [] };
            },
        };
        const emptyResult = await empty.ValidateAsync();
        expect(emptyResult.Success).toBe(false);
        expect(emptyResult.Errors[0]?.Type).toBe('Failure');
    });

    it('allows Draft to Submitted and refuses a new evaluation that is already Submitted', async () => {
        const created = new MJRubricEvaluationEntityServer();
        const createdHost = created as unknown as { IsSaved: boolean; Status: string };
        createdHost.IsSaved = false;
        createdHost.Status = 'Submitted';
        const refused = await created.ValidateAsync();
        expect(refused.Success).toBe(false);
        expect(refused.Errors[0]?.Type).toBe('Failure');

        const submit = new MJRubricEvaluationEntityServer();
        const submitHost = submit as unknown as { IsSaved: boolean; LoadedStatus: string; Status: string };
        submitHost.IsSaved = true;
        submitHost.LoadedStatus = 'Draft';
        submitHost.Status = 'Submitted';
        expect((await submit.ValidateAsync()).Success).toBe(true);

        const backwards = new MJRubricEvaluationEntityServer();
        const backwardsHost = backwards as unknown as { IsSaved: boolean; LoadedStatus: string; Status: string };
        backwardsHost.IsSaved = true;
        backwardsHost.LoadedStatus = 'Submitted';
        backwardsHost.Status = 'Draft';
        expect((await backwards.ValidateAsync()).Success).toBe(false);
    });
});
