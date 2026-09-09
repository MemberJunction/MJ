import { describe, it, expect } from 'vitest';
import { ordinalCompare } from '@memberjunction/global';
import { sortBySequenceAndCreatedAt, sortRelatedEntities } from '../Misc/util';
import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';

describe('deterministic-ordering (T8)', () => {
    describe('ordinalCompare total order and locale divergence', () => {
        it('disagrees with localeCompare on known casing and punctuation pairs', () => {
            // 'B' (0x42) < 'a' (0x61) in ordinal; in default en-US localeCompare, 'a' < 'B'
            expect(ordinalCompare('a', 'B')).toBeGreaterThan(0);
            expect('a'.localeCompare('B')).toBeLessThan(0);

            // '_' (0x5F) < 'a' (0x61) in ordinal
            expect(ordinalCompare('_', 'a')).toBeLessThan(0);

            // 'f' (0x66) < 'é' (0xE9) in ordinal; in localeCompare, 'é' sorts with 'e', so 'é' < 'f'
            expect(ordinalCompare('é', 'f')).toBeGreaterThan(0);
            expect('é'.localeCompare('f')).toBeLessThan(0);
        });

        it('handles null, undefined, and identical strings consistently', () => {
            expect(ordinalCompare(null, null)).toBe(0);
            expect(ordinalCompare('a', 'a')).toBe(0);
            expect(ordinalCompare(null, 'a')).toBe(-1);
            expect(ordinalCompare('a', null)).toBe(1);
            expect(ordinalCompare(undefined, 'a')).toBe(-1);
        });
    });

    describe('sortBySequenceAndCreatedAt totality and tiebreakers', () => {
        it('breaks Sequence ties by Name, and Name ties by ID', () => {
            const items = [
                { Sequence: 10, Name: 'Beta', ID: 'id-2' },
                { Sequence: 10, Name: 'Beta', ID: 'id-1' }, // Duplicate Name, Sequence tie -> tiebreak by ID
                { Sequence: 10, Name: 'Alpha', ID: 'id-3' }, // Sequence tie -> tiebreak by Name
                { Sequence: 5, Name: 'First', ID: 'id-0' },
            ];

            const sorted = sortBySequenceAndCreatedAt(items);
            expect(sorted.map(s => `${s.Sequence}:${s.Name}:${s.ID}`)).toEqual([
                '5:First:id-0',
                '10:Alpha:id-3',
                '10:Beta:id-1',
                '10:Beta:id-2',
            ]);
        });

        it('is invariant to input array permutation', () => {
            const items = [
                { Sequence: 1, Name: 'C', ID: '3' },
                { Sequence: 1, Name: 'A', ID: '1' },
                { Sequence: 1, Name: 'B', ID: '2' },
            ];

            const sorted1 = sortBySequenceAndCreatedAt(items);
            const sorted2 = sortBySequenceAndCreatedAt([...items].reverse());

            expect(sorted1).toEqual(sorted2);
        });
    });

    describe('sortRelatedEntities totality and tiebreakers', () => {
        it('breaks Sequence ties by RelatedEntity name, and then by RelatedEntityJoinField, and then by ID', () => {
            const rels = [
                { Sequence: 10, RelatedEntity: 'Users', RelatedEntityJoinField: 'UserID', ID: 'r-2' },
                { Sequence: 10, RelatedEntity: 'Accounts', RelatedEntityJoinField: 'AccountID_B', ID: 'r-1b' },
                { Sequence: 10, RelatedEntity: 'Accounts', RelatedEntityJoinField: 'AccountID_A', ID: 'r-1a' },
            ];

            const sorted = sortRelatedEntities(rels);
            expect(sorted.map(r => r.ID)).toEqual(['r-1a', 'r-1b', 'r-2']);
        });
    });

    describe('static guard: no unlocalized localeCompare in CodeGenLib/src', () => {
        it('contains 0 unlocalized localeCompare calls across non-test source files', () => {
            const srcDir = path.resolve(__dirname, '..');
            const tsFiles = globSync('**/*.ts', {
                cwd: srcDir,
                ignore: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
                absolute: true,
            });

            const violations: Array<{ file: string; line: number; text: string }> = [];

            for (const file of tsFiles) {
                const content = fs.readFileSync(file, 'utf8');
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                    if (line.includes('.localeCompare(') && !line.includes('// locale-ok:')) {
                        violations.push({
                            file: path.relative(srcDir, file),
                            line: idx + 1,
                            text: line.trim(),
                        });
                    }
                });
            }

            expect(violations).toEqual([]);
        });
    });
});
