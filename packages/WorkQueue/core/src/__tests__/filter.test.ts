import { describe, it, expect } from 'vitest';
import { WORK_QUEUE_FILTER_SUPPORT, FilterFields, MatchesFilter, ParseSubscriptionFilter, ValidateSubscriptionFilter } from '../filter';
import { WorkQueueConfigurationError } from '../errors';
import type { FilterSupport, SubscriptionFilter } from '../filterTypes';

const NO_GROUPS: FilterSupport = { ...WORK_QUEUE_FILTER_SUPPORT, SingleFieldOrGroups: false };
const EQ_ONLY: FilterSupport = { ...WORK_QUEUE_FILTER_SUPPORT, Operators: ['eq'] };

describe('ParseSubscriptionFilter', () => {
    it('returns null for null or blank text', () => {
        expect(ParseSubscriptionFilter(null, WORK_QUEUE_FILTER_SUPPORT)).toBeNull();
        expect(ParseSubscriptionFilter('   ', WORK_QUEUE_FILTER_SUPPORT)).toBeNull();
    });

    it('parses the spec 03 §4 example: rules, a single-field OR group and a presence test', () => {
        const filter = ParseSubscriptionFilter(
            JSON.stringify({
                logic: 'and',
                filters: [
                    { field: 'eventType', operator: 'eq', value: 'click' },
                    { logic: 'or', filters: [
                        { field: 'tenant', operator: 'eq', value: 'acme' },
                        { field: 'tenant', operator: 'eq', value: 'globex' },
                    ] },
                    { field: 'campaign', operator: 'isnotnull', value: null },
                ],
            }),
            WORK_QUEUE_FILTER_SUPPORT,
        );
        expect(filter).toEqual({
            logic: 'and',
            filters: [
                { field: 'eventType', operator: 'eq', value: 'click' },
                { logic: 'or', filters: [
                    { field: 'tenant', operator: 'eq', value: 'acme' },
                    { field: 'tenant', operator: 'eq', value: 'globex' },
                ] },
                { field: 'campaign', operator: 'isnotnull' },
            ],
        });
    });

    it('normalises number and boolean values to strings', () => {
        const filter = ParseSubscriptionFilter(
            '{"logic":"and","filters":[{"field":"attempt","operator":"eq","value":2},{"field":"live","operator":"eq","value":true}]}',
            WORK_QUEUE_FILTER_SUPPORT,
        );
        expect(filter).toEqual({
            logic: 'and',
            filters: [
                { field: 'attempt', operator: 'eq', value: '2' },
                { field: 'live', operator: 'eq', value: 'true' },
            ],
        });
    });

    it('rejects text that is not JSON', () => {
        expect(() => ParseSubscriptionFilter('{logic:', WORK_QUEUE_FILTER_SUPPORT)).toThrow(WorkQueueConfigurationError);
    });

    it('rejects a root that is not a CompositeFilterDescriptor', () => {
        expect(() => ParseSubscriptionFilter('[]', WORK_QUEUE_FILTER_SUPPORT)).toThrow('Filter must be a CompositeFilterDescriptor');
        expect(() => ParseSubscriptionFilter('{"field":"a","operator":"eq","value":"1"}', WORK_QUEUE_FILTER_SUPPORT))
            .toThrow('Filter must be a CompositeFilterDescriptor');
    });

    it("rejects a root whose logic is not 'and'", () => {
        expect(() => ParseSubscriptionFilter('{"logic":"or","filters":[{"field":"a","operator":"eq","value":"1"}]}', WORK_QUEUE_FILTER_SUPPORT))
            .toThrow("Filter root logic must be 'and'");
    });

    it('rejects an operator the transport does not support, naming field and operator', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'tenant', operator: 'contains', value: 'acme' }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("Filter operator 'contains' on field 'tenant' is not supported");
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'tenant', operator: 'startswith', value: 'acme' }] },
            EQ_ONLY,
        )).toThrow("Filter operator 'startswith' on field 'tenant' is not supported");
    });

    it('rejects dotted multi-record field names', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'source.name', operator: 'eq', value: 'x' }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("Filter field 'source.name'");
    });

    it('rejects a group that mixes fields or uses an operator other than eq', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ logic: 'or', filters: [
                { field: 'tenant', operator: 'eq', value: 'acme' },
                { field: 'region', operator: 'eq', value: 'eu' },
            ] }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow('single field');
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ logic: 'or', filters: [
                { field: 'tenant', operator: 'eq', value: 'acme' },
                { field: 'tenant', operator: 'startswith', value: 'glo' },
            ] }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("only 'eq'");
    });

    it('rejects groups when the transport does not support them, and rejects deeper nesting', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ logic: 'or', filters: [{ field: 'a', operator: 'eq', value: '1' }] }] },
            NO_GROUPS,
        )).toThrow('does not support OR groups');
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ logic: 'or', filters: [
                { logic: 'or', filters: [{ field: 'a', operator: 'eq', value: '1' }] },
            ] }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow('nesting');
    });

    it('rejects a field constrained more than once', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [
                { field: 'tenant', operator: 'eq', value: 'acme' },
                { field: 'tenant', operator: 'startswith', value: 'ac' },
            ] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("Filter field 'tenant' is constrained more than once");
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [
                { field: 'tenant', operator: 'eq', value: 'acme' },
                { logic: 'or', filters: [
                    { field: 'tenant', operator: 'eq', value: 'globex' },
                    { field: 'tenant', operator: 'eq', value: 'initech' },
                ] },
            ] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow('constrained more than once');
    });

    it('rejects more fields or values than the transport allows', () => {
        const manyFields = { logic: 'and', filters: ['a', 'b', 'c', 'd', 'e', 'f'].map((field) => ({ field, operator: 'eq', value: '1' })) };
        expect(() => ValidateSubscriptionFilter(manyFields, WORK_QUEUE_FILTER_SUPPORT)).toThrow('at most 5 fields');

        const manyValues = {
            logic: 'and',
            filters: [{ logic: 'or', filters: Array.from({ length: 51 }, (_, i) => ({ field: 'tenant', operator: 'eq', value: `v${i}` })) }],
        };
        expect(() => ValidateSubscriptionFilter(manyValues, WORK_QUEUE_FILTER_SUPPORT)).toThrow('at most 50 values');
    });

    it('requires a value for eq, neq and startswith, and forbids one for isnull', () => {
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'a', operator: 'eq' }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("operator 'eq' on field 'a' requires a value");
        expect(() => ValidateSubscriptionFilter(
            { logic: 'and', filters: [{ field: 'a', operator: 'isnull', value: 'x' }] },
            WORK_QUEUE_FILTER_SUPPORT,
        )).toThrow("operator 'isnull' on field 'a' takes no value");
    });

    it('lists distinct fields', () => {
        const filter = ValidateSubscriptionFilter(
            { logic: 'and', filters: [
                { field: 'eventType', operator: 'eq', value: 'click' },
                { logic: 'or', filters: [
                    { field: 'tenant', operator: 'eq', value: 'acme' },
                    { field: 'tenant', operator: 'eq', value: 'globex' },
                ] },
            ] },
            WORK_QUEUE_FILTER_SUPPORT,
        );
        expect(FilterFields(filter)).toEqual(['eventType', 'tenant']);
        expect(FilterFields(null)).toEqual([]);
    });
});

describe('MatchesFilter', () => {
    const parse = (value: unknown): SubscriptionFilter => ValidateSubscriptionFilter(value, WORK_QUEUE_FILTER_SUPPORT);

    it('matches everything for a null or empty filter', () => {
        expect(MatchesFilter(null, {})).toBe(true);
        expect(MatchesFilter({ logic: 'and', filters: [] }, { eventType: 'click' })).toBe(true);
    });

    it('matches eq exactly', () => {
        const filter = parse({ logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] });
        expect(MatchesFilter(filter, { eventType: 'click' })).toBe(true);
        expect(MatchesFilter(filter, { eventType: 'open' })).toBe(false);
    });

    it('is case-sensitive, unlike MJ CompositeFilter', () => {
        const filter = parse({ logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] });
        expect(MatchesFilter(filter, { eventType: 'Click' })).toBe(false);
        const prefix = parse({ logic: 'and', filters: [{ field: 'tenant', operator: 'startswith', value: 'acme' }] });
        expect(MatchesFilter(prefix, { tenant: 'ACME-7' })).toBe(false);
    });

    it('matches neq only when the attribute is present and different', () => {
        const filter = parse({ logic: 'and', filters: [{ field: 'source', operator: 'neq', value: 'test' }] });
        expect(MatchesFilter(filter, { source: 'prod' })).toBe(true);
        expect(MatchesFilter(filter, { source: 'test' })).toBe(false);
        expect(MatchesFilter(filter, {})).toBe(false);
    });

    it('matches startswith', () => {
        const filter = parse({ logic: 'and', filters: [{ field: 'tenant', operator: 'startswith', value: 'acme-' }] });
        expect(MatchesFilter(filter, { tenant: 'acme-7' })).toBe(true);
        expect(MatchesFilter(filter, { tenant: 'globex' })).toBe(false);
    });

    it('matches isnull and isnotnull against missing and present attributes', () => {
        const present = parse({ logic: 'and', filters: [{ field: 'priority', operator: 'isnotnull' }] });
        const absent = parse({ logic: 'and', filters: [{ field: 'priority', operator: 'isnull' }] });
        expect(MatchesFilter(present, { priority: 'high' })).toBe(true);
        expect(MatchesFilter(present, {})).toBe(false);
        expect(MatchesFilter(absent, {})).toBe(true);
        expect(MatchesFilter(absent, { priority: 'high' })).toBe(false);
    });

    it('requires every top-level rule to match', () => {
        const filter = parse({ logic: 'and', filters: [
            { field: 'eventType', operator: 'eq', value: 'unsubscribe' },
            { field: 'provider', operator: 'eq', value: 'sendgrid' },
        ] });
        expect(MatchesFilter(filter, { eventType: 'unsubscribe', provider: 'sendgrid' })).toBe(true);
        expect(MatchesFilter(filter, { eventType: 'unsubscribe', provider: 'ses' })).toBe(false);
    });

    it('matches any value inside a single-field OR group', () => {
        const filter = parse({ logic: 'and', filters: [{ logic: 'or', filters: [
            { field: 'tenant', operator: 'eq', value: 'acme' },
            { field: 'tenant', operator: 'eq', value: 'globex' },
        ] }] });
        expect(MatchesFilter(filter, { tenant: 'globex' })).toBe(true);
        expect(MatchesFilter(filter, { tenant: 'initech' })).toBe(false);
    });

    it('fails every operator except isnull on a missing attribute', () => {
        for (const operator of ['eq', 'neq', 'startswith'] as const) {
            const filter = parse({ logic: 'and', filters: [{ field: 'tenant', operator, value: 'acme' }] });
            expect(MatchesFilter(filter, {})).toBe(false);
        }
        expect(MatchesFilter(parse({ logic: 'and', filters: [{ field: 'tenant', operator: 'isnull' }] }), {})).toBe(true);
    });
});
