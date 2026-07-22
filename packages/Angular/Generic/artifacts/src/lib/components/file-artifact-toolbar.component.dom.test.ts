import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { FileArtifactToolbarComponent } from './file-artifact-toolbar.component';

/**
 * DOM-level spec for <mj-file-artifact-toolbar> — a pure @Input/@Output leaf.
 * Verifies the template contract: @if gating of nav/zoom/print sections,
 * [disabled] wiring on the page/zoom buttons, the filename binding, the
 * download spinner branch, and @Output emission on the action buttons.
 *
 * Module-declared (standalone:false), configured purely via inputs, so it is
 * rendered with `declarations: [FileArtifactToolbarComponent]`.
 */
describe('FileArtifactToolbarComponent (DOM)', () => {
  const render = (inputs?: Record<string, unknown>): ComponentFixture<FileArtifactToolbarComponent> =>
    renderComponentFixture(FileArtifactToolbarComponent, {
      declarations: [FileArtifactToolbarComponent],
      inputs,
    });

  const buttons = (f: ComponentFixture<FileArtifactToolbarComponent>, selector: string): HTMLButtonElement[] => queryAll(f, selector) as HTMLButtonElement[];

  it('renders the fileName in the center title', () => {
    const f = render({ fileName: 'report.pdf' });
    expect(query(f, '.file-toolbar__title')?.textContent?.trim()).toBe('report.pdf');
  });

  it('hides page navigation when totalPages <= 1', () => {
    const f = render({ totalPages: 1 });
    expect(query(f, '.file-toolbar__nav')).toBeNull();
  });

  it('shows page navigation when totalPages > 1, with "/ N" page count', () => {
    const f = render({ totalPages: 5, currentPage: 2 });
    expect(query(f, '.file-toolbar__nav')).not.toBeNull();
    expect(query(f, '.file-toolbar__page-of')?.textContent).toContain('5');
  });

  it('disables prev on the first page', () => {
    const first = buttons(render({ totalPages: 3, currentPage: 1 }), '.file-toolbar__nav .file-toolbar__icon-btn');
    expect(first[0].disabled).toBe(true); // prev
    expect(first[1].disabled).toBe(false); // next
  });

  it('disables next on the last page', () => {
    const last = buttons(render({ totalPages: 3, currentPage: 3 }), '.file-toolbar__nav .file-toolbar__icon-btn');
    expect(last[0].disabled).toBe(false); // prev
    expect(last[1].disabled).toBe(true); // next
  });

  it('hides the zoom controls by default', () => {
    expect(query(render(), '.file-toolbar__zoom')).toBeNull();
  });

  it('shows the zoom controls and percent when showZoom is set', () => {
    const f = render({ showZoom: true, zoomPercent: 125 });
    expect(query(f, '.file-toolbar__zoom')).not.toBeNull();
    expect(query(f, '.file-toolbar__zoom-level')?.textContent).toContain('125');
  });

  it('disables zoom-in/zoom-out per canZoomIn/canZoomOut', () => {
    const zoomBtns = buttons(render({ showZoom: true, canZoomIn: false, canZoomOut: false }), '.file-toolbar__zoom .file-toolbar__icon-btn');
    expect(zoomBtns[0].disabled).toBe(true); // zoom out
    expect(zoomBtns[1].disabled).toBe(true); // zoom in
  });

  const findPrint = (f: ComponentFixture<FileArtifactToolbarComponent>) => buttons(f, '.file-toolbar__btn').find((b) => b.textContent?.includes('Print'));

  it('shows the Print button by default', () => {
    expect(findPrint(render())).toBeDefined();
  });

  it('hides the Print button when showPrint is false', () => {
    expect(findPrint(render({ showPrint: false }))).toBeUndefined();
  });

  it('disables the download button and shows a spinner while downloading', () => {
    const f = render({ isDownloading: true });
    const dl = query(f, '.file-toolbar__btn--primary') as HTMLButtonElement;
    expect(dl.disabled).toBe(true);
    expect(dl.querySelector('i.fa-spin')).not.toBeNull();
  });

  it('emits download when the download button is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(FileArtifactToolbarComponent, {
      declarations: [FileArtifactToolbarComponent],
      setup: (c) => c.download.subscribe(spy),
    });
    (query(f, '.file-toolbar__btn--primary') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits print when the print button is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(FileArtifactToolbarComponent, {
      declarations: [FileArtifactToolbarComponent],
      setup: (c) => c.print.subscribe(spy),
    });
    const printBtn = buttons(f, '.file-toolbar__btn').find((b) => b.textContent?.includes('Print'))!;
    printBtn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits prevPage/nextPage when the nav arrows are clicked', () => {
    const prev = vi.fn();
    const next = vi.fn();
    const f = renderComponentFixture(FileArtifactToolbarComponent, {
      declarations: [FileArtifactToolbarComponent],
      inputs: { totalPages: 3, currentPage: 2 },
      setup: (c) => {
        c.prevPage.subscribe(prev);
        c.nextPage.subscribe(next);
      },
    });
    const navBtns = buttons(f, '.file-toolbar__nav .file-toolbar__icon-btn');
    navBtns[0].click();
    navBtns[1].click();
    expect(prev).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('emits pageChange with a validated page number on a valid page input edit', () => {
    const spy = vi.fn<(n: number) => void>();
    const f = renderComponentFixture(FileArtifactToolbarComponent, {
      declarations: [FileArtifactToolbarComponent],
      inputs: { totalPages: 5, currentPage: 1 },
      setup: (c) => c.pageChange.subscribe(spy),
    });
    const input = query(f, '.file-toolbar__page-input') as HTMLInputElement;
    input.value = '3';
    input.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('does not emit pageChange for an out-of-range page input, and snaps back', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(FileArtifactToolbarComponent, {
      declarations: [FileArtifactToolbarComponent],
      inputs: { totalPages: 5, currentPage: 2 },
      setup: (c) => c.pageChange.subscribe(spy),
    });
    const input = query(f, '.file-toolbar__page-input') as HTMLInputElement;
    input.value = '99';
    input.dispatchEvent(new Event('change'));
    expect(spy).not.toHaveBeenCalled();
    expect(input.value).toBe('2'); // snapped back to currentPage
  });
});
