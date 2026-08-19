import {
  ComponentContainer, LayoutConfig, LogicalZIndex, ResolvedComponentItemConfig, RowOrColumnItemConfig,
  VirtualLayout
} from 'golden-layout';
import { LogError } from '@memberjunction/core';

/** The Golden Layout `componentType` every surface pane is registered under. */
const SPLIT_COMPONENT_TYPE = 'mj-realtime-surface-pane';

/**
 * The smallest pane size {@link RealtimeSurfaceSplitLayout.Attach} accepts as "laid out". Golden
 * Layout delivers virtual rects synchronously from `loadLayout` / `setSize`, so one post-attach
 * measurement settles it — the constant exists so the postcondition reads as a named rule rather
 * than a bare `> 0` buried in a filter.
 */
const MIN_LAID_OUT_PANE_PX = 1;

/**
 * The inline style properties this layout writes onto a pane element. Recorded as ONE list so
 * teardown restores a pane exactly (every property written is a property removed) — the panes are
 * shared with the tabs layout, and a leftover `position: absolute` would break it silently.
 */
const MANAGED_PANE_STYLE_PROPERTIES = ['position', 'left', 'top', 'width', 'height', 'display', 'z-index'] as const;

/** DOM id of the one-time structural stylesheet {@link EnsureSplitLayoutBaseStyles} injects. */
const SPLIT_BASE_STYLE_ELEMENT_ID = 'mj-realtime-split-gl-base';

/** Class placed on the Golden Layout host element — the scope for the structural stylesheet. */
export const SPLIT_LAYOUT_HOST_CLASS = 'mj-realtime-split-host';

/**
 * One surface pane the split layout arranges: the channel key it belongs to, its tab title
 * (Golden Layout wants a title per component even with headers hidden), and the LIVE pane
 * element — which stays exactly where it is in the panel's own template. Golden Layout never
 * takes ownership of it; see {@link RealtimeSurfaceSplitLayout}.
 */
export interface RealtimeSplitPane {
  /** The pane's channel key (`RealtimeSurfaceTab.Key`). */
  Key: string;
  /** The pane's tab title, handed to Golden Layout as the component title. */
  Title: string;
  /** The pane element the layout positions. NEVER re-parented. */
  Element: HTMLElement;
}

/** A pane's computed position, relative to the panel's positioned root (px). */
export interface SplitPaneRect {
  Left: number;
  Top: number;
  Width: number;
  Height: number;
}

/**
 * Where a pane must sit so it covers the Golden Layout container that represents it.
 *
 * The pane is absolutely positioned against the surface panel (the nearest positioned
 * ancestor), NOT against the layout host — so the host's own offset within the panel has to be
 * added back. `offsetLeft`/`offsetTop` are measured to exactly the same box that `left`/`top`
 * resolve against (the offset parent's padding box), which is why they're used instead of
 * subtracting border widths by hand: the panel carries a 1px left border in one presentation
 * and none in the other, and that difference is precisely what offsetLeft already accounts for.
 *
 * Pure so the geometry is unit-testable without a layout engine.
 *
 * @param hostOffset  The layout host's `offsetLeft`/`offsetTop` within the positioned root.
 * @param hostViewport The layout host's viewport-relative origin (`getBoundingClientRect`).
 * @param containerViewport The Golden Layout container's viewport-relative origin.
 * @param width Container width, as reported by Golden Layout.
 * @param height Container height, as reported by Golden Layout.
 */
export function ComputeSplitPaneRect(
  hostOffset: { Left: number; Top: number },
  hostViewport: { Left: number; Top: number },
  containerViewport: { Left: number; Top: number },
  width: number,
  height: number
): SplitPaneRect {
  return {
    Left: hostOffset.Left + (containerViewport.Left - hostViewport.Left),
    Top: hostOffset.Top + (containerViewport.Top - hostViewport.Top),
    Width: width,
    Height: height
  };
}

/**
 * Injects (once per document) the STRUCTURAL Golden Layout rules the split arrangement needs,
 * scoped to {@link SPLIT_LAYOUT_HOST_CLASS}.
 *
 * Golden Layout ships its structure in `golden-layout/dist/css/goldenlayout-base.css`, which
 * Explorer-based apps import globally — but this panel renders inside a conversation widget that
 * any host may embed, and a MISSING stylesheet fails the worst possible way: GL's inline
 * width/height still land on its items, the items just stop floating, so both surfaces silently
 * stack instead of sitting side by side. Rather than document a global-CSS prerequisite and hope,
 * the few rules that decide geometry are carried here. They are byte-equivalent to GL's own, so an
 * app that DOES ship the base stylesheet sees no difference; everything cosmetic (themes, headers,
 * drag proxies) still comes from the app.
 */
export function EnsureSplitLayoutBaseStyles(doc: Document): void {
  if (doc.getElementById(SPLIT_BASE_STYLE_ELEMENT_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = SPLIT_BASE_STYLE_ELEMENT_ID;
  style.textContent = `
.${SPLIT_LAYOUT_HOST_CLASS} .lm_root { position: relative; }
.${SPLIT_LAYOUT_HOST_CLASS} .lm_row > .lm_item { float: left; }
.${SPLIT_LAYOUT_HOST_CLASS} .lm_column > .lm_item { position: relative; }
.${SPLIT_LAYOUT_HOST_CLASS} .lm_content { overflow: hidden; position: relative; }
.${SPLIT_LAYOUT_HOST_CLASS} .lm_splitter { position: relative; z-index: 2; touch-action: none; background: var(--mj-border-default); }
.${SPLIT_LAYOUT_HOST_CLASS} .lm_splitter.lm_horizontal { float: left; height: 100%; }
.${SPLIT_LAYOUT_HOST_CLASS} .lm_splitter.lm_horizontal .lm_drag_handle { height: 100%; position: absolute; cursor: ew-resize; touch-action: none; user-select: none; }
.${SPLIT_LAYOUT_HOST_CLASS} .lm_splitter.lm_vertical .lm_drag_handle { width: 100%; position: absolute; cursor: ns-resize; touch-action: none; user-select: none; }
`;
  doc.head.appendChild(style);
}

/**
 * Arranges a set of the surface panel's panes SIDE BY SIDE (with draggable splitters) using
 * Golden Layout — the panel's `Layout="split"` mode.
 *
 * The one design constraint everything else follows from: **a pane is never re-parented and never
 * re-created**. A channel surface holds live state (a whiteboard's drawing, a remote browser's
 * page, a media element's stream) that moving its DOM would destroy, and the panel's whole
 * contract is that panes stay alive while hidden. So the panes stay children of the panel's own
 * template and Golden Layout runs in VIRTUAL component mode: GL owns only its splitters and the
 * (invisible, headerless) container boxes, and reports where each box is; this class copies that
 * geometry onto the corresponding pane as inline `position/left/top/width/height`. Switching
 * back to tabs removes those inline properties and the panes fall straight back to the tab
 * layout's CSS — no re-render, no state loss.
 *
 * Positioning via inline styles is also what makes the mode declarable at all: inline styles
 * outrank every stylesheet, so neither the panel's own rules nor a host's can silently win the
 * specificity tie that made this arrangement impossible to impose from outside (issue #3535).
 *
 * Callers own the lifecycle: {@link Attach} once the host element has a measured size,
 * {@link Destroy} on teardown or when leaving split mode.
 */
export class RealtimeSurfaceSplitLayout {
  private layout: VirtualLayout | null = null;
  /** The layout host, kept for the per-pane offset math and resize handling. */
  private host: HTMLElement | null = null;
  /** Panes by key — the bind handler resolves the element GL asks about through this. */
  private panes = new Map<string, RealtimeSplitPane>();

  /** Whether a Golden Layout instance is currently arranging panes. */
  public get IsAttached(): boolean {
    return this.layout !== null;
  }

  /**
   * The panes this layout is ACTUALLY arranging, left to right — empty when not attached. The
   * owner compares its requested set against this (rather than against what it last asked for)
   * to decide whether anything needs rebuilding: a request that hasn't been honoured yet must
   * not read as already done.
   */
  public get PaneKeys(): ReadonlyArray<string> {
    return this.layout === null ? [] : [...this.panes.keys()];
  }

  /**
   * Builds a Golden Layout row over `panes` inside `host` and positions each pane over its
   * container.
   *
   * The caller MUST have established that `host` has a non-zero measured size: Golden Layout
   * lays its entire tree into whatever the container reports at init and reports no error when
   * that is nothing, which is the failure this whole mode exists to stop repeating. That
   * postcondition is re-checked here — a pane that ends up with no area fails the attach loudly
   * instead of leaving a blank panel.
   *
   * @param host The (measured) element Golden Layout renders its splitters into.
   * @param panes The panes to arrange, left to right. Two or more; a single pane is the tabs
   *              layout's job.
   * @returns `true` when every pane was laid out with real area. On `false` the layout has
   *          already been torn down and the caller should fall back to the tabs presentation.
   */
  public Attach(host: HTMLElement, panes: RealtimeSplitPane[]): boolean {
    if (panes.length < 2) {
      LogError(`RealtimeSurfaceSplitLayout.Attach requires at least 2 panes, got ${panes.length}`);
      return false;
    }
    this.Destroy();
    EnsureSplitLayoutBaseStyles(host.ownerDocument);
    host.classList.add(SPLIT_LAYOUT_HOST_CLASS);
    this.host = host;
    this.panes = new Map(panes.map(p => [p.Key, p]));

    try {
      this.layout = new VirtualLayout(
        host,
        (container, itemConfig) => this.bindPane(container, itemConfig),
        () => { /* per-pane cleanup is done in Destroy, which owns every managed element */ }
      );
      // GL watches the container itself, so a panel resize (the shell's drag handle, a window
      // resize, the panel collapsing) re-rects the panes without any wiring of our own.
      this.layout.resizeWithContainerAutomatically = true;
      this.layout.loadLayout(this.buildLayoutConfig(panes));
      const rect = host.getBoundingClientRect();
      this.layout.setSize(rect.width, rect.height);
    } catch (err) {
      LogError(`RealtimeSurfaceSplitLayout failed to initialise Golden Layout for panes [${panes.map(p => p.Key).join(', ')}]: ${err instanceof Error ? err.message : String(err)}`);
      this.Destroy();
      return false;
    }

    const unplaced = panes.filter(p => !this.isLaidOut(p.Element)).map(p => p.Key);
    if (unplaced.length > 0) {
      LogError(`RealtimeSurfaceSplitLayout laid out no area for pane(s) [${unplaced.join(', ')}] — the layout host measured ${host.getBoundingClientRect().width}×${host.getBoundingClientRect().height}. Falling back to the tabs layout.`);
      this.Destroy();
      return false;
    }
    return true;
  }

  /**
   * Re-measures the layout against its host. Golden Layout resizes with the container on its own
   * (see {@link Attach}); this is for the cases it cannot observe — a host that moved without
   * changing size, e.g. the panel's siblings collapsing.
   */
  public UpdateSize(): void {
    if (!this.layout || !this.host) {
      return;
    }
    const rect = this.host.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.layout.setSize(rect.width, rect.height);
    }
  }

  /**
   * Tears the layout down and hands every pane back to the tabs layout exactly as it was found:
   * Golden Layout's own DOM goes with it, and each managed pane loses every inline property this
   * class wrote. Safe to call when not attached.
   */
  public Destroy(): void {
    try {
      this.layout?.destroy();
    } catch (err) {
      // A GL teardown throw must not strand panes mid-arrangement — report it and finish the job.
      LogError(`RealtimeSurfaceSplitLayout failed to destroy Golden Layout: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.layout = null;
      for (const pane of this.panes.values()) {
        RestoreSplitPaneElement(pane.Element);
      }
      this.panes.clear();
      this.host?.classList.remove(SPLIT_LAYOUT_HOST_CLASS);
      this.host = null;
    }
  }

  /** A headerless row of one component per pane — GL contributes splitters, nothing else. */
  private buildLayoutConfig(panes: RealtimeSplitPane[]): LayoutConfig {
    const root: RowOrColumnItemConfig = {
      type: 'row',
      content: panes.map(pane => ({
        type: 'component' as const,
        componentType: SPLIT_COMPONENT_TYPE,
        componentState: { Key: pane.Key },
        title: pane.Title,
        isClosable: false
      }))
    };
    return {
      // The panel's own tab strip is the panel's identity; GL is here for the arrangement, so its
      // headers stay off ("the layout will be displayed with splitters only") and nothing in the
      // split can be closed or torn off out from under the session.
      header: { show: false, popout: false, maximise: false, close: false },
      settings: { reorderEnabled: false, popoutWholeStack: false },
      root
    };
  }

  /**
   * Golden Layout asks for the component behind one of its containers. We hand back the pane
   * element that is ALREADY on screen (virtual: true — GL positions it, never adopts it) and
   * subscribe the element to the container's geometry.
   */
  private bindPane(container: ComponentContainer, itemConfig: ResolvedComponentItemConfig): ComponentContainer.BindableComponent {
    const key = SplitPaneKeyFromState(itemConfig.componentState);
    const pane = key === null ? undefined : this.panes.get(key);
    if (!pane) {
      // Only reachable if the config this class just built disagrees with its own pane map.
      LogError(`RealtimeSurfaceSplitLayout was asked to bind unknown pane '${key ?? '(no key)'}' — the pane will be blank.`);
      return { component: container.element.ownerDocument.createElement('div'), virtual: true };
    }
    const element = pane.Element;
    // Show the pane up front: the tabs layout hides every inactive pane, and GL's visibility
    // event is not guaranteed to arrive before the first paint — a pane that waited for it
    // would flash empty (or stay empty) with nothing reporting why.
    element.style.setProperty('position', 'absolute');
    element.style.setProperty('display', 'flex');
    container.virtualRectingRequiredEvent = (_c, width, height) => this.applyRect(element, container, width, height);
    container.virtualVisibilityChangeRequiredEvent = (_c, visible) => {
      element.style.setProperty('display', visible ? 'flex' : 'none');
    };
    container.virtualZIndexChangeRequiredEvent = (_c, _logicalZIndex: LogicalZIndex, defaultZIndex: string) => {
      element.style.setProperty('z-index', defaultZIndex);
    };
    return { component: element, virtual: true };
  }

  /** Copies one container's geometry onto its pane. */
  private applyRect(element: HTMLElement, container: ComponentContainer, width: number, height: number): void {
    const host = this.host;
    if (!host) {
      return;
    }
    const hostViewport = host.getBoundingClientRect();
    const containerViewport = container.element.getBoundingClientRect();
    const rect = ComputeSplitPaneRect(
      { Left: host.offsetLeft, Top: host.offsetTop },
      { Left: hostViewport.left, Top: hostViewport.top },
      { Left: containerViewport.left, Top: containerViewport.top },
      width,
      height
    );
    element.style.setProperty('position', 'absolute');
    element.style.setProperty('left', `${rect.Left}px`);
    element.style.setProperty('top', `${rect.Top}px`);
    element.style.setProperty('width', `${rect.Width}px`);
    element.style.setProperty('height', `${rect.Height}px`);
  }

  /** Whether a pane actually received area — the postcondition {@link Attach} enforces. */
  private isLaidOut(element: HTMLElement): boolean {
    return parseFloat(element.style.width || '0') >= MIN_LAID_OUT_PANE_PX
      && parseFloat(element.style.height || '0') >= MIN_LAID_OUT_PANE_PX;
  }
}

/**
 * Reads the pane key out of a Golden Layout component state. Exported for the panel's specs; GL
 * types component state as free-form JSON, so the shape is checked rather than asserted.
 */
export function SplitPaneKeyFromState(state: unknown): string | null {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return null;
  }
  return 'Key' in state && typeof state.Key === 'string' ? state.Key : null;
}

/**
 * Removes every inline property the split layout may have written to a pane, returning it to
 * whatever the panel's stylesheet says. Exported so the panel can clean up a pane that left the
 * split (a channel tab removed mid-session) without tearing the whole layout down.
 */
export function RestoreSplitPaneElement(element: HTMLElement): void {
  for (const property of MANAGED_PANE_STYLE_PROPERTIES) {
    element.style.removeProperty(property);
  }
}
