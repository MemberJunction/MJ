import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { EntityInfo } from '@memberjunction/core';
import type { EntityFieldInfo, IMetadataProvider } from '@memberjunction/core';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';
import type { MJUserViewEntity_IColumnFormat as ColumnFormat } from '@memberjunction/core-entities';

/**
 * Column styles in a saved grid state come from the view's author, not from the viewer.
 * The cell renderer must keep each style value inside the style attribute and drop any
 * value that is not a plain CSS colour.
 */

function makeEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000009-0000-0000-0000-000000000001',
        Name: 'MJ: Test Accounts',
        Status: 'Active',
        BaseTable: 'TestAccount',
        BaseView: 'vwTestAccounts',
        Fields: [
            { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: false },
            { ID: 'F2', Name: 'Title', Type: 'nvarchar', Length: 100, AllowsNull: false, DefaultInView: true },
        ],
    });
}

function makeGrid(entity: EntityInfo): EntityDataGridComponent {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
    const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;
    const grid = new EntityDataGridComponent(cdr, elementRef, {} as never, ngZone);
    grid.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
    (grid as unknown as { _entityInfo: EntityInfo })._entityInfo = entity;
    return grid;
}

type FormatterHost = { applyFieldFormatter(colDef: ColDef, field: EntityFieldInfo, format?: ColumnFormat): void };

function buildColDef(format: ColumnFormat): ColDef {
    const entity = makeEntity();
    const grid = makeGrid(entity);
    const field = entity.Fields.find(f => f.Name === 'Title')!;
    const colDef: ColDef = { field: 'Title' };
    (grid as unknown as FormatterHost).applyFieldFormatter(colDef, field, format);
    return colDef;
}

/** Mounts the renderer output the way AG Grid does: as HTML inside a span. */
function renderCell(format: ColumnFormat, value: string): HTMLElement {
    const colDef = buildColDef(format);
    const renderer = colDef.cellRenderer as (p: ICellRendererParams) => string;
    const host = document.createElement('span');
    host.innerHTML = renderer({ value, data: { Title: value } } as ICellRendererParams);
    return host;
}

const MARKUP_VALUE = 'red"><img src=x data-marker="1">';

describe('EntityDataGridComponent cell style from grid state', () => {
    it('keeps a cell colour with markup inside the style attribute', () => {
        const host = renderCell({ cellStyle: { color: MARKUP_VALUE } }, 'Acme');
        expect(host.querySelector('img')).toBeNull();
        expect(host.querySelector('[data-marker]')).toBeNull();
        expect(host.textContent).toBe('Acme');
    });

    it('keeps a cell background colour with markup inside the style attribute', () => {
        const host = renderCell({ cellStyle: { backgroundColor: MARKUP_VALUE } }, 'Acme');
        expect(host.querySelector('img')).toBeNull();
        expect(host.textContent).toBe('Acme');
    });

    it('drops a cell colour that is not a valid CSS colour', () => {
        const host = renderCell({ cellStyle: { color: 'red; background-image: url(x)' } }, 'Acme');
        const styled = host.querySelector('[style]');
        expect(styled?.getAttribute('style') ?? '').not.toContain('background-image');
    });

    it('drops a header colour that is not a valid CSS colour', () => {
        const colDef = buildColDef({ headerStyle: { color: 'red; background-image: url(x)', backgroundColor: '#00ff00' } });
        const headerStyle = (colDef as ColDef & { headerStyle?: Record<string, string> }).headerStyle ?? {};
        expect(headerStyle['color']).toBeUndefined();
        expect(headerStyle['backgroundColor']).toBe('#00ff00');
    });
});
