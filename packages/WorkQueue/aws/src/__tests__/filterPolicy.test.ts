import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError, type FilterGroup, type FilterRule, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { NormalizeSnsFilterPolicy, SnsFilterPolicyFor, ToSnsFilterPolicy } from '../filterPolicy';

const Eq = (field: string, value: string): FilterRule => ({ field, operator: 'eq', value });
const And = (...filters: (FilterRule | FilterGroup)[]): SubscriptionFilter => ({ logic: 'and', filters });
const Or = (field: string, ...values: string[]): FilterGroup => ({ logic: 'or', filters: values.map(v => Eq(field, v)) });

describe('ToSnsFilterPolicy', () => {
    it('translates an eq rule and a single-field OR group', () => {
        expect(ToSnsFilterPolicy(And(Eq('eventType', 'click')))).toBe('{"eventType":["click"]}');
        expect(ToSnsFilterPolicy(And(Or('eventType', 'click', 'open')))).toBe('{"eventType":["click","open"]}');
    });

    it('translates neq, startswith, isnotnull and isnull', () => {
        const filter = And(
            { field: 'source', operator: 'neq', value: 'test' },
            { field: 'tenant', operator: 'startswith', value: 'acme-' },
            { field: 'priority', operator: 'isnotnull' },
            { field: 'legacy', operator: 'isnull' },
        );
        expect(JSON.parse(ToSnsFilterPolicy(filter))).toEqual({
            legacy: [{ exists: false }],
            priority: [{ exists: true }],
            source: [{ 'anything-but': ['test'] }],
            tenant: [{ prefix: 'acme-' }],
        });
    });

    it('preserves value case, because SNS matches case-sensitively', () => {
        expect(ToSnsFilterPolicy(And(Eq('tenant', 'ACME')))).toBe('{"tenant":["ACME"]}');
    });

    it('produces the same text regardless of the order fields appear in', () => {
        expect(ToSnsFilterPolicy(And(Eq('b', '2'), Eq('a', '1')))).toBe(ToSnsFilterPolicy(And(Eq('a', '1'), Eq('b', '2'))));
        expect(ToSnsFilterPolicy(And(Eq('b', '2'), Eq('a', '1')))).toBe('{"a":["1"],"b":["2"]}');
    });

    it('rejects an empty filter and a top level that is not AND', () => {
        expect(() => ToSnsFilterPolicy(And())).toThrow(WorkQueueConfigurationError);
        expect(() => ToSnsFilterPolicy({ logic: 'or', filters: [Eq('a', '1')] })).toThrow('top level must use AND');
    });

    it('rejects a field constrained twice, which SNS would widen into OR', () => {
        const filter = And(
            { field: 'tenant', operator: 'startswith', value: 'acme-' },
            { field: 'tenant', operator: 'neq', value: 'acme-test' },
        );
        expect(() => ToSnsFilterPolicy(filter)).toThrow("constrains 'tenant' more than once");
    });

    it('rejects a mixed-field OR group and a rule with no value', () => {
        expect(() => ToSnsFilterPolicy(And({ logic: 'or', filters: [Eq('a', '1'), Eq('b', '2')] }))).toThrow('single field');
        expect(() => ToSnsFilterPolicy(And({ field: 'a', operator: 'eq', value: null }))).toThrow('has no value');
    });

    it('rejects a filter with too many value combinations', () => {
        const wide = And(Or('a', '1', '2', '3', '4', '5', '6'), Or('b', '1', '2', '3', '4', '5', '6'), Or('c', '1', '2', '3', '4', '5'));
        expect(() => ToSnsFilterPolicy(wide)).toThrow('180 value combinations');
    });
});

describe('SnsFilterPolicyFor', () => {
    it('returns null when there is nothing to filter', () => {
        expect(SnsFilterPolicyFor(null)).toBeNull();
        expect(SnsFilterPolicyFor(And())).toBeNull();
        expect(SnsFilterPolicyFor(And(Eq('a', '1')))).toBe('{"a":["1"]}');
    });
});

describe('NormalizeSnsFilterPolicy', () => {
    it('ignores whitespace and key order, including inside condition objects', () => {
        const fromSns = '{ "tenant": [ { "prefix": "acme-" } ],\n "eventType": ["click"] }';
        expect(NormalizeSnsFilterPolicy(fromSns)).toBe(
            ToSnsFilterPolicy(And(Eq('eventType', 'click'), { field: 'tenant', operator: 'startswith', value: 'acme-' })),
        );
    });

    it('treats null, undefined, blank and an empty object as no policy', () => {
        expect(NormalizeSnsFilterPolicy(null)).toBeNull();
        expect(NormalizeSnsFilterPolicy(undefined)).toBeNull();
        expect(NormalizeSnsFilterPolicy('  ')).toBeNull();
        expect(NormalizeSnsFilterPolicy('{}')).toBeNull();
    });
});
