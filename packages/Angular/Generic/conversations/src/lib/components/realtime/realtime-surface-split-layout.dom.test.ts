import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Golden Layout stands in for the real thing here: it is a browser layout engine and jsdom has
 * no layout, so the real one would report zeros for everything and prove nothing. The fake keeps
 * GL's CONTRACT — construct, `loadLayout` binds one component per config entry, each bound
 * container is handed its geometry through the virtual events, `destroy` releases it all — which
 * is the half this driver is responsible for. The geometry itself (that GL really does report
 * side-by-side rects for a headerless row, and really does re-rect on resize) is verified in a
 * REAL browser by `scripts/verify-split-layout.mjs`; see that script's header.
 */
const { FakeVirtualLayout } = vi.hoisted(() => {
  interface FakeContainer {
    element: HTMLElement;
    virtualRectingRequiredEvent?: (container: FakeContainer, width: number, height: number) => void;
    virtualVisibilityChangeRequiredEvent?: (container: FakeContainer, visible: boolean) => void;
    virtualZIndexChangeRequiredEvent?: (container: FakeContainer, logicalZIndex: number, defaultZIndex: string) => void;
  }
  interface FakeComponentConfig {
    componentType: string;
    componentState: unknown;
    title: string;
    isClosable: boolean;
  }
  interface FakeLayoutConfig {
    root: { type: string; content: FakeComponentConfig[] };
    header: { show: false | string };
    settings: { reorderEnabled: boolean };
  }

  class FakeVirtualLayout {
    /** Every instance created this test — the driver should only ever leave one alive. */
    public static Instances: FakeVirtualLayout[] = [];
    /** Per-pane geometry the fake reports. Set to 0 to reproduce the zero-size collapse. */
    public static PaneWidth = 400;
    public static PaneHeight = 300;

    public Destroyed = false;
    public LoadedConfig: FakeLayoutConfig | null = null;
    public Size: { Width: number; Height: number } | null = null;
    public Containers: FakeContainer[] = [];
    public resizeWithContainerAutomatically = false;

    constructor(
      private readonly host: HTMLElement,
      private readonly bind: (container: FakeContainer, itemConfig: { componentState: unknown }) => unknown,
      private readonly unbind: (container: FakeContainer) => void
    ) {
      FakeVirtualLayout.Instances.push(this);
    }

    public loadLayout(config: FakeLayoutConfig): void {
      this.LoadedConfig = config;
      config.root.content.forEach((item, index) => {
        const element = this.host.ownerDocument.createElement('div');
        element.className = 'lm_content';
        const left = index * FakeVirtualLayout.PaneWidth;
        element.getBoundingClientRect = () => ({
          left, top: 0, right: left + FakeVirtualLayout.PaneWidth, bottom: FakeVirtualLayout.PaneHeight,
          width: FakeVirtualLayout.PaneWidth, height: FakeVirtualLayout.PaneHeight, x: left, y: 0,
          toJSON: () => ({})
        }) as DOMRect;
        this.host.appendChild(element);
        const container: FakeContainer = { element };
        this.bind(container, { componentState: item.componentState });
        this.Containers.push(container);
        container.virtualRectingRequiredEvent?.(container, FakeVirtualLayout.PaneWidth, FakeVirtualLayout.PaneHeight);
        container.virtualZIndexChangeRequiredEvent?.(container, 0, '10');
      });
    }

    public setSize(Width: number, Height: number): void {
      this.Size = { Width, Height };
    }

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

import {
  ComputeSplitPaneRect, EnsureSplitLayoutBaseStyles, RealtimeSplitPane, RealtimeSurfaceSplitLayout,
  RestoreSplitPaneElement, SPLIT_LAYOUT_HOST_CLASS, SplitPaneKeyFromState
} from './realtime-surface-split-layout';

describe('ComputeSplitPaneRect', () => {
  it('places a pane over its container, in the positioned root\'s coordinates', () => {
    // Host sits 40px down the panel (below the tab strip) and 1px in (the panel's left border).
    const rect = ComputeSplitPaneRect(
      { Left: 1, Top: 40 },
      { Left: 501, Top: 140 },   // host on screen
      { Left: 901, Top: 140 },   // second container, 400px along
      400,
      300
    );
    expect(rect).toEqual({ Left: 401, Top: 40, Width: 400, Height: 300 });
  });

  it('is an identity offset for a container that starts exactly at the host', () => {
    expect(ComputeSplitPaneRect({ Left: 0, Top: 0 }, { Left: 10, Top: 20 }, { Left: 10, Top: 20 }, 100, 50))
      .toEqual({ Left: 0, Top: 0, Width: 100, Height: 50 });
  });
});

describe('SplitPaneKeyFromState', () => {
  it('reads the key from a component state', () => {
    expect(SplitPaneKeyFromState({ Key: 'Whiteboard' })).toBe('Whiteboard');
  });

  it('returns null for anything that is not a keyed object', () => {
    expect(SplitPaneKeyFromState(null)).toBeNull();
    expect(SplitPaneKeyFromState('Whiteboard')).toBeNull();
    expect(SplitPaneKeyFromState(['Whiteboard'])).toBeNull();
    expect(SplitPaneKeyFromState({ Key: 7 })).toBeNull();
    expect(SplitPaneKeyFromState({})).toBeNull();
  });
});

describe('EnsureSplitLayoutBaseStyles', () => {
  afterEach(() => {
    document.getElementById('mj-realtime-split-gl-base')?.remove();
  });

  it('injects the structural rules once, however many layouts attach', () => {
    EnsureSplitLayoutBaseStyles(document);
    EnsureSplitLayoutBaseStyles(document);
    const styles = document.querySelectorAll('#mj-realtime-split-gl-base');
    expect(styles).toHaveLength(1);
    // The rule that decides whether two surfaces sit side by side or silently stack.
    expect(styles[0].textContent).toContain(`.${SPLIT_LAYOUT_HOST_CLASS} .lm_row > .lm_item { float: left; }`);
  });
});

describe('RealtimeSurfaceSplitLayout', () => {
  let host: HTMLElement;
  let panes: RealtimeSplitPane[];

  const makePane = (key: string): RealtimeSplitPane => {
    const element = document.createElement('div');
    element.className = 's-pane';
    element.dataset['channel'] = key;
    document.body.appendChild(element);
    return { Key: key, Title: key, Element: element };
  };

  beforeEach(() => {
    FakeVirtualLayout.Instances = [];
    FakeVirtualLayout.PaneWidth = 400;
    FakeVirtualLayout.PaneHeight = 300;
    host = document.createElement('div');
    document.body.appendChild(host);
    panes = [makePane('Site A'), makePane('Site B')];
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.getElementById('mj-realtime-split-gl-base')?.remove();
  });

  it('arranges the panes as a headerless Golden Layout row', () => {
    const layout = new RealtimeSurfaceSplitLayout();

    expect(layout.Attach(host, panes)).toBe(true);

    expect(FakeVirtualLayout.Instances).toHaveLength(1);
    const gl = FakeVirtualLayout.Instances[0];
    expect(gl.LoadedConfig?.root.type).toBe('row');
    expect(gl.LoadedConfig?.root.content.map(c => c.componentState)).toEqual([{ Key: 'Site A' }, { Key: 'Site B' }]);
    // Headers off: the panel's own tab strip is the panel's identity, GL only splits.
    expect(gl.LoadedConfig?.header.show).toBe(false);
    // Nothing in a live session's split may be closed or re-ordered out from under it.
    expect(gl.LoadedConfig?.root.content.every(c => c.isClosable === false)).toBe(true);
    expect(gl.LoadedConfig?.settings.reorderEnabled).toBe(false);
    expect(gl.resizeWithContainerAutomatically).toBe(true);
    expect(layout.IsAttached).toBe(true);
    expect(layout.PaneKeys).toEqual(['Site A', 'Site B']);
  });

  it('reports NO arranged panes until an attach has actually succeeded', () => {
    FakeVirtualLayout.PaneWidth = 0;
    FakeVirtualLayout.PaneHeight = 0;
    const layout = new RealtimeSurfaceSplitLayout();
    expect(layout.PaneKeys).toEqual([]);

    layout.Attach(host, panes);

    // A request that could not be honoured must never read as "already arranged".
    expect(layout.PaneKeys).toEqual([]);
  });

  it('positions the SAME pane elements it was given — never a copy, never re-parented', () => {
    const layout = new RealtimeSurfaceSplitLayout();
    const parents = panes.map(p => p.Element.parentElement);

    layout.Attach(host, panes);

    expect(panes.map(p => p.Element.parentElement)).toEqual(parents);
    expect(panes[0].Element.style.left).toBe('0px');
    expect(panes[0].Element.style.width).toBe('400px');
    expect(panes[1].Element.style.left).toBe('400px');
    expect(panes.every(p => p.Element.style.position === 'absolute')).toBe(true);
    expect(panes.every(p => p.Element.style.display === 'flex')).toBe(true);
  });

  it('follows Golden Layout\'s visibility events for a pane it is arranging', () => {
    const layout = new RealtimeSurfaceSplitLayout();
    layout.Attach(host, panes);
    const container = FakeVirtualLayout.Instances[0].Containers[1];

    container.virtualVisibilityChangeRequiredEvent?.(container, false);
    expect(panes[1].Element.style.display).toBe('none');

    container.virtualVisibilityChangeRequiredEvent?.(container, true);
    expect(panes[1].Element.style.display).toBe('flex');
  });

  it('scopes the structural stylesheet to the host it marks', () => {
    const layout = new RealtimeSurfaceSplitLayout();
    layout.Attach(host, panes);

    expect(host.classList.contains(SPLIT_LAYOUT_HOST_CLASS)).toBe(true);
    expect(document.getElementById('mj-realtime-split-gl-base')).not.toBeNull();

    layout.Destroy();
    expect(host.classList.contains(SPLIT_LAYOUT_HOST_CLASS)).toBe(false);
  });

  it('hands every pane back untouched on Destroy', () => {
    const layout = new RealtimeSurfaceSplitLayout();
    layout.Attach(host, panes);

    layout.Destroy();

    expect(FakeVirtualLayout.Instances[0].Destroyed).toBe(true);
    expect(layout.IsAttached).toBe(false);
    // Not one leftover inline property — the tabs layout owns these panes again.
    expect(panes.map(p => p.Element.getAttribute('style') ?? '')).toEqual(['', '']);
    expect(panes.map(p => p.Element.className)).toEqual(['s-pane', 's-pane']);
  });

  it('is idempotent: Destroy without an Attach, and Attach over a live layout', () => {
    const layout = new RealtimeSurfaceSplitLayout();
    expect(() => layout.Destroy()).not.toThrow();

    layout.Attach(host, panes);
    layout.Attach(host, panes);

    expect(FakeVirtualLayout.Instances).toHaveLength(2);
    expect(FakeVirtualLayout.Instances[0].Destroyed).toBe(true);
    expect(FakeVirtualLayout.Instances[1].Destroyed).toBe(false);
  });

  it('refuses a single pane — one surface side by side with nothing is the tabs layout', () => {
    const layout = new RealtimeSurfaceSplitLayout();
    expect(layout.Attach(host, [panes[0]])).toBe(false);
    expect(FakeVirtualLayout.Instances).toHaveLength(0);
  });

  it('FAILS LOUDLY when the layout produces no area, instead of leaving a blank panel', () => {
    // The zero-height container trap: GL lays its whole tree into nothing and reports no error.
    FakeVirtualLayout.PaneWidth = 0;
    FakeVirtualLayout.PaneHeight = 0;
    const layout = new RealtimeSurfaceSplitLayout();

    expect(layout.Attach(host, panes)).toBe(false);

    expect(layout.IsAttached).toBe(false);
    expect(FakeVirtualLayout.Instances[0].Destroyed).toBe(true);
    expect(panes.map(p => p.Element.getAttribute('style') ?? '')).toEqual(['', '']);
  });

  it('reports a Golden Layout that throws on init rather than half-attaching', () => {
    const boom = vi.spyOn(FakeVirtualLayout.prototype, 'loadLayout').mockImplementation(() => {
      throw new Error('layout config rejected');
    });
    const layout = new RealtimeSurfaceSplitLayout();

    expect(layout.Attach(host, panes)).toBe(false);
    expect(layout.IsAttached).toBe(false);
    expect(FakeVirtualLayout.Instances[0].Destroyed).toBe(true);

    boom.mockRestore();
  });
});

describe('RestoreSplitPaneElement', () => {
  it('removes exactly the properties the split writes, leaving the rest alone', () => {
    const element = document.createElement('div');
    element.style.setProperty('position', 'absolute');
    element.style.setProperty('left', '10px');
    element.style.setProperty('top', '20px');
    element.style.setProperty('width', '30px');
    element.style.setProperty('height', '40px');
    element.style.setProperty('display', 'flex');
    element.style.setProperty('z-index', '5');
    element.style.setProperty('opacity', '0.5');

    RestoreSplitPaneElement(element);

    expect(element.getAttribute('style')).toBe('opacity: 0.5;');
  });
});
