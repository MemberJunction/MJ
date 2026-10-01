import { Component, ChangeDetectorRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { FetchArrayBuffer, ParseWorkbook, type SheetData, type XlsxModuleShim } from './office-preview.logic';

/**
 * Renders a workbook (.xlsx, .xls) inline: fetches the bytes from `Url` (or takes them from `ArrayBuffer`), parses every
 * sheet with SheetJS and shows the active one in an AG Grid, with tabs when there is more than one sheet. Explorer's one
 * spreadsheet renderer: the artifact viewer wraps it with its toolbar, and the Files form shows it in its preview pane.
 *
 * `Loaded` fires with the parsed sheets once the workbook is shown; `Failed` fires with the reason when it cannot be;
 * `SheetChange` fires with the index when the viewer picks another sheet.
 */
@Component({
  standalone: false,
  selector: 'mj-xlsx-preview',
  template: `
    <div class="xlsx-preview">
      @if (IsLoading) {
        <div class="xlsx-preview__state">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading workbook…</span>
        </div>
      } @else if (ErrorMessage) {
        <div class="xlsx-preview__state xlsx-preview__state--error">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ ErrorMessage }}</span>
        </div>
      } @else {
        @if (Sheets.length > 1) {
          <div class="xlsx-preview__tabs">
            @for (sheet of Sheets; track sheet.name; let i = $index) {
              <button type="button" class="xlsx-preview__tab" [class.xlsx-preview__tab--active]="i === ActiveSheetIndex" (click)="SelectSheet(i)">
                <i class="fas fa-table"></i>
                {{ sheet.name }}
              </button>
            }
          </div>
        }
        <div class="xlsx-preview__grid">
          <ag-grid-angular
            class="ag-theme-quartz"
            [rowData]="ActiveSheet?.rowData"
            [columnDefs]="ActiveSheet?.columnDefs"
            [defaultColDef]="DefaultColDef"
            [animateRows]="false"
            [suppressMovableColumns]="false"
            [enableCellTextSelection]="true"
            (gridReady)="OnGridReady($event)"
          >
          </ag-grid-angular>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .xlsx-preview {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--mj-bg-surface);
      }
      .xlsx-preview__state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex: 1;
        min-height: 160px;
        color: var(--mj-text-muted);
        font-size: 14px;
      }
      .xlsx-preview__state--error {
        color: var(--mj-status-error-text);
      }
      .xlsx-preview__tabs {
        display: flex;
        gap: 2px;
        padding: 4px 8px 0;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        overflow-x: auto;
        flex-shrink: 0;
      }
      .xlsx-preview__tab {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 14px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-bottom: none;
        border-radius: 4px 4px 0 0;
        color: var(--mj-text-secondary);
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
        transition:
          background 0.1s,
          color 0.1s;
      }
      .xlsx-preview__tab:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }
      .xlsx-preview__tab--active {
        background: var(--mj-bg-surface);
        color: var(--mj-brand-primary);
        border-color: var(--mj-border-default);
        font-weight: 600;
        position: relative;
      }
      .xlsx-preview__tab--active::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--mj-bg-surface);
      }
      .xlsx-preview__grid {
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }
      .xlsx-preview__grid ag-grid-angular {
        height: 100%;
        width: 100%;
        display: block;
      }
    `,
  ],
})
export class XlsxPreviewComponent implements OnChanges {
  /** Where to fetch the workbook's bytes. Ignored when `ArrayBuffer` is set. */
  @Input() Url: string | null = null;
  /** The workbook's bytes, when the caller already has them. */
  @Input() ArrayBuffer: ArrayBuffer | null = null;

  /** The parsed sheets, once the workbook is shown. */
  @Output() Loaded = new EventEmitter<SheetData[]>();
  /** Why the workbook could not be shown. */
  @Output() Failed = new EventEmitter<string>();
  /** The index of the sheet the viewer switched to. */
  @Output() SheetChange = new EventEmitter<number>();

  public IsLoading = true;
  public ErrorMessage = '';
  public Sheets: SheetData[] = [];
  public ActiveSheetIndex = 0;
  public DefaultColDef: ColDef = { resizable: true, sortable: true, filter: true, minWidth: 80 };

  private gridApi: GridApi | null = null;
  private loadToken = 0;

  constructor(private cdr: ChangeDetectorRef) {}

  public get ActiveSheet(): SheetData | null {
    return this.Sheets[this.ActiveSheetIndex] ?? null;
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['Url'] || changes['ArrayBuffer']) {
      void this.load();
    }
  }

  public OnGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  public SelectSheet(index: number): void {
    if (index === this.ActiveSheetIndex || !this.Sheets[index]) return;
    this.ActiveSheetIndex = index;
    this.cdr.markForCheck();
    this.SheetChange.emit(index);
    // Let Angular render the new rowData/columnDefs before re-sizing
    setTimeout(() => this.gridApi?.sizeColumnsToFit(), 0);
  }

  private async load(): Promise<void> {
    const token = ++this.loadToken;
    this.IsLoading = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();
    try {
      const bytes = this.ArrayBuffer ?? (this.Url ? await FetchArrayBuffer(this.Url) : null);
      if (!bytes) {
        this.showError('No workbook to show.');
        return;
      }
      const XLSX = (await import('xlsx')) as unknown as XlsxModuleShim;
      const sheets = ParseWorkbook(XLSX.read(bytes, { type: 'array' }), XLSX);
      if (token !== this.loadToken) return; // a newer input won
      this.Sheets = sheets;
      this.ActiveSheetIndex = 0;
      this.IsLoading = false;
      this.cdr.markForCheck();
      this.Loaded.emit(sheets);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.showError(`Could not load workbook: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private showError(message: string): void {
    this.IsLoading = false;
    this.ErrorMessage = message;
    this.cdr.markForCheck();
    this.Failed.emit(message);
  }
}
