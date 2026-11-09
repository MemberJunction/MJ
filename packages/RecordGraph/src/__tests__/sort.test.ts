import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, EntityInfo, EntityFieldInfo, CompositeKey } from '@memberjunction/core';
import {
    SortByEntityDependencyOrder,
    SortEntitiesByDependency,
    SortNodesTopologically,
    FindStronglyConnectedComponents,
    FindTrueCycles,
    PlanEntityDependencyOrder,
} from '../sort';
import type { DependencyNode } from '../types';

describe('SortByEntityDependencyOrder', () => {
    const mockEntities: Record<string, Partial<EntityInfo>> = {
        'ent-parent': {
            ID: 'ent-parent',
            Name: 'ParentEntity',
            Fields: [],
        },
        'ent-child': {
            ID: 'ent-child',
            Name: 'ChildEntity',
            Fields: [
                {
                    Name: 'ParentID',
                    RelatedEntityID: 'ent-parent',
                } as EntityFieldInfo,
            ],
        },
        'ent-grandchild': {
            ID: 'ent-grandchild',
            Name: 'GrandchildEntity',
            Fields: [
                {
                    Name: 'ChildID',
                    RelatedEntityID: 'ent-child',
                } as EntityFieldInfo,
            ],
        },
    };

    const mockProvider: IMetadataProvider = {
        EntityByID: (id: string) => (mockEntities[id] as EntityInfo) ?? null,
    } as IMetadataProvider;

    interface TestItem {
        EntityID: string;
        Label: string;
    }

    it('sorts parent entities before child entities referencing them', () => {
        const items: TestItem[] = [
            { EntityID: 'ent-grandchild', Label: 'Grandchild' },
            { EntityID: 'ent-parent', Label: 'Parent' },
            { EntityID: 'ent-child', Label: 'Child' },
        ];

        const sorted = SortByEntityDependencyOrder(items, (item) => item.EntityID, mockProvider);
        expect(sorted.map(s => s.Label)).toEqual(['Parent', 'Child', 'Grandchild']);
    });

    it('works identically via the SortEntitiesByDependency alias', () => {
        const items: TestItem[] = [
            { EntityID: 'ent-child', Label: 'Child' },
            { EntityID: 'ent-parent', Label: 'Parent' },
        ];

        const sorted = SortEntitiesByDependency(items, (item) => item.EntityID, mockProvider);
        expect(sorted.map(s => s.Label)).toEqual(['Parent', 'Child']);
    });

    it('handles dependency cycles safely without crashing or infinite looping', () => {
        const cyclicEntities: Record<string, Partial<EntityInfo>> = {
            'ent-x': {
                ID: 'ent-x',
                Name: 'EntityX',
                Fields: [{ Name: 'Y_ID', RelatedEntityID: 'ent-y' } as EntityFieldInfo],
            },
            'ent-y': {
                ID: 'ent-y',
                Name: 'EntityY',
                Fields: [{ Name: 'X_ID', RelatedEntityID: 'ent-x' } as EntityFieldInfo],
            },
        };
        const cyclicProvider: IMetadataProvider = {
            EntityByID: (id: string) => (cyclicEntities[id] as EntityInfo) ?? null,
        } as IMetadataProvider;

        const items: TestItem[] = [
            { EntityID: 'ent-x', Label: 'X' },
            { EntityID: 'ent-y', Label: 'Y' },
        ];

        const sorted = SortByEntityDependencyOrder(items, (item) => item.EntityID, cyclicProvider);
        expect(sorted.length).toBe(2);
    });
});

describe('SortNodesTopologically', () => {
    function makeNode(name: string, children: DependencyNode[] = []): DependencyNode {
        return {
            EntityName: name,
            EntityInfo: {} as EntityInfo,
            RecordKey: {} as CompositeKey,
            RecordID: `${name}-id`,
            RecordData: {},
            Relationship: null,
            Children: children,
            Depth: 0,
        };
    }

    it('flattens a single node tree', () => {
        const root = makeNode('Root');
        const sorted = SortNodesTopologically(root);
        expect(sorted.map(n => n.EntityName)).toEqual(['Root']);
    });

    it('flattens a multi-level tree in breadth-first topological order', () => {
        const grandchild1 = makeNode('Grandchild1');
        const grandchild2 = makeNode('Grandchild2');
        const child1 = makeNode('Child1', [grandchild1, grandchild2]);
        const child2 = makeNode('Child2');
        const root = makeNode('Root', [child1, child2]);

        const sorted = SortNodesTopologically(root);
        expect(sorted.map(n => n.EntityName)).toEqual([
            'Root',
            'Child1',
            'Child2',
            'Grandchild1',
            'Grandchild2',
        ]);
    });
});

describe('FindStronglyConnectedComponents & FindTrueCycles', () => {
    it('identifies multi-node cycles and single-node self-loops accurately', () => {
        const edges: Record<string, string[]> = {
            A: ['B'],
            B: ['C'],
            C: ['A'], // 3-node cycle A -> B -> C -> A
            D: ['A'], // D depends on A, not in a cycle
            E: ['E'], // self-loop on E
        };

        const sccs = FindStronglyConnectedComponents(['A', 'B', 'C', 'D', 'E'], (id) => edges[id] ?? []);
        expect(sccs.length).toBe(3);

        const cycles = FindTrueCycles(['A', 'B', 'C', 'D', 'E'], (id) => edges[id] ?? []);
        expect(cycles.length).toBe(2);
        const cycleLengths = cycles.map(c => c.length).sort();
        expect(cycleLengths).toEqual([1, 3]);
    });
});

describe('PlanEntityDependencyOrder', () => {
    it('breaks a 2-entity cycle (Account <-> Contact) by deferring the nullable FK', () => {
        const entities: Record<string, Partial<EntityInfo>> = {
            'ent-account': {
                ID: 'ent-account',
                Name: 'Accounts',
                Fields: [
                    {
                        Name: 'PrimaryContactID',
                        RelatedEntityID: 'ent-contact',
                        AllowsNull: true,
                    } as EntityFieldInfo,
                ],
            },
            'ent-contact': {
                ID: 'ent-contact',
                Name: 'Contacts',
                Fields: [
                    {
                        Name: 'AccountID',
                        RelatedEntityID: 'ent-account',
                        AllowsNull: false,
                    } as EntityFieldInfo,
                ],
            },
        };
        const provider = {
            EntityByID: (id: string) => (entities[id] as EntityInfo) ?? null,
        } as IMetadataProvider;

        const plan = PlanEntityDependencyOrder(['ent-contact', 'ent-account'], provider);
        expect(plan.HasUnresolvableCycles).toBe(false);
        expect(plan.DeferredNullableFields).toHaveLength(1);
        expect(plan.DeferredNullableFields[0].EntityName).toBe('Accounts');
        expect(plan.DeferredNullableFields[0].FieldName).toBe('PrimaryContactID');
        // Since Contact.AccountID is non-nullable and Account.PrimaryContactID is deferred,
        // Accounts must be created before Contacts!
        expect(plan.OrderedEntityIDs).toEqual(['ent-account', 'ent-contact']);
    });

    it('breaks a 3-entity cycle (A -> B -> C -> A) and detects self-referencing FKs and IS-A parents', () => {
        const entities: Record<string, Partial<EntityInfo>> = {
            'ent-a': {
                ID: 'ent-a',
                Name: 'EntityA',
                Fields: [
                    { Name: 'C_ID', RelatedEntityID: 'ent-c', AllowsNull: true } as EntityFieldInfo,
                    { Name: 'ParentA_ID', RelatedEntityID: 'ent-a', AllowsNull: true } as EntityFieldInfo,
                ],
            },
            'ent-b': {
                ID: 'ent-b',
                Name: 'EntityB',
                Fields: [
                    { Name: 'A_ID', RelatedEntityID: 'ent-a', AllowsNull: false } as EntityFieldInfo,
                ],
            },
            'ent-c': {
                ID: 'ent-c',
                Name: 'EntityC',
                Fields: [
                    { Name: 'B_ID', RelatedEntityID: 'ent-b', AllowsNull: false } as EntityFieldInfo,
                ],
            },
            'ent-c-sub': {
                ID: 'ent-c-sub',
                Name: 'EntityCSubtype',
                ParentID: 'ent-c',
                Fields: [],
            },
        };
        const provider = {
            EntityByID: (id: string) => (entities[id] as EntityInfo) ?? null,
        } as IMetadataProvider;

        const plan = PlanEntityDependencyOrder(['ent-c-sub', 'ent-c', 'ent-b', 'ent-a'], provider);
        expect(plan.HasUnresolvableCycles).toBe(false);
        expect(plan.DeferredNullableFields).toHaveLength(1);
        expect(plan.DeferredNullableFields[0].FieldName).toBe('C_ID');
        expect(plan.SelfReferencingFields).toEqual([
            { EntityID: 'ent-a', EntityName: 'EntityA', FieldName: 'ParentA_ID', AllowsNull: true },
        ]);
        expect(plan.OrderedEntityIDs).toEqual(['ent-a', 'ent-b', 'ent-c', 'ent-c-sub']);
    });

    it('reports UnresolvableCycles when all FKs in a cycle are non-nullable', () => {
        const entities: Record<string, Partial<EntityInfo>> = {
            'ent-1': {
                ID: 'ent-1',
                Name: 'StrictOne',
                Fields: [{ Name: 'TwoID', RelatedEntityID: 'ent-2', AllowsNull: false } as EntityFieldInfo],
            },
            'ent-2': {
                ID: 'ent-2',
                Name: 'StrictTwo',
                Fields: [{ Name: 'OneID', RelatedEntityID: 'ent-1', AllowsNull: false } as EntityFieldInfo],
            },
        };
        const provider = {
            EntityByID: (id: string) => (entities[id] as EntityInfo) ?? null,
        } as IMetadataProvider;

        const plan = PlanEntityDependencyOrder(['ent-1', 'ent-2'], provider);
        expect(plan.HasUnresolvableCycles).toBe(true);
        expect(plan.UnresolvableCycles).toHaveLength(1);
        expect(plan.UnresolvableCycles[0].sort()).toEqual(['ent-1', 'ent-2']);
    });
});
