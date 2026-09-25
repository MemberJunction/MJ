import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseEntity, type BaseEntityEvent } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { RecordClonePanelComponent } from './record-clone-panel.component';
import { RecordCloneService } from './record-clone.service';
import type {
    RecordCloneDescribeOutput,
    RecordClonePlanOutput,
    RecordCloneExecuteOutput,
} from '@memberjunction/core-entities';
import type { CloneCompletedEvent, CloneFailedEvent, CloneNavigationEvent } from './record-clone-types';

const MOCK_DESCRIBE: RecordCloneDescribeOutput = {
    CanClone: true,
    Presets: ['Standard'],
    Relationships: [],
};

const MOCK_PLAN: RecordClonePlanOutput = {
    Plan: {
        PlanVersion: 1,
        Hash: 'plan-hash-1',
        Roots: ['Users:1'],
        Nodes: [
            {
                Key: 'Users:1',
                EntityName: 'Users',
                SourceKey: 'u-1',
                TargetKey: null,
                Action: 'Create',
                Reason: 'Root',
                Depth: 0,
                ParentKey: null,
                DisplayName: 'John Doe',
                FieldChanges: [
                    { Field: 'Name', OldValue: 'John Doe', NewValue: 'John Doe (Copy)', Kind: 'naming_strategy', Reason: 'Name made unique' },
                ],
                Warnings: [],
                Route: 'direct',
            },
        ],
        Edges: [],
        Counts: {
            ByEntity: { Users: { Create: 1, Reference: 0, Skip: 0 } },
            Create: 1,
            Total: 1,
        },
        Warnings: [],
        Blocked: false,
        EffectiveOptions: {
            MaxDepth: 3,
            MaxRecords: 500,
            Subtypes: 'include',
            Hierarchy: 'subtree',
            SoftLinks: 'skip',
            EntityActions: 'suppress',
            AIActions: 'suppress',
            Embeddings: 'copy',
        },
    },
};

const MOCK_EXECUTE: RecordCloneExecuteOutput = {
    Success: true,
    ResultCode: 'SUCCESS',
    CloneLogID: 'log-101',
    Roots: [{ EntityName: 'Users', SourceKey: 'u-1', TargetKey: 'u-copy-1' }],
    Created: [{ EntityName: 'Users', SourceKey: 'u-1', TargetKey: 'u-copy-1' }],
    Skipped: [],
    Counts: { ByEntity: { Users: { Create: 1, Reference: 0, Skip: 0 } }, Create: 1, Total: 1 },
    Warnings: [],
};

describe('RecordClonePanelComponent (DOM)', () => {
    let mockService: RecordCloneService;

    beforeEach(() => {
        mockService = {
            DescribeRecord: vi.fn().mockResolvedValue(MOCK_DESCRIBE),
            PlanClone: vi.fn().mockResolvedValue(MOCK_PLAN),
            ExecuteClone: vi.fn().mockResolvedValue(MOCK_EXECUTE),
            GetLineage: vi.fn().mockResolvedValue({}),
        } as unknown as RecordCloneService;
    });

    it('renders not_cloneable state when CanClone is false', async () => {
        vi.spyOn(mockService, 'DescribeRecord').mockResolvedValue({
            CanClone: false,
            Reason: 'System entities cannot be cloned',
            Relationships: [],
        });

        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                EntityName: 'SystemSettings',
                RecordKey: 'sys-1',
            },
        });

        await fixture.componentInstance.Start();
        fixture.detectChanges();

        expect(query(fixture, '.not-cloneable-card')).not.toBeNull();
        expect(text(fixture, '.state-description')).toContain('System entities cannot be cloned');
    });

    it('initializes in scope step and progresses through wizard steps', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                EntityName: 'Users',
                RecordKey: 'u-1',
            },
        });

        await fixture.componentInstance.Start();
        fixture.detectChanges();

        expect(fixture.componentInstance.CurrentStep).toBe('scope');
        expect(query(fixture, 'mj-clone-scope-controls')).not.toBeNull();
        expect(query(fixture, 'mj-clone-plan-tree')).not.toBeNull();

        // Navigate to step 2: Values
        fixture.componentInstance.GoToStep('values');
        fixture.detectChanges();

        expect(fixture.componentInstance.CurrentStep).toBe('values');
        expect(fixture.componentInstance.RootRecordName).toBe('John Doe (Copy)');

        // Navigate to step 3: Review
        fixture.componentInstance.GoToStep('review');
        fixture.detectChanges();

        expect(fixture.componentInstance.CurrentStep).toBe('review');
        expect(query(fixture, 'mj-clone-review')).not.toBeNull();
    });

    it('executes clone, transitions to done state, and emits CloneCompleted', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                EntityName: 'Users',
                RecordKey: 'u-1',
            },
        });

        await fixture.componentInstance.Start();
        fixture.detectChanges();

        let completedEvent: CloneCompletedEvent | null = null;
        fixture.componentInstance.CloneCompleted.subscribe((e) => {
            completedEvent = e;
        });

        await fixture.componentInstance.ExecuteClone();
        fixture.detectChanges();

        expect(fixture.componentInstance.CurrentState).toBe('done');
        expect(completedEvent).toEqual({
            EntityName: 'Users',
            TargetKey: 'u-copy-1',
            CloneLogID: 'log-101',
            CreatedRecordsCount: 1,
            Result: MOCK_EXECUTE,
        });

        expect(query(fixture, 'mj-clone-result')).not.toBeNull();
    });

    it('announces every entity the clone wrote as remote-invalidate, not a malformed save', async () => {
        vi.spyOn(mockService, 'ExecuteClone').mockResolvedValue({
            ...MOCK_EXECUTE,
            Created: [
                { EntityName: 'Users', SourceKey: 'u-1', TargetKey: 'u-copy-1' },
                { EntityName: 'MJ: User Roles', SourceKey: 'r-1', TargetKey: 'r-copy-1' },
                { EntityName: 'MJ: User Roles', SourceKey: 'r-2', TargetKey: 'r-copy-2' },
            ],
        });
        const raised = vi.spyOn(MJGlobal.Instance, 'RaiseEvent');
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });
        await fixture.componentInstance.Start();
        await fixture.componentInstance.ExecuteClone();

        const events = raised.mock.calls.map((c) => c[0]).filter((e) => e.eventCode === BaseEntity.BaseEventCode).map((e) => e.args as BaseEntityEvent);
        expect(events.map((e) => [e.type, e.entityName])).toEqual([
            ['remote-invalidate', 'Users'],
            ['remote-invalidate', 'MJ: User Roles'],
        ]);
        expect(events.every((e) => e.baseEntity === null && (e.payload as { action: string }).action === 'save')).toBe(true);
    });

    it('keeps the latest re-plan when an earlier one answers late, and refuses to execute mid re-plan', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });
        await fixture.componentInstance.Start();

        let answerFirst: (v: RecordClonePlanOutput) => void = () => undefined;
        vi.spyOn(mockService, 'PlanClone')
            .mockImplementationOnce(() => new Promise<RecordClonePlanOutput>((r) => (answerFirst = r)))
            .mockResolvedValueOnce({ Plan: { ...MOCK_PLAN.Plan!, Hash: 'second' } });
        const first = fixture.componentInstance.Replan();
        const second = fixture.componentInstance.Replan();

        expect(fixture.componentInstance.IsReplanning).toBe(true);
        await fixture.componentInstance.ExecuteClone();
        expect(mockService.ExecuteClone).not.toHaveBeenCalled();

        await second;
        answerFirst({ Plan: { ...MOCK_PLAN.Plan!, Hash: 'first' } });
        await first;
        expect(fixture.componentInstance.ActivePlan?.Hash).toBe('second');
        expect(fixture.componentInstance.IsReplanning).toBe(false);
    });

    it('sends retarget picks, and a root name only when the user typed one', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });
        await fixture.componentInstance.Start();
        const panel = fixture.componentInstance;
        panel.RetargetFields = [{ FieldName: 'CompanyID', DisplayName: 'Company', RelatedEntity: 'Companies', CurrentValue: 'co-1', NewValue: 'co-2' }];

        panel.GoToStep('review');
        await Promise.resolve();
        const sent = (mockService.PlanClone as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].Options;
        expect(sent.Retarget).toEqual([{ EntityName: 'Users', Field: 'CompanyID', Value: 'co-2' }]);
        expect(sent.FieldOverrides).toEqual({});

        panel.OnRootNameChange('Jane (copy)');
        panel.GoToStep('review');
        await Promise.resolve();
        expect((mockService.PlanClone as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].Options.FieldOverrides).toEqual({ Name: 'Jane (copy)' });
    });

    it('emits CloseRequested when panel close is triggered', () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                AutoStart: false,
                EntityName: 'Users',
            },
        });

        let closeEmitted = false;
        fixture.componentInstance.CloseRequested.subscribe(() => {
            closeEmitted = true;
        });

        fixture.componentInstance.OnClose();
        expect(closeEmitted).toBe(true);
    });

    it('starts on its own once a source is set, and reports each state', async () => {
        const states: string[] = [];
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { EntityName: 'Users', RecordKey: 'u-1' },
        });
        fixture.componentInstance.StateChange.subscribe((s) => states.push(s));

        await new Promise((r) => queueMicrotask(() => r(undefined)));
        await fixture.componentInstance.InitializationPromise;

        expect(mockService.DescribeRecord).toHaveBeenCalledTimes(1);
        expect(fixture.componentInstance.CurrentState).toBe('scope');
        expect(states).toContain('scope');
    });

    it('does not start on its own when AutoStart is false', async () => {
        renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        await new Promise((r) => queueMicrotask(() => r(undefined)));
        expect(mockService.DescribeRecord).not.toHaveBeenCalled();
    });

    it('parses a record-id string with every key column (composite keys included)', () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Order Lines', RecordKey: 'OrderID|o-1||LineNo|3' },
        });
        expect(fixture.componentInstance.EffectiveRecordKey).toEqual({
            KeyValuePairs: [
                { FieldName: 'OrderID', Value: 'o-1' },
                { FieldName: 'LineNo', Value: '3' },
            ],
        });
    });

    it('emits CloneFailed with the server message when execution fails', async () => {
        vi.spyOn(mockService, 'ExecuteClone').mockResolvedValue({
            ...MOCK_EXECUTE,
            Success: false,
            ResultCode: 'PLAN_CHANGED',
            ErrorMessage: 'The plan changed since review.',
        });
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        await fixture.componentInstance.Start();

        let failed: CloneFailedEvent | null = null;
        fixture.componentInstance.CloneFailed.subscribe((e) => (failed = e));
        await fixture.componentInstance.ExecuteClone();

        expect(fixture.componentInstance.CurrentState).toBe('failed');
        expect(failed).toEqual({ EntityName: 'Users', Message: 'The plan changed since review.', ResultCode: 'PLAN_CHANGED' });
    });

    it('re-emits navigation requests and asks the host to close', () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users' },
        });
        let nav: CloneNavigationEvent | null = null;
        let closed = false;
        fixture.componentInstance.NavigateToRecord.subscribe((e) => (nav = e));
        fixture.componentInstance.CloseRequested.subscribe(() => (closed = true));

        fixture.componentInstance.OnNavigateToRecord({ Kind: 'record', EntityName: 'Users', RecordKey: 'u-copy-1' });

        expect(nav).toEqual({ Kind: 'record', EntityName: 'Users', RecordKey: 'u-copy-1' });
        expect(closed).toBe(true);
    });

    it('Reset drops values folded into the options by the previous run', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        const panel = fixture.componentInstance;
        await panel.Start();
        panel.OnPromptedValuesChange({ Email: 'old@example.com' });
        panel.GoToStep('review');
        expect(panel.ScopeOptions.PromptedValues).toEqual({ Email: 'old@example.com' });

        await panel.Reset();

        expect(panel.ScopeOptions.PromptedValues).toBeUndefined();
        expect(panel.ScopeOptions.FieldOverrides).toBeUndefined();
        const lastPlanCall = vi.mocked(mockService.PlanClone).mock.calls.at(-1)![0];
        expect(lastPlanCall.Options?.PromptedValues).toBeUndefined();
    });

    it('moves to failed and emits CloneFailed when a re-plan from the UI fails', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        const panel = fixture.componentInstance;
        await panel.Start();
        vi.mocked(mockService.PlanClone).mockRejectedValueOnce(new Error('FORBIDDEN: soft links'));
        let failed: CloneFailedEvent | null = null;
        panel.CloneFailed.subscribe((e) => (failed = e));

        panel.OnScopeOptionsChanged({ ...panel.ScopeOptions, SoftLinks: 'include' });
        await new Promise((r) => setTimeout(r, 0));

        expect(panel.CurrentState).toBe('failed');
        expect(failed).toMatchObject({ Message: 'FORBIDDEN: soft links' });
    });

    it('offers the Fire Hooks toggle only when Describe says the user may fire hooks', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        await fixture.componentInstance.Start();
        expect(fixture.componentInstance.CanFireHooks).toBe(false);

        vi.mocked(mockService.DescribeRecord).mockResolvedValue({ ...MOCK_DESCRIBE, CanFireHooks: true });
        await fixture.componentInstance.Start();
        expect(fixture.componentInstance.CanFireHooks).toBe(true);
    });

    it('shows the effective options and sends only the scope values the user changed', async () => {
        vi.mocked(mockService.PlanClone).mockResolvedValue({
            Plan: { ...MOCK_PLAN.Plan, EffectiveOptions: { ...MOCK_PLAN.Plan.EffectiveOptions, MaxDepth: 2 } },
        });
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        const panel = fixture.componentInstance;
        await panel.Start();

        expect(vi.mocked(mockService.PlanClone).mock.calls[0][0].Options).toEqual({});
        expect(panel.DisplayedScope.MaxDepth).toBe(2);

        panel.OnScopeOptionsChanged({ ...panel.DisplayedScope, SoftLinks: 'include' });
        await new Promise((r) => setTimeout(r, 0));

        expect(vi.mocked(mockService.PlanClone).mock.calls.at(-1)![0].Options).toEqual({ SoftLinks: 'include' });
    });

    it('clears earlier scope changes when a preset is picked so the preset applies', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        const panel = fixture.componentInstance;
        await panel.Start();
        panel.OnScopeOptionsChanged({ ...panel.DisplayedScope, MaxDepth: 5 });
        panel.OnScopeOptionsChanged({ ...panel.DisplayedScope, MaxDepth: 5, Preset: 'Standard' });
        await new Promise((r) => setTimeout(r, 0));

        expect(vi.mocked(mockService.PlanClone).mock.calls.at(-1)![0].Options).toEqual({ Preset: 'Standard' });
    });

    it('sends branch overrides with the next plan and clears them on reset', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        const panel = fixture.componentInstance;
        await panel.Start();

        panel.OnEdgePolicyChanged({ RelationshipID: 'rel-roles', Policy: 'Skip' });
        await new Promise((r) => setTimeout(r, 0));
        expect(vi.mocked(mockService.PlanClone).mock.calls.at(-1)![0].EdgeOverrides).toEqual([{ RelationshipID: 'rel-roles', Policy: 'Skip' }]);

        panel.OnResetScopeToDefaults();
        await new Promise((r) => setTimeout(r, 0));
        expect(vi.mocked(mockService.PlanClone).mock.calls.at(-1)![0].EdgeOverrides).toBeUndefined();
    });

    it('switching a branch the user already changed drops the override instead of sending a new one', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        const panel = fixture.componentInstance;
        await panel.Start();
        panel.OnEdgePolicyChanged({ RelationshipID: 'rel-roles', Policy: 'Skip' });
        panel.OnEdgePolicyChanged({ RelationshipID: 'rel-roles', Policy: 'Deep' });
        expect(panel.EdgeOverrides).toEqual([]);
    });

    it('lists skipped branches with Undo, and sends overrides without their labels', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        const panel = fixture.componentInstance;
        await panel.Start();
        panel.OnEdgePolicyChanged({ RelationshipID: 'rel-settings', Policy: 'Skip', RelatedEntityName: 'MJ: User Settings' });
        await new Promise((r) => setTimeout(r, 0));
        fixture.detectChanges();

        expect(query(fixture, '.branch-override')?.textContent).toContain('Skipping MJ: User Settings');
        expect(vi.mocked(mockService.PlanClone).mock.calls.at(-1)![0].EdgeOverrides).toEqual([{ RelationshipID: 'rel-settings', Policy: 'Skip' }]);

        (query(fixture, '.undo-btn') as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        expect(panel.EdgeOverrides).toEqual([]);
    });

    it('offers developer overrides only when Describe grants Override Scope', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: { AutoStart: false, EntityName: 'Users', RecordKey: 'u-1' },
        });
        await fixture.componentInstance.Start();
        expect(fixture.componentInstance.CanOverrideScope).toBe(false);

        vi.mocked(mockService.DescribeRecord).mockResolvedValue({ ...MOCK_DESCRIBE, CanOverrideScope: true });
        await fixture.componentInstance.Start();
        expect(fixture.componentInstance.CanOverrideScope).toBe(true);
    });
});
