import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
    ElementRef,
    ViewChild,
    ChangeDetectorRef,
    AfterViewInit,
    inject
} from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import { GeoDataEngine } from '@memberjunction/core-entities';
import { MapRenderMode, MapDisplayState, MapMarkerClickEvent, MapRegionClickEvent } from './map-view.types';
// Leaflet is loaded as a global script at runtime via angular.json scripts array.
// The L namespace is available globally — see leaflet.d.ts for type declarations.

/**
 * MapViewComponent — Leaflet-based map visualization for geo-enabled MJ entities.
 *
 * Reads `__mj_Latitude` and `__mj_Longitude` from entity records (or custom field overrides)
 * and renders them as interactive markers on an OpenStreetMap tile layer.
 *
 * Supports three rendering modes:
 * - **point** (default): Individual markers with optional clustering
 * - **choropleth**: Region shading by country/state (requires BoundaryGeoJSON)
 * - **heatmap**: Density visualization (future)
 *
 * Integrates into MJExplorer's EntityViewer as the 'map' view mode.
 */
@Component({
    standalone: false,
    selector: 'mj-map-view',
    templateUrl: './map-view.component.html',
    styleUrls: ['./map-view.component.css']
})
export class MapViewComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
    private cdr = inject(ChangeDetectorRef);

    @ViewChild('mapContainer', { static: false })
    private mapContainer!: ElementRef<HTMLDivElement>;

    /** Entity metadata for the displayed records. */
    @Input() Entity!: EntityInfo;

    /** Array of entity records to render on the map. Accepts BaseEntity[] or plain Record objects. */
    @Input() Records: Record<string, unknown>[] = [];

    /** Latitude field name. Defaults to __mj_Latitude. */
    @Input() LatitudeField: string = '__mj_Latitude';

    /** Longitude field name. Defaults to __mj_Longitude. */
    @Input() LongitudeField: string = '__mj_Longitude';

    /** Current render mode. */
    @Input() RenderMode: MapRenderMode = 'point';

    /** Persisted display state from UserView. */
    @Input() DisplayState: Partial<MapDisplayState> | null = null;

    /**
     * Total record count from the server (before any client-side cap).
     * When this exceeds the number of Records passed in, the map shows
     * a truncation indicator so the user knows not all data is displayed.
     */
    @Input() TotalRecordCount: number = 0;

    /** Emitted when a marker is clicked. */
    @Output() MarkerClick = new EventEmitter<MapMarkerClickEvent>();

    /** Emitted when a choropleth region is clicked. */
    @Output() RegionClick = new EventEmitter<MapRegionClickEvent>();

    /** Emitted when display state changes (for persistence). */
    @Output() DisplayStateChange = new EventEmitter<MapDisplayState>();

    /** Emitted when render mode changes (supports two-way binding: [(RenderMode)]). */
    @Output() RenderModeChange = new EventEmitter<MapRenderMode>();

    private map: L.Map | null = null;
    private markerLayer: L.LayerGroup | null = null;
    private visibilityObserver: IntersectionObserver | null = null;
    private pendingRender = false;
    IsLoading = true;
    MarkerCount = 0;

    /** Whether the displayed records are truncated (more exist than were loaded). */
    get IsTruncated(): boolean {
        return this.TotalRecordCount > 0 && this.Records.length < this.TotalRecordCount;
    }

    ngOnInit(): void {
        // Map initialization happens when the component becomes visible
    }

    ngAfterViewInit(): void {
        // Use IntersectionObserver to detect when the map container becomes visible.
        // Leaflet requires the container to have actual dimensions before initialization.
        // Since the map starts hidden (grid view is default), we defer init until visible.
        this.visibilityObserver = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && !this.map) {
                // First time visible — initialize the map
                this.InitializeMap();
            } else if (entry.isIntersecting && this.map) {
                // Becoming visible again — fix tile rendering and re-fit
                this.map.invalidateSize();
                if (this.pendingRender) {
                    this.RenderMarkers();
                    this.pendingRender = false;
                }
            }
        }, { threshold: 0.1 });

        if (this.mapContainer?.nativeElement) {
            this.visibilityObserver.observe(this.mapContainer.nativeElement);
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Records'] || changes['RenderMode']) {
            if (this.map) {
                setTimeout(() => {
                    if (this.map) {
                        this.map.invalidateSize();
                        this.RenderMarkers();
                    }
                }, 100);
            } else {
                // Map not initialized yet — mark for render when visible
                this.pendingRender = true;
            }
        }
    }

    ngOnDestroy(): void {
        if (this.visibilityObserver) {
            this.visibilityObserver.disconnect();
            this.visibilityObserver = null;
        }
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }

    /**
     * Initialize the Leaflet map with OSM tiles.
     */
    private InitializeMap(): void {
        if (!this.mapContainer?.nativeElement || this.map) return;

        const center: L.LatLngExpression = [
            this.DisplayState?.CenterLat ?? 20,
            this.DisplayState?.CenterLng ?? 0
        ];
        const zoom = this.DisplayState?.ZoomLevel ?? 2;

        this.map = L.map(this.mapContainer.nativeElement, {
            center,
            zoom,
            zoomControl: true,
            attributionControl: false
        });

        // Compact attribution — required by OSM terms but styled to be unobtrusive
        L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(this.map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
            maxZoom: 18
        }).addTo(this.map);

        this.markerLayer = L.layerGroup().addTo(this.map);

        // Persist view state on move/zoom
        this.map.on('moveend', () => this.EmitDisplayState());

        // Set up popup click handlers for record drill-through
        this.SetupPopupClickHandler();

        // invalidateSize after a short delay to ensure tile rendering is correct
        // then render markers and fit bounds
        setTimeout(() => {
            if (this.map) {
                this.map.invalidateSize();
                this.RenderMarkers();
                this.IsLoading = false;
                this.cdr.detectChanges();

                // Double-invalidate after tiles start loading to fix partial rendering
                setTimeout(() => {
                    if (this.map) this.map.invalidateSize();
                }, 500);
            }
        }, 100);
    }

    /**
     * Render map content based on the current RenderMode.
     */
    private RenderMarkers(): void {
        if (!this.map || !this.markerLayer) return;

        this.markerLayer.clearLayers();

        switch (this.RenderMode) {
            case 'point':
                this.RenderPointMarkers();
                break;
            case 'heatmap':
                this.RenderHeatmap();
                break;
            case 'choropleth':
                this.RenderChoropleth();
                break;
            default:
                this.RenderPointMarkers();
        }
    }

    /**
     * Point mode: individual markers with marker clustering for dense areas.
     * Uses leaflet.markercluster when available, falls back to plain markers.
     */
    private RenderPointMarkers(): void {
        const bounds: L.LatLng[] = [];

        // Use marker cluster group if available (loaded via CDN)
        const useCluster = typeof L.markerClusterGroup === 'function';
        const clusterGroup = useCluster ? L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false
        }) : null;

        for (const record of this.Records) {
            const lat = this.GetNumericField(record, this.LatitudeField);
            const lng = this.GetNumericField(record, this.LongitudeField);

            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

            const latLng = L.latLng(lat, lng);
            bounds.push(latLng);

            const marker = L.marker(latLng);

            const nameField = this.Entity?.NameField;
            const label = nameField ? String(this.GetField(record, nameField.Name) ?? '') : 'Record';
            marker.bindPopup(`<b>${this.EscapeHtml(label)}</b>`);

            marker.on('click', () => {
                const pkFields = this.Entity?.PrimaryKeys ?? [];
                const recordId = pkFields.map(pk => this.GetField(record, pk.Name)).join('||');
                this.MarkerClick.emit({
                    RecordID: recordId,
                    Latitude: lat,
                    Longitude: lng,
                    Record: record
                });
            });

            if (clusterGroup) {
                clusterGroup.addLayer(marker);
            } else {
                this.markerLayer!.addLayer(marker);
            }
        }

        if (clusterGroup) {
            this.markerLayer!.addLayer(clusterGroup as L.Layer);
        }

        this.MarkerCount = bounds.length;
        this.FitBoundsToMarkers(bounds);
    }

    /**
     * Heatmap mode: density visualization using colored circle markers.
     * Larger/more opaque circles where records cluster together.
     * Click a cluster bubble to see matching records in a popup.
     */
    private RenderHeatmap(): void {
        const bounds: L.LatLng[] = [];
        const recordsWithCoords: { lat: number; lng: number; record: Record<string, unknown> }[] = [];

        for (const record of this.Records) {
            const lat = this.GetNumericField(record, this.LatitudeField);
            const lng = this.GetNumericField(record, this.LongitudeField);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));
            recordsWithCoords.push({ lat, lng, record });
        }

        // Cluster nearby records (within ~2 degrees / ~200km) into groups
        const clusters = this.SpatialCluster(recordsWithCoords, 2.0);

        for (const cluster of clusters) {
            const radius = Math.min(12 + cluster.records.length * 5, 40);
            const opacity = Math.min(0.3 + cluster.records.length * 0.08, 0.85);

            const circle = L.circleMarker([cluster.centerLat, cluster.centerLng], {
                radius,
                fillColor: '#e74c3c',
                fillOpacity: opacity,
                color: '#c0392b',
                weight: 1,
                opacity: 0.7
            });

            circle.bindPopup(this.BuildClusterPopup(cluster.records, `${cluster.records.length} record${cluster.records.length !== 1 ? 's' : ''}`));

            circle.on('click', () => {
                this.RegionClick.emit({
                    RegionName: `Cluster (${cluster.records.length} records)`,
                    GroupBy: 'state_province',
                    RecordCount: cluster.records.length,
                    Records: cluster.records
                });
            });

            this.markerLayer!.addLayer(circle);
        }

        this.MarkerCount = bounds.length;
        this.FitBoundsToMarkers(bounds);
    }

    /**
     * Regions mode: shaded geographic regions using GeoJSON boundaries.
     * Uses coordinate-based point-in-polygon resolution via GeoDataEngine —
     * no dependency on text field names in the entity. Each record's lat/lng
     * is resolved to its containing country and state/province geometrically.
     *
     * Auto-detects grouping level:
     * - If records span multiple countries → group by Country, render country polygons
     * - If all records are in one country → group by State/Province, render state polygons
     * Falls back to spatial clustering if boundary data isn't available.
     */
    private RenderChoropleth(): void {
        const geo = GeoDataEngine.Instance;
        const bounds: L.LatLng[] = [];

        // Resolve each record's location via point-in-polygon
        const recordsByCountryId = new Map<string, { country: { ID: string; Name: string; BoundaryGeoJSON: string | null }; records: Record<string, unknown>[] }>();
        const recordsByStateId = new Map<string, { state: { ID: string; Name: string; BoundaryGeoJSON: string | null }; countryId: string; records: Record<string, unknown>[] }>();
        const unmatchedRecords: Record<string, unknown>[] = [];

        for (const record of this.Records) {
            const lat = this.GetNumericField(record, this.LatitudeField);
            const lng = this.GetNumericField(record, this.LongitudeField);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));

            const resolution = geo.ResolvePointToLocation(lat, lng);

            if (resolution.Country) {
                const countryId = resolution.Country.ID.toLowerCase();
                let countryGroup = recordsByCountryId.get(countryId);
                if (!countryGroup) {
                    countryGroup = { country: resolution.Country, records: [] };
                    recordsByCountryId.set(countryId, countryGroup);
                }
                countryGroup.records.push(record);

                if (resolution.State) {
                    const stateId = resolution.State.ID.toLowerCase();
                    let stateGroup = recordsByStateId.get(stateId);
                    if (!stateGroup) {
                        stateGroup = { state: resolution.State, countryId, records: [] };
                        recordsByStateId.set(stateId, stateGroup);
                    }
                    stateGroup.records.push(record);
                }
            } else {
                unmatchedRecords.push(record);
            }
        }

        this.MarkerCount = bounds.length;

        // Auto-detect grouping: single country → state-level, multiple → country-level
        if (recordsByCountryId.size <= 1 && recordsByStateId.size > 1) {
            this.RenderStateRegions(recordsByStateId, unmatchedRecords, bounds);
        } else {
            this.RenderCountryRegions(recordsByCountryId, unmatchedRecords, bounds);
        }
    }

    /**
     * Render state-level choropleth regions from coordinate-resolved groups.
     * Each group is keyed by state ID with its entity and records already resolved.
     */
    private RenderStateRegions(
        recordsByStateId: Map<string, { state: { ID: string; Name: string; BoundaryGeoJSON: string | null }; countryId: string; records: Record<string, unknown>[] }>,
        unmatchedRecords: Record<string, unknown>[],
        bounds: L.LatLng[]
    ): void {
        const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
                        '#1abc9c', '#e67e22', '#2980b9', '#27ae60', '#c0392b',
                        '#16a085', '#d35400', '#8e44ad', '#2c3e50', '#f1c40f'];
        let colorIdx = 0;

        for (const [, group] of recordsByStateId) {
            const color = colors[colorIdx % colors.length];
            const rendered = this.RenderBoundaryRegion(
                group.state.Name, group.state.BoundaryGeoJSON, group.records, color, 'state_province'
            );

            if (!rendered) {
                this.RenderCircleFallback(group.state.Name, group.records, color);
            }
            colorIdx++;
        }

        // Render unmatched records as a gray cluster
        if (unmatchedRecords.length > 0) {
            this.RenderCircleFallback('Unmatched', unmatchedRecords, '#95a5a6');
        }

        this.FitBoundsToMarkers(bounds);
    }

    /**
     * Render country-level choropleth regions from coordinate-resolved groups.
     */
    private RenderCountryRegions(
        recordsByCountryId: Map<string, { country: { ID: string; Name: string; BoundaryGeoJSON: string | null }; records: Record<string, unknown>[] }>,
        unmatchedRecords: Record<string, unknown>[],
        bounds: L.LatLng[]
    ): void {
        const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
                        '#1abc9c', '#e67e22', '#2980b9', '#27ae60', '#c0392b',
                        '#16a085', '#d35400', '#8e44ad', '#2c3e50', '#f1c40f'];
        let colorIdx = 0;

        for (const [, group] of recordsByCountryId) {
            const color = colors[colorIdx % colors.length];
            const rendered = this.RenderBoundaryRegion(
                group.country.Name, group.country.BoundaryGeoJSON, group.records, color, 'country'
            );

            if (!rendered) {
                this.RenderCircleFallback(group.country.Name, group.records, color);
            }
            colorIdx++;
        }

        if (unmatchedRecords.length > 0) {
            this.RenderCircleFallback('Unmatched', unmatchedRecords, '#95a5a6');
        }

        this.FitBoundsToMarkers(bounds);
    }

    /**
     * Render a single GeoJSON boundary region with shading.
     * Returns true if the boundary rendered successfully, false if fallback is needed.
     */
    private RenderBoundaryRegion(
        regionName: string,
        boundaryGeoJSON: string | null,
        records: Record<string, unknown>[],
        color: string,
        groupBy: 'country' | 'state_province'
    ): boolean {
        if (!boundaryGeoJSON) return false;

        try {
            const geojson = typeof boundaryGeoJSON === 'string'
                ? JSON.parse(boundaryGeoJSON)
                : boundaryGeoJSON;

            const layer = L.geoJSON(geojson, {
                style: {
                    fillColor: color,
                    fillOpacity: 0.35,
                    color: color,
                    weight: 2,
                    opacity: 0.8
                }
            });

            layer.bindPopup(this.BuildClusterPopup(records, `${regionName} (${records.length})`));
            layer.on('click', () => {
                this.RegionClick.emit({
                    RegionName: regionName,
                    GroupBy: groupBy,
                    RecordCount: records.length,
                    Records: records
                });
            });

            this.markerLayer!.addLayer(layer as L.Layer);
            return true;
        } catch (e) {
            console.warn(`[MapView] Choropleth: GeoJSON render failed for "${regionName}"`, e);
            return false;
        }
    }

    /**
     * Render a colored circle marker as a fallback for regions without boundary data.
     */
    private RenderCircleFallback(
        regionName: string,
        records: Record<string, unknown>[],
        color: string
    ): void {
        let sumLat = 0, sumLng = 0, count = 0;
        for (const rec of records) {
            const lat = this.GetNumericField(rec, this.LatitudeField);
            const lng = this.GetNumericField(rec, this.LongitudeField);
            if (lat && lng) { sumLat += lat; sumLng += lng; count++; }
        }
        if (count > 0) {
            const radius = Math.min(15 + records.length * 5, 50);
            const circle = L.circleMarker([sumLat / count, sumLng / count], {
                radius, fillColor: color, fillOpacity: 0.45, color, weight: 2, opacity: 0.85
            });
            circle.bindPopup(this.BuildClusterPopup(records, `${regionName} (${records.length})`));
            this.markerLayer!.addLayer(circle);
        }
    }

    /**
     * Simple spatial clustering: group nearby records within a lat/lng radius.
     * Returns clusters with center coordinates and member records.
     */
    private SpatialCluster(
        items: { lat: number; lng: number; record: Record<string, unknown> }[],
        radiusDegrees: number
    ): { centerLat: number; centerLng: number; records: Record<string, unknown>[] }[] {
        const assigned = new Set<number>();
        const clusters: { centerLat: number; centerLng: number; records: Record<string, unknown>[] }[] = [];

        for (let i = 0; i < items.length; i++) {
            if (assigned.has(i)) continue;

            const seed = items[i];
            const members: Record<string, unknown>[] = [seed.record];
            let sumLat = seed.lat;
            let sumLng = seed.lng;
            assigned.add(i);

            // Find all unassigned neighbors within radius
            for (let j = i + 1; j < items.length; j++) {
                if (assigned.has(j)) continue;
                const candidate = items[j];
                if (Math.abs(candidate.lat - seed.lat) <= radiusDegrees &&
                    Math.abs(candidate.lng - seed.lng) <= radiusDegrees) {
                    members.push(candidate.record);
                    sumLat += candidate.lat;
                    sumLng += candidate.lng;
                    assigned.add(j);
                }
            }

            clusters.push({
                centerLat: sumLat / members.length,
                centerLng: sumLng / members.length,
                records: members
            });
        }

        return clusters;
    }

    /**
     * Fit map bounds to encompass all marker coordinates.
     */
    private FitBoundsToMarkers(bounds: L.LatLng[]): void {
        if (bounds.length > 0 && this.map) {
            const boundsObj = L.latLngBounds(bounds);
            this.map.fitBounds(boundsObj, { padding: [30, 30], maxZoom: 14 });
        }
        this.cdr.detectChanges();
    }

    /**
     * Emit the current display state for persistence.
     */
    private EmitDisplayState(): void {
        if (!this.map) return;
        const center = this.map.getCenter();
        this.DisplayStateChange.emit({
            ZoomLevel: this.map.getZoom(),
            CenterLat: center.lat,
            CenterLng: center.lng,
            ClusterMarkers: true
        });
    }

    /**
     * Set rendering mode.
     */
    SetRenderMode(mode: MapRenderMode): void {
        this.RenderMode = mode;
        this.RenderModeChange.emit(mode);
        this.RenderMarkers();
    }

    /**
     * Get a field value from a record, supporting both BaseEntity (with .Get()) and plain objects.
     */
    private GetField(record: Record<string, unknown>, fieldName: string): unknown {
        if ('Get' in record && typeof record['Get'] === 'function') {
            return (record as { Get: (name: string) => unknown }).Get(fieldName);
        }
        return record[fieldName];
    }

    /**
     * Get a numeric field value from a record, returning null if not a valid number.
     */
    private GetNumericField(record: Record<string, unknown>, fieldName: string): number | null {
        const val = this.GetField(record, fieldName);
        if (val == null) return null;
        const num = Number(val);
        return isNaN(num) ? null : num;
    }

    /**
     * Build a popup for a cluster of records.
     * Shows first 5 records as clickable links, then "and X more..." if needed.
     * Clicking a record name emits MarkerClick so the parent can open it.
     */
    private BuildClusterPopup(records: Record<string, unknown>[], title: string): string {
        const nameField = this.Entity?.NameField;
        const maxShow = 5;
        const shown = records.slice(0, maxShow);
        const remaining = records.length - maxShow;

        let html = `<div style="font-size:12px;min-width:160px;">` +
            `<b>${this.EscapeHtml(title)}</b>` +
            `<hr style="margin:4px 0;border-color:#e5e7eb;">`;

        for (const rec of shown) {
            const name = nameField ? String(this.GetField(rec, nameField.Name) ?? '') : 'Record';
            const pkFields = this.Entity?.PrimaryKeys ?? [];
            const recordId = pkFields.map(pk => this.GetField(rec, pk.Name)).join('||');
            // Clickable record name — uses a data attribute that the click handler reads
            html += `<div style="padding:2px 0;cursor:pointer;color:#2563eb;" ` +
                `class="mj-map-popup-record" data-record-id="${this.EscapeHtml(recordId)}">` +
                `${this.EscapeHtml(name)}</div>`;
        }

        if (remaining > 0) {
            html += `<div style="padding:4px 0 0;color:#6b7280;font-style:italic;">` +
                `and ${remaining} more...</div>`;
        }

        html += `</div>`;
        return html;
    }

    /**
     * Set up popup click handlers after the map initializes.
     * Listens for clicks on record links in popups and emits MarkerClick.
     */
    private SetupPopupClickHandler(): void {
        if (!this.map) return;
        this.map.on('popupopen', () => {
            // Attach click handlers to all popup record links
            setTimeout(() => {
                const links = document.querySelectorAll('.mj-map-popup-record');
                links.forEach(link => {
                    link.addEventListener('click', (e) => {
                        const recordId = (e.currentTarget as HTMLElement).getAttribute('data-record-id') ?? '';
                        // Find the matching record
                        const record = this.Records.find(r => {
                            const pkFields = this.Entity?.PrimaryKeys ?? [];
                            const id = pkFields.map(pk => this.GetField(r, pk.Name)).join('||');
                            return id === recordId;
                        });
                        if (record) {
                            const lat = this.GetNumericField(record, this.LatitudeField) ?? 0;
                            const lng = this.GetNumericField(record, this.LongitudeField) ?? 0;

                            this.MarkerClick.emit({
                                RecordID: recordId,
                                Latitude: lat,
                                Longitude: lng,
                                Record: record
                            });
                        }
                    });
                });
            }, 50);
        });
    }

    /**
     * Escape HTML for popup content.
     */
    private EscapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
