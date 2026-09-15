import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import {
  ExportFormat,
  ExportData,
  ExportColumn,
  SamplingMode,
  ExportOptions,
  ExportResult
} from '@memberjunction/export-engine';
import { ExportService, ExportDialogConfig, ExportDialogResult } from './export.service';

/**
 * Export dialog component with progressive UX
 * Provides format selection, sampling options, and export preview
 *
 * Usage:
 * <mj-export-dialog
 *   [visible]="showExportDialog"
 *   [config]="exportConfig"
 *   (closed)="onExportDialogClosed($event)">
 * </mj-export-dialog>
 */
@Component({
  standalone: false,
  selector: 'mj-export-dialog',
  templateUrl: './export-dialog.component.html',
  styleUrls: ['./export-dialog.component.css']
})
export class ExportDialogComponent {
  // Form state
  SelectedFormat: ExportFormat = 'excel';

  /** @deprecated Use {@link SelectedFormat}. */
  get selectedFormat(): ExportFormat {
    return this.SelectedFormat;
  }
  /** @deprecated Use {@link SelectedFormat}. */
  set selectedFormat(value: ExportFormat) {
    this.SelectedFormat = value;
  }
  FileName = 'export';

  /** @deprecated Use {@link FileName}. */
  get fileName() {
    return this.FileName;
  }
  /** @deprecated Use {@link FileName}. */
  set fileName(value) {
    this.FileName = value;
  }
  IncludeHeaders = true;

  /** @deprecated Use {@link IncludeHeaders}. */
  get includeHeaders() {
    return this.IncludeHeaders;
  }
  /** @deprecated Use {@link IncludeHeaders}. */
  set includeHeaders(value) {
    this.IncludeHeaders = value;
  }
  SamplingMode: SamplingMode = 'all';

  /** @deprecated Use {@link SamplingMode}. */
  get samplingMode(): SamplingMode {
    return this.SamplingMode;
  }
  /** @deprecated Use {@link SamplingMode}. */
  set samplingMode(value: SamplingMode) {
    this.SamplingMode = value;
  }
  SampleCount = 100;

  /** @deprecated Use {@link SampleCount}. */
  get sampleCount() {
    return this.SampleCount;
  }
  /** @deprecated Use {@link SampleCount}. */
  set sampleCount(value) {
    this.SampleCount = value;
  }
  SampleInterval = 10;

  /** @deprecated Use {@link SampleInterval}. */
  get sampleInterval() {
    return this.SampleInterval;
  }
  /** @deprecated Use {@link SampleInterval}. */
  set sampleInterval(value) {
    this.SampleInterval = value;
  }

  // UI state
  IsExporting = false;

  /** @deprecated Use {@link IsExporting}. */
  get isExporting() {
    return this.IsExporting;
  }
  /** @deprecated Use {@link IsExporting}. */
  set isExporting(value) {
    this.IsExporting = value;
  }
  ExportError: string | null = null;

  /** @deprecated Use {@link ExportError}. */
  get exportError(): string | null {
    return this.ExportError;
  }
  /** @deprecated Use {@link ExportError}. */
  set exportError(value: string | null) {
    this.ExportError = value;
  }

  // Available options
  AvailableFormats: ExportFormat[] = ['excel', 'csv', 'json'];

  /** @deprecated Use {@link AvailableFormats}. */
  get availableFormats(): ExportFormat[] {
    return this.AvailableFormats;
  }
  /** @deprecated Use {@link AvailableFormats}. */
  set availableFormats(value: ExportFormat[]) {
    this.AvailableFormats = value;
  }
  SamplingModes: { mode: SamplingMode; label: string; description: string }[];

  /** @deprecated Use {@link SamplingModes}. */
  get samplingModes(): { mode: SamplingMode; label: string; description: string }[] {
    return this.SamplingModes;
  }
  /** @deprecated Use {@link SamplingModes}. */
  set samplingModes(value: { mode: SamplingMode; label: string; description: string }[]) {
    this.SamplingModes = value;
  }

  constructor(
    private exportService: ExportService,
    private cdr: ChangeDetectorRef
  ) {
    this.SamplingModes = this.exportService.getSamplingModes();
  }

  private _visible = false;
  @Input()
  get visible(): boolean {
    return this._visible;
  }
  set visible(value: boolean) {
    if (value && !this._visible) {
      this.initializeFromConfig();
    }
    this._visible = value;
    this.cdr.detectChanges();
  }

  @Input() Config: ExportDialogConfig | null = null;

  /** @deprecated Use {@link Config}. */
  @Input() set config(value: ExportDialogConfig | null) {
    this.Config = value;
  }
  /** @deprecated Use {@link Config}. */
  get config(): ExportDialogConfig | null {
    return this.Config;
  }

  @Output() Closed = new EventEmitter<ExportDialogResult>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closed = this.Closed;

  /**
   * Initialize form from config
   */
  private initializeFromConfig(): void {
    if (!this.Config) return;

    this.SelectedFormat = this.Config.defaultFormat || 'excel';
    this.FileName = this.Config.defaultFileName || 'export';
    this.SamplingMode = this.Config.defaultSamplingMode || 'all';
    this.SampleCount = this.Config.defaultSampleCount || 100;
    this.AvailableFormats = this.Config.availableFormats || ['excel', 'csv', 'json'];
    this.ExportError = null;
    this.IsExporting = false;
  }

  /**
   * Get format info for display
   */
  GetFormatInfo(format: ExportFormat) {
    return this.exportService.getFormatInfo(format);
  }

  /** @deprecated Use {@link GetFormatInfo}. */
  getFormatInfo(format: ExportFormat) {
    return this.GetFormatInfo(format);
  }

  /**
   * Check if sampling needs a count input
   */
  get NeedsSampleCount(): boolean {
    return this.SamplingMode === 'top' || this.SamplingMode === 'bottom' || this.SamplingMode === 'random';
  }

  /** @deprecated Use {@link NeedsSampleCount}. */
  get needsSampleCount(): boolean {
    return this.NeedsSampleCount;
  }

  /**
   * Check if sampling needs an interval input
   */
  get NeedsSampleInterval(): boolean {
    return this.SamplingMode === 'every-nth';
  }

  /** @deprecated Use {@link NeedsSampleInterval}. */
  get needsSampleInterval(): boolean {
    return this.NeedsSampleInterval;
  }

  /**
   * Get total row count
   */
  get TotalRows(): number {
    return this.Config?.data?.length || 0;
  }

  /** @deprecated Use {@link TotalRows}. */
  get totalRows(): number {
    return this.TotalRows;
  }

  /**
   * Estimate exported row count
   */
  get EstimatedRows(): number {
    const total = this.TotalRows;
    switch (this.SamplingMode) {
      case 'all':
        return total;
      case 'top':
      case 'bottom':
      case 'random':
        return Math.min(this.SampleCount, total);
      case 'every-nth':
        return Math.ceil(total / this.SampleInterval);
      default:
        return total;
    }
  }

  /** @deprecated Use {@link EstimatedRows}. */
  get estimatedRows(): number {
    return this.EstimatedRows;
  }

  /**
   * Get sampling description
   */
  get SamplingDescription(): string {
    switch (this.SamplingMode) {
      case 'all':
        return `Exporting all ${this.TotalRows.toLocaleString()} rows`;
      case 'top':
        return `Exporting first ${Math.min(this.SampleCount, this.TotalRows).toLocaleString()} rows`;
      case 'bottom':
        return `Exporting last ${Math.min(this.SampleCount, this.TotalRows).toLocaleString()} rows`;
      case 'random':
        return `Exporting ${Math.min(this.SampleCount, this.TotalRows).toLocaleString()} random rows`;
      case 'every-nth':
        return `Exporting every ${this.SampleInterval}${this.getOrdinalSuffix(this.SampleInterval)} row (~${this.EstimatedRows.toLocaleString()} rows)`;
      default:
        return '';
    }
  }

  /** @deprecated Use {@link SamplingDescription}. */
  get samplingDescription(): string {
    return this.SamplingDescription;
  }

  /**
   * Get ordinal suffix for number
   */
  private getOrdinalSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  /**
   * Handle format selection
   */
  SelectFormat(format: ExportFormat): void {
    this.SelectedFormat = format;
    this.ExportError = null;
  }

  /** @deprecated Use {@link SelectFormat}. */
  selectFormat(format: ExportFormat): void {
    return this.SelectFormat(format);
  }

  /**
   * Handle cancel button
   */
  OnCancel(): void {
    this._visible = false;
    this.Closed.emit({ exported: false });
  }

  /** @deprecated Use {@link OnCancel}. */
  onCancel(): void {
    return this.OnCancel();
  }

  /**
   * Handle export button
   */
  async OnExport(): Promise<void> {
    if (!this.Config?.data) {
      this.ExportError = 'No data to export';
      return;
    }

    this.IsExporting = true;
    this.ExportError = null;
    this.cdr.detectChanges();

    try {
      const options: Partial<ExportOptions> = {
        format: this.SelectedFormat,
        fileName: this.FileName,
        includeHeaders: this.IncludeHeaders,
        columns: this.Config.columns,
        sampling: this.exportService.buildSamplingOptions(
          this.SamplingMode,
          this.SampleCount,
          this.SampleInterval
        )
      };

      const result = await this.exportService.export(this.Config.data, options);

      if (result.success) {
        this.exportService.downloadResult(result);
        this._visible = false;
        this.Closed.emit({
          exported: true,
          result,
          options: options as ExportOptions
        });
      } else {
        this.ExportError = result.error || 'Export failed';
      }
    } catch (error) {
      this.ExportError = error instanceof Error ? error.message : 'Export failed';
    } finally {
      this.IsExporting = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link OnExport}. */
  async onExport(): Promise<void> {
    return this.OnExport();
  }

  /**
   * Check if show sampling options
   */
  get ShowSamplingOptions(): boolean {
    return this.Config?.showSamplingOptions !== false;
  }

  /** @deprecated Use {@link ShowSamplingOptions}. */
  get showSamplingOptions(): boolean {
    return this.ShowSamplingOptions;
  }

  /**
   * Get dialog title
   */
  get DialogTitle(): string {
    return this.Config?.dialogTitle || 'Export Data';
  }

  /** @deprecated Use {@link DialogTitle}. */
  get dialogTitle(): string {
    return this.DialogTitle;
  }
}
