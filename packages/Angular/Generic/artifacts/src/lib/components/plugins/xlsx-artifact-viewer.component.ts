import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { DataSnapshot, DataTable, MJColumnDescriptor } from '@memberjunction/core';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { ColDef, GridReadyEvent, GridApi } from 'ag-grid-community';

/** A parsed sheet ready for display in AG Grid. */
interface SheetData {
  name: string;
  rowData: Record<string, string | number | boolean | null>[];
  columnDefs: ColDef[];
}

/**
 * Viewer plugin for Excel (XLSX/XLS) artifact versions stored in MJStorage.
 *
 * Downloads the file, parses all sheets with SheetJS, then renders the active
 * sheet in an AG Grid. Sheet tabs let the user switch between sheets.
 */
@Component({
  standalone: false,
  selector: 'mj-xlsx-artifact-viewer',
  template: `
    <div class="xlsx-viewer">
      <mj-file-artifact-toolbar
        [fileName]="artifactVersion.FileName || 'workbook.xlsx'"
        [isDownloading]="isDownloading"
        [showPrint]="false"
        (download)="onDownload()"
      >
      </mj-file-artifact-toolbar>

      @if (isLoading) {
        <div class="xlsx-viewer__state">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading workbook…</span>
        </div>
      } @else if (errorMessage) {
        <div class="xlsx-viewer__state xlsx-viewer__state--error">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ errorMessage }}</span>
        </div>
      } @else {
        @if (sheets.length > 1) {
          <div class="xlsx-viewer__tabs">
            @for (sheet of sheets; track sheet.name; let i = $index) {
              <button class="xlsx-viewer__tab" [class.xlsx-viewer__tab--active]="i === activeSheetIndex" (click)="selectSheet(i)">
                <i class="fas fa-table"></i>
                {{ sheet.name }}
              </button>
            }
          </div>
        }

        <div class="xlsx-viewer__grid">
          <ag-grid-angular
            class="ag-theme-quartz"
            [rowData]="activeSheet?.rowData"
            [columnDefs]="activeSheet?.columnDefs"
            [defaultColDef]="defaultColDef"
            [animateRows]="false"
            [suppressMovableColumns]="false"
            [enableCellTextSelection]="true"
            (gridReady)="onGridReady($event)"
          >
          </ag-grid-angular>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .xlsx-viewer {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--mj-bg-surface);
      }

      .xlsx-viewer__state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex: 1;
        color: var(--mj-text-muted);
        font-size: 14px;
      }

      .xlsx-viewer__state--error {
        color: var(--mj-status-error-text);
      }

      .xlsx-viewer__tabs {
        display: flex;
        gap: 2px;
        padding: 4px 8px 0;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        overflow-x: auto;
        flex-shrink: 0;
      }

      .xlsx-viewer__tab {
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

      .xlsx-viewer__tab:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }

      .xlsx-viewer__tab--active {
        background: var(--mj-bg-surface);
        color: var(--mj-brand-primary);
        border-color: var(--mj-border-default);
        font-weight: 600;
        position: relative;
      }

      .xlsx-viewer__tab--active::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--mj-bg-surface);
      }

      .xlsx-viewer__grid {
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      .xlsx-viewer__grid ag-grid-angular {
        height: 100%;
        width: 100%;
        display: block;
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'XlsxArtifactViewerPlugin')
export class XlsxArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  public isLoading = true;
  public isDownloading = false;
  public errorMessage = '';
  public sheets: SheetData[] = [];
  public activeSheetIndex = 0;
  public defaultColDef: ColDef = { resizable: true, sortable: true, filter: true, minWidth: 80 };

  private gridApi: GridApi | null = null;
  private downloadUrl = '';

  constructor(
    private fileService: ArtifactFileService,
    private cdr: ChangeDetectorRef,
  ) {
    super();
  }

  public override get hasDisplayContent(): boolean {
    return true;
  }

  public get activeSheet(): SheetData | null {
    return this.sheets[this.activeSheetIndex] ?? null;
  }

  async ngOnInit(): Promise<void> {
    await this.loadWorkbook();
  }

  public onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  public selectSheet(index: number): void {
    this.activeSheetIndex = index;
    this.cdr.markForCheck();
    // Let Angular render the new rowData/columnDefs before re-sizing
    setTimeout(() => this.gridApi?.sizeColumnsToFit(), 0);
  }

  public async onDownload(): Promise<void> {
    if (!this.downloadUrl || this.isDownloading) {
      return;
    }
    this.isDownloading = true;
    this.cdr.markForCheck();
    try {
      await this.triggerBrowserDownload(this.downloadUrl, this.artifactVersion?.FileName || 'workbook.xlsx');
    } finally {
      this.isDownloading = false;
      this.cdr.markForCheck();
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async loadWorkbook(): Promise<void> {
    if (!this.artifactVersion?.ID) {
      this.showError('No artifact version provided.');
      return;
    }

    try {
      let arrayBuffer: ArrayBuffer;

      if (this.artifactVersion.ContentMode === 'File') {
        // File-backed: download from storage via pre-auth URL
        this.downloadUrl = await this.fileService.getDownloadUrl(this.artifactVersion.ID);
        arrayBuffer = await this.fetchAsArrayBuffer(this.downloadUrl);
      } else {
        // Inline: content is a base64 data URL stored in the artifact version
        const content = this.artifactVersion.Content;
        if (!content) {
          this.showError('Artifact has no content.');
          return;
        }
        arrayBuffer = this.fileService.dataUrlToArrayBuffer(content);
        // Create an object URL for download support
        this.downloadUrl = this.fileService.dataUrlToObjectUrl(
          content,
          this.artifactVersion.MimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      }

      const XLSX = (await import('xlsx')) as unknown as XlsxModuleShim;
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      this.sheets = this.parseWorkbook(workbook, XLSX);
      this.isLoading = false;
      this.cdr.markForCheck();
    } catch (err) {
      this.showError(`Could not load workbook: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private parseWorkbook(workbook: WorkbookType, XLSX: XlsxModuleShim): SheetData[] {
    return workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(sheet, {
        defval: null,
        raw: false, // Format dates/numbers as strings so AG Grid can display them
      });

      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      const columnDefs: ColDef[] = headers.map((h) => ({
        field: h,
        headerName: h,
        tooltipField: h,
      }));

      return { name, rowData: rows, columnDefs };
    });
  }

  private async fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching file`);
    }
    return response.arrayBuffer();
  }

  private showError(message: string): void {
    this.isLoading = false;
    this.errorMessage = message;
    this.cdr.markForCheck();
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    if (this.sheets.length === 0) return null;

    // Convert parsed sheets into DataTables for structured snapshot
    const tables: DataTable[] = this.sheets.map((sheet) => {
      const table = new DataTable();
      table.name = sheet.name;
      table.source = 'static';
      table.columns = sheet.columnDefs
        .filter((col) => col.field)
        .map((col) => {
          const desc = new MJColumnDescriptor(col.field as string);
          desc.displayName = (col.headerName as string | undefined) ?? (col.field as string);
          desc.sqlBaseType = 'nvarchar';
          return desc;
        });
      table.rows = sheet.rowData;
      table.metadata = { rowCount: sheet.rowData.length };
      return table;
    });

    const snap = DataSnapshot.FromTables(tables, this.getDisplayTitle() ?? undefined);
    snap.activeTab = this.sheets[this.activeSheetIndex]?.name;
    return snap;
  }
}

// ─── Minimal type shims for xlsx dynamic import ────────────────────────────────

interface WorkbookType {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

interface XlsxModuleShim {
  read(data: ArrayBuffer, opts: { type: 'array' | 'buffer' | 'binary' | 'base64' | 'string' }): WorkbookType;
  utils: {
    sheet_to_json<T>(sheet: unknown, opts: { defval: null; raw: boolean }): T[];
  };
}
