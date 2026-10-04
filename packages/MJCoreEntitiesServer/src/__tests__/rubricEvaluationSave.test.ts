import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The base class is a stub so Save can run without Metadata or a database.
 * ProviderToUse.RunView is the mocked provider. Setting Status and calling
 * Save is the only entry point the test uses.
 */
vi.mock('@memberjunction/core-entities', () => {
    class MJRubricEvaluationEntity {
        public ID = '22222222-2222-4222-8222-222222222222';
        public Status = 'Draft';
        public LoadedStatus = 'Draft';
        public RubricVersionID = '11111111-1111-4111-8111-111111111111';
        public RubricID = '44444444-4444-4444-8444-444444444444';
        public SubjectEntityID = '55555555-5555-4555-8555-555555555555';
        public SubjectRecordID = '66666666-6666-4666-8666-666666666666';
        public ContextEntityID: string | null = null;
        public ContextRecordID: string | null = null;
        public SupersedesEvaluationID: string | null = null;
        public ProviderToUse: { RunView: (params: { EntityName: string }) => Promise<{ Success: boolean; Results: unknown[] }> } | null = null;
        public ContextCurrentUser = { ID: 'user-1' };
        public SuperSaveCalled = false;
        public NormalizedScore: number | null = null;
        public Completeness: number | null = null;
        public Outcome: string | null = null;
        public Passed: boolean | null = null;
        public GateFailed = false;
        public PassThresholdApplied: number | null = null;
        public BandID: string | null = null;
        public Confidence: number | null = null;
        public ScoringEngineVersion: string | null = null;
        public SubmittedAt: Date | null = null;
        public IsSaved = true;
        public SaveReturns = true;
        public GetFieldByName(name: string): { Dirty: boolean; OldValue: string; Value: string } | null {
            if (name !== 'Status') return null;
            return { Dirty: this.Status !== this.LoadedStatus, OldValue: this.LoadedStatus, Value: this.Status };
        }
        public async Save(): Promise<boolean> {
            this.SuperSaveCalled = true;
            events.push('evaluation');
            return this.SaveReturns;
        }
    }
    return { MJRubricEvaluationEntity };
});

import { MJRubricEvaluationEntityServer } from '../custom/MJRubricEvaluationEntityServer.server.js';

const events: string[] = [];

function provider(prior?: Record<string, unknown>) {
    return {
        async RunView(params: { EntityName: string }) {
            if (params.EntityName === 'MJ: Rubric Versions') {
                return { Success: true, Results: [{ ID: 'version-1', Status: 'Published', RubricID: 'rubric-1', NotApplicablePolicy: 'ExcludeAndRedistribute', PassThreshold: 0.5, ScoreDisplayMin: 0, ScoreDisplayMax: 100 }] };
            }
            if (params.EntityName === 'MJ: Rubric Criteria') {
                return { Success: true, Results: [{ ID: 'a', Key: 'clarity', Name: 'Clarity', NodeType: 'Criterion', ScaleID: 'scale', Weight: 1, IsAdvisory: false, IsGate: false, EvidenceRequired: false, RationaleRequired: false, Sequence: 0 }] };
            }
            if (params.EntityName === 'MJ: Rubric Bands') return { Success: true, Results: [] };
            if (params.EntityName === 'MJ: Rubric Scales') {
                return { Success: true, Results: [{ ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true }] };
            }
            if (params.EntityName === 'MJ: Rubric Scale Levels') {
                return { Success: true, Results: [{ ID: 'high', Label: 'High', Value: 1, NormalizedValue: 1, Sequence: 0 }] };
            }
            if (params.EntityName === 'MJ: Rubric Evaluation Scores') {
                return {
                    Success: true,
                    Results: [{
                        CriterionID: 'a',
                        ScaleLevelID: 'high',
                        IsNotApplicable: false,
                        IsComputed: false,
                        async Save() { events.push('score'); return true; },
                    }],
                };
            }
            if (params.EntityName === 'MJ: Rubric Evaluations') {
                return { Success: true, Results: prior ? [prior] : [] };
            }
            return { Success: true, Results: [] };
        },
    };
}

describe('MJRubricEvaluationEntityServer.Save', () => {
    beforeEach(() => { events.length = 0; });

    it('scores when Status is set to Submitted, without calling submit() directly', async () => {
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as {
            Status: string;
            ProviderToUse: ReturnType<typeof provider>;
            NormalizedScore: number | null;
            SubmittedAt: Date | null;
            Outcome: string | null;
            SuperSaveCalled: boolean;
        };
        host.ProviderToUse = provider();
        host.Status = 'Submitted';
        const ok = await evaluation.Save();
        expect(ok).toBe(true);
        expect(host.SuperSaveCalled).toBe(true);
        expect(host.NormalizedScore).toBe(1);
        expect(host.Outcome).toBe('Passed');
        expect(host.SubmittedAt).toBeInstanceOf(Date);
        expect(events).toEqual(['score', 'evaluation']);
    });

    it('refuses to create an evaluation when the pinned version is not Published', async () => {
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as {
            IsSaved: boolean;
            Status: string;
            ProviderToUse: ReturnType<typeof provider>;
            SuperSaveCalled: boolean;
        };
        const data = provider();
        const original = data.RunView.bind(data);
        data.RunView = async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Rubric Versions') {
                return { Success: true, Results: [{ ID: '11111111-1111-4111-8111-111111111111', Status: 'Retired', RubricID: 'rubric-1' }] };
            }
            return original(params);
        };
        host.IsSaved = false;
        host.ProviderToUse = data;
        host.Status = 'Draft';
        await expect(evaluation.Save()).rejects.toThrow(/Published/);
        expect(host.SuperSaveCalled).toBe(false);
        expect(events).toEqual([]);
    });

    it('throws before reading when the version id is not a UUID', async () => {
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as { Status: string; RubricVersionID: string; ProviderToUse: ReturnType<typeof provider> };
        host.ProviderToUse = provider();
        host.RubricVersionID = 'version-1';
        host.Status = 'Submitted';
        await expect(evaluation.Save()).rejects.toThrow(/not valid/);
        expect(events).toEqual([]);
    });

    it('fails closed when the score read does not succeed', async () => {
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as { Status: string; ProviderToUse: ReturnType<typeof provider> };
        const data = provider();
        const original = data.RunView.bind(data);
        data.RunView = async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Rubric Evaluation Scores') return { Success: false, Results: [] };
            return original(params);
        };
        host.ProviderToUse = data;
        host.Status = 'Submitted';
        await expect(evaluation.Save()).rejects.toThrow(/scores/);
        expect(events).toEqual([]);
    });

    it('ignores a server-written computed score instead of refusing it', async () => {
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as { Status: string; ProviderToUse: ReturnType<typeof provider> };
        const data = provider();
        const original = data.RunView.bind(data);
        data.RunView = async (params: { EntityName: string }) => {
            const result = await original(params);
            if (params.EntityName === 'MJ: Rubric Evaluation Scores') {
                return { Success: true, Results: [
                    { CriterionID: 'a', ScaleLevelID: 'high', IsNotApplicable: false, IsComputed: false, async Save() { events.push('score'); return true; } },
                    { CriterionID: 'g', IsComputed: true, async Save() { events.push('computed'); return true; } },
                ] };
            }
            return result;
        };
        host.ProviderToUse = data;
        host.Status = 'Submitted';
        await evaluation.Save();
        expect(events).not.toContain('computed');
        expect(events).toContain('score');
    });

    it('refuses a supersede of a different subject and does not save', async () => {
        const prior = {
            Status: 'Submitted',
            SubjectEntityID: '55555555-5555-4555-8555-555555555555',
            SubjectRecordID: 'someone-else',
            ContextEntityID: null,
            ContextRecordID: null,
            RubricID: 'rubric-1',
            async Save() { events.push('prior'); return true; },
        };
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as {
            Status: string;
            SupersedesEvaluationID: string;
            ProviderToUse: ReturnType<typeof provider>;
            SuperSaveCalled: boolean;
        };
        host.SupersedesEvaluationID = '33333333-3333-4333-8333-333333333333';
        host.ProviderToUse = provider(prior);
        host.Status = 'Submitted';
        await expect(evaluation.Save()).rejects.toThrow(/subject/);
        expect(host.SuperSaveCalled).toBe(false);
        expect(prior.Status).toBe('Submitted');
        expect(events).toEqual([]);
    });

    it('marks the previous evaluation Superseded in the same save', async () => {
        const prior = {
            Status: 'Submitted',
            SubjectEntityID: '55555555-5555-4555-8555-555555555555',
            SubjectRecordID: '66666666-6666-4666-8666-666666666666',
            ContextEntityID: null,
            ContextRecordID: null,
            RubricID: 'rubric-1',
            async Save() { events.push('prior'); return true; },
        };
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as {
            Status: string;
            SupersedesEvaluationID: string;
            ProviderToUse: ReturnType<typeof provider>;
            SuperSaveCalled: boolean;
        };
        host.SupersedesEvaluationID = '33333333-3333-4333-8333-333333333333';
        host.ProviderToUse = provider(prior);
        host.Status = 'Submitted';
        await evaluation.Save();
        expect(prior.Status).toBe('Superseded');
        expect(events).toEqual(['score', 'evaluation', 'prior']);
        expect(host.SuperSaveCalled).toBe(true);
    });

    it('throws and leaves the prior submitted when this evaluation does not save', async () => {
        const prior = {
            Status: 'Submitted',
            SubjectEntityID: '55555555-5555-4555-8555-555555555555',
            SubjectRecordID: '66666666-6666-4666-8666-666666666666',
            ContextEntityID: null,
            ContextRecordID: null,
            RubricID: 'rubric-1',
            async Save() { events.push('prior'); return true; },
        };
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as {
            Status: string;
            SupersedesEvaluationID: string;
            ProviderToUse: ReturnType<typeof provider>;
            SaveReturns: boolean;
        };
        host.SupersedesEvaluationID = '33333333-3333-4333-8333-333333333333';
        host.ProviderToUse = provider(prior);
        host.SaveReturns = false;
        host.Status = 'Submitted';
        await expect(evaluation.Save()).rejects.toThrow(/evaluation/);
        expect(prior.Status).toBe('Submitted');
        expect(events).toEqual(['score', 'evaluation']);
    });

    it('throws when a score does not save and does not supersede', async () => {
        const prior = {
            Status: 'Submitted',
            SubjectEntityID: '55555555-5555-4555-8555-555555555555',
            SubjectRecordID: '66666666-6666-4666-8666-666666666666',
            ContextEntityID: null,
            ContextRecordID: null,
            RubricID: 'rubric-1',
            async Save() { events.push('prior'); return true; },
        };
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as { Status: string; SupersedesEvaluationID: string; ProviderToUse: ReturnType<typeof provider> };
        host.SupersedesEvaluationID = '33333333-3333-4333-8333-333333333333';
        host.ProviderToUse = provider(prior);
        const original = host.ProviderToUse.RunView.bind(host.ProviderToUse);
        host.ProviderToUse.RunView = async (params: { EntityName: string }) => {
            const result = await original(params);
            if (params.EntityName === 'MJ: Rubric Evaluation Scores') {
                return { Success: true, Results: [{ CriterionID: 'a', ScaleLevelID: 'high', IsNotApplicable: false, IsComputed: false, async Save() { events.push('score'); return false; } }] };
            }
            return result;
        };
        host.Status = 'Submitted';
        await expect(evaluation.Save()).rejects.toThrow(/score/);
        expect(prior.Status).toBe('Submitted');
        expect(events).toEqual(['score']);
    });

    it('inserts a computed row for a group that the client did not send', async () => {
        const created: { IsComputed?: boolean; CriterionID?: string; saved: boolean } = { saved: false };
        const evaluation = new MJRubricEvaluationEntityServer();
        const host = evaluation as unknown as { Status: string; ProviderToUse: { RunView: (params: { EntityName: string }) => Promise<{ Success: boolean; Results: unknown[] }>; GetEntityObject: () => Promise<typeof created & { NewRecord: () => void; Save: () => Promise<boolean> }> }; SuperSaveCalled: boolean };
        host.ProviderToUse = {
            async RunView(params: { EntityName: string }) {
                if (params.EntityName === 'MJ: Rubric Versions') {
                    return { Success: true, Results: [{ ID: 'version-1', Status: 'Published', RubricID: 'rubric-1', NotApplicablePolicy: 'ExcludeAndRedistribute', PassThreshold: 0.5, ScoreDisplayMin: 0, ScoreDisplayMax: 100 }] };
                }
                if (params.EntityName === 'MJ: Rubric Criteria') {
                    return { Success: true, Results: [
                        { ID: 'g', Key: 'group', Name: 'Group', NodeType: 'Group', Weight: 1, IsAdvisory: false, IsGate: false, EvidenceRequired: false, RationaleRequired: false, Sequence: 0 },
                        { ID: 'a', Key: 'clarity', Name: 'Clarity', ParentID: 'g', NodeType: 'Criterion', ScaleID: 'scale', Weight: 1, IsAdvisory: false, IsGate: false, EvidenceRequired: false, RationaleRequired: false, Sequence: 1 },
                    ] };
                }
                if (params.EntityName === 'MJ: Rubric Scales') return { Success: true, Results: [{ ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true }] };
                if (params.EntityName === 'MJ: Rubric Scale Levels') return { Success: true, Results: [{ ID: 'high', Label: 'High', Value: 1, NormalizedValue: 1, Sequence: 0 }] };
                if (params.EntityName === 'MJ: Rubric Evaluation Scores') {
                    return { Success: true, Results: [{ CriterionID: 'a', ScaleLevelID: 'high', IsNotApplicable: false, IsComputed: false, async Save() { events.push('leaf'); return true; } }] };
                }
                return { Success: true, Results: [] };
            },
            async GetEntityObject() {
                return Object.assign(created, {
                    NewRecord() { /* the server fills the fields */ },
                    async Save() { created.saved = true; events.push('group'); return true; },
                });
            },
        };
        host.Status = 'Submitted';
        await evaluation.Save();
        expect(created.saved).toBe(true);
        expect(created.IsComputed).toBe(true);
        expect(created.CriterionID).toBe('g');
        expect(events).toEqual(['leaf', 'group', 'evaluation']);
        expect(host.SuperSaveCalled).toBe(true);
    });
});
