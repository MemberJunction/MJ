import { describe, it, expect } from 'vitest';
import { ResolveEdgePolicy, EdgePolicyResolutionContext } from '../ClonePolicyResolver';

describe('ClonePolicyResolver', () => {
    const baseContext: EdgePolicyResolutionContext = {
        FromKey: 'Parent::1',
        ToKey: 'Child::2',
        Kind: 'Relationship',
        ParentEntityName: 'Orders',
        ChildEntityName: 'OrderDetails',
        JoinField: 'OrderID',
        RelationshipID: 'rel-orders-details',
        CurrentDepth: 1,
        MaxDepth: 3,
    };

    it('applies built-in defaults for edge kinds', () => {
        const resCollection = ResolveEdgePolicy({
            ...baseContext,
            Kind: 'Collection',
        });
        expect(resCollection.Policy).toBe('Deep');
        expect(resCollection.PolicySource).toBe('BuiltIn');

        const resForwardFK = ResolveEdgePolicy({
            ...baseContext,
            Kind: 'ForwardFK',
        });
        expect(resForwardFK.Policy).toBe('Reference');
        expect(resForwardFK.PolicySource).toBe('BuiltIn');

        const resSoftLink = ResolveEdgePolicy({
            ...baseContext,
            Kind: 'SoftLink',
        });
        expect(resSoftLink.Policy).toBe('Skip');
        expect(resSoftLink.PolicySource).toBe('BuiltIn');
    });

    it('lets a unique FK turn Reference into Deep but never override Skip', () => {
        const skip = ResolveEdgePolicy({ ...baseContext, IsUniqueFK: true, RelationshipConfig: { Policy: 'Skip' } });
        expect(skip.Policy).toBe('Skip');

        const ref = ResolveEdgePolicy({ ...baseContext, IsUniqueFK: true, RelationshipConfig: { Policy: 'Reference' } });
        expect(ref.Policy).toBe('Deep');
        expect(ref.PolicySource).toBe('Constraint');
        expect(ref.Warnings.map((w) => w.Code)).toContain('CONSTRAINT_FORCED_DEEP');
    });

    it('NotCloneable on child entity wins unconditionally over all tiers', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            IsUniqueFK: true, // Even with unique FK
            RelationshipConfig: { Policy: 'Deep' },
            ChildEntityConfig: {
                NotCloneable: true,
                NotCloneableReason: 'Audit log cannot be cloned',
            },
            RequestOverrides: [{ RelationshipID: 'rel-orders-details', Policy: 'Deep' }],
        });

        expect(res.Policy).toBe('Skip');
        expect(res.PolicySource).toBe('Entity');
        expect(res.Locked).toBe(true);
        expect(res.Warnings[0].Code).toBe('NOT_CLONEABLE');
    });

    it('respects relationship configuration over built-ins', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            RelationshipConfig: { Policy: 'Reference' },
        });

        expect(res.Policy).toBe('Reference');
        expect(res.PolicySource).toBe('Relationship');
    });

    it('respects root entity descendant configuration over relationship bag', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            RelationshipConfig: { Policy: 'Reference' },
            RootEntityConfig: {
                Descendants: {
                    OrderDetails: { Policy: 'Deep' },
                },
            },
        });

        expect(res.Policy).toBe('Deep');
        expect(res.PolicySource).toBe('Descendant');
    });

    it('respects preset overrides over root entity defaults', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            RootEntityConfig: {
                Descendants: {
                    OrderDetails: { Policy: 'Deep' },
                },
            },
            PresetConfig: {
                EdgeOverrides: [
                    { ChildEntityName: 'OrderDetails', Policy: 'Skip' },
                ],
            },
        });

        expect(res.Policy).toBe('Skip');
        expect(res.PolicySource).toBe('Descendant');
    });

    it('applies request override when edge is unlocked', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            RelationshipConfig: { Policy: 'Deep', Locked: false },
            RequestOverrides: [
                { RelationshipID: 'rel-orders-details', Policy: 'Skip' },
            ],
        });

        expect(res.Policy).toBe('Skip');
        expect(res.PolicySource).toBe('Request');
    });

    it('ignores request override when edge is locked and emits warning', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            RelationshipConfig: { Policy: 'Deep', Locked: true },
            RequestOverrides: [
                { RelationshipID: 'rel-orders-details', Policy: 'Skip' },
            ],
        });

        expect(res.Policy).toBe('Deep');
        expect(res.Locked).toBe(true);
        expect(res.Warnings).toHaveLength(1);
        expect(res.Warnings[0].Code).toBe('LOCKED_EDGE_OVERRIDE_IGNORED');
    });

    it('defaults unconfigured relationships to Skip for every parent (no entity-specific branch)', () => {
        for (const parent of ['MJ: Users', 'MJ: AI Prompts', 'Orders']) {
            const res = ResolveEdgePolicy({ ...baseContext, ParentEntityName: parent, CurrentDepth: 0, MaxDepth: 3 });
            expect(res.Policy).toBe('Skip');
            expect(res.PolicySource).toBe('BuiltIn');
        }
    });

    it('follows a configured relationship, including by "Entity.JoinField" key', () => {
        const plain = ResolveEdgePolicy({ ...baseContext, RootEntityConfig: { Relationships: { OrderDetails: { Policy: 'Deep' } } } });
        expect(plain.Policy).toBe('Deep');
        const qualified = ResolveEdgePolicy({ ...baseContext, RootEntityConfig: { Relationships: { 'OrderDetails.OrderID': { Policy: 'Deep' } } } });
        expect(qualified.Policy).toBe('Deep');
    });

    it('copies a self-relationship subtree only when the join column is a hierarchy field', () => {
        const tree = ResolveEdgePolicy({ ...baseContext, Kind: 'Hierarchy', IsHierarchyField: true });
        expect(tree.Policy).toBe('Deep');
        const pointer = ResolveEdgePolicy({ ...baseContext, Kind: 'Hierarchy', IsHierarchyField: false });
        expect(pointer.Policy).toBe('Skip');
    });

    it('ignores a preset override on a locked edge', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            RelationshipConfig: { Policy: 'Skip', Locked: true },
            PresetConfig: { EdgeOverrides: [{ ChildEntityName: 'OrderDetails', Policy: 'Deep' }] },
        });
        expect(res.Policy).toBe('Skip');
        expect(res.Warnings.map((w) => w.Code)).toContain('LOCKED_EDGE_OVERRIDE_IGNORED');
    });

    it('applies name heuristics only when no configuration names the edge', () => {
        const heuristic = ResolveEdgePolicy({ ...baseContext, ChildEntityName: 'MJ: User Notification Preferences' });
        expect(heuristic.Policy).toBe('Skip');
        // An unlisted relationship is skipped anyway, so nothing to report.
        expect(heuristic.Warnings).toEqual([]);
        // A collection is followed by default, so skipping it is worth a note.
        const collection = ResolveEdgePolicy({ ...baseContext, Kind: 'Collection', ChildEntityName: 'MJ: User Notification Preferences' });
        expect(collection.Policy).toBe('Skip');
        expect(collection.Warnings[0].Code).toBe('NOT_CLONEABLE');

        const configured = ResolveEdgePolicy({
            ...baseContext,
            ChildEntityName: 'MJ: User Notification Preferences',
            RootEntityConfig: { Relationships: { 'MJ: User Notification Preferences': { Policy: 'Deep' } } },
        });
        expect(configured.Policy).toBe('Deep');
    });

    it('keeps explicit NotCloneable absolute even when the root lists the relationship', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            ChildEntityConfig: { NotCloneable: true },
            RootEntityConfig: { Relationships: { OrderDetails: { Policy: 'Deep' } } },
        });
        expect(res.Policy).toBe('Skip');
    });

    it('follows the parent entity\'s own configuration below the root, and lets the root override it', () => {
        const edge = { ...baseContext, ParentEntityName: 'MJ: Templates', ChildEntityName: 'MJ: Template Contents', JoinField: 'TemplateID', RelationshipID: undefined, CurrentDepth: 2 };
        const parent = { Relationships: { 'MJ: Template Contents': { Policy: 'Deep' as const } } };
        expect(ResolveEdgePolicy({ ...edge, ParentEntityConfig: parent }).Policy).toBe('Deep');
        expect(ResolveEdgePolicy({ ...edge, ParentEntityConfig: parent, RootEntityConfig: { Relationships: { 'MJ: Template Contents': { Policy: 'Skip' } } } }).Policy).toBe('Skip');
        expect(ResolveEdgePolicy(edge).Policy).toBe('Skip');
    });

    it('reports a NotCloneable child only when something asks to copy it', () => {
        const notCloneable = { ...baseContext, ChildEntityConfig: { NotCloneable: true } };
        expect(ResolveEdgePolicy(notCloneable).Warnings).toEqual([]);
        expect(ResolveEdgePolicy({ ...notCloneable, RootEntityConfig: { Relationships: { OrderDetails: { Policy: 'Deep' } } } }).Warnings[0].Code).toBe('NOT_CLONEABLE');
        expect(ResolveEdgePolicy({ ...notCloneable, RequestOverrides: [{ RelationshipID: 'rel-orders-details', Policy: 'Deep' }] }).Warnings[0].Code).toBe('NOT_CLONEABLE');
    });
});
