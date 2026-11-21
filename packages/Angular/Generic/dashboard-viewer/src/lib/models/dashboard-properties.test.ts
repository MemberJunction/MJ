import { describe, expect, it } from 'vitest';
import type { PropertyResolutionContext } from '@memberjunction/core';
import {
    DashboardPartInput,
    DashboardProperty,
    DashboardPropertyResolver,
    FillUrlPlaceholders,
    GetInputMappings,
    IsTypeCompatible,
    MappingProblem,
    NormalizeEventValue,
    ParseUrlPlaceholders,
    PartInputProblemMessage,
    PartInputResolutionKey,
    ResolvePartInputs,
    SqlTypeToValueType,
    ComponentTypeToValueType,
} from './dashboard-properties';

/** 2026-03-31 15:00 UTC: in New York it is still the 31st; in Tokyo it is 1 April. */
const NOW = new Date('2026-03-31T15:00:00Z');
const USER = { ID: '6E2C3B1A-1111-4A2B-8C3D-000000000001', Email: 'pat@example.com', Name: 'Pat' };
const ctx = (timeZone = 'America/New_York'): PropertyResolutionContext => ({ User: USER, Now: NOW, TimeZone: timeZone });

const CHAPTER_A = 'A1B2C3D4-0000-4000-8000-00000000000A';
const CHAPTER_B = 'A1B2C3D4-0000-4000-8000-00000000000B';
const CHAPTER_C = 'A1B2C3D4-0000-4000-8000-00000000000C';

function input(name: string, extra: Partial<DashboardPartInput> = {}): DashboardPartInput {
    return { Name: name, Type: 'uuid', IsRequired: false, HasOwnDefault: false, ServerSet: false, ...extra };
}

const chapter: DashboardProperty = { Name: 'Chapter', Type: 'uuid', Default: { Value: CHAPTER_C } };
const since: DashboardProperty = { Name: 'Since', Type: 'date', Default: { Token: 'Context.StartOfMonth' } };

describe('DashboardPropertyResolver (the dashboard-level order)', () => {
    it('gives the host value first', () => {
        const r = new DashboardPropertyResolver([chapter], () => ctx());
        r.SetHostValues({ Chapter: CHAPTER_A });
        r.SetEventValue('Chapter', CHAPTER_B, 'left');
        expect(r.ValuesFor('right').Chapter).toBe(CHAPTER_A);
    });

    it('gives an event value after the host value and before the property default', () => {
        const r = new DashboardPropertyResolver([chapter], () => ctx());
        expect(r.ValuesFor('right').Chapter).toBe(CHAPTER_C);
        r.SetEventValue('Chapter', CHAPTER_B, 'left');
        expect(r.ValuesFor('right').Chapter).toBe(CHAPTER_B);
    });

    it('treats a null or undefined host value as not set', () => {
        const r = new DashboardPropertyResolver([chapter], () => ctx());
        r.SetHostValues({ Chapter: null });
        expect(r.ValuesFor(null).Chapter).toBe(CHAPTER_C);
    });

    it('returns the property to its default when the selection is cleared', () => {
        const r = new DashboardPropertyResolver([chapter], () => ctx());
        r.SetEventValue('Chapter', CHAPTER_B, 'left');
        r.SetEventValue('Chapter', null, 'left');
        expect(r.ValuesFor('right').Chapter).toBe(CHAPTER_C);
    });

    it('lets a panel clear only the value its own event set', () => {
        const r = new DashboardPropertyResolver([chapter], () => ctx());
        r.SetEventValue('Chapter', CHAPTER_B, 'left');
        r.ClearEventValue('Chapter', 'other');
        expect(r.ValuesFor('right').Chapter).toBe(CHAPTER_B);
    });

    it('never shows a panel the value its own event set (no loops)', () => {
        const r = new DashboardPropertyResolver([chapter], () => ctx());
        r.SetEventValue('Chapter', CHAPTER_B, 'left');
        expect(r.ValuesFor('left').Chapter).toBe(CHAPTER_C);
        expect(r.ValuesFor('right').Chapter).toBe(CHAPTER_B);
    });

    it('works out a token default in the browser with the given zone', () => {
        const r = new DashboardPropertyResolver([since], () => ctx('America/New_York'));
        expect(r.ValuesFor(null).Since).toBe('2026-03-01');
        const tokyo = new DashboardPropertyResolver([since], () => ctx('Asia/Tokyo'));
        expect(tokyo.ValuesFor(null).Since).toBe('2026-04-01');
    });

    it('gives null for a property with no value and no default', () => {
        const r = new DashboardPropertyResolver([{ Name: 'Free', Type: 'string' }], () => ctx());
        expect(r.ValuesFor(null)).toEqual({ Free: null });
    });

    it('clears every event value at once', () => {
        const r = new DashboardPropertyResolver([chapter], () => ctx());
        r.SetEventValue('Chapter', CHAPTER_B, 'left');
        r.ClearEventValues();
        expect(r.ValuesFor('right').Chapter).toBe(CHAPTER_C);
    });

    it('drops event values of properties that no longer exist', () => {
        const r = new DashboardPropertyResolver([chapter], () => ctx());
        r.SetEventValue('Chapter', CHAPTER_B, 'left');
        r.SetProperties([]);
        r.SetProperties([chapter]);
        expect(r.ValuesFor('right').Chapter).toBe(CHAPTER_C);
    });
});

describe('ResolvePartInputs (the part-level order)', () => {
    const properties = [chapter, since];

    it('feeds inputs under the part\'s own names', () => {
        const res = ResolvePartInputs([input('ChapterID')], [{ Input: 'ChapterID', Property: 'Chapter' }], properties, { Chapter: CHAPTER_A }, ctx());
        expect(res).toEqual({ Values: { ChapterID: CHAPTER_A }, Missing: [], Broken: [] });
    });

    it('uses the mapping default when the property has no value', () => {
        const res = ResolvePartInputs(
            [input('ChapterID')],
            [{ Input: 'ChapterID', Property: 'Chapter', Default: { Value: CHAPTER_B } }],
            properties, { Chapter: null }, ctx(),
        );
        expect(res.Values).toEqual({ ChapterID: CHAPTER_B });
    });

    it('takes a mapping with a Default and no Property from its default alone', () => {
        const res = ResolvePartInputs([input('ChapterID')], [{ Input: 'ChapterID', Default: { Value: CHAPTER_B } }], properties, { Chapter: CHAPTER_A }, ctx());
        expect(res.Values).toEqual({ ChapterID: CHAPTER_B });
    });

    it('works out a token mapping default in the browser', () => {
        const res = ResolvePartInputs([input('From', { Type: 'date' })], [{ Input: 'From', Default: { Token: 'Context.Today', Offset: { Amount: -30, Unit: 'day' } } }], properties, {}, ctx());
        expect(res.Values).toEqual({ From: '2026-03-01' });
    });

    it('leaves an input to its own default when nothing above gives a value', () => {
        const res = ResolvePartInputs([input('ChapterID', { HasOwnDefault: true, IsRequired: true })], [{ Input: 'ChapterID', Property: 'Chapter' }], properties, { Chapter: null }, ctx());
        expect(res).toEqual({ Values: {}, Missing: [], Broken: [] });
    });

    it('names a required input with no value as missing', () => {
        const res = ResolvePartInputs([input('ChapterID', { IsRequired: true })], [{ Input: 'ChapterID', Property: 'Chapter' }], properties, { Chapter: null }, ctx());
        expect(res.Missing).toEqual(['ChapterID']);
        expect(PartInputProblemMessage(res)).toBe('Missing a value for "ChapterID".');
    });

    it('leaves an unmapped query parameter to the user, but not a URL placeholder', () => {
        const res = ResolvePartInputs(
            [input('chapter_id', { IsRequired: true, UserCanFill: true }), input('Slug', { Type: 'any', IsRequired: true })],
            [{ Input: 'Other', Default: { Value: 'x' } }],
            properties, {}, ctx(),
        );
        expect(res.Missing).toEqual(['Slug']);
    });

    it('never counts a server-set input as missing', () => {
        const res = ResolvePartInputs([input('Locked', { IsRequired: true, ServerSet: true })], [{ Input: 'X', Default: { Value: 1 } }], properties, {}, ctx());
        expect(res.Missing).toEqual([]);
    });

    it('shows a mapping to an input the part no longer declares as broken (a view property renamed)', () => {
        const res = ResolvePartInputs([input('ChapterKey')], [{ Input: 'ChapterID', Property: 'Chapter' }], properties, { Chapter: CHAPTER_A }, ctx());
        expect(res.Values).toEqual({});
        expect(res.Broken).toEqual(['Input "ChapterID" is not one the part declares.']);
        expect(PartInputProblemMessage(res)).toContain('ChapterID');
    });
});

describe('MappingProblem', () => {
    it('refuses a server-set input, a missing property and mismatched types', () => {
        expect(MappingProblem({ Input: 'L', Property: 'Chapter' }, [input('L', { ServerSet: true })], [chapter])).toContain('set by the server');
        expect(MappingProblem({ Input: 'C', Property: 'Nope' }, [input('C')], [chapter])).toContain('doesn\'t have');
        expect(MappingProblem({ Input: 'N', Property: 'Chapter' }, [input('N', { Type: 'number' })], [chapter])).toContain('can\'t take');
        expect(MappingProblem({ Input: 'C', Property: 'Chapter' }, [input('C')], [chapter])).toBeNull();
    });
});

describe('type helpers', () => {
    it('lets a uuid or date fill a string, and any fill anything', () => {
        expect(IsTypeCompatible('uuid', 'string')).toBe(true);
        expect(IsTypeCompatible('date', 'string')).toBe(true);
        expect(IsTypeCompatible('string', 'uuid')).toBe(false);
        expect(IsTypeCompatible('number', 'any')).toBe(true);
        expect(IsTypeCompatible('any', 'number')).toBe(true);
        expect(IsTypeCompatible('string', 'unsupported')).toBe(false);
    });

    it('maps SQL and component types', () => {
        expect(SqlTypeToValueType('uniqueidentifier')).toBe('uuid');
        expect(SqlTypeToValueType('nvarchar(100)')).toBe('string');
        expect(SqlTypeToValueType('datetimeoffset')).toBe('date');
        expect(SqlTypeToValueType('bit')).toBe('boolean');
        expect(SqlTypeToValueType('decimal')).toBe('number');
        expect(SqlTypeToValueType('geography')).toBe('any');
        expect(ComponentTypeToValueType('string')).toBe('string');
        expect(ComponentTypeToValueType('any')).toBe('any');
        expect(ComponentTypeToValueType('Array<string>')).toBe('unsupported');
    });

    it('normalizes event values', () => {
        expect(NormalizeEventValue(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
        expect(NormalizeEventValue(5)).toBe(5);
        expect(NormalizeEventValue({ a: 1 })).toBeNull();
        expect(NormalizeEventValue(undefined)).toBeNull();
    });
});

describe('URL placeholders', () => {
    it('finds each placeholder once and fills it URL-encoded', () => {
        const url = 'https://example.com/{Chapter}/members?q={Search}&c={Chapter}';
        expect(ParseUrlPlaceholders(url)).toEqual(['Chapter', 'Search']);
        expect(FillUrlPlaceholders(url, { Chapter: 'a/b', Search: 'x y&z' })).toBe('https://example.com/a%2Fb/members?q=x%20y%26z&c=a%2Fb');
    });

    it('leaves a placeholder without a value as it is', () => {
        expect(FillUrlPlaceholders('https://e.com/{A}', {})).toBe('https://e.com/{A}');
    });
});

describe('GetInputMappings and PartInputResolutionKey', () => {
    it('reads the mappings from a part config, empty when there are none', () => {
        expect(GetInputMappings({ type: 'View' })).toEqual([]);
        expect(GetInputMappings({ type: 'View', inputMappings: [{ Input: 'A', Property: 'B' }] })).toEqual([{ Input: 'A', Property: 'B' }]);
        expect(GetInputMappings(null)).toEqual([]);
    });

    it('keys equal resolutions equally, whatever the key order', () => {
        const a = PartInputResolutionKey({ Values: { X: 1, Y: 2 }, Missing: [], Broken: [] });
        const b = PartInputResolutionKey({ Values: { Y: 2, X: 1 }, Missing: [], Broken: [] });
        expect(a).toBe(b);
        expect(PartInputResolutionKey(null)).toBe('');
    });
});
