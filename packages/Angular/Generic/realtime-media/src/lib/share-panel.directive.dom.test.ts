import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RenderComponentFixture, query } from '@memberjunction/ng-test-utils';
import type { MediaSharePanel } from './components/media-controls.component';
import { SharePanelRegistry } from './share-panel-registry';
import { SharePanelDirective } from './share-panel.directive';

/** A host that marks one section as a shareable panel while it is shown. */
@Component({
  standalone: true,
  imports: [SharePanelDirective],
  template: `
    @if (Shown) {
      <section class="board" [mjSharePanel]="Label" [mjSharePanelIcon]="Icon">Board</section>
    }
  `,
})
class PanelHostComponent {
  @Input() Shown = true;
  @Input() Label: string | null = 'Whiteboard';
  @Input() Icon: string | null = 'fa-solid fa-chalkboard';
}

/** DOM spec for `[mjSharePanel]`: it registers its element by its label while it has one, and takes it off as it goes. */
describe('SharePanelDirective (DOM)', () => {
  beforeEach(() => {
    // Desktop Chrome, as far as the registry can tell: getDisplayMedia and Region Capture. Without an
    // IntersectionObserver (the test setup's one never reports), every registered panel counts as on screen.
    const getDisplayMedia = async (): Promise<MediaStream> => {
      throw new Error('No picker in these tests.');
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
    vi.stubGlobal('CropTarget', { fromElement: async () => ({}) });
    vi.stubGlobal('IntersectionObserver', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  const render = (inputs: Record<string, unknown> = {}) => RenderComponentFixture(PanelHostComponent, { inputs });
  const registry = (): SharePanelRegistry => TestBed.inject(SharePanelRegistry);

  /** The panels a Share menu outside the page offers now. */
  const offered = (): readonly MediaSharePanel[] => {
    let panels: readonly MediaSharePanel[] = [];
    registry().PanelsFor$(document.createElement('div')).subscribe((list) => (panels = list)).unsubscribe();
    return panels;
  };

  const set = (f: ReturnType<typeof render>, name: string, value: unknown): void => {
    f.componentRef.setInput(name, value);
    f.detectChanges();
  };

  /** Lets the registry's queued changes reach its streams. */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('registers its element by its label and icon', () => {
    const f = render();
    const [panel] = offered();
    expect(panel).toEqual({ Key: panel.Key, Label: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
    expect(registry().Get(panel.Key)?.Element).toBe(query(f, '.board'));
  });

  it('renames the panel when its label or icon changes, keeping its key', () => {
    const f = render();
    const key = offered()[0].Key;
    set(f, 'Label', '  Sketch  ');
    set(f, 'Icon', '  fa-solid fa-pen  ');
    expect(offered()).toEqual([{ Key: key, Label: 'Sketch', Icon: 'fa-solid fa-pen' }]);
    set(f, 'Icon', '   ');
    expect(registry().Get(key)?.Icon).toBeNull();
    expect(offered()).toEqual([{ Key: key, Label: 'Sketch' }]);
  });

  it('leaves its element unmarked while the label is empty or null, and marks it again with a label', async () => {
    const removed: string[] = [];
    registry().Removed$.subscribe((key) => removed.push(key));
    const f = render({ Label: '   ' });
    expect(offered()).toEqual([]);

    set(f, 'Label', 'Whiteboard');
    const key = offered()[0].Key;
    set(f, 'Label', null);
    expect(offered()).toEqual([]);
    await settle();
    expect(removed).toEqual([key]);
    set(f, 'Label', 'Whiteboard');
    expect(offered()[0].Key).not.toBe(key);
  });

  it('takes the panel off when its element goes away', async () => {
    const removed: string[] = [];
    registry().Removed$.subscribe((key) => removed.push(key));
    const f = render();
    const key = offered()[0].Key;
    set(f, 'Shown', false);
    expect(offered()).toEqual([]);
    await settle();
    expect(removed).toEqual([key]);
  });

  it('adds no style, class or ARIA to its element', () => {
    const f = render();
    const board = query(f, '.board') as HTMLElement;
    // Angular's own markers (`_ngcontent-*`, and `ng-reflect-*` where enabled) aside.
    expect(board.getAttributeNames().filter((name) => !name.startsWith('_ng') && !name.startsWith('ng-reflect'))).toEqual(['class']);
    expect(board.className).toBe('board');
  });
});
