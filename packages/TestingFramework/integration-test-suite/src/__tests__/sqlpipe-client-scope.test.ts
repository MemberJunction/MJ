/**
 * The two scopes of the GraphQL scenario matrix (IT145, SPC1): the `pr` subset covers every value
 * and every pair it promises, is at most 40% of `full`, and is deterministic; `full` is the list it
 * was before scopes existed.
 */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { DatabasePlatform } from '@memberjunction/core';
import { CLIENT_PATHS, ClientAssignments, ClientDimensions, MatrixScopeOf, PR_PAIRS, TRANSPORT_DIMENSIONS } from '../checks/sqlpipe-dimensions';
import { CoveredPairs } from '../checks/sqlpipe-pairwise';
import type { Assignment, DimensionValue } from '../checks/sqlpipe-pairwise';
import { BuildQuery, PointOf, ValidPoint } from '../checks/sqlpipe-scenarios';
import type { BuildEnvironment } from '../checks/sqlpipe-scenarios';
import { SHAPES } from '../checks/sqlpipe-shapes';

const PLATFORMS: readonly DatabasePlatform[] = ['sqlserver', 'postgresql'];

/** The full scope as it stood before the scopes: count and a hash of the assignment list, per platform. */
const FULL_SNAPSHOT: Readonly<Record<DatabasePlatform, { Count: number; Hash: string }>> = {
    sqlserver: { Count: 470, Hash: '6a417e057c2c0c45' },
    postgresql: { Count: 392, Hash: '99cb676f774a4bea' },
};

function hashOf(assignments: readonly Assignment[]): string {
    return createHash('sha256').update(JSON.stringify(assignments)).digest('hex').slice(0, 16);
}

function envFor(platform: DatabasePlatform): BuildEnvironment {
    return { Platform: platform, Context: { UserEmail: 'it145@example.com' }, Prefix: 'zzz-it145', Naming: () => ({ Path: dep => `Fixture/zzz-it145 core ${dep}` }) };
}

function distinctQueries(platform: DatabasePlatform, assignments: readonly Assignment[]): number {
    const env = envFor(platform);
    return new Set(assignments.map(a => BuildQuery(env, PointOf(a)).Key)).size;
}

/** `A=x|B=y` → the two dimension values. */
function parsePair(key: string): [DimensionValue, DimensionValue] {
    const [a, b] = key.split('|').map(part => {
        const at = part.indexOf('=');
        return { Dimension: part.slice(0, at), Value: part.slice(at + 1) };
    });
    return [a, b];
}

function valuesOf(assignments: readonly Assignment[], dimension: string): Set<string> {
    return new Set(assignments.map(a => a[dimension]));
}

describe('MatrixScopeOf', () => {
    it('defaults to full, reads pr, and refuses anything else', () => {
        expect(MatrixScopeOf(undefined)).toBe('full');
        expect(MatrixScopeOf('')).toBe('full');
        expect(MatrixScopeOf('full')).toBe('full');
        expect(MatrixScopeOf(' PR ')).toBe('pr');
        expect(() => MatrixScopeOf('nightly')).toThrow(/SQLPIPE_MATRIX_SCOPE/);
    });
});

describe.each(PLATFORMS)('IT145 scopes on %s', platform => {
    const full = ClientAssignments(platform, 'full').Assignments;
    const pr = ClientAssignments(platform, 'pr').Assignments;
    const valid = (a: Assignment): boolean => ValidPoint(platform, a);

    it('full scope is unchanged', () => {
        expect(full.length).toBe(FULL_SNAPSHOT[platform].Count);
        expect(hashOf(full)).toBe(FULL_SNAPSHOT[platform].Hash);
    });

    it('pr scope produces only valid points, and every value of every dimension the full scope reaches', () => {
        expect(pr.every(valid)).toBe(true);
        for (const dim of ClientDimensions()) expect([...valuesOf(full, dim.Name)].filter(v => !valuesOf(pr, dim.Name).has(v))).toEqual([]);
    });

    it('pr scope covers every pair over the transport dimensions, and every pair it requires, that the full scope covers', () => {
        const dims = ClientDimensions();
        const prPairs = CoveredPairs(dims, pr);
        const required = [...CoveredPairs(dims, full)].filter(key => PR_PAIRS(...parsePair(key)));
        expect(required.filter(key => !prPairs.has(key))).toEqual([]);
        const transport = required.filter(key => parsePair(key).every(d => TRANSPORT_DIMENSIONS.includes(d.Dimension)));
        expect(transport.length).toBeGreaterThan(0);
    });

    it('pr scope runs every query shape on every client run path it can reach', () => {
        const pairs = CoveredPairs(ClientDimensions(), pr);
        for (const shape of SHAPES.filter(s => valid({ Shape: s.Key, Schema: 'core' }))) {
            for (const path of CLIENT_PATHS) expect(pairs.has(`Shape=${shape.Key}|Path=${path}`)).toBe(true);
        }
    });

    it('pr scope is at most 40% of full, in points and in distinct saved queries', () => {
        expect(pr.length).toBeLessThanOrEqual(full.length * 0.4);
        expect(distinctQueries(platform, pr)).toBeLessThanOrEqual(distinctQueries(platform, full) * 0.4);
    });

    it('pr scope is deterministic', () => {
        expect(ClientAssignments(platform, 'pr')).toEqual(ClientAssignments(platform, 'pr'));
        expect(hashOf(ClientAssignments(platform, 'pr').Assignments)).toBe(hashOf(pr));
    });
});
