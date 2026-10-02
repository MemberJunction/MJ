import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { DataSnapshot, DataTable, MJColumnDescriptor } from '@memberjunction/core';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { ColDef } from 'ag-grid-community';
import { FetchArrayBuffer, type SheetData } from '../previews/office-preview.logic';


/**
 * Viewer plugin for Excel (XLSX/XLS) artifact versions stored in MJStorage.
 *
 * Downloads the file and hands the bytes to `mj-xlsx-preview`, Explorer's one spreadsheet renderer (SheetJS into an
 * AG Grid with sheet tabs), which the Files form shares. Keeps the parsed sheets for the state snapshot.
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

      @if (!ArrayBuffer && !errorMessage) {
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
        <div class="xlsx-viewer__body">
          <mj-xlsx-preview [ArrayBuffer]="ArrayBuffer" (Loaded)="OnPreviewLoaded($event)" (Failed)="ShowError($event)" (SheetChange)="ActiveSheetIndex = $event"></mj-xlsx-preview>
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

      .xlsx-viewer__body {
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'XlsxArtifactViewerPlugin')
export class XlsxArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  public IsDownloading = false;

  /** @deprecated Use {@link IsDownloading}. */
  public get isDownloading() {
    return this.IsDownloading;
  }
  /** @deprecated Use {@link IsDownloading}. */
  public set isDownloading(value) {
    this.IsDownloading = value;
  }
  public errorMessage = '';
  public Sheets: SheetData[] = [];

  /** @deprecated Use {@link Sheets}. */
  public get sheets(): SheetData[] {
    return this.Sheets;
  }
  /** @deprecated Use {@link Sheets}. */
  public set sheets(value: SheetData[]) {
    this.Sheets = value;
  }
  public ActiveSheetIndex = 0;

  /** @deprecated Use {@link ActiveSheetIndex}. */
  public get activeSheetIndex() {
    return this.ActiveSheetIndex;
  }
  /** @deprecated Use {@link ActiveSheetIndex}. */
  public set activeSheetIndex(value) {
    this.ActiveSheetIndex = value;
  }
  public DefaultColDef: ColDef = { resizable: true, sortable: true, filter: true, minWidth: 80 };

  /** @deprecated Use {@link DefaultColDef}. */
  public get defaultColDef(): ColDef {
    return this.DefaultColDef;
  }
  /** @deprecated Use {@link DefaultColDef}. */
  public set defaultColDef(value: ColDef) {
    this.DefaultColDef = value;
  }

  private downloadUrl = '';
  /** The workbook's bytes, handed to the shared preview once downloaded. */
  public ArrayBuffer: ArrayBuffer | null = null;

  constructor(
    private fileService: ArtifactFileService,
    private cdr: ChangeDetectorRef,
  ) {
    super();
  }

  public override get hasDisplayContent(): boolean {
    return true;
  }

  public get ActiveSheet(): SheetData | null {
    return this.Sheets[this.ActiveSheetIndex] ?? null;
  }

  /** @deprecated Use {@link ActiveSheet}. */
  public get activeSheet(): SheetData | null {
    return this.ActiveSheet;
  }

  async ngOnInit(): Promise<void> {
    await this.loadWorkbook();
  }

  public async OnDownload(): Promise<void> {
    if (!this.downloadUrl || this.IsDownloading) {
      return;
    }
    this.IsDownloading = true;
    this.cdr.markForCheck();
    try {
      await this.triggerBrowserDownload(this.downloadUrl, this.artifactVersion?.FileName || 'workbook.xlsx');
    } finally {
      this.IsDownloading = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link OnDownload}. */
  public async onDownload(): Promise<void> {
    return this.OnDownload();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async loadWorkbook(): Promise<void> {
    if (!this.artifactVersion?.ID) {
      this.ShowError('No artifact version provided.');
      return;
    }

    try {
      let arrayBuffer: ArrayBuffer;

      if (this.artifactVersion.ContentMode === 'File') {
        // File-backed: download from storage via pre-auth URL
        this.downloadUrl = await this.fileService.getDownloadUrl(this.artifactVersion.ID);
        arrayBuffer = await FetchArrayBuffer(this.downloadUrl);
      } else {
        // Inline: content is a base64 data URL stored in the artifact version
        const content = this.artifactVersion.Content;
        if (!content) {
          this.ShowError('Artifact has no content.');
          return;
        }
        arrayBuffer = this.fileService.dataUrlToArrayBuffer(content);
        // Create an object URL for download support
        this.downloadUrl = this.fileService.dataUrlToObjectUrl(
          content,
          this.artifactVersion.MimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      }

      this.ArrayBuffer = arrayBuffer;
      this.cdr.markForCheck();
    } catch (err) {
      this.ShowError(`Could not load workbook: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** The shared preview has parsed the workbook: keep the sheets for the snapshot and clear the loading state. */
  public OnPreviewLoaded(sheets: SheetData[]): void {
    this.Sheets = sheets;
    this.ActiveSheetIndex = 0;
    this.cdr.markForCheck();
  }


  public ShowError(message: string): void {
    this.errorMessage = message;
    this.cdr.markForCheck();
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    if (this.Sheets.length === 0) return null;

    // Convert parsed sheets into DataTables for structured snapshot
    const tables: DataTable[] = this.Sheets.map((sheet) => {
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
    snap.activeTab = this.Sheets[this.ActiveSheetIndex]?.name;
    return snap;
  }
}
