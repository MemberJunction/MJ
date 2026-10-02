import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DoCheck,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { MJDashboardEntity } from '@memberjunction/core-entities';
import type { DashboardNavRequestEvent } from '@memberjunction/ng-dashboard-viewer';
import { ElementHasSize, ElementSizeWait } from './element-size-wait';
import { CreateHomeTabView, HomeTabView, HomeTabViewPlan, PlanHomeTabView } from './home-dashboard-tabs.helpers';
import { DEFAULT_TILE_BODY_HEIGHT, TILE_CONTENT_SCALE } from './home-dashboard-tile-layout';

/**
 * A dashboard in Home's Dashboards section, live: a header row (the name, a Continue label, the
 * favorite star and Open) over the dashboard's viewer, shown at TILE_CONTENT_SCALE (80%) in a body
 * BodyHeight px tall. The tile keeps its viewer while the dashboard's ID, name and layout stay the
 * same, and builds a new one when they change, also when a save changes the same dashboard object,
 * but only into a body that has a size.
 * Presentational: the section decides what Open, ToggleFavorite and a panel's link do.
 */
@Component({
  standalone: false,
  selector: 'mj-home-dashboard-tile',
  templateUrl: './home-dashboard-tile.component.html',
  styleUrls: ['./home-dashboard-tile.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeDashboardTileComponent implements DoCheck, OnDestroy {
  private static tileCount = 0;

  private cdr = inject(ChangeDetectorRef);
  private _dashboard!: MJDashboardEntity;
  private viewKey = 0;
  /** Watches the body while a viewer build waits for the body to have a size. */
  private bodySizeWait = new ElementSizeWait(() => {
    this.syncView();
    this.cdr.markForCheck();
  });
  @ViewChild('tileBody', { static: true }) private body?: ElementRef<HTMLElement>;

  /** The dashboard the tile shows. A new object with the same ID, name and layout keeps the viewer. */
  @Input({ required: true })
  set Dashboard(value: MJDashboardEntity) {
    this._dashboard = value;
    this.syncView();
  }
  get Dashboard(): MJDashboardEntity {
    return this._dashboard;
  }

  /** Shows the Continue label: this is the dashboard the user opened last. */
  @Input() IsContinue = false;
  /** Whether the dashboard is one of the user's favorites, for the star. */
  @Input() IsFavorite = false;
  /** The height (px) of the body that shows the dashboard. */
  @Input() BodyHeight = DEFAULT_TILE_BODY_HEIGHT;
  /** Emits the dashboard when the user clicks its name or Open. */
  @Output() Open = new EventEmitter<MJDashboardEntity>();
  /** Emits the dashboard when the user clicks the star. */
  @Output() ToggleFavorite = new EventEmitter<MJDashboardEntity>();
  /** Emits a link from one of the dashboard's panels: a record, a dashboard or a query. */
  @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();

  /** The id of the heading that holds the name. It labels the tile. */
  public readonly HeadingId = `mj-home-dashboard-tile-${++HomeDashboardTileComponent.tileCount}-name`;
  /** The tile's viewer: empty until the first build, then one view. A new Key creates a new viewer. */
  public Views: HomeTabView[] = [];
  /** The CSS zoom of the box the dashboard lays out in. The box fills the body, so the dashboard lays out in 1 / TILE_CONTENT_SCALE of its size. */
  public readonly ContentZoom = TILE_CONTENT_SCALE;

  /**
   * Catches a save into the same dashboard object: the dashboard cache keeps its object, so the
   * `Dashboard` input does not change. While the viewer shows the dashboard as it is, this costs only
   * string compares. While a wait runs, it does nothing: the wait syncs when the body has a size.
   */
  ngDoCheck(): void {
    if (this.bodySizeWait.IsWatching || this.viewShowsDashboard()) {
      return;
    }
    this.syncView();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.bodySizeWait.Stop();
  }

  /** Keeps the viewer in step with the dashboard: keep it, build a new one, or wait until the body has a size. */
  private syncView(): void {
    const plan = this.planView();
    const body = this.body?.nativeElement;
    if (plan === 'wait' && body) {
      this.bodySizeWait.Watch(body);
      return;
    }
    this.bodySizeWait.Stop();
    if (plan === 'build') {
      this.Views = [CreateHomeTabView(this._dashboard, ++this.viewKey)];
    }
  }

  /**
   * Keep when the viewer shows the dashboard as it is; otherwise build, but only into a body that has
   * a size. A tile can get a new dashboard, or be created, while Home is hidden, and a viewer built
   * into a hidden body stops waiting for a size after a few seconds and then shows no panels. The
   * body size is read only when the result is not keep, because the read forces a layout.
   */
  private planView(): HomeTabViewPlan {
    if (this.viewShowsDashboard()) {
      return 'keep';
    }
    const body = this.body?.nativeElement;
    return body && !ElementHasSize(body) ? 'wait' : 'build';
  }

  /** True when the viewer was built from this dashboard's ID, name and layout. Compares strings only. */
  private viewShowsDashboard(): boolean {
    return PlanHomeTabView(this.Views[0] ?? null, this._dashboard, true) === 'keep';
  }
}
