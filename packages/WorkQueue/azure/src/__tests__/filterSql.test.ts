import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError, type FilterGroup, type FilterRule, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { NormalizeRuleSql, ServiceBusRuleSqlFor, SqlIdentifier, TargetingClause, ToServiceBusSqlFilter } from '../filterSql';

const Eq = (field: string, value: string): FilterRule => ({ field, operator: 'eq', value });
const And = (...filters: (FilterRule | FilterGroup)[]): SubscriptionFilter => ({ logic: 'and', filters });
const Or = (field: string, ...values: string[]): FilterGroup => ({ logic: 'or', filters: values.map(v => Eq(field, v)) });

describe('ToServiceBusSqlFilter', () => {
    it('translates eq and a single-field OR group', () => {
        expect(ToServiceBusSqlFilter(And(Eq('eventType', 'click')))).toBe("eventType = 'click'");
        expect(ToServiceBusSqlFilter(And(Or('eventType', 'click', 'open')))).toBe("eventType IN ('click', 'open')");
    });

    it('translates neq, startswith, isnotnull and isnull', () => {
        const filter = And(
            { field: 'source', operator: 'neq', value: 'test' },
            { field: 'tenant', operator: 'startswith', value: 'acme-' },
            { field: 'priority', operator: 'isnotnull' },
            { field: 'legacy', operator: 'isnull' },
        );
        expect(ToServiceBusSqlFilter(filter)).toBe(
            "(EXISTS(source) AND source <> 'test') AND tenant LIKE 'acme-%' ESCAPE '\\' AND EXISTS(priority) AND NOT EXISTS(legacy)",
        );
    });

    it('escapes quotes and LIKE wildcards in values and brackets non-identifier keys', () => {
        expect(ToServiceBusSqlFilter(And(Eq('name', "O'Brien")))).toBe("name = 'O''Brien'");
        expect(ToServiceBusSqlFilter(And({ field: 'code', operator: 'startswith', value: '100%_[a]\\' }))).toBe("code LIKE '100\\%\\_\\[a]\\\\%' ESCAPE '\\'");
        expect(ToServiceBusSqlFilter(And(Eq('my-key', '1')))).toBe("[my-key] = '1'");
        expect(SqlIdentifier('9lives')).toBe('[9lives]');
        expect(SqlIdentifier('plain_1')).toBe('plain_1');
    });

    it('preserves value case, because Service Bus compares strings ordinally', () => {
        expect(ToServiceBusSqlFilter(And(Eq('tenant', 'ACME')))).toBe("tenant = 'ACME'");
    });

    it('rejects an empty filter, a non-AND root, a field constrained twice and bad groups', () => {
        expect(() => ToServiceBusSqlFilter(And())).toThrow(WorkQueueConfigurationError);
        expect(() => ToServiceBusSqlFilter({ logic: 'or', filters: [Eq('a', '1')] })).toThrow('top level must use AND');
        expect(() => ToServiceBusSqlFilter(And(Eq('a', '1'), { field: 'a', operator: 'neq', value: '2' }))).toThrow("constrains 'a' more than once");
        expect(() => ToServiceBusSqlFilter(And({ logic: 'or', filters: [Eq('a', '1'), Eq('b', '2')] }))).toThrow('single field');
        expect(() => ToServiceBusSqlFilter(And({ field: 'a', operator: 'eq', value: null }))).toThrow('has no value');
    });
});

describe('ServiceBusRuleSqlFor', () => {
    it('wraps every rule in the targeting clause', () => {
        expect(TargetingClause('email.unsubscribe')).toBe("(NOT EXISTS(mj_target) OR mj_target = 'email.unsubscribe')");
        expect(ServiceBusRuleSqlFor(null, 'email.archive')).toBe("(NOT EXISTS(mj_target) OR mj_target = 'email.archive')");
        expect(ServiceBusRuleSqlFor(And(Eq('eventType', 'click')), 'email.dashboard'))
            .toBe("(NOT EXISTS(mj_target) OR mj_target = 'email.dashboard') AND (eventType = 'click')");
    });

    it('normalises whitespace for comparison', () => {
        expect(NormalizeRuleSql("  a =  'x'\n AND   b = 'y' ")).toBe("a = 'x' AND b = 'y'");
        expect(NormalizeRuleSql('   ')).toBeNull();
        expect(NormalizeRuleSql(undefined)).toBeNull();
    });
});
