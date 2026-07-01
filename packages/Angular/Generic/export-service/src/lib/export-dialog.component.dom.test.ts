import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, attr, click } from '@memberjunction/ng-test-utils';
import { ExportDialogComponent } from './export-dialog.component';
import { ExportDialogConfig } from './export.service';

/**
 * DOM-level spec for <mj-export-dialog>.
 *
 * Module-declared (standalone:false) component configured via @Inputs, so it is
 * rendered with renderComponentFixture + declarations/imports. ExportService is
 * providedIn:'root' so TestBed supplies it automatically.
 *
 * Covers the template contract: @if gating on `visible`, the format @for with the
 * `selected` conditional class + click→selectFormat, the sampling section gating,
 * the summary bindings, the error @if, the Export/Cancel buttons and their
 * isExporting-driven labels, and the `closed` @Output on cancel.
 *
 * NOT covered here (correctly deferred): the actual export+download path
 * (onExport → ExportService.export/downloadResult), which performs a real
 * ExportEngine run + Blob/URL.createObjectURL/anchor-click download. That is a
 * file-system/binary side effect, not a template assertion, and belongs to the
 * export-engine unit tests / a live test.
 */
describe('ExportDialogComponent (DOM)', () => {
  const baseConfig = (over: Partial<ExportDialogConfig> = {}): ExportDialogConfig => ({
    data: [
      { Name: 'A', Value: 1 },
      { Name: 'B', Value: 2 },
      { Name: 'C', Value: 3 },
    ],
    ...over,
  });

  const renderVisible = (config: ExportDialogConfig, setup?: (c: ExportDialogComponent) => void): ComponentFixture<ExportDialogComponent> =>
    renderComponentFixture(ExportDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ExportDialogComponent],
      inputs: { config, visible: true },
      setup,
    });

  it('renders nothing when not visible', () => {
    const f = renderComponentFixture(ExportDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ExportDialogComponent],
      inputs: { config: baseConfig(), visible: false },
    });
    expect(query(f, '.mj-export-dialog')).toBeNull();
    expect(query(f, '.mj-export-backdrop')).toBeNull();
  });

  it('renders the dialog and backdrop when visible', () => {
    const f = renderVisible(baseConfig());
    expect(query(f, '.mj-export-dialog')).not.toBeNull();
    expect(query(f, '.mj-export-backdrop')).not.toBeNull();
  });

  it('sets dialog a11y attributes', () => {
    const f = renderVisible(baseConfig());
    const dialog = query(f, '.mj-export-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(attr(f, '.mj-export-dialog', 'aria-labelledby')).toBe('export-dialog-title');
  });

  it('renders the default dialog title', () => {
    const f = renderVisible(baseConfig());
    expect(text(f, '#export-dialog-title')).toBe('Export Data');
  });

  it('renders a custom dialog title from config', () => {
    const f = renderVisible(baseConfig({ dialogTitle: 'Download Report' }));
    expect(text(f, '#export-dialog-title')).toBe('Download Report');
  });

  it('renders one format button per available format with label and description', () => {
    const f = renderVisible(baseConfig({ availableFormats: ['excel', 'csv', 'json'] }));
    const btns = queryAll(f, '.mj-export-format-btn');
    expect(btns).toHaveLength(3);
    const labels = queryAll(f, '.mj-export-format-label').map((el) => el.textContent?.trim());
    expect(labels).toEqual(['Excel', 'CSV', 'JSON']);
  });

  it('honors a restricted availableFormats list', () => {
    const f = renderVisible(baseConfig({ availableFormats: ['csv'] }));
    expect(queryAll(f, '.mj-export-format-btn')).toHaveLength(1);
    expect(text(f, '.mj-export-format-label')).toBe('CSV');
  });

  it('marks the default format button as selected', () => {
    const f = renderVisible(baseConfig({ defaultFormat: 'csv', availableFormats: ['excel', 'csv', 'json'] }));
    const selected = queryAll(f, '.mj-export-format-btn.selected');
    expect(selected).toHaveLength(1);
    expect(selected[0].querySelector('.mj-export-format-label')?.textContent?.trim()).toBe('CSV');
  });

  it('moves the selected class when a different format is clicked', () => {
    const f = renderVisible(baseConfig({ defaultFormat: 'excel', availableFormats: ['excel', 'csv', 'json'] }));
    const btns = queryAll(f, '.mj-export-format-btn');
    // index 1 is CSV
    (btns[1] as HTMLButtonElement).click();
    f.detectChanges();
    expect(btns[0].classList.contains('selected')).toBe(false);
    expect(btns[1].classList.contains('selected')).toBe(true);
    expect(f.componentInstance.selectedFormat).toBe('csv');
  });

  it('shows the sampling section by default', () => {
    const f = renderVisible(baseConfig());
    expect(query(f, '.mj-export-sampling-row')).not.toBeNull();
    expect(queryAll(f, '.mj-export-select option')).toHaveLength(5);
  });

  it('hides the sampling section when showSamplingOptions is false', () => {
    const f = renderVisible(baseConfig({ showSamplingOptions: false }));
    expect(query(f, '.mj-export-sampling-row')).toBeNull();
  });

  it('shows the count input for a count-based sampling mode but not the interval input', () => {
    const f = renderVisible(baseConfig({ defaultSamplingMode: 'top' }));
    const inputs = queryAll(f, '.mj-export-number-input');
    expect(inputs).toHaveLength(1);
  });

  it('shows no number input for the "all" sampling mode', () => {
    const f = renderVisible(baseConfig({ defaultSamplingMode: 'all' }));
    expect(queryAll(f, '.mj-export-number-input')).toHaveLength(0);
  });

  it('renders the summary row counts (total available and estimated to export)', () => {
    const f = renderVisible(baseConfig()); // 3 rows, default mode "all"
    const values = queryAll(f, '.mj-export-summary-value').map((el) => el.textContent?.trim());
    expect(values).toEqual(['3', '3']);
  });

  it('reflects a "top N" sampling estimate capped at the total rows', () => {
    const f = renderVisible(baseConfig({ defaultSamplingMode: 'top', defaultSampleCount: 2 }));
    const values = queryAll(f, '.mj-export-summary-value').map((el) => el.textContent?.trim());
    expect(values[0]).toBe('3'); // total
    expect(values[1]).toBe('2'); // estimated (min of count and total)
  });

  it('renders the sampling description text', () => {
    const f = renderVisible(baseConfig());
    expect(text(f, '.mj-export-sampling-desc')).toBe('Exporting all 3 rows');
  });

  it('does not render an error block by default', () => {
    const f = renderVisible(baseConfig());
    expect(query(f, '.mj-export-error')).toBeNull();
  });

  it('renders the error block when an export error is present', () => {
    // Set the flag in setup (before the first detectChanges) — mutating it after render and
    // re-running CD trips the zoneless dev-mode NG0100 check on this component. See guide §5.
    const f = renderVisible(baseConfig(), (c) => (c.exportError = 'Something went wrong'));
    expect(query(f, '.mj-export-error')).not.toBeNull();
    expect(text(f, '.mj-export-error')).toContain('Something went wrong');
  });

  it('shows the Export label (not the spinner) when not exporting', () => {
    const f = renderVisible(baseConfig());
    const primary = query(f, '.mj-export-btn-primary')!;
    expect(primary.textContent).toContain('Export');
    expect(primary.querySelector('.fa-download')).not.toBeNull();
    expect(primary.querySelector('.fa-spinner')).toBeNull();
    expect((primary as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the spinner and disables both buttons while exporting', () => {
    const f = renderVisible(baseConfig(), (c) => (c.isExporting = true));
    const primary = query(f, '.mj-export-btn-primary') as HTMLButtonElement;
    const secondary = query(f, '.mj-export-btn-secondary') as HTMLButtonElement;
    expect(primary.querySelector('.fa-spinner')).not.toBeNull();
    expect(primary.textContent).toContain('Exporting...');
    expect(primary.disabled).toBe(true);
    expect(secondary.disabled).toBe(true);
  });

  it('emits closed({exported:false}) and hides when Cancel is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(ExportDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ExportDialogComponent],
      inputs: { config: baseConfig(), visible: true },
      setup: (c) => c.closed.subscribe(spy),
    });
    click(f, '.mj-export-btn-secondary');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ exported: false });
    f.detectChanges();
    expect(query(f, '.mj-export-dialog')).toBeNull();
  });

  it('emits closed({exported:false}) when the backdrop is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(ExportDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ExportDialogComponent],
      inputs: { config: baseConfig(), visible: true },
      setup: (c) => c.closed.subscribe(spy),
    });
    click(f, '.mj-export-backdrop');
    expect(spy).toHaveBeenCalledWith({ exported: false });
  });

  it('emits closed({exported:false}) when the header close button is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(ExportDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ExportDialogComponent],
      inputs: { config: baseConfig(), visible: true },
      setup: (c) => c.closed.subscribe(spy),
    });
    click(f, '.mj-export-close');
    expect(spy).toHaveBeenCalledWith({ exported: false });
  });

  it('sets an error and emits nothing when Export is clicked with no data', async () => {
    const spy = vi.fn();
    const f = renderComponentFixture(ExportDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ExportDialogComponent],
      // config with no data property → onExport short-circuits to an error
      inputs: { config: {} as ExportDialogConfig, visible: true },
      setup: (c) => c.closed.subscribe(spy),
    });
    await f.componentInstance.onExport();
    f.detectChanges();
    expect(spy).not.toHaveBeenCalled();
    expect(f.componentInstance.exportError).toBe('No data to export');
    expect(query(f, '.mj-export-error')).not.toBeNull();
  });
});
