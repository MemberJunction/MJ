import { describe, it, expect } from 'vitest';
import { ComputeRemovedDependencyWarnings } from '../integration/EntityMapLifecycle.js';

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
