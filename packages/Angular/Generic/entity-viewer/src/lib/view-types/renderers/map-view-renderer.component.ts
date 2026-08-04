import { Component, Input, Output, EventEmitter, ViewEncapsulation, OnInit } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  MapViewComponent,
  MapRenderMode,
  MapDisplayState,
  MapMarkerClickEvent,
} from '@memberjunction/ng-map-view';
import { IViewRenderer, ViewDataRequest } from '../view-type.contracts';

/**
 * Opaque per-view configuration for the Map view type.
 *
 * The host stores and round-trips this blob verbatim against the active `ViewTypeID` and never
 * inspects it — only this renderer reads/writes it. It carries the two pieces of map state that
 * should persist with the view: the render mode (point / boundary / choropleth / heatmap) and the
 * last display state (zoom / center / clustering / choropleth options). Both are optional so a
 * freshly-created Map view starts from sensible defaults.
 */
export interface MapViewConfig {
  /** The map's render mode. Defaults to `'point'` when unset (see {@link MapViewRendererComponent.activeRenderMode}). */
  renderMode?: MapRenderMode;
  /** The map's last persisted display state (zoom, center, clustering, choropleth options). */
  displayState?: MapDisplayState;
}

/**
 * MapViewRendererComponent
 * ------------------------
 * The Map **view type** renderer — a thin {@link IViewRenderer} adapter that hosts the existing
 * {@link MapViewComponent} (`<mj-map-view>`) inside the entity-viewer's pluggable view-type system.
 *
 * **The container has ZERO knowledge of maps.** The host feeds this renderer only the generic
 * {@link IViewRenderer} surface (`entity` / `records` / `totalRecordCount` / `config` / …) and
 * listens only to the generic outputs (`recordSelected` / `configChanged` / `dataRequest` / …).
 * Everything map-specific is encapsulated here:
 *
 *  - The map's **render mode + display state** live inside the opaque {@link MapViewConfig} blob.
 *    The host persists that blob verbatim against the active `ViewTypeID` and never reads it; this
 *    renderer seeds `<mj-map-view>` from it and writes changes back via `configChanged`.
 *  - The "maps need the full record set" requirement is expressed through the **generic
 *    {@link IViewRenderer.dataRequest} channel** as `{ loadAll: true }` — the container honors the
 *    request (loads all records up to its safety cap) without knowing it came from a map.
 *
 * **Why import `MapViewModule` rather than `MapViewComponent` directly:** {@link MapViewComponent}
 * is an NgModule-declared (`standalone: false`) component, so Angular forbids placing it directly
 * in a standalone component's `imports` array (NG6008). The supported way for a standalone
 * component to consume a non-standalone component is to import the NgModule that exports it — here
 * {@link MapViewModule}. {@link MapViewComponent} is still imported above so its `@Input`/`@Output`
 * types stay referenced and the file documents exactly which component it adapts. This mirrors the
 * sibling `CardsViewRendererComponent`'s approach.
 *
 * **Marker → record mapping:** `<mj-map-view>` emits the rich {@link MapMarkerClickEvent}
 * (`{ RecordID, Latitude, Longitude, Record }`), but the host's dynamic renderer handler expects
 * the **raw record** and builds the composite key itself. This adapter therefore extracts
 * `.Record` and re-emits just that object via `recordSelected`, matching the other plug-in
 * renderers (Cards/Cluster emit raw record objects).
 *
 * Inputs use the camelCase names mandated by the {@link IViewRenderer} contract (the host binds
 * them by those exact names), rather than MJ's usual PascalCase for public members — mirroring the
 * Cards and Cluster renderers.
 */
@Component({
  standalone: false,
  selector: 'mj-map-view-renderer',
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (entity) {
      <mj-map-view
        [Entity]="entity"
        [Records]="records"
        [TotalRecordCount]="totalRecordCount ?? 0"
        [RenderMode]="activeRenderMode"
        [DisplayState]="activeDisplayState"
        (MarkerClick)="onMarkerClick($event)"
        (RenderModeChange)="onRenderModeChange($event)"
        (DisplayStateChange)="onDisplayStateChange($event)"
      >
      </mj-map-view>
    } @else {
      <mj-empty-state
        class="map-view-renderer-empty-fill"
        Icon="fa-solid fa-map-location-dot"
        Title="No entity selected to map." />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      /* Fill the map area (the host centers its content but does not grow). */
      .map-view-renderer-empty-fill {
        height: 100%;
      }
    `,
  ],
})
export class MapViewRendererComponent extends BaseAngularComponent implements IViewRenderer<MapViewConfig>, OnInit {
  // ---- IViewRenderer inputs (camelCase per the host contract) ----

  /** The entity whose records are being mapped. The map requires an entity; when null an empty state renders. */
  @Input() entity: EntityInfo | null = null;

  /** The records to render as map markers (loaded/filtered by the host). */
  @Input() records: Record<string, unknown>[] = [];

  /** Primary-key string of the currently selected record, if any. Unused by the map view today. */
  @Input() selectedRecordId: string | null = null;

  /** Active filter text. Unused by the map view today (records are already filtered by the host). */
  @Input() filterText: string | null = null;

  private _config: MapViewConfig = {};
  /**
   * The opaque per-view configuration. Setting it re-derives the {@link activeRenderMode} and
   * {@link activeDisplayState} that seed `<mj-map-view>`.
   */
  @Input()
  set config(value: MapViewConfig) {
    this._config = value ?? {};
    this.applyConfig();
  }
  get config(): MapViewConfig {
    return this._config;
  }

  /**
   * The total number of records the host's query would return — bound to `<mj-map-view>`'s
   * `TotalRecordCount` so the map can convey when markers are a capped subset.
   */
  @Input() totalRecordCount?: number;

  /** One-based current page of {@link records} when the host is paginating. Unused by the map view. */
  @Input() page?: number;

  /** Page size the host is using. Unused by the map view. */
  @Input() pageSize?: number;

  /** Whether the host is currently (re)loading the record set. Unused by the map view today. */
  @Input() isLoading?: boolean;

  // ---- IViewRenderer outputs ----

  /** Emitted when a marker is clicked — payload is the raw record object (the marker's `.Record`). */
  @Output() recordSelected = new EventEmitter<unknown>();

  /**
   * Required by {@link IViewRenderer}; the map view has no distinct "open" gesture, so this never
   * emits. Declared so the host's uniform output subscription is satisfied.
   */
  @Output() recordOpened = new EventEmitter<unknown>();

  /**
   * Emitted when the user changes the render mode or pans/zooms the map. The host persists the
   * updated {@link MapViewConfig} blob verbatim against the active `ViewTypeID`.
   */
  @Output() configChanged = new EventEmitter<MapViewConfig>();

  /**
   * The generic data-access channel. On init this emits `{ loadAll: true }` so the container loads
   * the full record set — maps need every record to plot, not a single page — requested without the
   * container knowing it came from a map.
   */
  @Output() dataRequest = new EventEmitter<ViewDataRequest>();

  // ---- Render state (seeded from config) ----

  /** The render mode bound to `<mj-map-view>`, derived from {@link config} (defaults to `'point'`). */
  public activeRenderMode: MapRenderMode = 'point';

  /** The display state bound to `<mj-map-view>`, derived from {@link config} (null when unset). */
  public activeDisplayState: Partial<MapDisplayState> | null = null;

  ngOnInit(): void {
    // Maps need the complete record set, not a single page. Request it through the generic
    // data-access channel — the container honors `{ loadAll: true }` without any map-specific
    // branching. Done after inputs are wired (the host sets inputs via setInput before ngOnInit).
    this.dataRequest.emit({ loadAll: true });
  }

  /** Re-derive the map's render mode + display state from the current opaque {@link config}. */
  private applyConfig(): void {
    this.activeRenderMode = this._config.renderMode ?? 'point';
    this.activeDisplayState = this._config.displayState ?? null;
  }

  /**
   * Relay `<mj-map-view>`'s marker click, normalizing to the raw record the host expects (the host
   * builds the composite key itself from the record + entity).
   */
  onMarkerClick(event: MapMarkerClickEvent): void {
    this.recordSelected.emit(event.Record);
  }

  /**
   * Persist a render-mode change into the opaque {@link config} and notify the host. The host
   * stores the blob verbatim; it has no knowledge that `renderMode` means anything map-specific.
   */
  onRenderModeChange(mode: MapRenderMode): void {
    this._config = { ...this._config, renderMode: mode };
    this.activeRenderMode = mode;
    this.configChanged.emit(this._config);
  }

  /**
   * Persist a display-state change (pan / zoom / clustering / choropleth options) into the opaque
   * {@link config} and notify the host. This fires continuously as the user pans/zooms; that's
   * fine — the host debounces persistence of the config blob.
   */
  onDisplayStateChange(state: MapDisplayState): void {
    this._config = { ...this._config, displayState: state };
    this.activeDisplayState = state;
    this.configChanged.emit(this._config);
  }
}

/**
 * Tree-shaking guard. Force-references this renderer so bundlers (ESBuild/Vite) don't drop the
 * component in builds that only mount it dynamically via the ClassFactory/descriptor. Mirrors the
 * Cards and Cluster renderers' load guards; the parent wires this into a barrel/module load path.
 */
export function LoadMapViewRenderer(): void {
  // no-op; presence prevents tree-shaking of this component
}
