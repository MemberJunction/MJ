import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, EntityInfo, EntityFieldInfo, CompositeKey } from '@memberjunction/core';
import {
    SortByEntityDependencyOrder,
    SortEntitiesByDependency,
    SortNodesTopologically,
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
