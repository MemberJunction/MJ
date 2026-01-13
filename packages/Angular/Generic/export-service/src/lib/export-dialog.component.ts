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
  selector: 'mj-export-dialog',
  templateUrl: './export-dialog.component.html',
  styleUrls: ['./export-dialog.component.css']
})
export class ExportDialogComponent {
  // Form state
  selectedFormat: ExportFormat = 'excel';
  fileName = 'export';
  includeHeaders = true;
  samplingMode: SamplingMode = 'all';
  sampleCount = 100;
  sampleInterval = 10;

  // UI state
  isExporting = false;
  exportError: string | null = null;

  // Available options
  availableFormats: ExportFormat[] = ['excel', 'csv', 'json'];
  samplingModes: { mode: SamplingMode; label: string; description: string }[];

  constructor(
    private exportService: ExportService,
    private cdr: ChangeDetectorRef
  ) {
    this.samplingModes = this.exportService.getSamplingModes();
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

  @Input() config: ExportDialogConfig | null = null;

  @Output() closed = new EventEmitter<ExportDialogResult>();

  /**
   * Initialize form from config
   */
  private initializeFromConfig(): void {
    if (!this.config) return;

    this.selectedFormat = this.config.defaultFormat || 'excel';
    this.fileName = this.config.defaultFileName || 'export';
    this.samplingMode = this.config.defaultSamplingMode || 'all';
    this.sampleCount = this.config.defaultSampleCount || 100;
    this.availableFormats = this.config.availableFormats || ['excel', 'csv', 'json'];
    this.exportError = null;
    this.isExporting = false;
  }

  /**
   * Get format info for display
   */
  getFormatInfo(format: ExportFormat) {
    return this.exportService.getFormatInfo(format);
  }

  /**
   * Check if sampling needs a count input
   */
  get needsSampleCount(): boolean {
    return this.samplingMode === 'top' || this.samplingMode === 'bottom' || this.samplingMode === 'random';
  }

  /**
   * Check if sampling needs an interval input
   */
  get needsSampleInterval(): boolean {
    return this.samplingMode === 'every-nth';
  }

  /**
   * Get total row count
   */
  get totalRows(): number {
    return this.config?.data?.length || 0;
  }

  /**
   * Estimate exported row count
   */
  get estimatedRows(): number {
    const total = this.totalRows;
    switch (this.samplingMode) {
      case 'all':
        return total;
      case 'top':
      case 'bottom':
      case 'random':
        return Math.min(this.sampleCount, total);
      case 'every-nth':
        return Math.ceil(total / this.sampleInterval);
      default:
        return total;
    }
  }

  /**
   * Get sampling description
   */
  get samplingDescription(): string {
    switch (this.samplingMode) {
      case 'all':
        return `Exporting all ${this.totalRows.toLocaleString()} rows`;
      case 'top':
        return `Exporting first ${Math.min(this.sampleCount, this.totalRows).toLocaleString()} rows`;
      case 'bottom':
        return `Exporting last ${Math.min(this.sampleCount, this.totalRows).toLocaleString()} rows`;
      case 'random':
        return `Exporting ${Math.min(this.sampleCount, this.totalRows).toLocaleString()} random rows`;
      case 'every-nth':
        return `Exporting every ${this.sampleInterval}${this.getOrdinalSuffix(this.sampleInterval)} row (~${this.estimatedRows.toLocaleString()} rows)`;
      default:
        return '';
    }
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
  selectFormat(format: ExportFormat): void {
    this.selectedFormat = format;
    this.exportError = null;
  }

  /**
   * Handle cancel button
   */
  onCancel(): void {
    this._visible = false;
    this.closed.emit({ exported: false });
  }

  /**
   * Handle export button
   */
  async onExport(): Promise<void> {
    if (!this.config?.data) {
      this.exportError = 'No data to export';
      return;
    }

    this.isExporting = true;
    this.exportError = null;
    this.cdr.detectChanges();

    try {
      const options: Partial<ExportOptions> = {
        format: this.selectedFormat,
        fileName: this.fileName,
        includeHeaders: this.includeHeaders,
        columns: this.config.columns,
        sampling: this.exportService.buildSamplingOptions(
          this.samplingMode,
          this.sampleCount,
          this.sampleInterval
        )
      };

      const result = await this.exportService.export(this.config.data, options);

      if (result.success) {
        this.exportService.downloadResult(result);
        this._visible = false;
        this.closed.emit({
          exported: true,
          result,
          options: options as ExportOptions
        });
      } else {
        this.exportError = result.error || 'Export failed';
      }
    } catch (error) {
      this.exportError = error instanceof Error ? error.message : 'Export failed';
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Check if show sampling options
   */
  get showSamplingOptions(): boolean {
    return this.config?.showSamplingOptions !== false;
  }

  /**
   * Get dialog title
   */
  get dialogTitle(): string {
    return this.config?.dialogTitle || 'Export Data';
  }
}
