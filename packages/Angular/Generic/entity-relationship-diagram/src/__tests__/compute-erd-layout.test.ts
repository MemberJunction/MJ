import { describe, it, expect } from 'vitest';
import { computeErdLayout, pointsToPath, getNeighbors } from '../lib/layout/compute-erd-layout';
import type { ERDNode } from '../lib/interfaces/erd-types';

const pk = (id: string, name = 'ID') => ({ id, name, type: 'uniqueidentifier', isPrimaryKey: true });
const fk = (id: string, name: string, targetId: string) => ({
    id, name, type: 'uniqueidentifier', isPrimaryKey: false, relatedNodeId: targetId,
});
const col = (id: string, name: string) => ({ id, name, type: 'nvarchar', isPrimaryKey: false });

const node = (id: string, schema: string | undefined, name: string, fields: ERDNode['fields']): ERDNode => ({
    id, name, schemaName: schema, fields,
});

describe('computeErdLayout', () => {

    describe('empty input', () => {
        it('returns empty layout for no nodes', () => {
            const layout = computeErdLayout([]);
            expect(layout.nodes).toEqual([]);
            expect(layout.edges).toEqual([]);
            expect(layout.bands).toEqual([]);
        });
    });

    describe('single node', () => {
        it('creates one node in one band', () => {
            const n = node('u', 'core', 'Users', [pk('u:id')]);
            const layout = computeErdLayout([n]);
            expect(layout.nodes).toHaveLength(1);
            expect(layout.bands).toHaveLength(1);
            expect(layout.bands[0].schemaName).toBe('core');
            expect(layout.nodes[0].id).toBe('u');
            expect(layout.nodes[0].width).toBeGreaterThan(0);
            expect(layout.nodes[0].height).toBeGreaterThan(0);
        });

        it('uses the synthetic default schema when schemaName is missing', () => {
            const n = node('u', undefined, 'Users', [pk('u:id')]);
            const layout = computeErdLayout([n]);
            expect(layout.bands).toHaveLength(1);
            expect(layout.bands[0].schemaName).toBe('_');
        });
    });

    describe('column layout rules', () => {
        const make = (count: number, schema = 'core'): ERDNode[] =>
            Array.from({ length: count }, (_, i) => node(`${schema}-${i}`, schema, `Entity${i}`, [pk(`${i}:id`)]));

        it('uses 1 column when count <= 3', () => {
            const layout = computeErdLayout(make(3));
            const xs = new Set(layout.nodes.map(n => n.x));
            expect(xs.size).toBe(1);
        });

        it('uses 2 columns when count is between 4 and 8', () => {
            const layout = computeErdLayout(make(6));
            const xs = new Set(layout.nodes.map(n => n.x));
            expect(xs.size).toBe(2);
        });

        it('uses 3 columns when count > 8', () => {
            const layout = computeErdLayout(make(12));
            const xs = new Set(layout.nodes.map(n => n.x));
            expect(xs.size).toBe(3);
        });
    });

    describe('schema bands', () => {
        it('creates one band per distinct schema', () => {
            const nodes = [
                node('a', 'core', 'A', [pk('a:id')]),
                node('b', 'ai',   'B', [pk('b:id')]),
                node('c', 'core', 'C', [pk('c:id')]),
            ];
            const layout = computeErdLayout(nodes, { schemaOrder: ['core', 'ai'] });
            expect(layout.bands.map(b => b.schemaName)).toEqual(['core', 'ai']);
        });

        it('aligns all band heights to the tallest', () => {
            const nodes = [
                node('a', 'core', 'A', [pk('a:id')]),
                node('b', 'core', 'B', [pk('b:id')]),
                node('c', 'core', 'C', [pk('c:id')]),
                node('d', 'core', 'D', [pk('d:id')]),
                node('e', 'ai',   'E', [pk('e:id')]),
            ];
            const layout = computeErdLayout(nodes);
            const heights = new Set(layout.bands.map(b => b.height));
            expect(heights.size).toBe(1);
        });

        it('sorts entities alphabetically within a band', () => {
            const nodes = [
                node('a', 'core', 'Charlie', [pk('c:id')]),
                node('b', 'core', 'Alpha', [pk('a:id')]),
                node('c', 'core', 'Bravo', [pk('b:id')]),
            ];
            const layout = computeErdLayout(nodes);
            expect(layout.nodes.map(n => n.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
        });
    });

    describe('field visibility', () => {
        it('hides non-PK/FK fields by default (keys-only view)', () => {
            const n = node('u', 'core', 'Users', [
                pk('u:id'),
                col('u:name', 'Name'),
                col('u:email', 'Email'),
                fk('u:role', 'RoleID', 'r'),
            ]);
            const layout = computeErdLayout([n]);
            const visible = layout.nodes[0].visibleFields.map(f => f.name);
            expect(visible).toEqual(['ID', 'RoleID']);
            expect(layout.nodes[0].hasMore).toBe(true);
        });

        it('shows every field when showAllFields is true', () => {
            const n = node('u', 'core', 'Users', [
                pk('u:id'),
                col('u:name', 'Name'),
                col('u:email', 'Email'),
            ]);
            const layout = computeErdLayout([n], { showAllFields: true });
            expect(layout.nodes[0].visibleFields.map(f => f.name)).toEqual(['ID', 'Name', 'Email']);
            expect(layout.nodes[0].hasMore).toBe(false);
        });

        it('shows every field when the node is in the expanded set', () => {
            const n = node('u', 'core', 'Users', [
                pk('u:id'),
                col('u:name', 'Name'),
            ]);
            const layout = computeErdLayout([n], { expandedNodeIds: new Set(['u']) });
            expect(layout.nodes[0].visibleFields.map(f => f.name)).toEqual(['ID', 'Name']);
            expect(layout.nodes[0].hasMore).toBe(false);
        });
    });

    describe('edges', () => {
        it('creates an edge for each FK field that has a resolvable target', () => {
            const nodes = [
                node('u', 'core', 'Users', [pk('u:id'), fk('u:r', 'RoleID', 'r')]),
                node('r', 'core', 'Roles', [pk('r:id')]),
            ];
            const layout = computeErdLayout(nodes);
            expect(layout.edges).toHaveLength(1);
            expect(layout.edges[0].sourceId).toBe('u');
            expect(layout.edges[0].targetId).toBe('r');
        });

        it('skips FKs whose target isn\'t in the node list', () => {
            const nodes = [node('u', 'core', 'Users', [pk('u:id'), fk('u:x', 'GhostID', 'ghost')])];
            const layout = computeErdLayout(nodes);
            expect(layout.edges).toEqual([]);
        });

        it('produces a 4-point orthogonal path for a cross-schema edge', () => {
            const nodes = [
                node('u', 'core', 'Users', [pk('u:id'), fk('u:r', 'RoleID', 'r')]),
                node('r', 'ai',   'Roles', [pk('r:id')]),
            ];
            const layout = computeErdLayout(nodes, { schemaOrder: ['core', 'ai'] });
            expect(layout.edges[0].points).toHaveLength(4);
            expect(layout.edges[0].selfReference).toBe(false);
            expect(layout.edges[0].goingRight).toBe(true);
        });

        it('produces a 5-point loop path for a self-reference', () => {
            const nodes = [
                node('e', 'core', 'Employees', [pk('e:id'), fk('e:sup', 'SupervisorID', 'e')]),
            ];
            const layout = computeErdLayout(nodes);
            expect(layout.edges).toHaveLength(1);
            expect(layout.edges[0].selfReference).toBe(true);
            expect(layout.edges[0].points).toHaveLength(5);
        });
    });

    describe('schemaOrder override', () => {
        it('honors explicit schema ordering', () => {
            const nodes = [
                node('z', 'zzz', 'Z', [pk('z:id')]),
                node('a', 'aaa', 'A', [pk('a:id')]),
            ];
            const layout = computeErdLayout(nodes, { schemaOrder: ['zzz', 'aaa'] });
            expect(layout.bands.map(b => b.schemaName)).toEqual(['zzz', 'aaa']);
        });

        it('appends schemas not mentioned in schemaOrder', () => {
            const nodes = [
                node('x', 'x', 'X', [pk('x:id')]),
                node('y', 'y', 'Y', [pk('y:id')]),
            ];
            const layout = computeErdLayout(nodes, { schemaOrder: ['y'] });
            expect(layout.bands.map(b => b.schemaName)).toEqual(['y', 'x']);
        });
    });
});

describe('pointsToPath', () => {
    it('builds an SVG M/L path string', () => {
        const d = pointsToPath([[0, 0], [10, 0], [10, 10]]);
        expect(d).toBe('M0 0 L10 0 L10 10');
    });

    it('returns empty string for empty points', () => {
        expect(pointsToPath([])).toBe('');
    });
});

describe('getNeighbors', () => {
    it('returns just the node id when no relationships exist', () => {
        const nodes = [node('a', 'x', 'A', [pk('a:id')])];
        expect([...getNeighbors(nodes, 'a')]).toEqual(['a']);
    });

    it('includes nodes referenced via outgoing FK', () => {
        const nodes = [
            node('u', 'core', 'Users', [pk('u:id'), fk('u:r', 'RoleID', 'r')]),
            node('r', 'core', 'Roles', [pk('r:id')]),
        ];
        const set = getNeighbors(nodes, 'u');
        expect(set.has('r')).toBe(true);
    });

    it('includes nodes that reference the target via incoming FK', () => {
        const nodes = [
            node('u', 'core', 'Users', [pk('u:id'), fk('u:r', 'RoleID', 'r')]),
            node('r', 'core', 'Roles', [pk('r:id')]),
        ];
        const set = getNeighbors(nodes, 'r');
        expect(set.has('u')).toBe(true);
    });
});
