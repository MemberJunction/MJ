import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { ClonePlanTreeComponent } from './clone-plan-tree.component';
import type { RecordClonePlanDetails } from '@memberjunction/core-entities';

const SAMPLE_PLAN: RecordClonePlanDetails = {
    PlanVersion: 1,
    Hash: 'hash-abc',
    Roots: ['Users:1'],
    Nodes: [
        {
            Key: 'Users:1',
            EntityName: 'Users',
            SourceKey: 'u-1',
            TargetKey: null,
            Action: 'Create',
            Reason: 'Root record',
            Depth: 0,
            ParentKey: null,
            DisplayName: 'John Doe',
            FieldChanges: [],
            Warnings: [],
            Route: 'direct',
        },
        {
            Key: 'UserRoles:2',
            EntityName: 'User Roles',
            SourceKey: 'ur-2',
            TargetKey: null,
            Action: 'Create',
            Reason: 'Direct child',
            Depth: 1,
            ParentKey: 'Users:1',
            DisplayName: 'Admin Role',
            FieldChanges: [],
            Warnings: [{ Code: 'WARN1', Severity: 'Warning', Message: 'Role already held' }],
            Route: 'direct',
        },
        {
            Key: 'Roles:3',
            EntityName: 'Roles',
            SourceKey: 'r-3',
            TargetKey: 'r-3',
            Action: 'Reference',
            Reason: 'Lookup entity',
            Depth: 2,
            ParentKey: 'UserRoles:2',
            DisplayName: 'Administrator',
            FieldChanges: [],
            Warnings: [],
            Route: 'direct',
        },
    ],
    Edges: [
        {
            FromKey: 'Users:1',
            ToKey: 'UserRoles:2',
            Kind: 'OneToMany',
            RelatedEntityName: 'User Roles',
            JoinField: 'UserID',
            Policy: 'Deep',
            Locked: false,
            PolicySource: 'Configuration',
        },
        {
            FromKey: 'UserRoles:2',
            ToKey: 'Roles:3',
            Kind: 'ManyToOne',
            RelatedEntityName: 'Roles',
            JoinField: 'RoleID',
            Policy: 'Reference',
            Locked: true,
            PolicySource: 'Foreign Key Constraint',
        },
    ],
    Counts: {
        ByEntity: {
            Users: { Create: 1, Reference: 0, Skip: 0 },
            'User Roles': { Create: 1, Reference: 0, Skip: 0 },
            Roles: { Create: 0, Reference: 1, Skip: 0 },
        },
        Create: 2,
        Total: 3,
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
};

describe('ClonePlanTreeComponent (DOM)', () => {
    it('renders empty message when no plan is provided', () => {
        const fixture = renderComponentFixture(ClonePlanTreeComponent, {
            inputs: { Plan: null },
        });
        expect(text(fixture, '.empty-tree-message')).toContain('No records planned');
    });

    it('renders aggregate counts bar and all nodes in the hierarchy', () => {
        const fixture = renderComponentFixture(ClonePlanTreeComponent, {
            inputs: { Plan: SAMPLE_PLAN },
        });

        const totalCount = text(fixture, '.count-item.total');
        expect(totalCount).toContain('3 Total');

        const createCount = text(fixture, '.count-item.create');
        expect(createCount).toContain('2 Create');

        const referenceCount = text(fixture, '.count-item.reference');
        expect(referenceCount).toContain('1 Reference');

        const rows = queryAll(fixture, '.tree-row');
        expect(rows.length).toBe(3);
    });

    it('renders policy pills and locked indicator correctly', () => {
        const fixture = renderComponentFixture(ClonePlanTreeComponent, {
            inputs: { Plan: SAMPLE_PLAN },
        });

        const policyPills = queryAll(fixture, '.policy-pill');
        expect(policyPills.length).toBe(2);

        // First child has Deep policy, not locked
        expect(policyPills[0].textContent).toContain('Deep');
        expect(policyPills[0].querySelector('.lock-icon')).toBeNull();

        // Second child has Reference policy, locked
        expect(policyPills[1].textContent).toContain('Reference');
        expect(policyPills[1].querySelector('.lock-icon')).not.toBeNull();
        expect(policyPills[1].getAttribute('title')).toContain('Policy is locked (Foreign Key Constraint)');
    });

    it('filters visible nodes when searching', () => {
        const fixture = renderComponentFixture(ClonePlanTreeComponent, {
            inputs: { Plan: SAMPLE_PLAN },
        });

        // Search for Administrator
        fixture.componentInstance.OnSearchTermChange('Administrator');
        fixture.detectChanges();

        const visibleRows = queryAll(fixture, '.tree-row');
        // Matches Roles:3, plus its ancestor path
        const titles = visibleRows.map(r => r.querySelector('.record-title')?.textContent?.trim());
        expect(titles).toContain('Administrator');
    });

    it('emits NodeSelected when clicking a tree row', () => {
        const fixture = renderComponentFixture(ClonePlanTreeComponent, {
            inputs: { Plan: SAMPLE_PLAN },
        });

        let selectedNode: unknown = null;
        fixture.componentInstance.NodeSelected.subscribe((node) => {
            selectedNode = node;
        });

        const rows = queryAll(fixture, '.tree-row');
        (rows[1] as HTMLElement).click();

        expect(selectedNode).not.toBeNull();
        expect((selectedNode as { Key: string }).Key).toBe('UserRoles:2');
        expect(fixture.componentInstance.SelectedNodeKey).toBe('UserRoles:2');
    });

    describe('branch policy toggles', () => {
        const withIds = {
            ...SAMPLE_PLAN,
            Edges: [
                { ...SAMPLE_PLAN.Edges[0], RelationshipID: 'rel-roles' },
                { ...SAMPLE_PLAN.Edges[1], RelationshipID: 'rel-role' },
            ],
        };

        it('keeps pills read-only by default', () => {
            const fixture = renderComponentFixture(ClonePlanTreeComponent, { inputs: { Plan: withIds } });
            expect(queryAll(fixture, 'button.policy-pill--toggle')).toHaveLength(0);
        });

        it('lets the user skip an unlocked Deep branch when narrowing is allowed', () => {
            const fixture = renderComponentFixture(ClonePlanTreeComponent, { inputs: { Plan: withIds, AllowNarrowing: true } });
            const toggles = queryAll(fixture, 'button.policy-pill--toggle');
            expect(toggles).toHaveLength(1);
            const events: unknown[] = [];
            fixture.componentInstance.EdgePolicyChanged.subscribe((e) => events.push(e));
            (toggles[0] as HTMLButtonElement).click();
            expect(events).toEqual([{ RelationshipID: 'rel-roles', Policy: 'Skip', RelatedEntityName: 'User Roles' }]);
        });

        it('lets anyone put back a branch they skipped themselves', () => {
            const userSkipped = { ...withIds, Edges: [{ ...withIds.Edges[0], Policy: 'Skip' as const, PolicySource: 'Request' }, withIds.Edges[1]] };
            const fixture = renderComponentFixture(ClonePlanTreeComponent, { inputs: { Plan: userSkipped, AllowNarrowing: true } });
            expect(queryAll(fixture, 'button.policy-pill--toggle')).toHaveLength(1);
        });

        it('only offers Skip to Deep when widening is allowed', () => {
            const skipped = { ...withIds, Edges: [{ ...withIds.Edges[0], Policy: 'Skip' as const }, withIds.Edges[1]] };
            const narrowOnly = renderComponentFixture(ClonePlanTreeComponent, { inputs: { Plan: skipped, AllowNarrowing: true } });
            expect(queryAll(narrowOnly, 'button.policy-pill--toggle')).toHaveLength(0);

            const widen = renderComponentFixture(ClonePlanTreeComponent, { inputs: { Plan: skipped, AllowNarrowing: true, AllowWidening: true } });
            expect(queryAll(widen, 'button.policy-pill--toggle')).toHaveLength(1);
        });
    });
});
