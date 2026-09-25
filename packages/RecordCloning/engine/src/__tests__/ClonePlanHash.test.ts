import { describe, it, expect } from 'vitest';
import type { ClonePlanNode, ClonePlanEdge } from '@memberjunction/record-cloning-base';
import { ComputeClonePlanHash as ComputePlanHash, Sha256Hex } from '../ClonePlanHash';

describe('ClonePlanHash', () => {
    const baseNode1: ClonePlanNode = {
        Key: 'User::101',
        EntityName: 'User',
        SourceKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '101' }] },
        TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'target-uuid-1' }] },
        Action: 'Create',
        Reason: 'Root node',
        Depth: 0,
        ParentKey: null,
        Via: null,
        DisplayName: 'User 101',
        FieldChanges: [
            { Field: 'Name', Kind: 'Rename', OldValue: 'Alice', NewValue: 'Copy of Alice', Reason: 'Unique name' },
            { Field: 'Email', Kind: 'Prompt', OldValue: 'alice@example.com', NewValue: 'alice2@example.com', Reason: 'Prompted email' },
        ],
        Warnings: [],
        Route: 'RootSave',
    };

    const baseNode2: ClonePlanNode = {
        Key: 'Role::501',
        EntityName: 'Role',
        SourceKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '501' }] },
        TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'target-uuid-2' }] },
        Action: 'Reference',
        Reason: 'Shared role',
        Depth: 1,
        ParentKey: 'User::101',
        Via: null,
        DisplayName: 'Admin Role',
        FieldChanges: [],
        Warnings: [],
        Route: 'Collection',
    };

    const baseEdge: ClonePlanEdge = {
        FromKey: 'User::101',
        ToKey: 'Role::501',
        Kind: 'Relationship',
        RelatedEntityName: 'User Roles',
        JoinField: 'RoleID',
        Policy: 'Reference',
        Locked: false,
        PolicySource: 'Relationship',
    };

    it('computes a consistent 64-character hex hash', () => {
        const hash = ComputePlanHash({
            Nodes: [baseNode1, baseNode2],
            Edges: [baseEdge],
        });

        expect(hash).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('is stable across node and edge array ordering', () => {
        const hashForward = ComputePlanHash({
            Nodes: [baseNode1, baseNode2],
            Edges: [baseEdge],
        });

        const hashReversed = ComputePlanHash({
            Nodes: [baseNode2, baseNode1],
            Edges: [baseEdge],
        });

        expect(hashForward).toBe(hashReversed);
    });

    it('is stable across field changes array ordering', () => {
        const nodeWithReversedChanges: ClonePlanNode = {
            ...baseNode1,
            FieldChanges: [
                baseNode1.FieldChanges[1],
                baseNode1.FieldChanges[0],
            ],
        };

        const hash1 = ComputePlanHash({
            Nodes: [baseNode1],
            Edges: [],
        });

        const hash2 = ComputePlanHash({
            Nodes: [nodeWithReversedChanges],
            Edges: [],
        });

        expect(hash1).toBe(hash2);
    });

    it('ignores TargetKey differences completely', () => {
        const hashWithTargetUuid1 = ComputePlanHash({
            Nodes: [baseNode1],
            Edges: [],
        });

        const nodeWithDifferentTarget: ClonePlanNode = {
            ...baseNode1,
            TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'completely-different-uuid-9999' }] },
        };

        const hashWithTargetUuid2 = ComputePlanHash({
            Nodes: [nodeWithDifferentTarget],
            Edges: [],
        });

        expect(hashWithTargetUuid1).toBe(hashWithTargetUuid2);
    });

    it('changes when a node Action changes', () => {
        const hashCreate = ComputePlanHash({
            Nodes: [baseNode1],
            Edges: [],
        });

        const nodeSkip: ClonePlanNode = {
            ...baseNode1,
            Action: 'Skip',
        };

        const hashSkip = ComputePlanHash({
            Nodes: [nodeSkip],
            Edges: [],
        });

        expect(hashCreate).not.toBe(hashSkip);
    });

    it('changes when an edge Policy changes', () => {
        const hashRef = ComputePlanHash({
            Nodes: [baseNode1, baseNode2],
            Edges: [baseEdge],
        });

        const edgeDeep: ClonePlanEdge = {
            ...baseEdge,
            Policy: 'Deep',
        };

        const hashDeep = ComputePlanHash({
            Nodes: [baseNode1, baseNode2],
            Edges: [edgeDeep],
        });

        expect(hashRef).not.toBe(hashDeep);
    });

    it('changes when a FieldChange value or kind changes', () => {
        const hashOrig = ComputePlanHash({
            Nodes: [baseNode1],
            Edges: [],
        });

        const nodeModifiedChange: ClonePlanNode = {
            ...baseNode1,
            FieldChanges: [
                { ...baseNode1.FieldChanges[0], NewValue: 'Brand New Name' },
                baseNode1.FieldChanges[1],
            ],
        };

        const hashMod = ComputePlanHash({
            Nodes: [nodeModifiedChange],
            Edges: [],
        });

        expect(hashOrig).not.toBe(hashMod);
    });

    it('is standard SHA-256', () => {
        expect(Sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('hashes text outside Latin-1, so PLAN_CHANGED still fires for it', () => {
        const withText = (text: string) =>
            ComputePlanHash({
                Nodes: [{ ...baseNode1, FieldChanges: [{ Field: 'Name', Kind: 'Copy', OldValue: text, NewValue: text, Reason: '' }] }],
                Edges: [],
            });
        const a = withText('Prompt — v1 “draft” 你好 🚀');
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(withText('Prompt — v2 “draft” 你好 🚀')).not.toBe(a);
    });

    it('hashes encrypted values masked, so the hash reveals nothing about them', () => {
        const withSecret = (secret: string) =>
            ComputePlanHash({
                Nodes: [{ ...baseNode1, FieldChanges: [{ Field: 'APIKey', Kind: 'Copy', OldValue: secret, NewValue: secret, Reason: '', Sensitive: true }] }],
                Edges: [],
            });
        expect(withSecret('sk-one')).toBe(withSecret('sk-two'));
    });

    it('ignores the key values a plan mints, including remapped FKs and IDs inside JSON', () => {
        const planWith = (minted: string) =>
            ComputePlanHash({
                Nodes: [
                    { ...baseNode1, TargetKey: minted, FieldChanges: [] },
                    {
                        ...baseNode2,
                        Action: 'Create',
                        TargetKey: `child-${minted}`,
                        FieldChanges: [
                            { Field: 'UserID', Kind: 'Remap', OldValue: '101', NewValue: minted, Reason: '' },
                            { Field: 'Config', Kind: 'RemapJSON', OldValue: '{"u":"101"}', NewValue: `{"u":"${minted}"}`, Reason: '' },
                        ],
                    },
                ],
                Edges: [baseEdge],
            });
        expect(planWith('AAAA-1111')).toBe(planWith('bbbb-2222'));
    });

    it('still changes when a remap points at an existing record instead of the new one', () => {
        const withRemap = (value: string) =>
            ComputePlanHash({
                Nodes: [
                    { ...baseNode1, TargetKey: 'new-1', FieldChanges: [] },
                    { ...baseNode2, Action: 'Create', TargetKey: 'new-2', FieldChanges: [{ Field: 'UserID', Kind: 'Remap', OldValue: '101', NewValue: value, Reason: '' }] },
                ],
                Edges: [baseEdge],
            });
        expect(withRemap('new-1')).not.toBe(withRemap('existing-7'));
    });
});
