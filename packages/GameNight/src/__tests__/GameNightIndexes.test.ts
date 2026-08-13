import { describe, expect, it } from 'vitest';
import { GroupByField, IndexByField, IndexByID, NormalizeKey } from '../GameNightIndexes.js';

type Game = { ID: string; Name: string; Category: string | null };
type Player = { ID: string; Nickname: string | null };

const WINGSPAN: Game = { ID: 'B6A00003-0000-4000-8000-000000000001', Name: 'Wingspan', Category: 'Strategy' };
const CODENAMES: Game = { ID: 'b6a00003-0000-4000-8000-000000000010', Name: 'Codenames', Category: 'Party' };
const WAVELENGTH: Game = { ID: 'B6A00003-0000-4000-8000-000000000020', Name: 'Wavelength', Category: 'Party' };
const UNCATEGORIZED: Game = { ID: 'B6A00003-0000-4000-8000-000000000099', Name: 'Mystery', Category: null };

describe('NormalizeKey', () => {
    it('lowercases and trims so mixed-case GUIDs still match', () => {
        expect(NormalizeKey('  ABC-DEF  ')).toBe('abc-def');
    });

    it('maps null and undefined to empty rather than throwing', () => {
        expect(NormalizeKey(null)).toBe('');
        expect(NormalizeKey(undefined)).toBe('');
    });
});

describe('IndexByID', () => {
    it('finds a record regardless of the casing the caller passes', () => {
        const idx = IndexByID([WINGSPAN, CODENAMES]);
        // Stored uppercase, queried lowercase — the real MJ failure mode this guards.
        expect(idx.get(NormalizeKey('b6a00003-0000-4000-8000-000000000001'))?.Name).toBe('Wingspan');
        // Stored lowercase, queried uppercase.
        expect(idx.get(NormalizeKey('B6A00003-0000-4000-8000-000000000010'))?.Name).toBe('Codenames');
    });

    it('returns undefined for an unknown ID', () => {
        expect(IndexByID([WINGSPAN]).get(NormalizeKey('nope'))).toBeUndefined();
    });

    it('handles an empty input', () => {
        expect(IndexByID([]).size).toBe(0);
    });
});

describe('GroupByField', () => {
    it('groups games by category and preserves input order within a group', () => {
        const groups = GroupByField([WINGSPAN, CODENAMES, WAVELENGTH], (g) => g.Category);
        expect(groups.get('party')?.map((g) => g.Name)).toEqual(['Codenames', 'Wavelength']);
        expect(groups.get('strategy')?.map((g) => g.Name)).toEqual(['Wingspan']);
    });

    it('skips records with a null key instead of inventing an empty bucket', () => {
        const groups = GroupByField([WINGSPAN, UNCATEGORIZED], (g) => g.Category);
        expect(groups.has('')).toBe(false);
        expect(groups.size).toBe(1);
    });
});

describe('IndexByField', () => {
    const cait: Player = { ID: '1', Nickname: 'Cait' };
    const caitDupe: Player = { ID: '2', Nickname: 'cait' };
    const noNick: Player = { ID: '3', Nickname: null };

    it('looks up case-insensitively', () => {
        const idx = IndexByField([cait], (p) => p.Nickname);
        expect(idx.get(NormalizeKey('CAIT'))?.ID).toBe('1');
    });

    it('keeps the FIRST match on a collision so results are stable across reloads', () => {
        const idx = IndexByField([cait, caitDupe], (p) => p.Nickname);
        expect(idx.get('cait')?.ID).toBe('1');
    });

    it('skips records with no value for the field', () => {
        const idx = IndexByField([noNick], (p) => p.Nickname);
        expect(idx.size).toBe(0);
    });
});
