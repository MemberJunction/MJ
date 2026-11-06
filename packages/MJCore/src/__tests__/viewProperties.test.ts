import { describe, it, expect } from 'vitest';
import { GetDialect } from '@memberjunction/sql-dialect';
import type { UserViewProperty } from '../generic/contextTokens';
import {
    BuildViewPropertyFilter,
    HasViewPropertyValues,
    ResolveViewPropertyValues,
    ValidateUserViewProperties,
    ViewPropertyValues,
    ViewPropertyValuesKey,
} from '../views/viewProperties';
import { LocalCacheManager } from '../generic/localCacheManager';
import { RunViewParams, SERVER_ONLY_RUN_VIEW_PARAMS, StripServerOnlyRunViewParams } from '../views/runView';

const SS = GetDialect('sqlserver');
const PG = GetDialect('postgresql');
const FIELDS = ['ID', 'ChapterID', 'Name', 'Age', 'IsActive', 'JoinedAt'];
const USER = { ID: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', Email: 'ada@example.com', Name: 'Ada Lovelace' };
const CHAPTER_A = '11111111-1111-4111-8111-111111111111';
const CHAPTER_B = '22222222-2222-4222-8222-222222222222';
/** 00:30 on 15 October in Paris, still 14 October in UTC. */
const NOW = new Date('2026-10-14T22:30:00.000Z');

function prop(overrides: Partial<UserViewProperty>): UserViewProperty {
    return { Name: 'P', Type: 'string', Target: { Field: 'Name', Operator: '=' }, ...overrides };
}

const chapter = prop({ Name: 'Chapter', Type: 'uuid', Target: { Field: 'ChapterID', Operator: '=' } });
const lockedChapter = prop({ ...chapter, AllowOverride: false });

function resolve(declared: UserViewProperty[], client?: ViewPropertyValues, server?: ViewPropertyValues, timeZone?: string): ViewPropertyValues {
    return ResolveViewPropertyValues(declared, client, server, { User: USER, Now: NOW, TimeZone: timeZone });
}

function sql(declared: UserViewProperty[], client?: ViewPropertyValues, dialect = SS): string {
    return BuildViewPropertyFilter(declared, resolve(declared, client), FIELDS, dialect);
}

describe('BuildViewPropertyFilter: the SQL each operator and type produces', () => {
    it.each([
        ['=', `[Name] = 'Ada'`],
        ['<>', `[Name] <> 'Ada'`],
        ['>', `[Name] > 'Ada'`],
        ['>=', `[Name] >= 'Ada'`],
        ['<', `[Name] < 'Ada'`],
        ['<=', `[Name] <= 'Ada'`],
    ] as const)('string %s', (operator, expected) => {
        expect(sql([prop({ Target: { Field: 'Name', Operator: operator } })], { P: 'Ada' })).toBe(expected);
    });

    it('string escapes quotes and gets the N prefix for non-ASCII on SQL Server only', () => {
        expect(sql([prop({})], { P: "O'Brien; DROP TABLE x--" })).toBe(`[Name] = 'O''Brien; DROP TABLE x--'`);
        expect(sql([prop({})], { P: 'Zoë' })).toBe(`[Name] = N'Zoë'`);
        expect(sql([prop({})], { P: 'Zoë' }, PG)).toBe(`"Name" = 'Zoë'`);
    });

    it('number is a bare literal', () => {
        const age = prop({ Name: 'MinAge', Type: 'number', Target: { Field: 'Age', Operator: '>=' } });
        expect(sql([age], { MinAge: 21.5 })).toBe('[Age] >= 21.5');
        expect(sql([age], { MinAge: -3 })).toBe('[Age] >= -3');
    });

    it('boolean uses each platform literal', () => {
        const active = prop({ Name: 'Active', Type: 'boolean', Target: { Field: 'IsActive', Operator: '=' } });
        expect(sql([active], { Active: true })).toBe('[IsActive] = 1');
        expect(sql([active], { Active: false }, PG)).toBe('"IsActive" = false');
    });

    it('date keeps a calendar date and writes an instant in UTC', () => {
        const since = prop({ Name: 'Since', Type: 'date', Target: { Field: 'JoinedAt', Operator: '>=' } });
        expect(sql([since], { Since: '2026-09-01' })).toBe(`[JoinedAt] >= '2026-09-01'`);
        expect(sql([since], { Since: '2026-09-01T10:00:00+02:00' })).toBe(`[JoinedAt] >= '2026-09-01T08:00:00.000Z'`);
    });

    it('uuid, with = and IN, on both platforms', () => {
        expect(sql([chapter], { Chapter: CHAPTER_A })).toBe(`[ChapterID] = '${CHAPTER_A}'`);
        const chapters = prop({ ...chapter, Name: 'Chapters', Target: { Field: 'ChapterID', Operator: 'IN' } });
        expect(sql([chapters], { Chapters: [CHAPTER_A, CHAPTER_B] }, PG)).toBe(`"ChapterID" IN ('${CHAPTER_A}', '${CHAPTER_B}')`);
        expect(sql([chapters], { Chapters: CHAPTER_A })).toBe(`[ChapterID] IN ('${CHAPTER_A}')`);
    });

    it('an empty IN list matches nothing', () => {
        const chapters = prop({ ...chapter, Name: 'Chapters', Target: { Field: 'ChapterID', Operator: 'IN' } });
        expect(sql([chapters], { Chapters: [] })).toBe('1 = 0');
    });

    it('ANDs one predicate per property with a value and skips the ones without', () => {
        const name = prop({ Name: 'Name' });
        expect(sql([chapter, name], { Chapter: CHAPTER_A, Name: 'Ada' })).toBe(`[ChapterID] = '${CHAPTER_A}' AND [Name] = 'Ada'`);
        expect(sql([chapter, name], { Name: 'Ada' })).toBe(`[Name] = 'Ada'`);
        expect(sql([chapter, name])).toBe('');
    });

    it('uses the field name as the entity spells it', () => {
        expect(sql([prop({ Target: { Field: 'name', Operator: '=' } })], { P: 'Ada' })).toBe(`[Name] = 'Ada'`);
    });

    it('refuses a target that is not a field of the entity', () => {
        expect(() => sql([prop({ Target: { Field: 'Nope', Operator: '=' } })], { P: 'x' })).toThrow(/"P" targets "Nope"/);
    });

    it('checks values again, whoever resolved them', () => {
        expect(() => BuildViewPropertyFilter([chapter], { Chapter: "x' OR 1=1 --" }, FIELDS, SS)).toThrow(/needs a uuid value/);
    });
});

describe('ResolveViewPropertyValues: refusals', () => {
    it.each([
        ['uuid', chapter, { Chapter: 'not-a-uuid' }],
        ['number', prop({ Type: 'number', Target: { Field: 'Age', Operator: '=' } }), { P: '21' }],
        ['number', prop({ Type: 'number', Target: { Field: 'Age', Operator: '=' } }), { P: Number.NaN }],
        ['boolean', prop({ Type: 'boolean', Target: { Field: 'IsActive', Operator: '=' } }), { P: 'true' }],
        ['date', prop({ Type: 'date', Target: { Field: 'JoinedAt', Operator: '=' } }), { P: '2026-02-30' }],
        ['string', prop({}), { P: 42 }],
    ] as const)('a wrong-typed %s value', (_type, declared, values) => {
        expect(() => resolve([declared], values as ViewPropertyValues)).toThrow(/needs a .* value/);
    });

    it('a list for an operator other than IN', () => {
        expect(() => resolve([chapter], { Chapter: [CHAPTER_A] })).toThrow(/only the IN operator takes a list/);
    });

    it('an object value', () => {
        expect(() => resolve([prop({})], { P: { a: 1 } as unknown as string })).toThrow(/needs a string value/);
    });

    it('an unknown name, in either map', () => {
        expect(() => resolve([chapter], { Region: 'x' })).toThrow(/Unknown view property "Region" in Properties\. The view declares: Chapter\./);
        expect(() => resolve([chapter], undefined, { Region: 'x' })).toThrow(/Unknown view property "Region" in ServerProperties/);
        expect(() => resolve([], { Region: 'x' })).toThrow(/declares no properties/);
    });

    it('a required property with no value', () => {
        expect(() => resolve([prop({ ...chapter, IsRequired: true })])).toThrow(/"Chapter" is required and has no value/);
        expect(() => resolve([prop({ ...chapter, IsRequired: true })], { Chapter: null })).toThrow(/is required/);
    });

    it('a client value for a property that does not allow override, even null, even with a server value', () => {
        expect(() => resolve([lockedChapter], { Chapter: CHAPTER_B })).toThrow(/"Chapter" is set by the server; a client value for it is refused/);
        expect(() => resolve([lockedChapter], { Chapter: null })).toThrow(/is set by the server/);
        expect(() => resolve([lockedChapter], { Chapter: CHAPTER_B }, { Chapter: CHAPTER_A })).toThrow(/is set by the server/);
    });
});

describe('ResolveViewPropertyValues: where each value comes from', () => {
    it('a non-overridable property takes the server value', () => {
        expect(resolve([lockedChapter], undefined, { Chapter: CHAPTER_A })).toEqual({ Chapter: CHAPTER_A });
    });

    it('a server value wins over a client value for a property that allows override', () => {
        expect(resolve([chapter], { Chapter: CHAPTER_B }, { Chapter: CHAPTER_A })).toEqual({ Chapter: CHAPTER_A });
    });

    it('a fixed default applies when the run gives no value; null means no value and skips it', () => {
        const withDefault = prop({ ...chapter, Default: { Value: CHAPTER_A } });
        expect(resolve([withDefault])).toEqual({ Chapter: CHAPTER_A });
        expect(resolve([withDefault], { Chapter: null })).toEqual({ Chapter: null });
        expect(resolve([prop({ ...chapter, Default: { Value: null } })])).toEqual({ Chapter: null });
    });

    it('a token default is worked out with the context user, the clock and the zone (UTC when none)', () => {
        const since = prop({ Name: 'Since', Type: 'date', Target: { Field: 'JoinedAt', Operator: '>=' }, Default: { Token: 'Context.Today', Offset: { Amount: -30, Unit: 'day' } } });
        expect(resolve([since])).toEqual({ Since: '2026-09-14' });
        expect(resolve([since], undefined, undefined, 'Europe/Paris')).toEqual({ Since: '2026-09-15' });
        const owner = prop({ Name: 'Owner', Type: 'uuid', Target: { Field: 'ID', Operator: '=' }, Default: { Token: 'Context.UserID' }, AllowOverride: false });
        expect(resolve([owner])).toEqual({ Owner: USER.ID });
        expect(sql([since])).toBe(`[JoinedAt] >= '2026-09-14'`);
    });

    it('a token default that cannot be worked out refuses the run, naming the property', () => {
        const owner = prop({ Name: 'Owner', Type: 'uuid', Target: { Field: 'ID', Operator: '=' }, Default: { Token: 'Context.UserID' } });
        expect(() => ResolveViewPropertyValues([owner], undefined, undefined, { Now: NOW })).toThrow(/"Owner": its default cannot be worked out/);
    });
});

describe('ValidateUserViewProperties (save)', () => {
    it('accepts no properties and a valid list', () => {
        expect(ValidateUserViewProperties(null, FIELDS)).toEqual([]);
        expect(ValidateUserViewProperties(undefined, FIELDS)).toEqual([]);
        expect(ValidateUserViewProperties([chapter, prop({ Name: 'Since', Type: 'date', Target: { Field: 'JoinedAt', Operator: '>=' }, Default: { Token: 'Context.StartOfMonth', Offset: { Amount: -1, Unit: 'month' } } })], FIELDS)).toEqual([]);
    });

    it('reports each problem, naming the property', () => {
        const errors = ValidateUserViewProperties([
            prop({ Name: 'Chapter', Type: 'uuid', Target: { Field: 'Nope', Operator: '>' } }),
            prop({ Name: 'chapter' }),
            prop({ Name: ' ' }),
            prop({ Name: 'Bad', Type: 'text' as UserViewProperty['Type'] }),
            prop({ Name: 'Flag', Type: 'boolean', Target: { Field: 'IsActive', Operator: 'IN' } }),
            prop({ Name: 'Since', Type: 'date', Target: { Field: 'JoinedAt', Operator: '=' }, Default: { Token: 'Context.UserID' } }),
            prop({ Name: 'Who', Default: { Token: 'Context.UserName', Offset: { Amount: 1, Unit: 'day' } } }),
            prop({ Name: 'Age', Type: 'number', Target: { Field: 'Age', Operator: '=' }, Default: { Value: 'old' } }),
            prop({ Name: 'Flags', IsRequired: 'yes' as unknown as boolean }),
        ], FIELDS);
        expect(errors).toEqual([
            'Property "Chapter": Target.Field "Nope" is not a field of the view\'s entity.',
            'Property "Chapter": Target.Operator > does not apply to a uuid property. Allowed: =, <>, IN.',
            'Property "chapter": another property has the same name.',
            'Property 3: Name is required.',
            'Property "Bad": Type must be one of string, number, boolean, date, uuid.',
            'Property "Flag": Target.Operator IN does not apply to a boolean property. Allowed: =, <>.',
            'Property "Since": Context.UserID cannot default a date property.',
            'Property "Who": Context.UserName cannot take an offset; offsets apply to date tokens only.',
            'Property "Age": Value "old" is not a valid number.',
            'Property "Flags": IsRequired must be true or false.',
        ]);
    });

    it('refuses a value that is not a list, and a missing target', () => {
        expect(ValidateUserViewProperties({}, FIELDS)).toEqual(['Properties must be a list.']);
        expect(ValidateUserViewProperties([{ Name: 'X', Type: 'string' }], FIELDS)).toEqual(['Property "X": Target is required, with a Field and an Operator.']);
    });
});

describe('Result-cache fingerprint and params', () => {
    const cache = LocalCacheManager.Instance;
    const base: RunViewParams = { ViewID: 'view-1', EntityName: 'Members' };

    it('a run without properties keeps its exact fingerprint', () => {
        expect(cache.GenerateRunViewFingerprint(base, 'conn://x/')).toBe('Members|_|_|-1|0|_|_|vw:view-1|conn://x/');
        expect(cache.GenerateRunViewFingerprint({ ...base, Properties: {}, ServerProperties: {} }, 'conn://x/')).toBe('Members|_|_|-1|0|_|_|vw:view-1|conn://x/');
    });

    it('differs for each chapter, from either map, and orders names canonically', () => {
        const a = cache.GenerateRunViewFingerprint({ ...base, ServerProperties: { Chapter: CHAPTER_A } });
        const b = cache.GenerateRunViewFingerprint({ ...base, ServerProperties: { Chapter: CHAPTER_B } });
        const clientA = cache.GenerateRunViewFingerprint({ ...base, Properties: { Chapter: CHAPTER_A } });
        expect(a).not.toBe(b);
        expect(a).not.toBe(clientA);
        expect(a).toContain(CHAPTER_A);
        const xy = ViewPropertyValuesKey({ X: 1, Y: 2 });
        expect(ViewPropertyValuesKey({ Y: 2, X: 1 })).toBe(xy);
    });

    it('RunViewParams.Equals compares property values', () => {
        expect(RunViewParams.Equals({ ...base, Properties: { Chapter: CHAPTER_A } }, { ...base, Properties: { Chapter: CHAPTER_A } })).toBe(true);
        expect(RunViewParams.Equals({ ...base, Properties: { Chapter: CHAPTER_A } }, { ...base, Properties: { Chapter: CHAPTER_B } })).toBe(false);
        expect(RunViewParams.Equals(base, { ...base })).toBe(true);
    });

    it('ServerProperties is server-only: a client body loses it', () => {
        expect(SERVER_ONLY_RUN_VIEW_PARAMS).toContain('ServerProperties');
        const stripped = StripServerOnlyRunViewParams({ ...base, Properties: { Chapter: CHAPTER_A }, ServerProperties: { Chapter: CHAPTER_B } });
        expect(stripped.ServerProperties).toBeUndefined();
        expect(stripped.Properties).toEqual({ Chapter: CHAPTER_A });
    });

    it('HasViewPropertyValues ignores empty maps and undefined values', () => {
        expect(HasViewPropertyValues(undefined)).toBe(false);
        expect(HasViewPropertyValues({ A: undefined as unknown as null })).toBe(false);
        expect(HasViewPropertyValues({ A: null })).toBe(true);
    });
});
