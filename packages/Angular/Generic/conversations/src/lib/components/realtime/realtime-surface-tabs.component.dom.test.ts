import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';

/**
 * Golden Layout is faked for the same reason as in the driver's own spec: jsdom has no layout
 * engine, so the real one would report zeros and prove nothing. This spec is about the PANEL's
 * half of the contract — that `tabs` is untouched, that a `split` puts several surfaces on screen
 * at once through the same pane elements, and that switching between them never re-creates a
 * surface or leaks a layout.
 */
const { FakeVirtualLayout } = vi.hoisted(() => {
  interface FakeContainer {
    element: HTMLElement;
    virtualRectingRequiredEvent?: (container: FakeContainer, width: number, height: number) => void;
    virtualVisibilityChangeRequiredEvent?: (container: FakeContainer, visible: boolean) => void;
    virtualZIndexChangeRequiredEvent?: (container: FakeContainer, logicalZIndex: number, defaultZIndex: string) => void;
  }
  interface FakeLayoutConfig {
    root: { type: string; content: Array<{ componentState: unknown; title: string }> };
  }

  class FakeVirtualLayout {
    public static Instances: FakeVirtualLayout[] = [];
    public static PaneWidth = 400;
    public static PaneHeight = 300;

    public Destroyed = false;
    public LoadedConfig: FakeLayoutConfig | null = null;
    public Containers: FakeContainer[] = [];
    public resizeWithContainerAutomatically = false;

    constructor(
      public readonly Host: HTMLElement,
      private readonly bind: (container: FakeContainer, itemConfig: { componentState: unknown }) => unknown,
      private readonly unbind: (container: FakeContainer) => void
    ) {
      FakeVirtualLayout.Instances.push(this);
    }

    public loadLayout(config: FakeLayoutConfig): void {
      this.LoadedConfig = config;
      config.root.content.forEach((item, index) => {
        const element = this.Host.ownerDocument.createElement('div');
        const left = index * FakeVirtualLayout.PaneWidth;
        element.getBoundingClientRect = () => ({
          left, top: 0, right: left + FakeVirtualLayout.PaneWidth, bottom: FakeVirtualLayout.PaneHeight,
          width: FakeVirtualLayout.PaneWidth, height: FakeVirtualLayout.PaneHeight, x: left, y: 0,
          toJSON: () => ({})
        }) as DOMRect;
        this.Host.appendChild(element);
        const container: FakeContainer = { element };
        this.bind(container, { componentState: item.componentState });
        this.Containers.push(container);
        container.virtualRectingRequiredEvent?.(container, FakeVirtualLayout.PaneWidth, FakeVirtualLayout.PaneHeight);
      });
    }

    public setSize(): void { /* the fake's geometry is fixed */ }

    public destroy(): void {
      this.Destroyed = true;
      for (const container of this.Containers) {
        this.unbind(container);
        container.element.remove();
      }
      this.Containers = [];
    }
  }

  return { FakeVirtualLayout };
});

vi.mock('golden-layout', () => ({ VirtualLayout: FakeVirtualLayout }));

import { renderComponentFixture, queryAll, query } from '@memberjunction/ng-test-utils';
import { RealtimeSurfaceTabsComponent } from './realtime-surface-tabs.component';
import { RealtimeSessionState } from './realtime-session-state';

describe('RealtimeSurfaceTabsComponent layout modes (DOM)', () => {
  /** Give jsdom (which lays nothing out) a measured box, so the split can be established. */
  let restoreLayoutBoxes: (() => void) | null = null;

  const stubLayoutBoxes = (): void => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      return {
        left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
        toJSON: () => ({})
      } as DOMRect;
    };
    restoreLayoutBoxes = () => { HTMLElement.prototype.getBoundingClientRect = original; };
  };

  beforeEach(() => {
    FakeVirtualLayout.Instances = [];
    FakeVirtualLayout.PaneWidth = 400;
    FakeVirtualLayout.PaneHeight = 300;
  });

  afterEach(() => {
    restoreLayoutBoxes?.();
    restoreLayoutBoxes = null;
    document.getElementById('mj-realtime-split-gl-base')?.remove();
  });

  /**
   * The panel defers every layout decision by a microtask (and re-enters once the split host has
   * rendered), so a spec has to let those passes run. Bounded, never a bare sleep.
   */
  const settle = async (fixture: ComponentFixture<RealtimeSurfaceTabsComponent>): Promise<void> => {
    for (let i = 0; i < 6; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };

  const render = (inputs: Record<string, unknown> = {}, channelKeys: string[] = ['Site A', 'Site B']) =>
    renderComponentFixture(RealtimeSurfaceTabsComponent, {
      inputs: { State: new RealtimeSessionState(), ...inputs },
      setup: instance => {
        for (const key of channelKeys) {
          instance.Model.RegisterChannelTab({ Key: key, Title: key, Icon: 'fa-solid fa-chalkboard' });
        }
        instance.Model.Focus(channelKeys[0]);
      }
    });

  const panes = (fixture: ComponentFixture<RealtimeSurfaceTabsComponent>): HTMLElement[] =>
    queryAll(fixture, '.s-pane') as HTMLElement[];
  const tabs = (fixture: ComponentFixture<RealtimeSurfaceTabsComponent>): HTMLButtonElement[] =>
    queryAll(fixture, '.s-tab') as HTMLButtonElement[];

  // ── the layout that must not have moved ───────────────────────────────────────────────────
  describe('tabs (the default, and what every existing caller gets)', () => {
    it('defaults to tabs and never touches Golden Layout', async () => {
      const fixture = render();
      await settle(fixture);

      expect(fixture.componentInstance.Layout).toBe('tabs');
      expect(FakeVirtualLayout.Instances).toHaveLength(0);
      expect(query(fixture, '.surface__split')).toBeNull();
      expect((query(fixture, '.surface') as HTMLElement).classList.contains('surface--split')).toBe(false);
      expect(fixture.componentInstance.SplitEngaged).toBe(false);
    });

    it('shows exactly one pane — the focused one — and leaves every pane free of inline geometry', async () => {
      const fixture = render();
      await settle(fixture);

      const active = panes(fixture).filter(p => p.classList.contains('s-pane--active'));
      expect(active).toHaveLength(1);
      expect(active[0].dataset['channel']).toBe('Site A');
      // Nothing inline: the panel's stylesheet is the only thing deciding what shows.
      expect(panes(fixture).map(p => p.getAttribute('style'))).toEqual([null, null]);
    });

    it('renders the pane exactly as before, plus the channel name the issue asked for', async () => {
      const fixture = render();
      await settle(fixture);

      const pane = panes(fixture)[0];
      expect(pane.className).toBe('s-pane s-pane--active');
      // Nothing on the pane but what was always there and the channel name — no layout classes,
      // no stray attributes leaking in from the split. (`_ngcontent-*` is Angular's own scoping.)
      const attributes = Array.from(pane.attributes, a => a.name).filter(n => !n.startsWith('_ngcontent')).sort();
      expect(attributes).toEqual(['class', 'data-channel', 'role']);
      expect(pane.getAttribute('role')).toBe('tabpanel');
    });

    it('keeps the strip a single-select: one tab selected, none disabled', async () => {
      const fixture = render();
      await settle(fixture);

      expect(tabs(fixture).map(t => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
      expect(tabs(fixture).some(t => t.disabled)).toBe(false);
      expect(tabs(fixture).some(t => t.classList.contains('s-tab--outside-split'))).toBe(false);
    });

    it('still switches surface on a tab click', async () => {
      const fixture = render();
      await settle(fixture);

      tabs(fixture)[1].click();
      await settle(fixture);

      expect(fixture.componentInstance.Model.ActiveKey).toBe('Site B');
      const active = panes(fixture).filter(p => p.classList.contains('s-pane--active'));
      expect(active.map(p => p.dataset['channel'])).toEqual(['Site B']);
    });
  });

  // ── the layout the issue asked for ────────────────────────────────────────────────────────
  describe('split', () => {
    it('shows two surfaces at once, through the panel\'s own API', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split', SplitKeys: ['Site A', 'Site B'] });
      await settle(fixture);

      expect(fixture.componentInstance.SplitEngaged).toBe(true);
      expect(fixture.componentInstance.SplitMemberKeys).toEqual(['Site A', 'Site B']);
      expect(FakeVirtualLayout.Instances).toHaveLength(1);
      expect(FakeVirtualLayout.Instances[0].Host).toBe(query(fixture, '.surface__split'));

      // BOTH panes on screen at the same time, side by side — the whole point.
      const shown = panes(fixture).filter(p => p.style.display === 'flex');
      expect(shown.map(p => p.dataset['channel'])).toEqual(['Site A', 'Site B']);
      expect(shown.map(p => p.style.left)).toEqual(['0px', '400px']);
      expect(shown.every(p => p.style.position === 'absolute')).toBe(true);
      expect(shown.every(p => parseFloat(p.style.width) > 0 && parseFloat(p.style.height) > 0)).toBe(true);
    });

    it('reports every shown surface in the strip, and disables one the split is not showing', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split', SplitKeys: ['Site A', 'Site B'] }, ['Site A', 'Site B', 'Site C']);
      await settle(fixture);

      expect(tabs(fixture).map(t => t.getAttribute('aria-selected'))).toEqual(['true', 'true', 'false']);
      expect(tabs(fixture).map(t => t.disabled)).toEqual([false, false, true]);
      expect(query(fixture, '.s-tab--outside-split')?.getAttribute('title')).toBe('Site C');
      // The surface outside the split is hidden — including when it is the model's active tab.
      expect(panes(fixture)[2].style.display).toBe('');
    });

    it('splits every open surface when the host names none', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split' }, ['Site A', 'Site B', 'Site C']);
      await settle(fixture);

      expect(fixture.componentInstance.SplitMemberKeys).toEqual(['Site A', 'Site B', 'Site C']);
      expect(panes(fixture).filter(p => p.style.display === 'flex')).toHaveLength(3);
    });

    it('grows into a surface that registers later', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split', SplitKeys: ['Site A', 'Site B', 'Site C'] }, ['Site A', 'Site B']);
      await settle(fixture);
      expect(fixture.componentInstance.SplitMemberKeys).toEqual(['Site A', 'Site B']);

      fixture.componentInstance.Model.RegisterChannelTab({ Key: 'Site C', Title: 'Site C', Icon: 'fa-solid fa-globe' });
      await settle(fixture);

      expect(fixture.componentInstance.SplitMemberKeys).toEqual(['Site A', 'Site B', 'Site C']);
      expect(panes(fixture).filter(p => p.style.display === 'flex')).toHaveLength(3);
    });

    it('does not rebuild the arrangement when the membership has not changed', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split', SplitKeys: ['Site A', 'Site B'] });
      await settle(fixture);
      const arrangement = FakeVirtualLayout.Instances[0];

      // A surface outside the split joining, and a focus change, are both noise to it — a rebuild
      // would throw away wherever the user dragged the splitters.
      fixture.componentInstance.Model.RegisterChannelTab({ Key: 'Site C', Title: 'Site C', Icon: 'fa-solid fa-globe' });
      fixture.componentInstance.Model.Focus('Site B');
      await settle(fixture);

      expect(FakeVirtualLayout.Instances).toHaveLength(1);
      expect(arrangement.Destroyed).toBe(false);
    });

    it('stays on tabs when only one surface is open — a split of one is the tabs layout', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split', SplitKeys: ['Site A', 'Site B'] }, ['Site A']);
      await settle(fixture);

      expect(fixture.componentInstance.SplitEngaged).toBe(false);
      expect(FakeVirtualLayout.Instances).toHaveLength(0);
      expect(query(fixture, '.surface__split')).toBeNull();
      expect(panes(fixture)[0].classList.contains('s-pane--active')).toBe(true);
      expect(tabs(fixture)[0].disabled).toBe(false);
    });

    it('stays on tabs — loudly — when the host never gains a size', async () => {
      // No layout-box stub: jsdom reports 0×0, exactly the trap this mode exists to stop.
      vi.useFakeTimers();
      try {
        const fixture = render({ Layout: 'split', SplitKeys: ['Site A', 'Site B'] });
        await settle(fixture);
        expect(fixture.componentInstance.SplitEngaged).toBe(true); // waiting for a size

        await vi.advanceTimersByTimeAsync(5000);
        await settle(fixture);

        expect(fixture.componentInstance.SplitEngaged).toBe(false);
        expect(FakeVirtualLayout.Instances).toHaveLength(0);
        expect(panes(fixture).filter(p => p.classList.contains('s-pane--active'))).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── the constraint everything else follows from ───────────────────────────────────────────
  describe('switching layout', () => {
    it('keeps the SAME pane elements alive across tabs → split → tabs', async () => {
      stubLayoutBoxes();
      const fixture = render();
      await settle(fixture);
      const before = panes(fixture);
      const beforeContent = before.map(p => p.firstElementChild);
      expect(before).toHaveLength(2);

      fixture.componentRef.setInput('Layout', 'split');
      await settle(fixture);
      const during = panes(fixture);
      expect(during[0]).toBe(before[0]);
      expect(during[1]).toBe(before[1]);
      expect(during.map(p => p.firstElementChild)).toEqual(beforeContent);

      fixture.componentRef.setInput('Layout', 'tabs');
      await settle(fixture);
      const after = panes(fixture);
      expect(after[0]).toBe(before[0]);
      expect(after[1]).toBe(before[1]);
      expect(after.map(p => p.firstElementChild)).toEqual(beforeContent);
    });

    it('hands the panes back to the tabs layout with no inline geometry left over', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split' });
      await settle(fixture);
      expect(panes(fixture).every(p => p.style.position === 'absolute')).toBe(true);

      fixture.componentRef.setInput('Layout', 'tabs');
      await settle(fixture);

      expect(FakeVirtualLayout.Instances[0].Destroyed).toBe(true);
      expect(panes(fixture).map(p => p.getAttribute('style') ?? '')).toEqual(['', '']);
      expect(panes(fixture).filter(p => p.classList.contains('s-pane--active'))).toHaveLength(1);
      expect(query(fixture, '.surface__split')).toBeNull();
      expect(tabs(fixture).some(t => t.disabled)).toBe(false);
    });

    it('releases Golden Layout when the panel collapses, and re-splits when it re-opens', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split' });
      await settle(fixture);

      fixture.componentInstance.ToggleCollapsed();
      await settle(fixture);
      expect(FakeVirtualLayout.Instances[0].Destroyed).toBe(true);
      expect(fixture.componentInstance.SplitEngaged).toBe(false);

      fixture.componentInstance.ToggleCollapsed();
      await settle(fixture);
      expect(FakeVirtualLayout.Instances).toHaveLength(2);
      expect(FakeVirtualLayout.Instances[1].Destroyed).toBe(false);
      expect(fixture.componentInstance.SplitEngaged).toBe(true);
    });
  });

  describe('teardown', () => {
    it('destroys Golden Layout with the panel', async () => {
      stubLayoutBoxes();
      const fixture = render({ Layout: 'split' });
      await settle(fixture);
      expect(FakeVirtualLayout.Instances[0].Destroyed).toBe(false);

      fixture.destroy();

      expect(FakeVirtualLayout.Instances[0].Destroyed).toBe(true);
    });
  });
});
