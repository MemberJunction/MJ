/**
 * The scenario matrix's combination generators: all-pairs coverage under a validity predicate,
 * the full cross product, and determinism.
 */
import { describe, it, expect } from 'vitest';
import { CoveredPairs, CrossProduct, GeneratePairwise } from '../checks/sqlpipe-pairwise';
import type { Assignment, Dimension } from '../checks/sqlpipe-pairwise';

const DIMS: Dimension[] = [
    { Name: 'Shape', Values: ['plain', 'cte', 'json', 'top', 'union'] },
    { Name: 'Templating', Values: ['none', 'required', 'optional', 'array'] },
    { Name: 'Composition', Values: ['none', 'one', 'nested'] },
    { Name: 'Path', Values: ['saved', 'adhoc'] },
    { Name: 'Platform', Values: ['sqlserver', 'postgresql'] },
];

/** json is SQL Server only; ad hoc runs take no template. */
function valid(a: Assignment): boolean {
    if (a.Shape === 'json' && a.Platform === 'postgresql') return false;
    if (a.Path === 'adhoc' && a.Templating !== undefined && a.Templating !== 'none') return false;
    return true;
}

function feasiblePairs(): Set<string> {
    return CoveredPairs(DIMS, CrossProduct(DIMS, valid));
}

describe('GeneratePairwise', () => {
    it('covers every pair some valid combination can hold, and produces only valid combinations', () => {
        const result = GeneratePairwise(DIMS, valid);
        const covered = CoveredPairs(DIMS, result.Assignments);
        expect([...feasiblePairs()].filter(p => !covered.has(p))).toEqual([]);
        expect(result.Assignments.every(valid)).toBe(true);
        expect(result.Assignments.every(a => DIMS.every(d => d.Values.includes(a[d.Name])))).toBe(true);
    });

    it('reports the pairs the predicate rules out instead of forcing them', () => {
        const result = GeneratePairwise(DIMS, valid);
        expect(result.InfeasiblePairs).toContain('Shape=json|Platform=postgresql');
        expect(result.InfeasiblePairs).toContain('Templating=required|Path=adhoc');
        expect(result.InfeasiblePairs).not.toContain('Shape=json|Platform=sqlserver');
    });

    it('needs far fewer combinations than the cross product', () => {
        const pairwise = GeneratePairwise(DIMS, valid).Assignments.length;
        const cross = CrossProduct(DIMS, valid).length;
        expect(pairwise).toBeGreaterThanOrEqual(5 * 4);
        expect(pairwise).toBeLessThan(cross / 3);
    });

    it('is deterministic', () => {
        expect(GeneratePairwise(DIMS, valid)).toEqual(GeneratePairwise(DIMS, valid));
    });
});

describe('CrossProduct', () => {
    it('returns every valid combination exactly once', () => {
        const all = CrossProduct(DIMS, valid);
        const keys = all.map(a => DIMS.map(d => a[d.Name]).join('/'));
        expect(new Set(keys).size).toBe(keys.length);
        // 5*4*3*2*2 = 240; minus json on PG (4*3*2 = 24); minus adhoc with a template ((5*2 - 1) * 3 * 3 = 81, json/PG/adhoc already gone).
        expect(all.length).toBe(240 - 24 - 81);
    });
});
