import { describe, it, expect } from 'vitest';
import {
    BuildQueryTemplateContext,
    FindQueryContextTokens,
    FindTemplateContextTokens,
    QueryContextCacheValues,
} from '../generic/queryTemplateContext';
import { CONTEXT_TOKENS } from '../generic/contextTokens';
import { SERVER_ONLY_RUN_QUERY_PARAMS, StripServerOnlyRunQueryParams } from '../generic/runQuery';

const USER = { ID: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', Email: 'ada@example.com', Name: 'Ada Lovelace' };
/** Wednesday 14 October 2026, mid-afternoon UTC. */
const NOW = new Date('2026-10-14T15:30:00.000Z');

describe('BuildQueryTemplateContext', () => {
    it('gives every token by its short name, from the user, the clock and the zone', () => {
        const { Context } = BuildQueryTemplateContext({ User: USER, Now: NOW, TimeZone: 'UTC' });
        expect({ ...Context }).toEqual({
            UserID: USER.ID, UserEmail: USER.Email, UserName: USER.Name,
            Now: '2026-10-14T15:30:00.000Z', Today: '2026-10-14', StartOfWeek: '2026-10-12',
            StartOfMonth: '2026-10-01', StartOfQuarter: '2026-10-01', StartOfYear: '2026-01-01',
        });
    });

    it('works a member out only when it is read, and reports exactly what was read', () => {
        const built = BuildQueryTemplateContext({ Now: NOW }); // no user: the user members would throw if touched
        expect(built.ReadValues()).toEqual({});
        expect(built.Context.Today).toBe('2026-10-14');
        expect(built.ReadValues()).toEqual({ Today: '2026-10-14' });
        expect(() => built.Context.UserID).toThrow('Context.UserID needs a context user');
    });

    it('reads the clock once, so Now is the same however often it is read', () => {
        const { Context } = BuildQueryTemplateContext({ User: USER });
        const first = Context.Now;
        expect(Context.Now).toBe(first);
    });

    it('cannot be changed by whoever holds it', () => {
        const { Context } = BuildQueryTemplateContext({ User: USER, Now: NOW });
        expect(() => { (Context as Record<string, string>).UserID = 'someone-else'; }).toThrow();
        expect(Context.UserID).toBe(USER.ID);
    });

    it('fails on an invalid zone only when a date member is read', () => {
        const { Context } = BuildQueryTemplateContext({ User: USER, Now: NOW, TimeZone: 'Not/AZone' });
        expect(Context.UserID).toBe(USER.ID);
        expect(() => Context.Today).toThrow('Invalid time zone');
    });
});

describe('FindTemplateContextTokens', () => {
    it('finds each member a template tag names', () => {
        expect(FindTemplateContextTokens("WHERE o = {{ Context.UserID | sqlString }} {% if Context.Today %}AND d = {{Context.StartOfMonth}}{% endif %}"))
            .toEqual(['Context.UserID', 'Context.Today', 'Context.StartOfMonth']);
    });

    it('ignores SQL outside template tags and template comments', () => {
        expect(FindTemplateContextTokens('SELECT Context, Context.UserID FROM T {# Context.Now #}')).toEqual([]);
        expect(FindTemplateContextTokens(null)).toEqual([]);
    });

    it('assumes every token when a tag reads Context any other way', () => {
        expect(FindTemplateContextTokens("{% set c = Context %}{{ c.UserID }}")).toEqual([...CONTEXT_TOKENS]);
        expect(FindTemplateContextTokens("{{ Context['UserID'] }}")).toEqual([...CONTEXT_TOKENS]);
    });
});

describe('FindQueryContextTokens', () => {
    const sql: Record<string, string[]> = {
        A: ['SELECT * FROM {{query:"B"}} x'],
        B: ['SELECT 1 WHERE u = {{ Context.UserID }}', 'SELECT 1 WHERE d = {{ Context.Today }}'], // base + a dialect variant
        C: ['SELECT {{ Context.StartOfYear }}'],
    };
    const composed: Record<string, string[]> = { A: ['B'], B: ['A'], C: [] };

    it('collects the tokens of a query, its dialect variants and what it composes, through cycles', () => {
        expect(FindQueryContextTokens('A', id => sql[id] ?? [], id => composed[id] ?? []))
            .toEqual(['Context.UserID', 'Context.Today']);
        expect(FindQueryContextTokens('C', id => sql[id] ?? [], id => composed[id] ?? [])).toEqual(['Context.StartOfYear']);
    });
});

describe('QueryContextCacheValues', () => {
    it('gives the values a cached result depends on, null for one that cannot be worked out', () => {
        expect(QueryContextCacheValues(['Context.UserID', 'Context.UserEmail', 'Context.Today'], { User: { ID: USER.ID }, Now: NOW }))
            .toEqual({ UserID: USER.ID, UserEmail: null, Today: '2026-10-14' });
    });

    it('differs by user and by day, so one slot never answers another user or another day', () => {
        const ada = QueryContextCacheValues(['Context.UserID'], { User: USER });
        const bob = QueryContextCacheValues(['Context.UserID'], { User: { ...USER, ID: 'b0b0b0b0-0000-4000-8000-000000000000' } });
        expect(ada).not.toEqual(bob);
        const today = QueryContextCacheValues(['Context.Today'], { Now: NOW });
        const tomorrow = QueryContextCacheValues(['Context.Today'], { Now: new Date('2026-10-15T15:30:00.000Z') });
        expect(today).not.toEqual(tomorrow);
    });

    it('is null when the query reads Context.Now: such a result is never reused', () => {
        expect(QueryContextCacheValues(['Context.UserID', 'Context.Now'], { User: USER, Now: NOW })).toBeNull();
    });
});

describe('SERVER_ONLY_RUN_QUERY_PARAMS', () => {
    it('lists TimeZone and ServerParameters, and the strip removes them and nothing else', () => {
        expect([...SERVER_ONLY_RUN_QUERY_PARAMS]).toEqual(['TimeZone', 'ServerParameters']);
        const stripped = StripServerOnlyRunQueryParams({
            QueryName: 'Members', Parameters: { Region: 'West' }, TimeZone: 'Europe/Paris', ServerParameters: { ChapterID: 3 },
        });
        expect(stripped).toEqual({ QueryName: 'Members', Parameters: { Region: 'West' } });
    });
});
