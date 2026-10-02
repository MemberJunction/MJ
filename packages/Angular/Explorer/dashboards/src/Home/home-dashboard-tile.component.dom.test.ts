import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import type { DashboardNavRequestEvent, DashboardPanel } from '@memberjunction/ng-dashboard-viewer';
import { RenderComponentFixture, Query, Text, Attr, Click, Capture } from '@memberjunction/ng-test-utils';
import { HomeDashboardTileComponent } from './home-dashboard-tile.component';

/**
 * DOM coverage for a live dashboard tile on Home (<mj-home-dashboard-tile>): the header row (name,
 * Continue label, star, Open), the live dashboard viewer in the body, and when the tile keeps its
 * viewer, builds a new one, or waits until the body has a size. The dashboard viewer and
 * ResizeObserver are doubles.
 */

/**
 * Inert <mj-dashboard-viewer>. `Id` tells a new viewer from the one before it; `Shown` records each
 * dashboard object it is given, in order. Tests compare ids, not instances: a failed assertion prints
 * its values, and printing a component instance walks Angular's whole object graph.
 */
@Component({ standalone: true, selector: 'mj-dashboard-viewer', template: '' })
class DashboardViewerStub {
  private static created = 0;
  public readonly Id = ++DashboardViewerStub.created;
  public readonly Shown: MJDashboardEntity[] = [];
  @Input() set Dashboard(value: MJDashboardEntity | null) {
    if (value) {
      this.Shown.push(value);
    }
  }
  @Input() IsEditing = true;
  @Input() ShowToolbar = true;
  @Input() ShowBreadcrumb = true;
  @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();
}

/** A ResizeObserver double. `Resize` reports each observed element's current size, as a browser does after a layout. */
class FakeResizeObserver {
  public static Instances: FakeResizeObserver[] = [];
  public readonly Targets = new Set<Element>();
  public Disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.Instances.push(this);
  }

  public observe(target: Element): void {
    this.Targets.add(target);
  }

  public unobserve(target: Element): void {
    this.Targets.delete(target);
  }

  public disconnect(): void {
    this.Targets.clear();
    this.Disconnected = true;
  }

  public Resize(): void {
    const entries = [...this.Targets].map(target => ({ target, contentRect: target.getBoundingClientRect() }) as unknown as ResizeObserverEntry);
    if (entries.length > 0) {
      this.callback(entries, this as unknown as ResizeObserver);
    }
  }
}

const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

/** The size the tile body reports (jsdom reports 0 × 0 for every element). Zero means Home is hidden. */
let bodySize = { width: 640, height: 360 };

/** How many times the tile read its body size. Each read forces a layout in a browser. */
let bodySizeReads = 0;

/** Makes `.tile-body` report `bodySize`, and counts the reads. Other elements keep jsdom's size. */
function stubBodySize(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement): DOMRect {
    if (!this.classList.contains('tile-body')) {
      return realGetBoundingClientRect.call(this);
    }
    bodySizeReads++;
    const { width, height } = bodySize;
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
  });
}

const LAYOUT = '{"layout":{"root":null},"settings":{"theme":"light"}}';
const NEW_LAYOUT = '{"layout":{"root":null},"settings":{}}';

const SALES = {
  ID: 'D1000000-0000-4000-8000-000000000009',
  Name: 'Sales pipeline',
  Description: 'Weekly pipeline by stage.',
  User: 'Ana Ruiz',
  Type: 'Config',
  UIConfigDetails: LAYOUT,
} as unknown as MJDashboardEntity;

/** A copy of the dashboard as a new object, with some values changed. A cache reload returns new objects. */
const copyOf = (d: MJDashboardEntity, changes: Record<string, unknown> = {}): MJDashboardEntity =>
  ({ ...(d as unknown as Record<string, unknown>), ...changes }) as unknown as MJDashboardEntity;

/** Changes the dashboard object itself, as a save in a dashboard tab does to the cached object. */
const editInPlace = (d: MJDashboardEntity, changes: Record<string, unknown>): void => {
  Object.assign(d as unknown as Record<string, unknown>, changes);
};

const PANEL = { id: 'panel-1', title: 'Accounts' } as unknown as DashboardPanel;

type Fixture = ComponentFixture<HomeDashboardTileComponent>;

const render = (inputs: Record<string, unknown> = {}): Fixture =>
  RenderComponentFixture(HomeDashboardTileComponent, {
    imports: [DashboardViewerStub],
    declarations: [HomeDashboardTileComponent],
    inputs: { Dashboard: SALES, ...inputs },
  });

/** Sets an input, then renders. */
function setInput(fixture: Fixture, name: string, value: unknown): void {
  fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
}

/**
 * Checks the view that holds the tile, as each check of the Dashboards section does. That runs the
 * tile's ngDoCheck; the tile's own OnPush view is checked only when the tile marks it. (A plain
 * zoneless detectChanges() checks only views marked dirty, and nothing marks a view when a save
 * changes the dashboard object.)
 */
function checkFromParent(fixture: Fixture): void {
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges();
}

/** The dashboard viewer in the tile body, or null. */
function viewer(fixture: Fixture): DashboardViewerStub | null {
  const element = fixture.debugElement.query(By.css('.tile-body mj-dashboard-viewer'));
  return element ? (element.componentInstance as DashboardViewerStub) : null;
}

/** The id of the viewer in the tile body, or null. A new viewer has a new id. */
const viewerId = (fixture: Fixture): number | null => viewer(fixture)?.Id ?? null;

describe('HomeDashboardTileComponent (DOM)', () => {
  beforeEach(() => {
    bodySize = { width: 640, height: 360 };
    bodySizeReads = 0;
    stubBodySize();
    FakeResizeObserver.Instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('the header row', () => {
    it('is an article labelled by the dashboard name, a button in a level-3 heading with the full name in its title', () => {
      const f = render();
      const labelledBy = Attr(f, 'article.tile', 'aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(Query(f, `#${labelledBy}`)?.textContent?.trim()).toBe('Sales pipeline');
      expect(Query(f, '.tile-header h3 > button.tile-name')).not.toBeNull();
      expect(Attr(f, '.tile-name', 'title')).toBe('Sales pipeline');
    });

    it('emits Open from the name and from the Open button, which shows "Open" and is named "Open <dashboard name>"', () => {
      const f = render();
      const opened = Capture(f.componentInstance.Open);

      Click(f, '.tile-name');
      Click(f, '.tile-open');

      expect(opened.map(d => d.ID)).toEqual([SALES.ID, SALES.ID]);
      expect(opened[0]).toBe(SALES);
      expect(Text(f, '.tile-open')).toBe('Open');
      expect(Text(f, '.tile-open .tile-open-label')).toBe('Open');
      expect(Attr(f, '.tile-open', 'aria-label')).toBe('Open Sales pipeline');
      expect(Query(f, '.tile-open > i.fa-solid.fa-up-right-from-square[aria-hidden="true"]')).not.toBeNull();
    });

    it("emits ToggleFavorite from the star, which has the dashboard card's icon, label and pressed state", () => {
      const f = render({ IsFavorite: false });
      const toggled = Capture(f.componentInstance.ToggleFavorite);
      expect(Attr(f, '.tile-star', 'aria-pressed')).toBe('false');
      expect(Attr(f, '.tile-star', 'aria-label')).toBe('Favorite Sales pipeline');
      expect(Query(f, '.tile-star > i.fa-regular.fa-star')).not.toBeNull();
      expect(Query(f, '.tile-star.on')).toBeNull();

      Click(f, '.tile-star');
      expect(toggled.map(d => d.ID)).toEqual([SALES.ID]);

      setInput(f, 'IsFavorite', true);
      expect(Attr(f, '.tile-star', 'aria-pressed')).toBe('true');
      expect(Query(f, '.tile-star > i.fa-solid.fa-star')).not.toBeNull();
      expect(Query(f, '.tile-star.on')).not.toBeNull();
    });

    it('shows the Continue label only when IsContinue', () => {
      const f = render();
      expect(Query(f, '.tile-chip')).toBeNull();

      setInput(f, 'IsContinue', true);
      expect(Text(f, '.tile-header .tile-chip')).toBe('Continue');

      setInput(f, 'IsContinue', false);
      expect(Query(f, '.tile-chip')).toBeNull();
    });
  });

  describe('the live body', () => {
    it('gives the viewer the dashboard object, not editing, without its toolbar or breadcrumb', () => {
      const f = render();
      const shownBy = viewer(f);
      expect(shownBy?.Shown).toHaveLength(1);
      expect(shownBy?.Shown[0]).toBe(SALES);
      expect([shownBy?.IsEditing, shownBy?.ShowToolbar, shownBy?.ShowBreadcrumb]).toEqual([false, false, false]);
    });

    it('gives the body the BodyHeight, 360 px by default', () => {
      const f = render();
      expect((Query(f, '.tile-body') as HTMLElement).style.height).toBe('360px');

      setInput(f, 'BodyHeight', 480);
      expect((Query(f, '.tile-body') as HTMLElement).style.height).toBe('480px');
    });

    it('shows the dashboard at 80% with CSS zoom on a box that fills the body, not with a transform', () => {
      const f = render();
      const content = Query(f, '.tile-body > .tile-content') as HTMLElement | null;
      expect(content).not.toBeNull();
      // jsdom drops `zoom`, so the tile's CSS reads the factor from this custom property: zoom: var(--tile-content-zoom).
      expect(content?.getAttribute('style')).toContain('--tile-content-zoom: 0.8');
      expect([content?.style.width, content?.style.height, content?.style.transform]).toEqual(['', '', '']);
      expect(Query(f, '.tile-content > mj-dashboard-viewer')).not.toBeNull();
    });

    it('builds its first viewer at once: until the BodyHeight binding applies, its CSS gives the body 360 px', () => {
      // Layout as a browser computes it: the body is as tall as its styles make it.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement): DOMRect {
        if (!this.classList.contains('tile-body')) {
          return realGetBoundingClientRect.call(this);
        }
        const height = parseFloat(getComputedStyle(this).height) || 0;
        return { x: 0, y: 0, top: 0, left: 0, right: 640, bottom: height, width: 640, height, toJSON: () => ({}) } as DOMRect;
      });

      const f = render({ BodyHeight: 480 });

      expect(FakeResizeObserver.Instances).toEqual([]);
      expect(viewer(f)?.Shown).toEqual([SALES]);
      expect(getComputedStyle(Query(f, '.tile-body') as HTMLElement).height).toBe('480px');
    });

    it("re-emits the viewer's links as NavigationRequested", () => {
      const f = render();
      const links = Capture(f.componentInstance.NavigationRequested);
      const link: DashboardNavRequestEvent = { request: { type: 'OpenQuery', sourcePanelId: 'panel-1', queryId: 'Q-1' }, panel: PANEL };

      viewer(f)?.NavigationRequested.emit(link);

      expect(links).toHaveLength(1);
      expect(links[0]).toBe(link);
    });
  });

  describe('the viewer the tile keeps', () => {
    it('keeps the viewer for a new object with the same ID, name and layout', () => {
      const f = render();
      const before = viewerId(f);
      expect(before).not.toBeNull();

      setInput(f, 'Dashboard', copyOf(SALES));

      expect(viewerId(f)).toBe(before);
      expect(viewer(f)?.Shown).toHaveLength(1);
      expect(viewer(f)?.Shown[0]).toBe(SALES);
    });

    it('builds a new viewer when the layout changes, and again when the name changes', () => {
      const f = render();
      const first = viewerId(f);
      const relaidOut = copyOf(SALES, { UIConfigDetails: NEW_LAYOUT });

      setInput(f, 'Dashboard', relaidOut);
      const second = viewerId(f);
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
      expect(viewer(f)?.Shown).toHaveLength(1);
      expect(viewer(f)?.Shown[0]).toBe(relaidOut);

      setInput(f, 'Dashboard', copyOf(relaidOut, { Name: 'Pipeline' }));
      expect(viewerId(f)).not.toBe(second);
      expect(Text(f, '.tile-name')).toBe('Pipeline');
    });

    it('builds a new viewer for another dashboard', () => {
      const f = render();
      const before = viewerId(f);
      const other = copyOf(SALES, { ID: 'D1000000-0000-4000-8000-000000000006', Name: 'Ops health' });

      setInput(f, 'Dashboard', other);

      expect(viewerId(f)).not.toBe(before);
      expect(viewer(f)?.Shown[0]).toBe(other);
    });

    it('waits while the body has no size, then builds the new viewer once the body has one', () => {
      const f = render();
      const before = viewerId(f);
      bodySize = { width: 0, height: 0 };
      const relaidOut = copyOf(SALES, { UIConfigDetails: NEW_LAYOUT });

      setInput(f, 'Dashboard', relaidOut);
      expect(viewerId(f)).toBe(before);
      const observer = FakeResizeObserver.Instances.at(-1);
      expect(observer?.Targets.size).toBe(1);
      expect(observer?.Targets.has(Query(f, '.tile-body') as Element)).toBe(true);

      observer?.Resize();
      f.detectChanges();
      expect(viewerId(f)).toBe(before);

      bodySize = { width: 640, height: 360 };
      observer?.Resize();
      f.detectChanges();
      expect(viewerId(f)).not.toBe(before);
      expect(viewer(f)?.Shown).toHaveLength(1);
      expect(viewer(f)?.Shown[0]).toBe(relaidOut);
      expect(observer?.Disconnected).toBe(true);
    });

    it('waits to build its first viewer until the body has a size (a tile made while Home is hidden)', () => {
      bodySize = { width: 0, height: 0 };
      const f = render();
      expect(viewerId(f)).toBeNull();
      const observer = FakeResizeObserver.Instances.at(-1);
      expect(observer?.Targets.has(Query(f, '.tile-body') as Element)).toBe(true);

      bodySize = { width: 640, height: 360 };
      observer?.Resize();
      f.detectChanges();

      expect(viewer(f)?.Shown).toHaveLength(1);
      expect(viewer(f)?.Shown[0]).toBe(SALES);
      expect(observer?.Disconnected).toBe(true);
    });

    it('waits to build the viewer for another dashboard until the body has a size', () => {
      const f = render();
      const before = viewerId(f);
      bodySize = { width: 0, height: 0 };
      const other = copyOf(SALES, { ID: 'D1000000-0000-4000-8000-000000000006', Name: 'Ops health' });

      setInput(f, 'Dashboard', other);
      expect(viewerId(f)).toBe(before);
      expect(Text(f, '.tile-name')).toBe('Ops health');

      bodySize = { width: 640, height: 360 };
      FakeResizeObserver.Instances.at(-1)?.Resize();
      f.detectChanges();
      expect(viewerId(f)).not.toBe(before);
      expect(viewer(f)?.Shown[0]).toBe(other);
    });

    it('stops waiting, without a build, when a waiting tile gets back the dashboard its viewer shows', () => {
      const f = render();
      const before = viewerId(f);
      bodySize = { width: 0, height: 0 };
      setInput(f, 'Dashboard', copyOf(SALES, { UIConfigDetails: NEW_LAYOUT }));
      const observer = FakeResizeObserver.Instances.at(-1);
      expect(observer?.Disconnected).toBe(false);

      setInput(f, 'Dashboard', copyOf(SALES));

      expect(observer?.Disconnected).toBe(true);
      expect(viewerId(f)).toBe(before);
      expect(viewer(f)?.Shown).toEqual([SALES]);
    });

    it('reads no body size while its viewer already shows the dashboard as it is', () => {
      const f = render();
      const reads = bodySizeReads;

      checkFromParent(f);
      setInput(f, 'Dashboard', copyOf(SALES));
      checkFromParent(f);

      expect(bodySizeReads).toBe(reads);
    });

    it('stops watching the body when the tile is destroyed', () => {
      const f = render();
      bodySize = { width: 0, height: 0 };
      setInput(f, 'Dashboard', copyOf(SALES, { UIConfigDetails: NEW_LAYOUT }));
      const observer = FakeResizeObserver.Instances.at(-1);
      expect(observer?.Disconnected).toBe(false);

      f.destroy();

      expect(observer?.Disconnected).toBe(true);
    });
  });

  describe('a save into the same dashboard object (the dashboard cache keeps its object)', () => {
    it('builds a new viewer when a save changes the layout', () => {
      const sales = copyOf(SALES);
      const f = render({ Dashboard: sales });
      const before = viewerId(f);

      editInPlace(sales, { UIConfigDetails: NEW_LAYOUT });
      checkFromParent(f);

      expect(viewerId(f)).not.toBeNull();
      expect(viewerId(f)).not.toBe(before);
      expect(viewer(f)?.Shown).toEqual([sales]);
    });

    it('shows the new name, and builds a new viewer, when a save renames the dashboard', () => {
      const sales = copyOf(SALES);
      const f = render({ Dashboard: sales });
      const before = viewerId(f);

      editInPlace(sales, { Name: 'Pipeline' });
      checkFromParent(f);

      expect(Text(f, '.tile-name')).toBe('Pipeline');
      expect(Attr(f, '.tile-name', 'title')).toBe('Pipeline');
      expect(Attr(f, '.tile-star', 'aria-label')).toBe('Favorite Pipeline');
      expect(viewerId(f)).not.toBe(before);
    });

    it('shows the new name at once, and waits to build until the body has a size', () => {
      const sales = copyOf(SALES);
      const f = render({ Dashboard: sales });
      const before = viewerId(f);
      bodySize = { width: 0, height: 0 };

      editInPlace(sales, { Name: 'Pipeline', UIConfigDetails: NEW_LAYOUT });
      checkFromParent(f);
      expect(Text(f, '.tile-name')).toBe('Pipeline');
      expect(viewerId(f)).toBe(before);
      const observer = FakeResizeObserver.Instances.at(-1);
      expect(observer?.Targets.has(Query(f, '.tile-body') as Element)).toBe(true);

      // Later checks while it waits read no size and start no second watch.
      const reads = bodySizeReads;
      checkFromParent(f);
      checkFromParent(f);
      expect(bodySizeReads).toBe(reads);
      expect(FakeResizeObserver.Instances.at(-1)).toBe(observer);

      bodySize = { width: 640, height: 360 };
      observer?.Resize();
      f.detectChanges();
      expect(viewerId(f)).not.toBe(before);
      expect(viewer(f)?.Shown).toEqual([sales]);
      expect(observer?.Disconnected).toBe(true);
    });
  });
});
