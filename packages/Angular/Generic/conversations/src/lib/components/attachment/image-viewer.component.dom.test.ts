import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { ImageViewerComponent } from './image-viewer.component';

/**
 * DOM spec for <mj-image-viewer> — a pure @Input-driven lightbox (no services).
 * Covers @if(visible) gating, the filename branch, the zoom controls driving
 * zoomPercentage + the imageTransform getter, the img src/alt binding, and the
 * close button / backdrop → closed output.
 */
describe('ImageViewerComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(ImageViewerComponent, {
      imports: [CommonModule],
      declarations: [ImageViewerComponent],
      inputs: { visible: true, imageUrl: 'data:image/png;base64,AAA', alt: 'A picture', fileName: 'pic.png', ...inputs },
    });

  it('renders nothing when not visible', () => {
    const f = render({ visible: false });
    expect(query(f, '.image-viewer-backdrop')).toBeNull();
  });

  it('renders the image with its src and alt when visible', () => {
    const f = render();
    const img = query(f, 'img.viewer-image') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAA');
    expect(img.getAttribute('alt')).toBe('A picture');
  });

  it('renders the filename when provided', () => {
    const f = render();
    expect(text(f, '.file-name')).toContain('pic.png');
  });

  it('omits the filename element when not provided', () => {
    const f = render({ fileName: '' });
    expect(query(f, '.file-name')).toBeNull();
  });

  it('shows 100% zoom by default', () => {
    const f = render();
    expect(text(f, '.zoom-display')).toContain('100%');
  });

  it('increases the zoom display when Zoom In is clicked', () => {
    const f = render();
    (query(f, '.toolbar-center button[title="Zoom In"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(text(f, '.zoom-display')).toContain('125%');
  });

  it('decreases the zoom display when Zoom Out is clicked', () => {
    const f = render();
    (query(f, '.toolbar-center button[title="Zoom Out"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(text(f, '.zoom-display')).toContain('75%');
  });

  it('resets the zoom display to 100% after Reset Zoom', () => {
    const f = render();
    (query(f, 'button[title="Zoom In"]') as HTMLButtonElement).click();
    (query(f, 'button[title="Reset Zoom (100%)"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(text(f, '.zoom-display')).toContain('100%');
  });

  it('reflects the zoom level in the image transform style', () => {
    const f = render();
    (query(f, 'button[title="Zoom In"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect((query(f, 'img.viewer-image') as HTMLElement).style.transform).toContain('scale(1.25)');
  });

  it('emits closed when the close button is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.closed.subscribe(spy);
    (query(f, 'button.close-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('emits closed when the backdrop itself is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.closed.subscribe(spy);
    (query(f, '.image-viewer-backdrop') as HTMLElement).click();
    expect(spy).toHaveBeenCalled();
  });
});
