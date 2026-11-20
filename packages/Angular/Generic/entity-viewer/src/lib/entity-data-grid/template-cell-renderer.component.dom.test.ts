import { describe, it, expect } from 'vitest';
import { Component, TemplateRef, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Column, ICellRendererParams, IHeaderParams, IRowNode } from 'ag-grid-community';
import type { GridCellTemplateContext, GridColumnConfig, GridHeaderTemplateContext } from './models/grid-types';
import {
  GridTemplateCellRendererComponent,
  GridTemplateHeaderComponent,
  type GridTemplateCellRendererParams,
  type GridTemplateHeaderParams
} from './template-cell-renderer.component';

/**
 * DOM coverage for the renderers that stamp a host column's `cellTemplate` / `headerTemplate`
 * inside AG Grid. AG Grid itself is not mounted: the specs call `agInit` / `refresh` with the
 * params AG Grid would pass and check what the template renders.
 */

@Component({
  standalone: true,
  template: `
    <ng-template #cell let-value="value" let-row="row" let-column="column" let-rowIndex="rowIndex">
      <span class="chip">{{ column.field }}={{ value }} ({{ row.Name }}, #{{ rowIndex }})</span>
    </ng-template>
    <ng-template #header let-column="column" let-sortDirection="sortDirection">
      <b class="head">{{ column.title }} [{{ sortDirection }}]</b>
    </ng-template>
  `
})
class TemplateHost {
  @ViewChild('cell', { static: true }) Cell!: TemplateRef<GridCellTemplateContext>;
  @ViewChild('header', { static: true }) Header!: TemplateRef<GridHeaderTemplateContext>;
}

const COLUMN: GridColumnConfig = { field: 'Status', title: 'State' };

function templates(): TemplateHost {
  const host = TestBed.createComponent(TemplateHost);
  host.detectChanges();
  return host.componentInstance;
}

function cellParams(template: TemplateRef<GridCellTemplateContext>, value: unknown, name: string, rowIndex: number) {
  const params = {
    value,
    data: { Name: name },
    node: { rowIndex } as IRowNode,
    mjTemplate: template,
    mjColumn: COLUMN
  };
  return params as unknown as ICellRendererParams & GridTemplateCellRendererParams;
}

describe('GridTemplateCellRendererComponent (DOM)', () => {
  it('renders the template with value, row, column and row index', () => {
    const t = templates();
    const f = TestBed.createComponent(GridTemplateCellRendererComponent);
    f.componentInstance.agInit(cellParams(t.Cell, 'Open', 'Row A', 2));
    f.detectChanges();
    expect(f.nativeElement.querySelector('.chip')?.textContent?.trim()).toBe('Status=Open (Row A, #2)');
  });

  it('re-renders on refresh', () => {
    const t = templates();
    const f = TestBed.createComponent(GridTemplateCellRendererComponent);
    f.componentInstance.agInit(cellParams(t.Cell, 'Open', 'Row A', 0));
    f.detectChanges();
    expect(f.componentInstance.refresh(cellParams(t.Cell, 'Closed', 'Row A', 0))).toBe(true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.chip')?.textContent).toContain('Status=Closed');
  });
});

describe('GridTemplateHeaderComponent (DOM)', () => {
  function headerParams(template: TemplateRef<GridHeaderTemplateContext>, sort: 'asc' | 'desc' | undefined, sorts: boolean[]) {
    const column = {
      getSort: () => sort,
      addEventListener: () => {},
      removeEventListener: () => {}
    } as unknown as Column;
    const params = {
      column,
      enableSorting: true,
      progressSort: (multi?: boolean) => { sorts.push(multi === true); },
      mjTemplate: template,
      mjColumn: COLUMN
    };
    return params as unknown as IHeaderParams & GridTemplateHeaderParams;
  }

  it('renders the template with the column and its sort direction, and sorts on click', () => {
    const t = templates();
    const sorts: boolean[] = [];
    const f = TestBed.createComponent(GridTemplateHeaderComponent);
    f.componentInstance.agInit(headerParams(t.Header, 'desc', sorts));
    f.detectChanges();
    expect(f.nativeElement.querySelector('.head')?.textContent?.trim()).toBe('State [desc]');

    (f.nativeElement.querySelector('.mj-grid-template-header') as HTMLElement).click();
    expect(sorts).toEqual([false]);
  });

  it('reports none when the column is not sorted', () => {
    const t = templates();
    const f = TestBed.createComponent(GridTemplateHeaderComponent);
    f.componentInstance.agInit(headerParams(t.Header, undefined, []));
    f.detectChanges();
    expect(f.nativeElement.querySelector('.head')?.textContent).toContain('[none]');
  });
});
