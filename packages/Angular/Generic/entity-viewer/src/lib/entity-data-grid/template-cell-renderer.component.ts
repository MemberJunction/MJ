import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, TemplateRef, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { ICellRendererAngularComp, IHeaderAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams, IHeaderParams } from 'ag-grid-community';
import type { GridCellTemplateContext, GridColumnConfig, GridHeaderTemplateContext } from './models/grid-types';

/**
 * What the grid passes in `cellRendererParams` for a column declared with a `cellTemplate`.
 * Prefixed so it cannot collide with AG Grid's own `column` param.
 */
export interface GridTemplateCellRendererParams {
  mjTemplate: TemplateRef<GridCellTemplateContext>;
  mjColumn: GridColumnConfig;
}

/** What the grid passes in `headerComponentParams` for a column declared with a `headerTemplate`. */
export interface GridTemplateHeaderParams {
  mjTemplate: TemplateRef<GridHeaderTemplateContext>;
  mjColumn: GridColumnConfig;
}

/** Builds the template context for one cell. Exported for tests. */
export function BuildGridCellTemplateContext(params: ICellRendererParams & GridTemplateCellRendererParams): GridCellTemplateContext {
  return {
    row: (params.data && typeof params.data === 'object') ? params.data as Record<string, unknown> : {},
    column: params.mjColumn,
    value: params.value,
    rowIndex: params.node?.rowIndex ?? -1,
    isEditing: false
  };
}

/**
 * Renders a host column's `cellTemplate` inside an AG Grid cell, with a
 * {@link GridCellTemplateContext} built from the row.
 */
@Component({
  selector: 'mj-grid-template-cell',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (Template && Context) {
      <ng-container [ngTemplateOutlet]="Template" [ngTemplateOutletContext]="Context"></ng-container>
    }
  `
})
export class GridTemplateCellRendererComponent implements ICellRendererAngularComp {
  private cdr = inject(ChangeDetectorRef);

  Template: TemplateRef<GridCellTemplateContext> | null = null;
  Context: GridCellTemplateContext | null = null;

  // case-violation-ok-legacy-back-compat: AG Grid's ICellRendererAngularComp contract names this method
  agInit(params: ICellRendererParams & GridTemplateCellRendererParams): void {
    this.apply(params);
  }

  // case-violation-ok-legacy-back-compat: AG Grid's ICellRendererAngularComp contract names this method
  refresh(params: ICellRendererParams & GridTemplateCellRendererParams): boolean {
    this.apply(params);
    this.cdr.markForCheck();
    return true;
  }

  private apply(params: ICellRendererParams & GridTemplateCellRendererParams): void {
    this.Template = params.mjTemplate;
    this.Context = BuildGridCellTemplateContext(params);
  }
}

/**
 * Renders a host column's `headerTemplate` as the AG Grid header, with a
 * {@link GridHeaderTemplateContext}. Clicking the header still sorts when the column is sortable.
 */
@Component({
  selector: 'mj-grid-template-header',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host { display: flex; align-items: center; width: 100%; height: 100%; }`],
  template: `
    <div class="mj-grid-template-header" (click)="OnClick($event)">
      @if (Template && Context) {
        <ng-container [ngTemplateOutlet]="Template" [ngTemplateOutletContext]="Context"></ng-container>
      }
    </div>
  `
})
export class GridTemplateHeaderComponent implements IHeaderAngularComp, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private params: (IHeaderParams & GridTemplateHeaderParams) | null = null;
  private readonly onSortChanged = (): void => {
    this.updateContext();
    this.cdr.markForCheck();
  };

  Template: TemplateRef<GridHeaderTemplateContext> | null = null;
  Context: GridHeaderTemplateContext | null = null;

  // case-violation-ok-legacy-back-compat: AG Grid's IHeaderAngularComp contract names this method
  agInit(params: IHeaderParams & GridTemplateHeaderParams): void {
    this.params = params;
    this.Template = params.mjTemplate;
    this.updateContext();
    params.column.addEventListener('sortChanged', this.onSortChanged);
  }

  // case-violation-ok-legacy-back-compat: AG Grid's IHeaderAngularComp contract names this method
  refresh(params: IHeaderParams & GridTemplateHeaderParams): boolean {
    this.params?.column.removeEventListener('sortChanged', this.onSortChanged);
    this.agInit(params);
    this.cdr.markForCheck();
    return true;
  }

  ngOnDestroy(): void {
    this.params?.column.removeEventListener('sortChanged', this.onSortChanged);
  }

  OnClick(event: MouseEvent): void {
    if (this.params?.enableSorting) {
      this.params.progressSort(event.shiftKey);
    }
  }

  private updateContext(): void {
    if (!this.params) return;
    const sort = this.params.column.getSort();
    this.Context = {
      column: this.params.mjColumn,
      sortDirection: sort === 'asc' || sort === 'desc' ? sort : 'none',
      filterValue: null
    };
  }
}
