import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, Renderer2, ViewChild, inject } from '@angular/core';
import { MJDashboardEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { DashboardNavRequestEvent } from '@memberjunction/ng-dashboard-viewer';
import {
  BuildHomeDashboardTileLayout,
  ClampTileBodyHeight,
  EmptyHomeDashboardTileSizes,
  HomeDashboardTileColumns,
  HomeDashboardTileLayout,
  HomeDashboardTileSizes,
  MAX_TILE_BODY_HEIGHT,
  MIN_TILE_BODY_HEIGHT,
  MIN_TILE_WIDTH_PERCENT,
  MoveTileGutter,
  RowBodyHeight,
  RowTileWidths,
  TILE_GAP,
  TILE_HEIGHT_KEY_STEP,
  TILE_WIDTH_KEY_STEP,
  WithRowHeight,
  WithRowWidths,
} from './home-dashboard-tile-layout';
import { SeparatorPointerDrag } from './separator-pointer-drag';

/** How many favorite dashboards the strip shows, after the Continue dashboard. */
const FAVORITE_CARD_COUNT = 2;

/** A tile of the strip: its dashboard, and whether that is the Continue dashboard. */
export interface HomeDashboardStripTile {
  Dashboard: MJDashboardEntity;
  IsContinue: boolean;
}

/** The layout a drag started in: the tiles (by dashboard ID) and how many fit side by side. */
interface DragLayout {
  TileIds: string[];
  Columns: number;
}

/** A drag of a row's height handle. */
interface HeightDrag extends DragLayout {
  Kind: 'height';
  Session: SeparatorPointerDrag;
  Row: number;
  StartY: number;
  StartHeight: number;
  Height: number;
}

/** A drag of the gutter after a tile. */
interface GutterDrag extends DragLayout {
  Kind: 'gutter';
  Session: SeparatorPointerDrag;
  TileIndex: number;
  Row: number;
  Gutter: number;
  TileCount: number;
  StartX: number;
  /** The row's width without its gaps (px). */
  FreeWidth: number;
  StartWidths: number[];
  Widths: number[];
}

type SeparatorDrag = HeightDrag | GutterDrag;

/**
 * The Dashboards section on Home, in a panel that collapses to its header (title, New, See all).
 * Each dashboard runs live in a tile: first the dashboard the user opened last (Continue), then up
 * to two favorite dashboards. A Browse all row sits under the tiles.
 *
 * The tiles are one list keyed by dashboard ID, so a tile keeps its viewer when the rows change.
 * The strip watches its width and puts the tiles in rows (one, two or three side by side); CSS grid
 * places each tile in its row. The user drags the gutter between side-by-side tiles to share the
 * row's width, and the handle under a row to set its height; TileSizes holds those sizes and
 * TileSizesChange emits them. A drag follows its pointer outside Angular's zone and renders only the
 * strip. Presentational: Home decides what each output does and saves the open state and the sizes.
 */
@Component({
  standalone: false,
  selector: 'mj-home-dashboards-strip',
  templateUrl: './home-dashboards-strip.component.html',
  styleUrls: ['./home-dashboards-strip.component.css'],
})
export class HomeDashboardsStripComponent implements OnDestroy {
  /** The dashboard the user opened last, or null. */
  @Input()
  set Continue(value: MJDashboardEntity | null) {
    this._continue = value;
    this.endDragIfLayoutChanged();
  }
  get Continue(): MJDashboardEntity | null {
    return this._continue;
  }

  /** The user's favorite dashboards, in the order the tiles show them. */
  @Input()
  set Favorites(value: MJDashboardEntity[]) {
    this._favorites = value;
    this.endDragIfLayoutChanged();
  }
  get Favorites(): MJDashboardEntity[] {
    return this._favorites;
  }

  /** Ids of the user's favorite dashboards, for the star on each tile. */
  @Input() FavoriteIds: string[] = [];
  /** How many dashboards the user can open. */
  @Input() TotalCount = 0;
  /** How many of those dashboards other people shared with the user. */
  @Input() SharedCount = 0;
  /** Whether the strip is open. False shows only its header. */
  @Input() Expanded = true;
  /** The row heights and tile widths the user set (the HomeApp.DashboardTileSizes setting). */
  @Input() TileSizes: HomeDashboardTileSizes = EmptyHomeDashboardTileSizes();
  /** Emits the new open state when the user clicks the title or the chevron. */
  @Output() ExpandedChange = new EventEmitter<boolean>();
  @Output() Open = new EventEmitter<MJDashboardEntity>();
  @Output() ToggleFavorite = new EventEmitter<MJDashboardEntity>();
  @Output() NewDashboard = new EventEmitter<void>();
  @Output() SeeAll = new EventEmitter<void>();
  @Output() BrowseAll = new EventEmitter<void>();
  /** Emits a link from a panel of a tile's dashboard: a record, a dashboard or a query. */
  @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();
  /** Emits the new sizes when the user resizes: once when a drag ends, on each key press and on a double-click reset. */
  @Output() TileSizesChange = new EventEmitter<HomeDashboardTileSizes>();

  /** The range of a row's height (px) and the smallest tile share (%), for the separators' ARIA values. */
  public readonly MinRowHeight = MIN_TILE_BODY_HEIGHT;
  public readonly MaxRowHeight = MAX_TILE_BODY_HEIGHT;
  public readonly MinTileWidth = MIN_TILE_WIDTH_PERCENT;
  /** The gap between side-by-side tiles and between rows, for the grid's CSS. */
  public readonly TileGap = `${TILE_GAP}px`;

  private cdr = inject(ChangeDetectorRef);
  private renderer = inject(Renderer2);
  private ngZone = inject(NgZone);
  private _continue: MJDashboardEntity | null = null;
  private _favorites: MJDashboardEntity[] = [];
  /** The strip's width (px), as its ResizeObserver last reported it; 0 before the first report. */
  private stripWidth = 0;
  private widthObserver: ResizeObserver | null = null;
  private observedProbe: HTMLElement | null = null;
  /** The drag in progress, if any. */
  private drag: SeparatorDrag | null = null;
  @ViewChild('tileGrid') private tileGrid?: ElementRef<HTMLElement>;

  /** The zero-height element as wide as the section. The strip watches its width while the body is shown. */
  @ViewChild('widthProbe')
  private set widthProbe(probe: ElementRef<HTMLElement> | undefined) {
    this.observeWidth(probe?.nativeElement ?? null);
  }

  /** The first two favorites, without the Continue dashboard. */
  public get FavoriteCards(): MJDashboardEntity[] {
    const continueId = this.Continue?.ID;
    return this.Favorites.filter(d => !continueId || !UUIDsEqual(d.ID, continueId)).slice(0, FAVORITE_CARD_COUNT);
  }

  /**
   * The tiles in order: the Continue dashboard, if any, then the favorites. The strip tracks them by
   * dashboard ID, so a dashboard that moves between Continue and the favorites keeps its tile and
   * its viewer.
   */
  public get Tiles(): HomeDashboardStripTile[] {
    const favorites = this.FavoriteCards.map(d => ({ Dashboard: d, IsContinue: false }));
    return this.Continue ? [{ Dashboard: this.Continue, IsContinue: true }, ...favorites] : favorites;
  }

  /** How many tiles the strip shows: the Continue dashboard, if any, and the favorites. */
  public get TileCount(): number {
    return (this.Continue ? 1 : 0) + this.FavoriteCards.length;
  }

  /** Where each tile, gutter and height handle goes, with a row or gutter being dragged at its current size. */
  public get Layout(): HomeDashboardTileLayout {
    return BuildHomeDashboardTileLayout(this.stripWidth, this.TileCount, this.currentSizes());
  }

  /** "1 favorite" or "N favorites". */
  public get FavoritesLabel(): string {
    const count = this.Favorites.length;
    return `${count} ${count === 1 ? 'favorite' : 'favorites'}`;
  }

  public IsFavorite(dashboard: MJDashboardEntity): boolean {
    return this.FavoriteIds.some(id => UUIDsEqual(id, dashboard.ID));
  }

  /** Keeps Expanded in step with the panel and emits ExpandedChange. */
  public OnExpandedChange(expanded: boolean): void {
    this.Expanded = expanded;
    this.ExpandedChange.emit(expanded);
  }

  /** The name of the gutter after a tile: "Resize <tile name> and <next tile name>". */
  public GutterLabel(tileIndex: number): string {
    const tiles = this.Tiles;
    return `Resize ${tiles[tileIndex]?.Dashboard.Name ?? ''} and ${tiles[tileIndex + 1]?.Dashboard.Name ?? ''}`;
  }

  /** A row handle's value text: the height in px and the row's dashboards, for example "360 px, Sales pipeline and Ops health". */
  public HandleValueText(height: number, row: number[]): string {
    const tiles = this.Tiles;
    return `${height} px, ${joinNames(row.map(index => tiles[index]?.Dashboard.Name ?? ''))}`;
  }

  /** True while the user drags the gutter after that tile. */
  public IsDraggingGutter(tileIndex: number): boolean {
    const drag = this.activeDrag();
    return drag?.Kind === 'gutter' && drag.TileIndex === tileIndex;
  }

  /** True while the user drags that row's height handle. */
  public IsDraggingRow(row: number): boolean {
    const drag = this.activeDrag();
    return drag?.Kind === 'height' && drag.Row === row;
  }

  /** Starts a drag of a row's height handle with the main button. */
  public OnHandlePointerDown(event: PointerEvent, row: number): void {
    const target = this.dragTarget(event);
    if (!target) {
      return;
    }
    const height = RowBodyHeight(this.TileSizes, row, this.stripWidth);
    this.beginDrag({ Kind: 'height', Session: this.newSession(target, event.pointerId), Row: row, StartY: event.clientY, StartHeight: height, Height: height, ...this.dragLayout() });
  }

  /** Starts a drag of the gutter after a tile with the main button. */
  public OnGutterPointerDown(event: PointerEvent, tileIndex: number): void {
    const target = this.dragTarget(event);
    const place = this.Layout.Tiles[tileIndex];
    const freeWidth = (this.tileGrid?.nativeElement.getBoundingClientRect().width ?? 0) - (place.RowTileCount - 1) * TILE_GAP;
    if (!target || freeWidth <= 0) {
      return;
    }
    const widths = RowTileWidths(this.TileSizes, place.Row, place.RowTileCount);
    this.beginDrag({
      Kind: 'gutter',
      Session: this.newSession(target, event.pointerId),
      TileIndex: tileIndex,
      Row: place.Row,
      Gutter: place.Column,
      TileCount: place.RowTileCount,
      StartX: event.clientX,
      FreeWidth: freeWidth,
      StartWidths: widths,
      Widths: widths,
      ...this.dragLayout(),
    });
  }

  /** Arrow Down and Arrow Up change the row's height by 20 px, from 240 to 900 px, and emit it. */
  public OnHandleKeyDown(event: KeyboardEvent, row: number): void {
    const step = event.key === 'ArrowDown' ? TILE_HEIGHT_KEY_STEP : event.key === 'ArrowUp' ? -TILE_HEIGHT_KEY_STEP : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    this.endDrag();
    const height = RowBodyHeight(this.TileSizes, row, this.stripWidth);
    const next = ClampTileBodyHeight(height + step);
    if (next !== height) {
      this.commit(WithRowHeight(this.TileSizes, row, next));
    }
  }

  /** A double-click puts the row back to the default height. */
  public OnHandleDoubleClick(row: number): void {
    this.endDrag();
    if (this.TileSizes.Rows[row]?.Height !== undefined) {
      this.commit(WithRowHeight(this.TileSizes, row, null));
    }
  }

  /** Arrow Right and Arrow Left move the gutter by 2% of the row, each tile kept at 25% or more, and emit the shares. */
  public OnGutterKeyDown(event: KeyboardEvent, tileIndex: number): void {
    const step = event.key === 'ArrowRight' ? TILE_WIDTH_KEY_STEP : event.key === 'ArrowLeft' ? -TILE_WIDTH_KEY_STEP : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    this.endDrag();
    const place = this.Layout.Tiles[tileIndex];
    const widths = RowTileWidths(this.TileSizes, place.Row, place.RowTileCount);
    const moved = MoveTileGutter(widths, place.Column, step);
    if (!sameWidths(moved, widths)) {
      this.commit(WithRowWidths(this.TileSizes, place.Row, place.RowTileCount, moved));
    }
  }

  /** A double-click on a gutter makes the row's tiles equal again. */
  public OnGutterDoubleClick(tileIndex: number): void {
    this.endDrag();
    const place = this.Layout.Tiles[tileIndex];
    if (this.TileSizes.Rows[place.Row]?.Widths?.[String(place.RowTileCount)]) {
      this.commit(WithRowWidths(this.TileSizes, place.Row, place.RowTileCount, null));
    }
  }

  ngOnDestroy(): void {
    this.drag?.Session.Dispose();
    this.drag = null;
    this.observeWidth(null);
  }

  /** The separator that got a main-button pointer down, after any drag in progress ends; null to ignore the event. */
  private dragTarget(event: PointerEvent): Element | null {
    const target = event.currentTarget;
    if (event.button !== 0 || !(target instanceof Element)) {
      return null;
    }
    event.preventDefault();
    this.endDrag();
    return target;
  }

  /** A pointer drag of a separator that calls back into the strip. */
  private newSession(target: Element, pointerId: number): SeparatorPointerDrag {
    const session: SeparatorPointerDrag = new SeparatorPointerDrag(
      this.renderer,
      target,
      pointerId,
      event => this.onDragMove(event),
      () => this.onDragEnd(session)
    );
    return session;
  }

  /** Makes the drag the one in progress and starts its pointer session outside Angular's zone. */
  private beginDrag(drag: SeparatorDrag): void {
    this.drag = drag;
    this.ngZone.runOutsideAngular(() => drag.Session.Start());
  }

  /** One move of the dragging pointer (outside Angular): the row or gutter follows it, and the strip renders. */
  private onDragMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    if (!this.dragFits(drag)) {
      drag.Session.End();
      return;
    }
    if (drag.Kind === 'height') {
      drag.Height = ClampTileBodyHeight(drag.StartHeight + event.clientY - drag.StartY);
    } else {
      drag.Widths = MoveTileGutter(drag.StartWidths, drag.Gutter, ((event.clientX - drag.StartX) * 100) / drag.FreeWidth);
    }
    this.cdr.detectChanges();
  }

  /** Ends the drag in progress, if any: its session releases the pointer and calls onDragEnd. */
  private endDrag(): void {
    this.drag?.Session.End();
  }

  /** A drag ended: it is cleared, its size is emitted once if it changed (inside Angular's zone), and the strip renders. */
  private onDragEnd(session: SeparatorPointerDrag): void {
    const drag = this.drag;
    if (!drag || drag.Session !== session) {
      return;
    }
    this.drag = null;
    const sizes = this.dragResult(drag);
    if (sizes) {
      this.ngZone.run(() => this.commit(sizes));
    }
    this.cdr.detectChanges();
  }

  /** The sizes a drag leaves, or null when it changed nothing. */
  private dragResult(drag: SeparatorDrag): HomeDashboardTileSizes | null {
    if (drag.Kind === 'height') {
      return drag.Height === drag.StartHeight ? null : WithRowHeight(this.TileSizes, drag.Row, drag.Height);
    }
    return sameWidths(drag.Widths, drag.StartWidths) ? null : WithRowWidths(this.TileSizes, drag.Row, drag.TileCount, drag.Widths);
  }

  /** The tiles and the tiles per row now, to compare with those a drag started in. */
  private dragLayout(): DragLayout {
    return { TileIds: this.Tiles.map(tile => tile.Dashboard.ID), Columns: HomeDashboardTileColumns(this.stripWidth) };
  }

  /** True while the drag's separator is on the page and the tiles and the tiles per row are those it started with. */
  private dragFits(drag: SeparatorDrag): boolean {
    const now = this.dragLayout();
    return drag.Session.Target.isConnected && drag.Columns === now.Columns && sameIds(drag.TileIds, now.TileIds);
  }

  /** The drag in progress while it still fits the layout; else null. */
  private activeDrag(): SeparatorDrag | null {
    const drag = this.drag;
    return drag && this.dragFits(drag) ? drag : null;
  }

  /**
   * After the tiles change, ends a drag they no longer fit. It waits for a microtask, so the end's
   * output is not emitted while Angular is setting the strip's inputs.
   */
  private endDragIfLayoutChanged(): void {
    if (!this.drag) {
      return;
    }
    queueMicrotask(() => {
      const drag = this.drag;
      if (drag && !this.dragFits(drag)) {
        drag.Session.End();
      }
    });
  }

  /** The saved sizes, with a row or gutter being dragged at its current size. */
  private currentSizes(): HomeDashboardTileSizes {
    const drag = this.activeDrag();
    if (!drag) {
      return this.TileSizes;
    }
    return drag.Kind === 'height' ? WithRowHeight(this.TileSizes, drag.Row, drag.Height) : WithRowWidths(this.TileSizes, drag.Row, drag.TileCount, drag.Widths);
  }

  /** Takes the new sizes and emits them. */
  private commit(sizes: HomeDashboardTileSizes): void {
    this.TileSizes = sizes;
    this.TileSizesChange.emit(sizes);
  }

  /** Watches the probe's width with a ResizeObserver; null stops watching. */
  private observeWidth(probe: HTMLElement | null): void {
    if (probe === this.observedProbe) {
      return;
    }
    this.widthObserver?.disconnect();
    this.widthObserver = null;
    this.observedProbe = probe;
    if (probe && typeof ResizeObserver !== 'undefined') {
      this.widthObserver = new ResizeObserver(entries => this.onStripWidth(entries[entries.length - 1].contentRect.width));
      this.widthObserver.observe(probe);
    }
  }

  /**
   * Takes the strip's new width. When the tiles per row change, a drag in progress ends (its size is
   * emitted once) and the strip renders at once, so the new rows show before the next paint.
   */
  private onStripWidth(width: number): void {
    const columnsChanged = HomeDashboardTileColumns(width) !== HomeDashboardTileColumns(this.stripWidth);
    this.stripWidth = width;
    if (columnsChanged) {
      this.endDrag();
      this.cdr.detectChanges();
    }
  }
}

/** True when both lists hold the same shares. */
function sameWidths(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((width, i) => width === b[i]);
}

/** True when both lists hold the same dashboard IDs in the same order. */
function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => UUIDsEqual(id, b[i]));
}

/** Names joined for reading: "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
