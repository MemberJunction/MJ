import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import type { EntityFieldInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJUserViewEntity_IColumnFormat as ColumnFormat, MJUserViewEntity_IGridAggregate as ViewGridAggregate } from '@memberjunction/core-entities';
import { EntityCardsComponent } from '../lib/entity-cards/entity-cards.component';
import { EntityRecordDetailPanelComponent } from '../lib/entity-record-detail-panel/entity-record-detail-panel.component';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';
import { ViewConfigPanelComponent } from '../lib/view-config-panel/view-config-panel.component';

/**
 * A DATE-ONLY COLUMN IS A CALENDAR DAY, NOT AN INSTANT (MJ#4210).
 *
 * A SQL `date` column arrives as a Date at UTC midnight. Every display path here ran it through a
 * LOCAL-zone formatter, which subtracts the reader's offset and lands on the previous day for
 * everyone west of Greenwich: a stored 2026-11-20 read as Nov 19 in the grid, the cards and the
 * detail panel, while the form field (fixed in #4177) said the 20th. Same row, two answers.
 *
 * A `datetime`/`datetimeoffset` column names an instant and MUST keep local rendering: 02:00 UTC
 * on the 20th really is the evening of the 19th in New York.
 *
 * These tests PIN A TIMEZONE rather than trusting the runner's. Every assertion passes at
 * Greenwich and fails in New York, which is how the bug shipped past a UTC CI box.
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

const STORED_DAY = new Date('2026-11-20T00:00:00.000Z');        // a `date` column: the 20th, no zone
const INSTANT = new Date('2026-11-20T02:00:00.000Z');           // a timestamp: still the 19th in New York

function makeEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000002-0000-0000-0000-000000000002',
        Name: 'Animals',
        Status: 'Active',
        BaseTable: 'Animal',
        BaseView: 'vwAnimals',
        Fields: [
            { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: true },
            { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 100, AllowsNull: false, DefaultInView: true, IsNameField: true },
            { ID: 'F3', Name: 'IntakeDate', Type: 'date', AllowsNull: true, DefaultInView: true },
            { ID: 'F4', Name: 'LaunchAt', Type: 'datetimeoffset', AllowsNull: true, DefaultInView: true },
        ],
    });
}

const fieldNamed = (entity: EntityInfo, name: string): EntityFieldInfo => entity.Fields.find(f => f.Name === name)!;
const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;
const provider = { CurrentUser: null, Entities: [] } as unknown as IMetadataProvider;

describe('EntityCardsComponent.getDateValue', () => {
    it('renders a date column as its stored day west of Greenwich', () => {
        AT('America/New_York', () => {
            const cards = new EntityCardsComponent(elementRef, cdr);
            cards.entity = makeEntity();
            const shown = cards.getDateValue({ IntakeDate: STORED_DAY }, 'IntakeDate');
            expect(shown, `got ${shown}`).toContain('20');
            expect(shown).not.toContain('19');
        });
    });

    it('keeps a timestamp column in local time', () => {
        AT('America/New_York', () => {
            const cards = new EntityCardsComponent(elementRef, cdr);
            cards.entity = makeEntity();
            expect(cards.getDateValue({ LaunchAt: INSTANT }, 'LaunchAt')).toContain('19');
        });
    });
});

describe('EntityRecordDetailPanelComponent field values', () => {
    type Internals = { formatFieldValue(value: unknown, field: EntityFieldInfo): string };
    const make = (): Internals => {
        const panel = new EntityRecordDetailPanelComponent(cdr, ngZone);
        panel.Provider = provider;
        return panel as unknown as Internals;
    };

    it('renders a date column as its stored day west of Greenwich', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            const shown = make().formatFieldValue(STORED_DAY, fieldNamed(entity, 'IntakeDate'));
            expect(shown, `got ${shown}`).toContain('20');
            expect(shown).not.toContain('19');
        });
    });

    it('keeps a timestamp column in local time', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            expect(make().formatFieldValue(INSTANT, fieldNamed(entity, 'LaunchAt'))).toContain('19');
        });
    });
});

describe('EntityDataGridComponent date cells', () => {
    type Internals = {
        formatDefaultDate(value: unknown, field: EntityFieldInfo, friendlyDates: boolean): string;
        formatValueWithCustomFormat(value: unknown, format: ColumnFormat, field: EntityFieldInfo): string;
        _aggregateValues: Map<string, unknown>;
        _entityInfo: EntityInfo;
    };
    const makeGrid = (entity: EntityInfo): EntityDataGridComponent & Internals => {
        const grid = new EntityDataGridComponent(cdr, elementRef, {} as never, ngZone);
        grid.Provider = provider;
        (grid as unknown as Internals)._entityInfo = entity;
        return grid as EntityDataGridComponent & Internals;
    };

    it('renders a date column as its stored day in the friendly default format', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            const shown = makeGrid(entity).formatDefaultDate(STORED_DAY, fieldNamed(entity, 'IntakeDate'), true);
            expect(shown, `got ${shown}`).toContain('20');
            expect(shown).not.toContain('19');
        });
    });

    it('keeps a timestamp column in local time in the friendly default format', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            expect(makeGrid(entity).formatDefaultDate(INSTANT, fieldNamed(entity, 'LaunchAt'), true)).toContain('19');
        });
    });

    it('renders a date column as its stored day under a custom date format', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            const shown = makeGrid(entity).formatValueWithCustomFormat(STORED_DAY, { type: 'date', dateFormat: 'medium' }, fieldNamed(entity, 'IntakeDate'));
            expect(shown, `got ${shown}`).toContain('20');
            expect(shown).not.toContain('19');
        });
    });

    it('shows no time for a date column even when the column format asks for datetime', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            const shown = makeGrid(entity).formatValueWithCustomFormat(STORED_DAY, { type: 'datetime', dateFormat: 'medium' }, fieldNamed(entity, 'IntakeDate'));
            expect(shown).toContain('20');
            expect(shown).not.toMatch(/\d{1,2}:\d{2}/);
        });
    });

    it('keeps a timestamp column in local time, with its time, under a custom datetime format', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            const shown = makeGrid(entity).formatValueWithCustomFormat(INSTANT, { type: 'datetime', dateFormat: 'medium' }, fieldNamed(entity, 'LaunchAt'));
            expect(shown).toContain('19');
            expect(shown).toMatch(/\d{1,2}:\d{2}/);
        });
    });

    it('renders an aggregate over a date column as its stored day', () => {
        AT('America/New_York', () => {
            const grid = makeGrid(makeEntity());
            grid._aggregateValues = new Map([['earliest', STORED_DAY]]);
            const agg: ViewGridAggregate = { id: 'earliest', expression: 'MIN(IntakeDate)', displayType: 'card', label: 'Earliest intake' };
            const shown = grid.getAggregateValue(agg);
            expect(shown, `got ${shown}`).toContain('20');
            expect(shown).not.toContain('19');
        });
    });

    it('keeps an aggregate over a timestamp column in local time', () => {
        AT('America/New_York', () => {
            const grid = makeGrid(makeEntity());
            grid._aggregateValues = new Map([['latest', INSTANT]]);
            const agg: ViewGridAggregate = { id: 'latest', expression: 'MAX(LaunchAt)', displayType: 'card', label: 'Latest launch' };
            expect(grid.getAggregateValue(agg)).toContain('19');
        });
    });
});

describe('ViewConfigPanelComponent.FormatPreviewValue', () => {
    const make = (): ViewConfigPanelComponent => {
        const panel = new ViewConfigPanelComponent(cdr);
        panel.Provider = provider;
        return panel;
    };

    it('previews a date column as its stored day west of Greenwich', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            const shown = make().FormatPreviewValue(STORED_DAY, { type: 'date', dateFormat: 'medium' }, fieldNamed(entity, 'IntakeDate'));
            expect(shown, `got ${shown}`).toContain('20');
            expect(shown).not.toContain('19');
        });
    });

    it('previews a timestamp column in local time', () => {
        AT('America/New_York', () => {
            const entity = makeEntity();
            expect(make().FormatPreviewValue(INSTANT, { type: 'datetime', dateFormat: 'medium' }, fieldNamed(entity, 'LaunchAt'))).toContain('19');
        });
    });
});
