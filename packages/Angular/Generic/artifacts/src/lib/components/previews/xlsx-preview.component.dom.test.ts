import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import * as XLSX from 'xlsx';
import { renderComponentFixture, query, queryAll, text, capture, click } from '@memberjunction/ng-test-utils';
import { XlsxPreviewComponent } from './xlsx-preview.component';

/**
 * DOM coverage for <mj-xlsx-preview>, the one spreadsheet renderer in Explorer. Drives it with a real two-sheet workbook
 * written by SheetJS in the test, parsed by the real SheetJS in the component. The grid itself is AG Grid's and is stubbed:
 * what this covers is the component's own DOM (the sheet tabs, the active sheet, the states) and its emits (`Loaded` with
 * the parsed sheets, `SheetChange` on a tab click, `Failed` on bad bytes).
 */

@Component({
  standalone: true,
  selector: 'ag-grid-angular',
  template: '<div class="stub-grid" [attr.data-rows]="rowData?.length ?? 0" [attr.data-cols]="columnDefs?.length ?? 0"></div>',
})
class StubGrid {
  @Input() rowData: unknown[] | undefined;
  @Input() columnDefs: unknown[] | undefined;
  @Input() defaultColDef: unknown;
  @Input() animateRows: boolean | undefined;
  @Input() suppressMovableColumns: boolean | undefined;
  @Input() enableCellTextSelection: boolean | undefined;
  @Output() gridReady = new EventEmitter<unknown>();
}

function workbookBytes(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Month', 'Renewals', 'Churn'], ['Jul', 42, 3], ['Aug', 51, 2], ['Sep', 47, 5]]), 'Renewals');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Note'], ['Second sheet, to check the tabs.']]), 'Notes');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const render = () => renderComponentFixture(XlsxPreviewComponent, { declarations: [XlsxPreviewComponent], imports: [StubGrid] });

async function settled(f: ComponentFixture<XlsxPreviewComponent>): Promise<void> {
  for (let i = 0; i < 200 && f.componentInstance.IsLoading; i++) await new Promise((r) => setTimeout(r, 25));
  f.detectChanges();
}

describe('XlsxPreviewComponent (DOM)', () => {
  it('shows the loading state until it has a workbook', () => {
    const f = render();
    expect(text(f, '.xlsx-preview__state')).toContain('Loading workbook');
    expect(query(f, '.xlsx-preview__tabs')).toBeNull();
  });

  it('renders one tab per sheet, the first active, and hands the active sheet to the grid; emits Loaded with the sheets', async () => {
    const f = render();
    const loaded = capture(f.componentInstance.Loaded);
    f.componentInstance.ArrayBuffer = workbookBytes();
    await settled(f);
    const tabs = queryAll(f, '.xlsx-preview__tab');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Renewals', 'Notes']);
    expect(tabs[0].classList.contains('xlsx-preview__tab--active')).toBe(true);
    expect((query(f, '.stub-grid') as HTMLElement).dataset['rows']).toBe('3');
    expect((query(f, '.stub-grid') as HTMLElement).dataset['cols']).toBe('3');
    expect(loaded.length).toBe(1);
    expect(loaded[0].map((s) => s.name)).toEqual(['Renewals', 'Notes']);
    expect(loaded[0][0].rowData[0]).toMatchObject({ Month: 'Jul', Renewals: '42', Churn: '3' });
  });

  it('switches the active sheet on a tab click and emits SheetChange', async () => {
    const f = render();
    f.componentInstance.ArrayBuffer = workbookBytes();
    await settled(f);
    const changes = capture(f.componentInstance.SheetChange);
    click(f, '.xlsx-preview__tab:nth-child(2)');
    f.detectChanges();
    expect(queryAll(f, '.xlsx-preview__tab')[1].classList.contains('xlsx-preview__tab--active')).toBe(true);
    expect((query(f, '.stub-grid') as HTMLElement).dataset['rows']).toBe('1');
    expect(changes).toEqual([1]);
  });

  it('shows the error state and emits Failed when the workbook cannot be fetched from its URL', async () => {
    // SheetJS reads almost any bytes as a sheet, so the error path that matters is the fetch: a URL nothing answers.
    const f = render();
    const failed = capture(f.componentInstance.Failed);
    f.componentInstance.Url = 'http://127.0.0.1:1/no-such-workbook.xlsx';
    await settled(f);
    expect(query(f, '.xlsx-preview__state--error')).not.toBeNull();
    expect(failed.length).toBe(1);
    expect(query(f, '.xlsx-preview__tabs')).toBeNull();
  });
});
