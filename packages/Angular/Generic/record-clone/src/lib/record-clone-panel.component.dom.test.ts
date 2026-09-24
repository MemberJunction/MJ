import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { RecordClonePanelComponent } from './record-clone-panel.component';
import { RecordCloneService } from './record-clone.service';
import type {
    RecordCloneDescribeOutput,
    RecordClonePlanOutput,
    RecordCloneExecuteOutput,
} from '@memberjunction/core-entities';
import type { CloneCompletedEvent, FormNavigationEvent } from './record-clone-types';

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
                IsOpen: true,
                EntityName: 'SystemSettings',
                RecordKey: 'sys-1',
            },
        });

        await fixture.componentInstance.InitializationPromise;
        fixture.detectChanges();

        expect(query(fixture, '.not-cloneable-card')).not.toBeNull();
        expect(text(fixture, '.state-description')).toContain('System entities cannot be cloned');
    });

    it('initializes in scope step and progresses through wizard steps', async () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                IsOpen: true,
                EntityName: 'Users',
                RecordKey: 'u-1',
            },
        });

        await fixture.componentInstance.InitializationPromise;
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
                IsOpen: true,
                EntityName: 'Users',
                RecordKey: 'u-1',
            },
        });

        await fixture.componentInstance.InitializationPromise;
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

    it('emits CloseRequested when panel close is triggered', () => {
        const fixture = renderComponentFixture(RecordClonePanelComponent, {
            providers: [{ provide: RecordCloneService, useValue: mockService }],
            inputs: {
                IsOpen: true,
                EntityName: 'Users',
            },
        });

        let closeEmitted = false;
        fixture.componentInstance.CloseRequested.subscribe(() => {
            closeEmitted = true;
        });

        fixture.componentInstance.OnClose();
        expect(closeEmitted).toBe(true);
        expect(fixture.componentInstance.IsOpen).toBe(false);
    });
});
