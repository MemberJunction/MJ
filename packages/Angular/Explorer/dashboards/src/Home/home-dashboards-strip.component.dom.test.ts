import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RenderComponentFixture, Query, QueryAll, Text, Attr, Click, Capture } from '@memberjunction/ng-test-utils';
import { MJAccordionModule } from '@memberjunction/ng-ui-components';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import type { DashboardNavRequestEvent, DashboardPanel } from '@memberjunction/ng-dashboard-viewer';
import { HomeDashboardsStripComponent } from './home-dashboards-strip.component';
import { HomeDashboardTileComponent } from './home-dashboard-tile.component';
import type { HomeDashboardTileSizes } from './home-dashboard-tile-layout';

/** Inert <mj-dashboard-viewer>: the live dashboard in each tile. `Id` tells a new viewer from the one before it. */
@Component({ standalone: true, selector: 'mj-dashboard-viewer', template: '' })
class DashboardViewerStub {
  private static created = 0;
  public readonly Id = ++DashboardViewerStub.created;
  @Input() Dashboard: MJDashboardEntity | null = null;
  @Input() IsEditing = true;
  @Input() ShowToolbar = true;
  @Input() ShowBreadcrumb = true;
  @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();
}

/** A ResizeObserver double. `ReportWidth` calls back as a browser does when an observed element gets a new width. */
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

  public ReportWidth(width: number): void {
    const entries = [...this.Targets].map(target => ({ target, contentRect: { width, height: 0 } }) as unknown as ResizeObserverEntry);
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

const d = (ID: string, Name: string) =>
  ({ ID, Name, Description: '', User: 'Ana', Type: 'Config', Thumbnail: null, UIConfigDetails: '{}' }) as unknown as MJDashboardEntity;

const PANEL = { id: 'panel-1', title: 'Accounts' } as unknown as DashboardPanel;

const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

/** The strip's width (px) the tile grid reports on screen; resizeStrip sets it. */
let gridWidth = 0;

/** A box of that size at the origin. */
const box = (width: number, height: number): DOMRect =>
  ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect;

/**
 * Gives each tile body a size (jsdom reports 0 × 0 for every element), so each tile builds its viewer as
 * in a browser, and gives the tile grid the strip's width, for gutter drags.
 */
function stubSizes(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement): DOMRect {
    if (this.classList.contains('tile-body')) {
      return box(600, 360);
    }
    if (this.classList.contains('strip-grid')) {
      return box(gridWidth, 900);
    }
    return realGetBoundingClientRect.call(this);
  });
}

type Fixture = ComponentFixture<HomeDashboardsStripComponent>;

const render = (inputs: Record<string, unknown> = {}, autoDetect = false): Fixture =>
  RenderComponentFixture(HomeDashboardsStripComponent, {
    imports: [MJAccordionModule, DashboardViewerStub],
    declarations: [HomeDashboardsStripComponent, HomeDashboardTileComponent],
    inputs: { Continue: d('c', 'Sales pipeline'), Favorites: [d('f1', 'Ops health'), d('f2', 'AR aging'), d('f3', 'Extra')], FavoriteIds: ['f1', 'f2', 'f3'], TotalCount: 31, SharedCount: 5, ...inputs },
    autoDetect,
  });

/** Sets inputs, then renders. */
function update(f: Fixture, inputs: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(inputs)) {
    f.componentRef.setInput(name, value);
  }
  f.detectChanges();
}

/** The ResizeObserver that watches the strip's width probe. Throws when there is none. */
function widthObserver(f: Fixture): FakeResizeObserver {
  const probe = Query(f, '.strip-width-probe');
  const observer = FakeResizeObserver.Instances.find(o => probe !== null && o.Targets.has(probe));
  if (!observer) {
    throw new Error('widthObserver(): nothing watches .strip-width-probe');
  }
  return observer;
}

/** Reports a new strip width, as the browser does after a layout, then renders. */
function resizeStrip(f: Fixture, width: number): void {
  gridWidth = width;
  widthObserver(f).ReportWidth(width);
  f.detectChanges();
}

/** Renders the strip at a width (px). */
function renderAt(width: number, inputs: Record<string, unknown> = {}): Fixture {
  const f = render(inputs);
  resizeStrip(f, width);
  return f;
}

/** The tiles' host elements, in order. */
const tiles = (f: Fixture): HTMLElement[] => QueryAll(f, 'mj-home-dashboard-tile') as HTMLElement[];

/** The name on each tile, in order. */
const tileNames = (f: Fixture): string[] => tiles(f).map(tile => tile.querySelector('.tile-name')?.textContent?.trim() ?? '');

/** The row of each tile, in order. */
const tileRows = (f: Fixture): string[] => tiles(f).map(tile => tile.getAttribute('data-row') ?? '');

/** Each tile's body height, in order. */
const bodyHeights = (f: Fixture): string[] => tiles(f).map(tile => (tile.querySelector('.tile-body') as HTMLElement | null)?.style.height ?? '');

/** A custom property of an element's inline style, as a number rounded to 4 decimals. */
const styleNumber = (el: Element, name: string): number => Math.round(Number((el as HTMLElement).style.getPropertyValue(name)) * 10000) / 10000;

/** Each tile's share (0-1) of its row, in order. */
const tileSpans = (f: Fixture): number[] => tiles(f).map(tile => styleNumber(tile, '--tiles-span'));

/** The gutters between side-by-side tiles, in order. */
const gutters = (f: Fixture): HTMLElement[] => QueryAll(f, '.strip-gutter') as HTMLElement[];

/** The height handles, one under each row, in order. */
const handles = (f: Fixture): HTMLElement[] => QueryAll(f, '.strip-row-handle') as HTMLElement[];

/** What each child of the tile grid is, in DOM order: the tile's name, "gutter" or "handle". */
function gridOrder(f: Fixture): string[] {
  const grid = Query(f, '.strip-grid');
  return Array.from(grid?.children ?? []).map(child => {
    if (child.matches('mj-home-dashboard-tile')) {
      return child.querySelector('.tile-name')?.textContent?.trim() ?? '';
    }
    return child.classList.contains('strip-gutter') ? 'gutter' : child.classList.contains('strip-row-handle') ? 'handle' : child.tagName;
  });
}

/** The id of the viewer in each tile, by the tile's name. A new viewer has a new id. */
function viewerIds(f: Fixture): Record<string, number | null> {
  const ids: Record<string, number | null> = {};
  for (const tile of f.debugElement.queryAll(By.css('mj-home-dashboard-tile'))) {
    const name = (tile.nativeElement as HTMLElement).querySelector('.tile-name')?.textContent?.trim() ?? '';
    const viewer = tile.query(By.directive(DashboardViewerStub));
    ids[name] = viewer ? (viewer.componentInstance as DashboardViewerStub).Id : null;
  }
  return ids;
}

/** Whether each tile, in order, shows the Continue label. */
const continueLabels = (f: Fixture): boolean[] => tiles(f).map(tile => tile.querySelector('.tile-chip') !== null);

/** The first element inside the tile with that name that matches `selector`. Throws when there is none. */
function inTile(f: Fixture, name: string, selector: string): HTMLElement {
  const tile = tiles(f).find(t => t.querySelector('.tile-name')?.textContent?.trim() === name);
  const element = tile?.querySelector(selector);
  if (!element) {
    throw new Error(`inTile(): no "${selector}" in the tile "${name}"`);
  }
  return element as HTMLElement;
}

/** The ARIA attributes of a separator. */
const aria = (el: Element) => ({
  role: el.getAttribute('role'),
  orientation: el.getAttribute('aria-orientation'),
  tabindex: el.getAttribute('tabindex'),
  label: el.getAttribute('aria-label'),
  now: el.getAttribute('aria-valuenow'),
  min: el.getAttribute('aria-valuemin'),
  max: el.getAttribute('aria-valuemax'),
});

/** Presses a key on an element, then renders. */
function press(f: Fixture, el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  f.detectChanges();
}

/** Double-clicks an element, then renders. */
function doubleClick(f: Fixture, el: Element): void {
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  f.detectChanges();
}

/** A pointer event's position, buttons and pointer. By default the main button, held down during a down or a move, pointer 7. */
interface PointerInit {
  x?: number;
  y?: number;
  button?: number;
  buttons?: number;
  pointerId?: number;
}

/** Dispatches a pointer event (jsdom has no PointerEvent: a MouseEvent with a pointerId). It bubbles to the document. */
function dispatchPointer(el: Element, type: string, init: PointerInit = {}): void {
  const held = type === 'pointerdown' || type === 'pointermove' ? 1 : 0;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
    button: init.button ?? 0,
    buttons: init.buttons ?? held,
  });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 7 });
  el.dispatchEvent(event);
}

/** Dispatches a pointer event, then renders. */
function pointer(f: Fixture, el: Element, type: string, init: PointerInit = {}): void {
  dispatchPointer(el, type, init);
  f.detectChanges();
}

/** The pointers each element holds captured (jsdom has no pointer capture). */
let captures = new Map<Element, Set<number>>();

/** Pointer capture as a browser keeps it: setPointerCapture, releasePointerCapture and hasPointerCapture. */
function stubPointerCapture(): void {
  const capture = {
    setPointerCapture: vi.fn(function (this: Element, id: number): void {
      captures.set(this, new Set([...(captures.get(this) ?? []), id]));
    }),
    releasePointerCapture: vi.fn(function (this: Element, id: number): void {
      captures.get(this)?.delete(id);
    }),
    hasPointerCapture: vi.fn(function (this: Element, id: number): boolean {
      return captures.get(this)?.has(id) ?? false;
    }),
  };
  for (const [name, value] of Object.entries(capture)) {
    Object.defineProperty(Element.prototype, name, { configurable: true, writable: true, value });
  }
}

/** Each element's aria-valuetext. */
const valueTexts = (els: Element[]): Array<string | null> => els.map(el => el.getAttribute('aria-valuetext'));

/** Whether any separator is lit as dragged. */
const anyDragging = (f: Fixture): boolean => [...gutters(f), ...handles(f)].some(el => el.classList.contains('dragging'));

/** Saved sizes with the given rows. */
const sizes = (...rows: HomeDashboardTileSizes['Rows']): HomeDashboardTileSizes => ({ Version: 1, Rows: rows });

/** Each value rounded to 2 decimals. */
const round2 = (values: number[]): number[] => values.map(v => Math.round(v * 100) / 100);

describe('HomeDashboardsStripComponent (DOM)', () => {
  beforeEach(() => {
    gridWidth = 0;
    stubSizes();
    FakeResizeObserver.Instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    captures = new Map();
    stubPointerCapture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      Reflect.deleteProperty(Element.prototype, name);
    }
  });

  describe('tiles', () => {
    it('shows a live tile for Continue, then up to two favorites without the Continue dashboard, with the Continue label on the first tile only', () => {
      const f = render({ Favorites: [d('c', 'Sales pipeline'), d('f1', 'Ops health'), d('f2', 'AR aging'), d('f3', 'Extra')] });
      expect(tileNames(f)).toEqual(['Sales pipeline', 'Ops health', 'AR aging']);
      expect(continueLabels(f)).toEqual([true, false, false]);
      const shown = f.debugElement.queryAll(By.directive(DashboardViewerStub)).map(v => (v.componentInstance as DashboardViewerStub).Dashboard?.ID);
      expect(shown).toEqual(['c', 'f1', 'f2']);
    });

    it('shows only favorite tiles, without a Continue label, when there is no Continue dashboard', () => {
      const f = render({ Continue: null });
      expect(tileNames(f)).toEqual(['Ops health', 'AR aging']);
      expect(continueLabels(f)).toEqual([false, false]);
    });

    it('skips the Continue dashboard among the favorites when its id differs only in letter case', () => {
      const f = render({ Continue: d('AAAA-0001', 'Sales pipeline'), Favorites: [d('aaaa-0001', 'Sales pipeline'), d('f1', 'Ops health')] });
      expect(tileNames(f)).toEqual(['Sales pipeline', 'Ops health']);
    });

    it('stars each tile whose dashboard is a favorite, also when the ids differ only in letter case', () => {
      const f = render({ Continue: d('c', 'Sales pipeline'), Favorites: [d('bbbb-0002', 'Ops health')], FavoriteIds: ['BBBB-0002'] });
      expect(tiles(f).map(tile => tile.querySelector('.tile-star')?.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    });

    it('labels each tile by its own name', () => {
      const f = render();
      const labels = QueryAll(f, 'mj-home-dashboard-tile article').map(article => article.getAttribute('aria-labelledby') ?? '');
      expect(new Set(labels).size).toBe(3);
      expect(labels.map(id => Query(f, `#${id}`)?.textContent?.trim())).toEqual(['Sales pipeline', 'Ops health', 'AR aging']);
    });

    it('passes Open and ToggleFavorite from each tile to its own outputs', () => {
      const f = render();
      const opened = Capture(f.componentInstance.Open);
      const toggled = Capture(f.componentInstance.ToggleFavorite);

      inTile(f, 'Sales pipeline', '.tile-name').click();
      inTile(f, 'Ops health', '.tile-open').click();
      inTile(f, 'AR aging', '.tile-star').click();

      expect(opened.map(x => x.ID)).toEqual(['c', 'f1']);
      expect(toggled.map(x => x.ID)).toEqual(['f2']);
    });

    it('moves the tiles and keeps their viewers when a favorite becomes Continue and Continue becomes a favorite', () => {
      const alpha = d('a1', 'Alpha');
      const beta = d('b1', 'Beta');
      const gamma = d('g1', 'Gamma');
      const f = render({ Continue: alpha, Favorites: [alpha, beta, gamma], FavoriteIds: ['a1', 'b1', 'g1'] });
      expect(tileNames(f)).toEqual(['Alpha', 'Beta', 'Gamma']);
      const before = viewerIds(f);

      // The user opens Beta from Home, so Beta becomes the Continue dashboard.
      update(f, { Continue: beta });

      expect(tileNames(f)).toEqual(['Beta', 'Alpha', 'Gamma']);
      expect(continueLabels(f)).toEqual([true, false, false]);
      expect(viewerIds(f)).toEqual(before);
    });

    it('keeps the viewers of the tiles that stay when a favorite is removed', () => {
      const ops = d('f1', 'Ops health');
      const ar = d('f2', 'AR aging');
      const extra = d('f3', 'Extra');
      const f = render({ Favorites: [ops, ar, extra] });
      const before = viewerIds(f);

      update(f, { Favorites: [ar, extra], FavoriteIds: ['f2', 'f3'] });

      expect(tileNames(f)).toEqual(['Sales pipeline', 'AR aging', 'Extra']);
      const after = viewerIds(f);
      expect(after['Sales pipeline']).toBe(before['Sales pipeline']);
      expect(after['AR aging']).toBe(before['AR aging']);
      expect(after['Extra']).not.toBeNull();
      expect(Object.values(before)).not.toContain(after['Extra']);
    });

    it("forwards a link from a tile's dashboard as NavigationRequested", () => {
      const f = render();
      const links = Capture(f.componentInstance.NavigationRequested);
      const link: DashboardNavRequestEvent = { request: { type: 'OpenQuery', sourcePanelId: 'panel-1', queryId: 'Q-1' }, panel: PANEL };
      const viewers = f.debugElement.queryAll(By.directive(DashboardViewerStub));

      (viewers.at(-1)?.componentInstance as DashboardViewerStub | undefined)?.NavigationRequested.emit(link);

      expect(links).toHaveLength(1);
      expect(links[0]).toBe(link);
    });
  });

  describe('rows by the strip width', () => {
    it('watches the width of a zero-height probe as wide as the section, and stops watching when the strip is destroyed', () => {
      const f = render();
      const observer = widthObserver(f);
      expect([...observer.Targets]).toEqual([Query(f, '.strip-body > .strip-width-probe')]);

      f.destroy();

      expect(observer.Disconnected).toBe(true);
    });

    it('puts three tiles side by side at 1,600 px: two gutters, one height handle after the row', () => {
      const f = renderAt(1600);
      expect(tileRows(f)).toEqual(['0', '0', '0']);
      expect(gridOrder(f)).toEqual(['Sales pipeline', 'gutter', 'Ops health', 'gutter', 'AR aging', 'handle']);
      expect(gutters(f).map(g => g.getAttribute('aria-label'))).toEqual(['Resize Sales pipeline and Ops health', 'Resize Ops health and AR aging']);
      expect(tileSpans(f)).toEqual([0.3333, 0.3333, 0.3333]);
      expect(bodyHeights(f)).toEqual(['360px', '360px', '360px']);
    });

    it('puts two tiles side by side and the third in its own row, at full width, at 1,100 px', () => {
      const f = renderAt(1100);
      expect(tileRows(f)).toEqual(['0', '0', '1']);
      expect(gridOrder(f)).toEqual(['Sales pipeline', 'gutter', 'Ops health', 'handle', 'AR aging', 'handle']);
      expect(gutters(f).map(g => g.getAttribute('aria-label'))).toEqual(['Resize Sales pipeline and Ops health']);
      expect(tileSpans(f)).toEqual([0.5, 0.5, 1]);
      expect(handles(f).map(h => h.getAttribute('data-row'))).toEqual(['0', '1']);
    });

    it('puts each tile in its own row at 500 px, with no gutters and 300 px bodies', () => {
      const f = renderAt(500);
      expect(tileRows(f)).toEqual(['0', '1', '2']);
      expect(gridOrder(f)).toEqual(['Sales pipeline', 'handle', 'Ops health', 'handle', 'AR aging', 'handle']);
      expect(gutters(f)).toEqual([]);
      expect(tileSpans(f)).toEqual([1, 1, 1]);
      expect(bodyHeights(f)).toEqual(['300px', '300px', '300px']);
    });

    it('splits a row by its tile count: two tiles at 1,600 px share one row, one tile has no gutter', () => {
      const f = renderAt(1600, { Favorites: [d('f1', 'Ops health')] });
      expect(gridOrder(f)).toEqual(['Sales pipeline', 'gutter', 'Ops health', 'handle']);

      update(f, { Continue: null });
      expect(gridOrder(f)).toEqual(['Ops health', 'handle']);
      expect(tileSpans(f)).toEqual([1]);
    });

    it("places each tile and gutter on its row's grid line, with its shares of the row (CSS custom properties)", () => {
      const f = renderAt(1100);
      const props = (el: Element) => ['--tiles-line', '--tiles-row-gaps', '--tiles-start', '--tiles-span', '--tiles-gaps-before'].map(name => styleNumber(el, name));
      expect(tiles(f).map(props)).toEqual([
        [1, 1, 0, 0.5, 0],
        [1, 1, 0.5, 0.5, 1],
        [3, 0, 0, 1, 0],
      ]);
      expect(['--tiles-line', '--tiles-row-gaps', '--tiles-start', '--tiles-gaps-before'].map(name => styleNumber(gutters(f)[0], name))).toEqual([1, 1, 0.5, 0]);
      expect(handles(f).map(h => styleNumber(h, '--tiles-line'))).toEqual([2, 4]);
      expect((Query(f, '.strip-grid') as HTMLElement).style.getPropertyValue('--tiles-gap')).toBe('16px');
    });

    it('keeps every viewer when a width change moves tiles between rows', () => {
      const f = renderAt(1600);
      const before = viewerIds(f);
      expect(Object.values(before).every(id => id !== null)).toBe(true);

      for (const width of [1100, 500, 700, 1600]) {
        resizeStrip(f, width);
        expect(viewerIds(f), `${width} px`).toEqual(before);
      }
      expect(tileRows(f)).toEqual(['0', '0', '0']);
    });
  });

  describe('the height handle under each row', () => {
    it('is a horizontal separator named "Resize row height", with its height and range in px', () => {
      const f = renderAt(1600);
      expect(handles(f).map(aria)).toEqual([
        { role: 'separator', orientation: 'horizontal', tabindex: '0', label: 'Resize row height', now: '360', min: '240', max: '900' },
      ]);
      resizeStrip(f, 500);
      expect(handles(f).map(h => h.getAttribute('aria-valuenow'))).toEqual(['300', '300', '300']);
    });

    it("gives each handle a distinct value text: the row height in px and the names of the row's dashboards", () => {
      const f = renderAt(1600);
      expect(valueTexts(handles(f))).toEqual(['360 px, Sales pipeline, Ops health and AR aging']);
      resizeStrip(f, 1100);
      expect(valueTexts(handles(f))).toEqual(['360 px, Sales pipeline and Ops health', '360 px, AR aging']);
      resizeStrip(f, 500);
      expect(valueTexts(handles(f))).toEqual(['300 px, Sales pipeline', '300 px, Ops health', '300 px, AR aging']);
    });

    it('Arrow Down and Arrow Up change the row height by 20 px, and each press emits TileSizesChange', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);

      press(f, handles(f)[0], 'ArrowDown');
      expect(handles(f)[0].getAttribute('aria-valuenow')).toBe('380');
      expect(bodyHeights(f)).toEqual(['380px', '380px', '360px']);
      press(f, handles(f)[1], 'ArrowUp');
      press(f, handles(f)[1], 'Enter');

      expect(bodyHeights(f)).toEqual(['380px', '380px', '340px']);
      expect(changes).toEqual([sizes({ Height: 380 }), sizes({ Height: 380 }, { Height: 340 })]);
    });

    it('keeps the height from 240 to 900 px, and emits nothing at a limit', () => {
      const f = renderAt(1100, { TileSizes: sizes({ Height: 240 }, { Height: 900 }) });
      const changes = Capture(f.componentInstance.TileSizesChange);

      press(f, handles(f)[0], 'ArrowUp');
      press(f, handles(f)[1], 'ArrowDown');

      expect(handles(f).map(h => h.getAttribute('aria-valuenow'))).toEqual(['240', '900']);
      expect(changes).toEqual([]);
    });

    it('a double-click puts the row back to its default height: 360 px, or 300 px in one-column mode', () => {
      const f = renderAt(1100, { TileSizes: sizes({ Height: 480, Widths: { '2': [60, 40] } }) });
      const changes = Capture(f.componentInstance.TileSizesChange);
      expect(handles(f)[0].getAttribute('aria-valuenow')).toBe('480');

      doubleClick(f, handles(f)[0]);
      expect(handles(f)[0].getAttribute('aria-valuenow')).toBe('360');
      expect(changes).toEqual([sizes({ Widths: { '2': [60, 40] } })]);

      resizeStrip(f, 500);
      press(f, handles(f)[0], 'ArrowDown');
      expect(handles(f)[0].getAttribute('aria-valuenow')).toBe('320');
      doubleClick(f, handles(f)[0]);
      expect(handles(f)[0].getAttribute('aria-valuenow')).toBe('300');
      expect(changes.at(-1)).toEqual(sizes({ Widths: { '2': [60, 40] } }));
    });

    it('a double-click on a handle already at its default height emits nothing', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);

      doubleClick(f, handles(f)[0]);

      expect(handles(f)[0].getAttribute('aria-valuenow')).toBe('360');
      expect(changes).toEqual([]);
    });

    it('follows a pointer drag, from 240 to 900 px, rendering each move itself, and emits once when the drag ends', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const handle = handles(f)[0];

      pointer(f, handle, 'pointerdown', { y: 100 });
      expect(Element.prototype.setPointerCapture).toHaveBeenCalledWith(7);
      expect(handles(f)[0].classList.contains('dragging')).toBe(true);
      // Moves run outside Angular, and the strip renders each one itself: no fixture.detectChanges() here.
      dispatchPointer(handle, 'pointermove', { y: 160 });
      expect(bodyHeights(f)).toEqual(['420px', '420px', '360px']);
      dispatchPointer(handle, 'pointermove', { y: 900 });
      expect(bodyHeights(f)).toEqual(['900px', '900px', '360px']);
      dispatchPointer(handle, 'pointermove', { y: 130 });
      expect(changes).toEqual([]);

      pointer(f, handle, 'pointerup', { y: 130 });

      expect(changes).toEqual([sizes({ Height: 390 })]);
      expect(Element.prototype.releasePointerCapture).toHaveBeenCalledWith(7);
      expect(handles(f)[0].classList.contains('dragging')).toBe(false);
      expect(handles(f)[0].getAttribute('aria-valuenow')).toBe('390');
    });

    it('ignores a pointer down with a button other than the main one', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const handle = handles(f)[0];

      pointer(f, handle, 'pointerdown', { y: 100, button: 2, buttons: 2 });
      pointer(f, handle, 'pointermove', { y: 200 });
      pointer(f, handle, 'pointerup', { y: 200 });

      expect(Element.prototype.setPointerCapture).not.toHaveBeenCalled();
      expect(anyDragging(f)).toBe(false);
      expect(bodyHeights(f)).toEqual(['360px', '360px', '360px']);
      expect(changes).toEqual([]);
    });

    it('follows only the pointer that started the drag', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const handle = handles(f)[0];

      pointer(f, handle, 'pointerdown', { y: 100 });
      pointer(f, handle, 'pointermove', { y: 300, pointerId: 9 });
      pointer(f, handle, 'pointerup', { y: 300, pointerId: 9 });
      pointer(f, handle, 'pointercancel', { pointerId: 9 });
      expect(bodyHeights(f)).toEqual(['360px', '360px', '360px']);
      expect(handles(f)[0].classList.contains('dragging')).toBe(true);
      expect(changes).toEqual([]);

      pointer(f, handle, 'pointermove', { y: 130 });
      pointer(f, handle, 'pointerup', { y: 130 });

      expect(changes).toEqual([sizes({ Height: 390 })]);
    });

    it('ends the drag on pointercancel: the row keeps the dragged height, the bar goes out, and the height is emitted once', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const handle = handles(f)[0];

      pointer(f, handle, 'pointerdown', { y: 100 });
      pointer(f, handle, 'pointermove', { y: 200 });
      pointer(f, handle, 'pointercancel', { y: 200 });
      pointer(f, handle, 'pointermove', { y: 300 });

      expect(bodyHeights(f)).toEqual(['460px', '460px', '360px']);
      expect(anyDragging(f)).toBe(false);
      expect(changes).toEqual([sizes({ Height: 460 })]);
    });

    it('ends the drag when the handle loses the pointer capture without a pointerup', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const handle = handles(f)[0];

      pointer(f, handle, 'pointerdown', { y: 100 });
      pointer(f, handle, 'pointermove', { y: 150 });
      pointer(f, handle, 'lostpointercapture');
      pointer(f, handle, 'pointermove', { y: 300 });

      expect(bodyHeights(f)).toEqual(['410px', '410px', '360px']);
      expect(anyDragging(f)).toBe(false);
      expect(changes).toEqual([sizes({ Height: 410 })]);
    });

    it('ends the drag on a pointermove with no button down (the button came up out of sight)', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const handle = handles(f)[0];

      pointer(f, handle, 'pointerdown', { y: 100 });
      pointer(f, handle, 'pointermove', { y: 160 });
      pointer(f, handle, 'pointermove', { y: 220, buttons: 0 });
      pointer(f, handle, 'pointermove', { y: 260 });

      expect(bodyHeights(f)).toEqual(['420px', '420px', '360px']);
      expect(anyDragging(f)).toBe(false);
      expect(Element.prototype.releasePointerCapture).toHaveBeenCalledWith(7);
      expect(changes).toEqual([sizes({ Height: 420 })]);
    });

    it('ends the drag when a width change moves the rows, and emits the dragged height once', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const handle = handles(f)[0];

      pointer(f, handle, 'pointerdown', { y: 100 });
      pointer(f, handle, 'pointermove', { y: 160 });
      resizeStrip(f, 1600);
      pointer(f, handle, 'pointermove', { y: 300 });

      expect(anyDragging(f)).toBe(false);
      expect(bodyHeights(f)).toEqual(['420px', '420px', '420px']);
      expect(changes).toEqual([sizes({ Height: 420 })]);
    });

    it('ends the drag when the tiles change under it, and emits the dragged height once', async () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const handle = handles(f)[0];

      pointer(f, handle, 'pointerdown', { y: 100 });
      pointer(f, handle, 'pointermove', { y: 140 });
      update(f, { Favorites: [d('f1', 'Ops health')] });
      await Promise.resolve();
      f.detectChanges();

      expect(tileNames(f)).toEqual(['Sales pipeline', 'Ops health']);
      expect(anyDragging(f)).toBe(false);
      expect(changes).toEqual([sizes({ Height: 400 })]);
      expect(bodyHeights(f)).toEqual(['400px', '400px']);
    });
  });

  describe('the gutters between side-by-side tiles', () => {
    it('is a vertical separator named after the tiles on its two sides, with the left tile share and its range in %', () => {
      const f = renderAt(1100);
      expect(gutters(f).map(aria)).toEqual([
        { role: 'separator', orientation: 'vertical', tabindex: '0', label: 'Resize Sales pipeline and Ops health', now: '50', min: '25', max: '75' },
      ]);
    });

    it('Arrow Right and Arrow Left move the gutter by 2% of the row, and each press emits TileSizesChange', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);

      press(f, gutters(f)[0], 'ArrowRight');
      expect(tileSpans(f)).toEqual([0.52, 0.48, 1]);
      expect(gutters(f)[0].getAttribute('aria-valuenow')).toBe('52');
      press(f, gutters(f)[0], 'ArrowLeft');
      press(f, gutters(f)[0], 'ArrowLeft');
      press(f, gutters(f)[0], 'ArrowUp');

      expect(tileSpans(f)).toEqual([0.48, 0.52, 1]);
      expect(changes).toEqual([sizes({ Widths: { '2': [52, 48] } }), sizes({ Widths: { '2': [50, 50] } }), sizes({ Widths: { '2': [48, 52] } })]);
    });

    it('keeps each tile at 25% of the row or more, and emits nothing at a limit', () => {
      const f = renderAt(1100, { TileSizes: sizes({ Widths: { '2': [75, 25] } }) });
      const changes = Capture(f.componentInstance.TileSizesChange);

      press(f, gutters(f)[0], 'ArrowRight');

      expect(tileSpans(f)).toEqual([0.75, 0.25, 1]);
      expect(changes).toEqual([]);
    });

    it('moves only the two tiles beside a gutter in a row of three, and keeps the shares for that tile count', () => {
      const f = renderAt(1600);
      const changes = Capture(f.componentInstance.TileSizesChange);

      press(f, gutters(f)[1], 'ArrowRight');

      expect(tileSpans(f)).toEqual([0.3333, 0.3533, 0.3133]);
      expect(changes).toHaveLength(1);
      expect(Object.keys(changes[0].Rows[0].Widths ?? {})).toEqual(['3']);
      expect(round2(changes[0].Rows[0].Widths?.['3'] ?? [])).toEqual([33.33, 35.33, 31.33]);
    });

    it('a double-click makes the row tiles equal again', () => {
      const f = renderAt(1100, { TileSizes: sizes({ Height: 420, Widths: { '2': [60, 40], '3': [40, 30, 30] } }) });
      const changes = Capture(f.componentInstance.TileSizesChange);
      expect(tileSpans(f)).toEqual([0.6, 0.4, 1]);

      doubleClick(f, gutters(f)[0]);

      expect(tileSpans(f)).toEqual([0.5, 0.5, 1]);
      expect(changes).toEqual([sizes({ Height: 420, Widths: { '3': [40, 30, 30] } })]);
    });

    it('a double-click on a gutter whose row is already equal emits nothing', () => {
      const f = renderAt(1100);
      const changes = Capture(f.componentInstance.TileSizesChange);

      doubleClick(f, gutters(f)[0]);

      expect(tileSpans(f)).toEqual([0.5, 0.5, 1]);
      expect(changes).toEqual([]);
    });

    it('ends a gutter drag when the gutter loses the pointer capture, and emits the dragged shares once', () => {
      // 1,016 px: the row's free width is 1,000 px (one 16 px gap), so 100 px is 10%.
      const f = renderAt(1016);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const gutter = gutters(f)[0];

      pointer(f, gutter, 'pointerdown', { x: 508 });
      pointer(f, gutter, 'pointermove', { x: 608 });
      pointer(f, gutter, 'lostpointercapture');
      pointer(f, gutter, 'pointermove', { x: 900 });

      expect(tileSpans(f)).toEqual([0.6, 0.4, 1]);
      expect(anyDragging(f)).toBe(false);
      expect(changes).toEqual([sizes({ Widths: { '2': [60, 40] } })]);
    });

    it('ends a gutter drag on a pointermove with no button down', () => {
      const f = renderAt(1016);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const gutter = gutters(f)[0];

      pointer(f, gutter, 'pointerdown', { x: 508 });
      pointer(f, gutter, 'pointermove', { x: 558 });
      pointer(f, gutter, 'pointermove', { x: 700, buttons: 0 });

      expect(tileSpans(f)).toEqual([0.55, 0.45, 1]);
      expect(anyDragging(f)).toBe(false);
      expect(changes).toEqual([sizes({ Widths: { '2': [55, 45] } })]);
    });

    it('follows a pointer drag, by share of the row without its gap, and emits once when the drag ends', () => {
      // 1,016 px: the row's free width is 1,000 px (one 16 px gap), so 100 px is 10%.
      const f = renderAt(1016);
      const changes = Capture(f.componentInstance.TileSizesChange);
      const gutter = gutters(f)[0];

      pointer(f, gutter, 'pointerdown', { x: 508 });
      pointer(f, gutter, 'pointermove', { x: 608 });
      expect(tileSpans(f)).toEqual([0.6, 0.4, 1]);
      expect(gutters(f)[0].classList.contains('dragging')).toBe(true);
      pointer(f, gutter, 'pointermove', { x: 1000 });
      expect(tileSpans(f)).toEqual([0.75, 0.25, 1]);
      pointer(f, gutter, 'pointermove', { x: 538 });
      expect(changes).toEqual([]);

      pointer(f, gutter, 'pointerup', { x: 538 });

      expect(changes).toEqual([sizes({ Widths: { '2': [53, 47] } })]);
      expect(gutters(f)[0].classList.contains('dragging')).toBe(false);
    });
  });

  describe('change detection', () => {
    it('runs no change detection while the pointer only moves over the separators', async () => {
      const f = render({}, true);
      resizeStrip(f, 1100);
      await f.whenStable();
      const renders = vi.spyOn(HomeDashboardsStripComponent.prototype, 'Layout', 'get');

      for (const separator of [gutters(f)[0], handles(f)[0]]) {
        dispatchPointer(separator, 'pointerover', { buttons: 0 });
        dispatchPointer(separator, 'pointermove', { x: 5, y: 5, buttons: 0 });
        dispatchPointer(separator, 'pointermove', { x: 6, y: 6, buttons: 0 });
      }
      await f.whenStable();
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(renders).not.toHaveBeenCalled();
    });
  });

  describe('sizes from the TileSizes input', () => {
    it('restores the saved row heights and shares, by row position and tile count', () => {
      const saved = sizes({ Height: 480, Widths: { '2': [60, 40], '3': [40, 30, 30] } }, { Height: 300 });
      const f = renderAt(1100, { TileSizes: saved });

      expect(bodyHeights(f)).toEqual(['480px', '480px', '300px']);
      expect(tileSpans(f)).toEqual([0.6, 0.4, 1]);
      expect(gutters(f)[0].getAttribute('aria-valuenow')).toBe('60');
      expect(handles(f).map(h => h.getAttribute('aria-valuenow'))).toEqual(['480', '300']);

      resizeStrip(f, 1600);
      expect(bodyHeights(f)).toEqual(['480px', '480px', '480px']);
      expect(tileSpans(f)).toEqual([0.4, 0.3, 0.3]);
    });

    it('follows a new TileSizes value', () => {
      const f = renderAt(1100);
      update(f, { TileSizes: sizes({ Height: 500, Widths: { '2': [30, 70] } }) });
      expect(bodyHeights(f)).toEqual(['500px', '500px', '360px']);
      expect(tileSpans(f)).toEqual([0.3, 0.7, 1]);
    });
  });

  describe('Browse all and the empty state', () => {
    it('shows Browse all as one row under the tiles: the icon, "Browse all" with the total, and the favorite and shared counts', () => {
      const f = render();
      expect(Query(f, '.strip-grid + .strip-browse-all')).not.toBeNull();
      expect(Query(f, '.strip-grid .strip-browse-all')).toBeNull();
      expect(Query(f, '.strip-browse-all .strip-browse-icon i.fa-layer-group')).not.toBeNull();
      expect(Text(f, '.strip-browse-all .strip-browse-label')).toBe('Browse all 31');
      expect(Text(f, '.strip-browse-all small')).toBe('3 favorites · 5 shared with you');
    });

    it('counts one favorite in the singular', () => {
      expect(Text(render({ Favorites: [d('f1', 'Ops health')] }), '.strip-browse-all small')).toBe('1 favorite · 5 shared with you');
    });

    it('emits SeeAll, BrowseAll and NewDashboard', () => {
      const f = render();
      const seeAll = Capture(f.componentInstance.SeeAll);
      const browse = Capture(f.componentInstance.BrowseAll);
      const created = Capture(f.componentInstance.NewDashboard);
      Click(f, '.strip-see-all'); Click(f, '.strip-browse-all'); Click(f, '.strip-new');
      expect(seeAll.length).toBe(1); expect(browse.length).toBe(1); expect(created.length).toBe(1);
    });

    it('shows the empty hint above the Browse all row, and no tiles, when nothing has been opened or starred', () => {
      const f = render({ Continue: null, Favorites: [] });
      expect(Text(f, '.strip-empty')).toBe('Open or star a dashboard and it appears here.');
      expect(Query(f, '.strip-empty + .strip-browse-all')).not.toBeNull();
      expect(tiles(f)).toEqual([]);
      expect(Query(f, '.strip-grid')).toBeNull();
    });

    it('shows no empty hint and one tile when the only favorite is the Continue dashboard', () => {
      const f = render({ Favorites: [d('c', 'Sales pipeline')] });
      expect(Query(f, '.strip-empty')).toBeNull();
      expect(tileNames(f)).toEqual(['Sales pipeline']);
      expect(continueLabels(f)).toEqual([true]);
    });
  });

  describe('collapsing', () => {
    /** The strip's toggle: the "Dashboards" title button. */
    const TOGGLE = 'button.mj-accordion-header';

    it('is a Bare accordion panel whose "Dashboards" title is the toggle', () => {
      const f = render();
      expect(Text(f, TOGGLE)).toBe('Dashboards');
      expect(Query(f, '.mj-accordion-panel')?.classList.contains('mj-accordion-panel--bare')).toBe(true);
    });

    it('shows the body and marks the toggle open when Expanded is true, the default', () => {
      const f = render();
      expect(Attr(f, TOGGLE, 'aria-expanded')).toBe('true');
      expect(Query(f, '.mj-accordion-body-outer')?.hasAttribute('inert')).toBe(false);
      expect(Query(f, '.mj-accordion-body .strip-grid')).not.toBeNull();
    });

    it('makes the "Dashboards" title a level-2 heading', () => {
      const f = render();
      expect(Attr(f, '[role="heading"]', 'aria-level')).toBe('2');
      expect(Text(f, '[role="heading"]')).toBe('Dashboards');
      expect(Query(f, `[role="heading"] ${TOGGLE}`)).not.toBeNull();
    });

    it('does not render the body when Expanded is false', () => {
      // No Continue dashboard and no favorites, so an open body would show the empty text
      const f = render({ Expanded: false, Continue: null, Favorites: [] });
      expect(Attr(f, TOGGLE, 'aria-expanded')).toBe('false');
      expect(Query(f, '.strip-browse-all')).toBeNull();
      expect(Query(f, '.strip-empty')).toBeNull();
    });

    it('hides the body again when Expanded turns false', () => {
      const f = render();
      f.componentRef.setInput('Expanded', false);
      f.detectChanges();
      expect(Attr(f, TOGGLE, 'aria-expanded')).toBe('false');
      expect(Query(f, '.mj-accordion-body-outer')?.hasAttribute('inert')).toBe(true);
    });

    it('emits ExpandedChange each time the title is clicked', () => {
      const f = render();
      const changes = Capture(f.componentInstance.ExpandedChange);
      Click(f, TOGGLE);
      f.detectChanges();
      Click(f, TOGGLE);
      expect(changes).toEqual([false, true]);
    });

    it('keeps New and See all in the header, outside the toggle, and they still emit when collapsed', () => {
      const f = render({ Expanded: false });
      const changes = Capture(f.componentInstance.ExpandedChange);
      const created = Capture(f.componentInstance.NewDashboard);
      const seeAll = Capture(f.componentInstance.SeeAll);
      expect(Query(f, '.mj-accordion-actions .strip-new')).not.toBeNull();
      expect(Query(f, `${TOGGLE} .strip-new, ${TOGGLE} .strip-see-all`)).toBeNull();

      Click(f, '.strip-new');
      Click(f, '.strip-see-all');

      expect(created.length).toBe(1);
      expect(seeAll.length).toBe(1);
      expect(changes).toEqual([]);
    });
  });
});
