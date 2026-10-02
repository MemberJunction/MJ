import { describe, expect, it } from 'vitest';
import { HighestNonDraftVersion, RubricVersionDiff } from '../RubricVersionDiff.js';
import { Sha256Hex } from '../canonical.js';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '../types.js';

function node(partial: Partial<RubricNodeSnapshot> & Pick<RubricNodeSnapshot, 'key'>): RubricNodeSnapshot {
    return {
        id: partial.key,
        name: partial.key,
        nodeType: 'Criterion',
        weight: 1,
        isAdvisory: false,
        isGate: false,
        evidenceRequired: false,
        rationaleRequired: false,
        sequence: 0,
        scaleId: 'scale',
        ...partial,
    };
}

function snapshot(nodes: RubricNodeSnapshot[], extra: Partial<RubricVersionSnapshot> = {}): RubricVersionSnapshot {
    return {
        id: 'v',
        rubricId: 'r',
        majorVersion: 1,
        minorVersion: 2,
        patchVersion: 3,
        notApplicablePolicy: 'ExcludeAndRedistribute',
        passThreshold: 0.6,
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes,
        scales: [{
            id: 'scale',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 1, description: 'wording', sequence: 0 }],
        }],
        bands: [{ id: 'band', label: 'Pass', description: 'ok', minScore: 0.6, maxScore: 1, displayTone: 'Success', sequence: 0 }],
        ...extra,
    };
}

async function scoringHash(version: RubricVersionSnapshot): Promise<string> {
    return Sha256Hex(RubricVersionDiff.scoringCanonical(version));
}

describe('RubricVersionDiff', () => {
    const base = snapshot([node({ key: 'clarity' })]);

    it('publishes the first version as 1.0.0 Initial', () => {
        const result = RubricVersionDiff.diff(null, base);
        expect(result.appliedBump).toBe('Initial');
        expect(result.nextVersion).toEqual({ major: 1, minor: 0, patch: 0 });
    });

    it('picks the highest Published or Retired version and ignores drafts', () => {
        const best = HighestNonDraftVersion([
            { id: 'published', status: 'Published', major: 1, minor: 5, patch: 0 },
            { id: 'draft', status: 'Draft', major: 9, minor: 0, patch: 0 },
            { id: 'retired', status: 'Retired', major: 2, minor: 0, patch: 0 },
        ]);
        expect(best?.id).toBe('retired');
        expect(HighestNonDraftVersion([{ id: 'only', status: 'Draft', major: 1, minor: 0, patch: 0 }])).toBeNull();
    });

    it('refuses a draft identical to its base', () => {
        const result = RubricVersionDiff.diff(base, snapshot([node({ key: 'clarity' })]));
        expect(result.computedBump).toBeNull();
        expect(result.nextVersion).toBeNull();
    });

    it('classifies wording as Patch, a threshold as Minor, and a weight as Major', () => {
        expect(RubricVersionDiff.diff(base, snapshot([node({ key: 'clarity', name: 'Clarity' })])).computedBump).toBe('Patch');
        expect(RubricVersionDiff.diff(base, snapshot([node({ key: 'clarity' })], { passThreshold: 0.8 })).computedBump).toBe('Minor');
        const heavier = RubricVersionDiff.diff(base, snapshot([node({ key: 'clarity', weight: 2 })]));
        expect(heavier.computedBump).toBe('Major');
        expect(heavier.changes.find(change => change.property === 'Weight')).toMatchObject({ from: 1, to: 2 });
    });

    it('treats an advisory add as Minor and a non-advisory add as Major', () => {
        const advisory = RubricVersionDiff.diff(base, snapshot([
            node({ key: 'clarity' }),
            node({ key: 'note', isAdvisory: true }),
        ]));
        expect(advisory.computedBump).toBe('Minor');
        const structural = RubricVersionDiff.diff(base, snapshot([
            node({ key: 'clarity' }),
            node({ key: 'accuracy' }),
        ]));
        expect(structural.computedBump).toBe('Major');
    });

    it('compares parent links by key, so a clone with new ids is not a major bump', () => {
        const parented = snapshot([
            node({ id: 'old-group', key: 'group', nodeType: 'Group', scaleId: null }),
            node({ id: 'old-child', key: 'clarity', parentId: 'old-group' }),
        ]);
        const clone = snapshot([
            node({ id: 'new-group', key: 'group', nodeType: 'Group', scaleId: null }),
            node({ id: 'new-child', key: 'clarity', parentId: 'new-group' }),
        ]);
        expect(RubricVersionDiff.diff(parented, clone).computedBump).toBeNull();
    });

    it('lets the author bump higher and not lower, and numbers the next version from the base', () => {
        const patch = RubricVersionDiff.diff(base, snapshot([node({ key: 'clarity', guidance: 'more' })]), 'Major');
        expect(patch.appliedBump).toBe('Major');
        expect(patch.nextVersion).toEqual({ major: 2, minor: 0, patch: 0 });
        const cannotLower = RubricVersionDiff.diff(base, snapshot([node({ key: 'clarity', weight: 4 })]), 'Patch');
        expect(cannotLower.appliedBump).toBe('Major');
        expect(cannotLower.nextVersion).toEqual({ major: 2, minor: 0, patch: 0 });
        const minor = RubricVersionDiff.diff(base, snapshot([node({ key: 'clarity' })], { passThreshold: 0.9 }));
        expect(minor.nextVersion).toEqual({ major: 1, minor: 3, patch: 0 });
    });

    it('treats a level normalizedValue change as Major and changes ScoringHash', async () => {
        const edited = snapshot([node({ key: 'clarity' })]);
        edited.scales = [{
            id: 'scale',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 0.4, description: 'wording', sequence: 0 }],
        }];
        const result = RubricVersionDiff.diff(base, edited);
        expect(result.computedBump).toBe('Major');
        expect(await scoringHash(edited)).not.toBe(await scoringHash(base));
    });

    it('changes ScoringHash when level values swap onto the other level ids', async () => {
        const levels = [
            { id: 'low', label: 'Low', value: 0, normalizedValue: 0, sequence: 0 },
            { id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 1 },
        ];
        const before = snapshot([node({ key: 'clarity' })]);
        before.scales = [{ id: 'scale', scaleType: 'Levels', higherIsBetter: true, levels }];
        const swapped = snapshot([node({ key: 'clarity' })]);
        swapped.scales = [{
            id: 'scale',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [
                { id: 'low', label: 'Low', value: 1, normalizedValue: 1, sequence: 1 },
                { id: 'high', label: 'High', value: 0, normalizedValue: 0, sequence: 0 },
            ],
        }];
        expect(await scoringHash(swapped)).not.toBe(await scoringHash(before));
    });

    it('calls a band label rename Patch and a sequence-only edit a change', () => {
        const renamed = snapshot([node({ key: 'clarity' })]);
        renamed.bands = [{ id: 'band-clone', label: 'Met', description: 'ok', minScore: 0.6, maxScore: 1, displayTone: 'Success', sequence: 0 }];
        const rename = RubricVersionDiff.diff(base, renamed);
        expect(rename.computedBump).toBe('Patch');
        expect(rename.changes.some(change => change.property === 'band added' || change.property === 'band removed')).toBe(false);
        expect(rename.changes.find(change => change.property === 'band label')).toMatchObject({ bump: 'Patch', from: 'Pass', to: 'Met' });

        const reordered = snapshot([node({ key: 'clarity' })]);
        reordered.bands = [{ id: 'band', label: 'Pass', description: 'ok', minScore: 0.6, maxScore: 1, displayTone: 'Success', sequence: 4 }];
        const sequence = RubricVersionDiff.diff(base, reordered);
        expect(sequence.computedBump).toBe('Patch');
        expect(sequence.nextVersion).not.toBeNull();
        expect(sequence.changes.find(change => change.property === 'Sequence')).toMatchObject({ from: 0, to: 4 });
    });

    it('does not bump when a clone keeps the band label and range and assigns a new id', () => {
        const cloned = snapshot([node({ key: 'clarity' })]);
        cloned.bands = [{ id: 'band-clone', label: 'Pass', description: 'ok', minScore: 0.6, maxScore: 1, displayTone: 'Success', sequence: 0 }];
        expect(RubricVersionDiff.diff(base, cloned).computedBump).toBeNull();
    });

    it('does not call reparenting an advisory node Major, and the hash stays', async () => {
        const before = snapshot([
            node({ id: 'group-a', key: 'group-a', nodeType: 'Group', scaleId: null }),
            node({ id: 'group-b', key: 'group-b', nodeType: 'Group', scaleId: null }),
            node({ key: 'clarity' }),
            node({ key: 'aside', isAdvisory: true, parentId: 'group-a' }),
        ]);
        const after = snapshot([
            node({ id: 'group-a', key: 'group-a', nodeType: 'Group', scaleId: null }),
            node({ id: 'group-b', key: 'group-b', nodeType: 'Group', scaleId: null }),
            node({ key: 'clarity' }),
            node({ key: 'aside', isAdvisory: true, parentId: 'group-b' }),
        ]);
        const result = RubricVersionDiff.diff(before, after);
        expect(result.computedBump).not.toBe('Major');
        expect(await scoringHash(before)).toBe(await scoringHash(after));
    });

    it('does not call an advisory weight change Major, and the hash stays', async () => {
        const light = snapshot([
            node({ key: 'clarity' }),
            node({ key: 'aside', isAdvisory: true, weight: 1 }),
        ]);
        const heavy = snapshot([
            node({ key: 'clarity' }),
            node({ key: 'aside', isAdvisory: true, weight: 9 }),
        ]);
        const result = RubricVersionDiff.diff(light, heavy);
        expect(result.computedBump).not.toBe('Major');
        expect(await scoringHash(light)).toBe(await scoringHash(heavy));
    });

    it('keeps ScoringHash inside one major and changes it on a major bump', async () => {
        const wording = snapshot([node({ key: 'clarity', name: 'Renamed', description: 'x' })], { passThreshold: 0.2 });
        const advisory = snapshot([
            node({ key: 'clarity' }),
            node({ key: 'aside', isAdvisory: true, weight: 9 }),
        ]);
        const heavier = snapshot([node({ key: 'clarity', weight: 3 })]);
        const baseHash = await scoringHash(base);
        expect(await scoringHash(wording)).toBe(baseHash);
        expect(await scoringHash(advisory)).toBe(baseHash);
        expect(await scoringHash(heavier)).not.toBe(baseHash);

        for (let i = 0; i < 20; i++) {
            const patch = snapshot([node({
                key: 'clarity',
                name: `name-${i}`,
                description: `desc-${i}`,
                guidance: i % 2 === 0 ? 'g' : null,
                sequence: i,
            })], {
                instructions: `note ${i}`,
                scoreDisplayMax: 100 + i,
            });
            expect(RubricVersionDiff.diff(base, patch).computedBump).toBe('Patch');
            expect(await scoringHash(patch)).toBe(baseHash);

            const major = snapshot([node({ key: 'clarity', weight: 1 + (i + 1) / 10 })]);
            expect(RubricVersionDiff.diff(base, major).computedBump).toBe('Major');
            expect(await scoringHash(major)).not.toBe(baseHash);
        }
    });
});
