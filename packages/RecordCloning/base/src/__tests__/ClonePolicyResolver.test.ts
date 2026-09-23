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

    it('forces Deep when FK is unique (constraint-derived)', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            IsUniqueFK: true,
            RelationshipConfig: { Policy: 'Skip' }, // Relationship wants to skip
        });

        expect(res.Policy).toBe('Deep');
        expect(res.PolicySource).toBe('Constraint');
        expect(res.Locked).toBe(true);
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

    it('defaults unconfigured relationships on MJ: Users to Skip', () => {
        const res = ResolveEdgePolicy({
            ...baseContext,
            ParentEntityName: 'MJ: Users',
            ChildEntityName: 'MJ: Conversations',
            CurrentDepth: 1,
            MaxDepth: 3,
        });

        expect(res.Policy).toBe('Skip');
        expect(res.PolicySource).toBe('BuiltIn');
    });
});
