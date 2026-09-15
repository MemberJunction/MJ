import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import type { MJUserViewEntity_IGridAggregate as ViewGridAggregate } from '@memberjunction/core-entities';
import { AggregatePanelComponent } from '../lib/aggregate-panel/aggregate-panel.component';
import { AggregateFieldName, AggregateField } from '../lib/utils/aggregate-field.util';

/**
 * THE AGGREGATE PANEL HAD NO WAY TO KNOW A COLUMN'S TYPE (MJ#4210).
 *
 * An aggregate carries an expression and a value, never field metadata. And the value of a date
 * aggregate reaches the browser as an ISO string, because the server JSON-stringifies it and the
 * client parses it back, so the panel printed `2026-11-20T00:00:00.000Z` verbatim. Given the
 * entity, the panel can read the column's SQL type out of `MIN(IntakeDate)` and render a `date`
 * column as its stored day and a timestamp in local time. A host that binds no entity sees no
 * change. Pinned to New York: at Greenwich the day-shift half of this is invisible.
 */
const AT = (tz: string, fn: () => void) => {
    const original = process.env.TZ;
    process.env.TZ = tz;
    try {
        fn();
    } finally {
        process.env.TZ = original;
    }
};

const STORED_DAY = new Date('2026-11-20T00:00:00.000Z');
const INSTANT = new Date('2026-11-20T02:00:00.000Z');

function makeEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000002-0000-0000-0000-000000000003',
        Name: 'Animals',
        Status: 'Active',
        BaseTable: 'Animal',
        BaseView: 'vwAnimals',
        Fields: [
            { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: true },
            { ID: 'F3', Name: 'IntakeDate', Type: 'date', AllowsNull: true, DefaultInView: true },
            { ID: 'F4', Name: 'LaunchAt', Type: 'datetimeoffset', AllowsNull: true, DefaultInView: true },
            { ID: 'F5', Name: 'Intake Date', Type: 'date', AllowsNull: true, DefaultInView: true },
        ],
    });
}

const agg = (expression: string, id = 'a1', column?: string): ViewGridAggregate =>
    ({ id, expression, displayType: 'card', label: expression, column });

function makePanel(withEntity: boolean, value: unknown, expression: string): AggregatePanelComponent {
    const panel = new AggregatePanelComponent();
    panel.Entity = withEntity ? makeEntity() : null;
    panel.Aggregates = [agg(expression)];
    panel.Values = new Map([['a1', value as never]]);
    return panel;
}

describe('AggregateFieldName', () => {
    it('reads the one column a single-field aggregate summarises', () => {
        expect(AggregateFieldName(agg('MIN(IntakeDate)'))).toBe('IntakeDate');
        expect(AggregateFieldName(agg(' max ( [Intake Date] ) '))).toBe('Intake Date');
    });
    it('falls back to the column the aggregate is pinned under', () => {
        expect(AggregateFieldName(agg('COUNT(*)', 'a1', 'IntakeDate'))).toBe('IntakeDate');
    });
    it('gives nothing for anything more complex than one function over one column', () => {
        for (const e of ['COUNT(*)', 'SUM(Amount) + 1', 'DATEDIFF(day, A, B)', 'MIN(YEAR(IntakeDate))', 'IntakeDate', '', 'MIN()']) {
            expect(AggregateFieldName(agg(e)), e).toBeNull();
        }
    });
});

describe('AggregateField', () => {
    it('resolves the entity field, including a name with a space', () => {
        const entity = makeEntity();
        expect(AggregateField(agg('MIN(IntakeDate)'), entity)?.Type).toBe('date');
        expect(AggregateField(agg('MAX([Intake Date])'), entity)?.Name).toBe('Intake Date');
        expect(AggregateField(agg('MIN(Nope)'), entity)).toBeNull();
        expect(AggregateField(agg('MIN(IntakeDate)'), null)).toBeNull();
    });
});

describe('AggregatePanelComponent.FormatValue with the entity bound', () => {
    it('renders a date aggregate that arrived as an ISO string as its stored day', () => {
        AT('America/New_York', () => {
            const shown = makePanel(true, STORED_DAY.toISOString(), 'MIN(IntakeDate)').FormatValue(agg('MIN(IntakeDate)'));
            expect(shown, `got ${shown}`).toContain('20');
            expect(shown).not.toContain('19');
            expect(shown).not.toContain('T00:00');
        });
    });

    it('renders a date aggregate that is already a Date as its stored day', () => {
        AT('America/New_York', () => {
            const shown = makePanel(true, STORED_DAY, 'MIN(IntakeDate)').FormatValue(agg('MIN(IntakeDate)'));
            expect(shown).toContain('20');
            expect(shown).not.toContain('19');
        });
    });

    it('renders a timestamp aggregate in local time', () => {
        AT('America/New_York', () => {
            const shown = makePanel(true, INSTANT.toISOString(), 'MAX(LaunchAt)').FormatValue(agg('MAX(LaunchAt)'));
            expect(shown, `got ${shown}`).toContain('19');
            expect(shown).not.toContain('T02:00');
        });
    });
});

describe('AggregatePanelComponent.FormatValue with no entity bound (unchanged)', () => {
    it('prints a string value as it is', () => {
        const shown = makePanel(false, STORED_DAY.toISOString(), 'MIN(IntakeDate)').FormatValue(agg('MIN(IntakeDate)'));
        expect(shown).toBe(STORED_DAY.toISOString());
    });
});
