import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CanonicalJson, CompareCodePoints, ContentProjection, ScoringProjection } from '../canonical.js';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '../types.js';

function leaf(key: string): RubricNodeSnapshot {
    return {
        id: key,
        key,
        name: key,
        nodeType: 'Criterion',
        weight: 1,
        isAdvisory: false,
        isGate: false,
        evidenceRequired: false,
        rationaleRequired: false,
        sequence: 0,
        scaleId: 'scale',
    };
}

function version(nodes: RubricNodeSnapshot[], extra: Partial<RubricVersionSnapshot> = {}): RubricVersionSnapshot {
    return {
        id: 'version',
        rubricId: 'rubric',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes,
        scales: [],
        bands: [],
        ...extra,
    };
}

describe('code-point order', () => {
    it('orders ä after z, including a character above the basic plane', () => {
        expect(CompareCodePoints('z', 'ä')).toBeLessThan(0);
        expect(CompareCodePoints('😀', '\uD83E')).toBeGreaterThan(0);
        const projected = ScoringProjection(version([leaf('ä'), leaf('z')]));
        expect((projected as { nodes: { key: string }[] }).nodes.map(node => node.key)).toEqual(['z', 'ä']);
        const content = ContentProjection(version([leaf('ä'), leaf('z')], {
            bands: [
                { id: 'a', label: 'ä', minScore: 0, maxScore: 0.5, displayTone: 'Warning', sequence: 0 },
                { id: 'b', label: 'z', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 0 },
            ],
        }));
        const body = content as { nodes: { key: string }[]; bands: { label: string }[] };
        expect(body.nodes.map(node => node.key)).toEqual(['z', 'ä']);
        expect(body.bands.map(band => band.label)).toEqual(['z', 'ä']);
        expect(CanonicalJson({ ä: 1, z: 2 }).indexOf('"z"')).toBeLessThan(CanonicalJson({ ä: 1, z: 2 }).indexOf('"ä"'));
    });

    it('does not sort the canonical form with localeCompare', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../canonical.ts'), 'utf8');
        expect(source.includes('localeCompare')).toBe(false);
    });
});
