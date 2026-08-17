import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { RealtimeSurfaceTabsComponent } from './realtime-surface-tabs.component';
import { RealtimeSessionState } from './realtime-session-state';

/**
 * DOM spec for the side-by-side surface layout (#3535).
 *
 * The panel showed exactly one pane at a time, and arranging two from OUTSIDE could not be done
 * honestly: MJ's `.surface { display: flex }` and a host's `.surface.my-split { display: grid }`
 * are both specificity (0,2,0), ties break on document order, and component styles are injected
 * after a startup stylesheet — so MJ won and `grid-template-columns` was silently ignored on a flex
 * container. These pin the component's own answer, so no host has to discover that.
 */
describe('RealtimeSurfaceTabsComponent — side-by-side surfaces (DOM)', () => {
  const render = () =>
    renderComponentFixture(RealtimeSurfaceTabsComponent, {
      inputs: { State: new RealtimeSessionState() },
    });

  /** `RegisterChannelTab` defers to a microtask (the component's NG0100 guard). */
  const flush = async (f: { detectChanges(): void }) => {
    await Promise.resolve();
    f.detectChanges();
  };

  /**
   * Sets the input the way a host template does — through the input machinery, which marks this
   * OnPush component dirty. Assigning the field directly does not, and the panel would keep
   * rendering the previous arrangement.
   */
  const setSplit = (f: { componentRef: { setInput(name: string, value: unknown): void }; detectChanges(): void }, keys: string[] | null) => {
    f.componentRef.setInput('SplitKeys', keys);
    f.detectChanges();
  };

  const withTabs = async (keys: string[]) => {
    const f = render();
    for (const key of keys) {
      f.componentInstance.RegisterChannelTab({ Key: key, Title: key, Icon: 'fa-solid fa-globe' });
    }
    await flush(f);
    return f;
  };

  it('stays tabbed by default — one pane displayed, no split marker', async () => {
    const f = await withTabs(['Left', 'Right']);

    expect(f.componentInstance.Layout).toBe('tabs');
    expect(query(f, '.surface')?.classList.contains('surface--split')).toBe(false);
    expect(queryAll(f, '.s-pane--split')).toHaveLength(0);
  });

  it('shows the named surfaces side by side', async () => {
    const f = await withTabs(['Left', 'Right']);
    setSplit(f, ['Left', 'Right']);

    expect(f.componentInstance.Layout).toBe('split');
    // Two things, both required: `surface--split` is what the stylesheet keys the grid off, and
    // `data-layout` is the stable attribute a host reads. Asserting only the second would let the
    // grid silently stop applying.
    expect(query(f, '.surface')?.classList.contains('surface--split')).toBe(true);
    expect(query(f, '.surface')?.getAttribute('data-layout')).toBe('split');
    expect(queryAll(f, '.s-pane--split')).toHaveLength(2);
    // The column count rides on the wrapper, so the grid matches the number of panes rather than
    // assuming two.
    expect(query(f, '.s-panes')?.getAttribute('style')).toContain('--surface-split-count: 2');
  });

  it('honours the host ORDER without moving the pane elements', async () => {
    // Panes render in registration order; a host asking for the reverse gets it via CSS `order`.
    // Moving the DOM instead would tear down and recreate the dynamic channel surfaces inside —
    // a live browser canvas would go blank because someone wanted it on the left.
    const f = await withTabs(['Left', 'Right']);
    setSplit(f, ['Right', 'Left']);

    const panes = queryAll(f, '.s-pane');
    expect(panes.map(p => p.getAttribute('data-channel'))).toEqual(['Left', 'Right']);
    expect((panes[0] as HTMLElement).style.order).toBe('1');
    expect((panes[1] as HTMLElement).style.order).toBe('0');
  });

  it('ignores keys for surfaces that do not exist yet', async () => {
    // A host names its arrangement up front; the channels arrive as the session gets going.
    const f = await withTabs(['Left']);
    setSplit(f, ['Left', 'NotHereYet']);

    expect(f.componentInstance.SplitTabKeys).toEqual(['Left']);
    // One present surface is not a split — falling back to tabs beats a one-column "grid".
    expect(f.componentInstance.Layout).toBe('tabs');
  });

  it('hides a focused surface that is not part of the arrangement', async () => {
    // Otherwise choosing a third tab would silently drop an extra pane into a two-column grid.
    const f = await withTabs(['Left', 'Right', 'Other']);
    f.componentInstance.Model.Focus('Other');
    setSplit(f, ['Left', 'Right']);

    const other = queryAll(f, '.s-pane').find(p => p.getAttribute('data-channel') === 'Other');
    expect(other?.classList.contains('s-pane--split')).toBe(false);
    expect(other?.classList.contains('s-pane--active')).toBe(true);   // still the focused TAB…
    expect(queryAll(f, '.s-pane--split')).toHaveLength(2);            // …but not a shown PANE
  });

  it('gives every pane its own identity so a host never matches by index', async () => {
    // Before this, panes were bare `.s-pane` elements and a host had to pair them with tabs by
    // position — which only worked because both lists render from the same array.
    const f = await withTabs(['Left', 'Right']);
    f.componentInstance.ShowActivityTab = true;
    await flush(f);

    const panes = queryAll(f, '.s-pane');
    expect(panes.map(p => p.getAttribute('data-channel'))).toEqual(['Left', 'Right', 'activity']);
    expect(panes.map(p => p.getAttribute('data-tab-kind'))).toEqual(['channel', 'channel', 'activity']);
  });

  it('treats null and an empty list as the ordinary tabbed panel', async () => {
    const f = await withTabs(['Left', 'Right']);
    setSplit(f, []);
    expect(f.componentInstance.Layout).toBe('tabs');

    setSplit(f, null);
    expect(f.componentInstance.Layout).toBe('tabs');
  });
});
