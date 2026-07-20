import { describe, it, expect } from 'vitest';
import { ComputeCascadeRemovalSet, ComputeRemovedDependencyWarnings } from '../integration/EntityMapLifecycle.js';

/**
 * rsuplan "adding and removing tables": removing a table another table relies on must NOT
 * auto-remove the dependent — the broken edge is surfaced as a warning so a consumer can
 * prompt a force-remove (or re-add). These tests pin the pure decision function.
 */
describe('ComputeRemovedDependencyWarnings', () => {
    const parents = new Map<string, string[]>([
        ['orders', ['Customers']],          // Orders depends on Customers
        ['orderitems', ['Orders', 'Products']],
        ['customers', []],
        ['products', []],
    ]);

    it('warns for each still-active object that depends on a removed object', () => {
        const w = ComputeRemovedDependencyWarnings(['Orders', 'OrderItems', 'Products'], ['Customers'], parents);
        expect(w).toHaveLength(1);
        expect(w[0]).toContain("'Orders'");
        expect(w[0]).toContain("'Customers'");
        expect(w[0]).toContain('force-remove');
    });

    it('lists every removed parent an active object depends on', () => {
        const w = ComputeRemovedDependencyWarnings(['OrderItems'], ['Orders', 'Products'], parents);
        expect(w).toHaveLength(1);
        expect(w[0]).toContain("'Orders'");
        expect(w[0]).toContain("'Products'");
    });

    it('is case-insensitive on both sides of the edge', () => {
        const w = ComputeRemovedDependencyWarnings(['ORDERS'], ['customers'], parents);
        expect(w).toHaveLength(1);
    });

    it('returns nothing when no active object depends on a removed one (leaf removal is clean)', () => {
        expect(ComputeRemovedDependencyWarnings(['Customers', 'Products'], ['Orders'], parents)).toEqual([]);
    });

    it('returns nothing when nothing was removed or nothing remains active', () => {
        expect(ComputeRemovedDependencyWarnings(['Orders'], [], parents)).toEqual([]);
        expect(ComputeRemovedDependencyWarnings([], ['Customers'], parents)).toEqual([]);
    });

    it('tolerates objects absent from the dependency map (no persisted IO row)', () => {
        expect(ComputeRemovedDependencyWarnings(['UnknownThing'], ['Customers'], parents)).toEqual([]);
    });
});

/**
 * rsuplan force-remove: "a consumer may want the user to force remove those too" — the
 * transitive closure of dependents that cascades with a removed object when the caller opts in.
 */
describe('ComputeCascadeRemovalSet', () => {
    const parents = new Map<string, string[]>([
        ['orders', ['Customers']],
        ['orderitems', ['Orders', 'Products']],
        ['shipments', ['OrderItems']],          // 3 levels deep
        ['customers', []],
        ['products', []],
    ]);

    it('cascades direct dependents of a removed object', () => {
        const c = ComputeCascadeRemovalSet(['Orders', 'Products', 'Customers'], ['Products'], parents);
        // Orders depends on Customers (kept) — only OrderItems-style dependents of Products cascade;
        // here Orders does NOT depend on Products, so nothing cascades except true dependents.
        expect(c).toEqual([]);
    });

    it('cascades the FULL transitive closure (removed → dependent → its dependent …)', () => {
        const c = ComputeCascadeRemovalSet(['Orders', 'OrderItems', 'Shipments', 'Products'], ['Customers'], parents);
        // Customers removed → Orders cascades → OrderItems (depends on Orders) → Shipments (depends on OrderItems)
        expect(c).toEqual(['Orders', 'OrderItems', 'Shipments']);
    });

    it('is case-insensitive across edges', () => {
        const c = ComputeCascadeRemovalSet(['ORDERS'], ['customers'], parents);
        expect(c).toEqual(['ORDERS']);
    });

    it('returns nothing when nothing was removed or nothing depends on the removed', () => {
        expect(ComputeCascadeRemovalSet(['Orders'], [], parents)).toEqual([]);
        expect(ComputeCascadeRemovalSet(['Customers', 'Products'], ['Orders'], parents)).toEqual([]);
    });

    it('never cascades an object that is itself already removed', () => {
        const c = ComputeCascadeRemovalSet(['Orders', 'OrderItems'], ['Customers', 'Orders'], parents);
        expect(c).toEqual(['OrderItems']); // Orders already in the removed set — not double-listed
    });
});
