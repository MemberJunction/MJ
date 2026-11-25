import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { EntityInfo } from '@memberjunction/core';
import type { EntityFieldInfo, IMetadataProvider } from '@memberjunction/core';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';
import { BuildPolymorphicCompositeKey, PolymorphicCacheKey } from '../lib/utils/record.util';

/**
 * Record values that the cell renderer puts inside HTML attributes (links, image sources,
 * data attributes, titles) must stay inside their own attribute.
 */

const QUOTED_VALUE_SUFFIX = '" data-marker="1';

const TARGET_ENTITY_ID = 'E0000009-0000-0000-0000-0000000000A2';

function makeTargetEntity(): EntityInfo {
    return new EntityInfo({
        ID: TARGET_ENTITY_ID,
        Name: 'MJ: Test Targets',
        Status: 'Active',
        BaseTable: 'TestTarget',
        BaseView: 'vwTestTargets',
        Fields: [
            { ID: 'T1', Name: 'Code', Type: 'nvarchar', Length: 50, AllowsNull: false, IsPrimaryKey: true, DefaultInView: true },
        ],
    });
}

function makeEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000009-0000-0000-0000-0000000000A1',
        Name: 'MJ: Test Contacts',
        Status: 'Active',
        BaseTable: 'TestContact',
        BaseView: 'vwTestContacts',
        Fields: [
            { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: false },
            { ID: 'F2', Name: 'Homepage', Type: 'nvarchar', Length: 255, AllowsNull: true, DefaultInView: true, ExtendedType: 'URL' },
            { ID: 'F3', Name: 'Contact', Type: 'nvarchar', Length: 255, AllowsNull: true, DefaultInView: true, ExtendedType: 'Email' },
            { ID: 'F4', Name: 'Photo', Type: 'nvarchar', Length: 255, AllowsNull: true, DefaultInView: true, ExtendedType: 'Image' },
            { ID: 'F5', Name: 'OwnerRef', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true,
              RelatedEntityID: TARGET_ENTITY_ID, RelatedEntity: 'MJ: Test Targets' },
            { ID: 'F6', Name: 'TargetEntityID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: true, DefaultInView: false },
            { ID: 'F7', Name: 'TargetRecordID', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true,
              EntityIDFieldName: 'TargetEntityID' },
        ],
    });
}

function makeGrid(entity: EntityInfo, target: EntityInfo): EntityDataGridComponent {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
    const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;
    const grid = new EntityDataGridComponent(cdr, elementRef, {} as never, ngZone);
    grid.Provider = {
        CurrentUser: null,
        EntityByID: (id: string) => (id === TARGET_ENTITY_ID ? target : undefined),
        EntityByName: () => undefined,
    } as unknown as IMetadataProvider;
    (grid as unknown as { _entityInfo: EntityInfo })._entityInfo = entity;
    return grid;
}

type FormatterHost = { applyFieldFormatter(colDef: ColDef, field: EntityFieldInfo): void };

/** Mounts the renderer output the way AG Grid does: as HTML inside a span. */
function renderCell(fieldName: string, value: string, data: Record<string, string> = {}, names?: Map<string, string>): HTMLElement {
    const entity = makeEntity();
    const target = makeTargetEntity();
    const grid = makeGrid(entity, target);
    if (names) (grid as unknown as { _polymorphicRecordNames: Map<string, string> })._polymorphicRecordNames = names;
    const field = entity.Fields.find(f => f.Name === fieldName)!;
    const colDef: ColDef = { field: fieldName };
    (grid as unknown as FormatterHost).applyFieldFormatter(colDef, field);
    const renderer = colDef.cellRenderer as (p: ICellRendererParams) => string;
    const host = document.createElement('span');
    host.innerHTML = renderer({ value, data: { [fieldName]: value, ...data } } as ICellRendererParams);
    return host;
}

describe('EntityDataGridComponent record values inside attributes', () => {
    it('keeps a URL value with a quote inside the href attribute', () => {
        const value = 'example.com/page' + QUOTED_VALUE_SUFFIX;
        const link = renderCell('Homepage', value).querySelector('a')!;
        expect(link.hasAttribute('data-marker')).toBe(false);
        expect(link.getAttribute('href')).toBe('https://' + value);
    });

    it('gives a URL value that is not a web address an https link', () => {
        const link = renderCell('Homepage', 'httpx://example.com').querySelector('a')!;
        expect(['http:', 'https:']).toContain(new URL(link.getAttribute('href') ?? '').protocol);
    });

    it('keeps an email value with a quote inside the mailto href', () => {
        const value = 'someone@example.com' + QUOTED_VALUE_SUFFIX;
        const link = renderCell('Contact', value).querySelector('a')!;
        expect(link.hasAttribute('data-marker')).toBe(false);
        expect(link.getAttribute('href')).toBe('mailto:' + value);
    });

    it('keeps an image path with a quote inside the src and href attributes', () => {
        const value = 'photos/me.png' + QUOTED_VALUE_SUFFIX;
        const host = renderCell('Photo', value);
        const img = host.querySelector('img')!;
        const link = host.querySelector('a')!;
        expect(img.hasAttribute('data-marker')).toBe(false);
        expect(link.hasAttribute('data-marker')).toBe(false);
        expect(img.getAttribute('src')).toBe(value);
        expect(link.getAttribute('href')).toBe(value);
    });

    it('keeps a foreign key value with a quote inside data-record-id', () => {
        const value = 'T-100' + QUOTED_VALUE_SUFFIX;
        const link = renderCell('OwnerRef', value).querySelector('a')!;
        expect(link.hasAttribute('data-marker')).toBe(false);
        expect(link.getAttribute('data-record-id')).toBe(value);
    });

    it('keeps a resolved record name with a quote inside the title attribute', () => {
        const target = makeTargetEntity();
        const recordId = 'T-200';
        const key = BuildPolymorphicCompositeKey(recordId, target)!;
        const resolvedName = 'Acme' + QUOTED_VALUE_SUFFIX;
        const names = new Map([[PolymorphicCacheKey(target.Name, key), resolvedName]]);
        const link = renderCell('TargetRecordID', recordId, { TargetEntityID: TARGET_ENTITY_ID }, names).querySelector('a')!;
        expect(link.hasAttribute('data-marker')).toBe(false);
        expect(link.getAttribute('title')).toBe(`${target.DisplayNameOrName}: ${resolvedName} (${recordId})`);
    });
});
