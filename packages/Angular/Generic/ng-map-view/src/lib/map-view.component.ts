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

    /** Emitted when a marker is clicked. */
    @Output() MarkerClick = new EventEmitter<MapMarkerClickEvent>();

    /** Emitted when a choropleth region is clicked. */
    @Output() RegionClick = new EventEmitter<MapRegionClickEvent>();

    /** Emitted when display state changes (for persistence). */
    @Output() DisplayStateChange = new EventEmitter<MapDisplayState>();

    private map: L.Map | null = null;
    private markerLayer: L.LayerGroup | null = null;
    private visibilityObserver: IntersectionObserver | null = null;
    private pendingRender = false;
    IsLoading = true;
    MarkerCount = 0;

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
            zoomControl: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18
        }).addTo(this.map);

        this.markerLayer = L.layerGroup().addTo(this.map);

        // Persist view state on move/zoom
        this.map.on('moveend', () => this.EmitDisplayState());

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
     * Point mode: individual markers at each record's coordinates.
     */
    private RenderPointMarkers(): void {
        const bounds: L.LatLng[] = [];

        for (const record of this.Records) {
            const lat = this.GetField(record, this.LatitudeField) as number;
            const lng = this.GetField(record, this.LongitudeField) as number;

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

            this.markerLayer!.addLayer(marker);
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
            const lat = this.GetField(record, this.LatitudeField) as number;
            const lng = this.GetField(record, this.LongitudeField) as number;
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

            // Build popup with record names for click-through
            const nameField = this.Entity?.NameField;
            const names = cluster.records.map(r =>
                nameField ? String(this.GetField(r, nameField.Name) ?? '') : 'Record'
            );
            const popupHTML = `<div style="max-height:200px;overflow-y:auto;font-size:12px;">` +
                `<b>${cluster.records.length} record${cluster.records.length !== 1 ? 's' : ''}</b><br>` +
                names.map(n => `• ${this.EscapeHtml(n)}`).join('<br>') +
                `</div>`;
            circle.bindPopup(popupHTML);

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
     * Choropleth mode: regional grouping with colored bubbles per state/region.
     * Groups records by geographic proximity into state-sized clusters,
     * each with a distinct color and size proportional to record count.
     * Full GeoJSON boundary rendering is a future enhancement.
     */
    private RenderChoropleth(): void {
        const bounds: L.LatLng[] = [];
        const recordsWithCoords: { lat: number; lng: number; record: Record<string, unknown> }[] = [];
        const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
                        '#1abc9c', '#e67e22', '#2980b9', '#27ae60', '#c0392b',
                        '#16a085', '#d35400', '#8e44ad', '#2c3e50', '#f1c40f'];

        for (const record of this.Records) {
            const lat = this.GetField(record, this.LatitudeField) as number;
            const lng = this.GetField(record, this.LongitudeField) as number;
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));
            recordsWithCoords.push({ lat, lng, record });
        }

        // Cluster into state-sized regions (~5 degrees / ~500km)
        const clusters = this.SpatialCluster(recordsWithCoords, 5.0);

        for (let i = 0; i < clusters.length; i++) {
            const cluster = clusters[i];
            const color = colors[i % colors.length];
            const radius = Math.min(20 + cluster.records.length * 6, 60);

            // Try to derive a region name from the records' State or Country fields
            const regionNames = new Set<string>();
            for (const rec of cluster.records) {
                const state = this.GetField(rec, 'State') as string;
                const country = this.GetField(rec, 'Country') as string;
                if (state) regionNames.add(String(state));
                else if (country) regionNames.add(String(country));
            }
            const regionLabel = regionNames.size > 0
                ? Array.from(regionNames).slice(0, 3).join(', ') + (regionNames.size > 3 ? '...' : '')
                : `Region ${i + 1}`;

            const circle = L.circleMarker([cluster.centerLat, cluster.centerLng], {
                radius,
                fillColor: color,
                fillOpacity: 0.45,
                color: color,
                weight: 2,
                opacity: 0.85
            });

            const nameField = this.Entity?.NameField;
            const names = cluster.records.map(r =>
                nameField ? String(this.GetField(r, nameField.Name) ?? '') : 'Record'
            );
            circle.bindPopup(
                `<div style="max-height:200px;overflow-y:auto;font-size:12px;">` +
                `<b>${this.EscapeHtml(regionLabel)}</b><br>` +
                `${cluster.records.length} record${cluster.records.length !== 1 ? 's' : ''}<br><hr style="margin:4px 0;">` +
                names.map(n => `• ${this.EscapeHtml(n)}`).join('<br>') +
                `</div>`
            );

            circle.on('click', () => {
                this.RegionClick.emit({
                    RegionName: regionLabel,
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
        if (bounds.length > 0 && this.map && !this.DisplayState?.CenterLat) {
            const boundsObj = L.latLngBounds(bounds);
            this.map.fitBounds(boundsObj, { padding: [30, 30], maxZoom: 12 });
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
            RenderMode: this.RenderMode,
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
        this.RenderMarkers();
    }

    /**
     * Get a field value from a record, supporting both BaseEntity (with .Get()) and plain objects.
     */
    private GetField(record: Record<string, unknown>, fieldName: string): unknown {
        if ('Get' in record && typeof (record as Record<string, unknown>)['Get'] === 'function') {
            return (record as { Get: (name: string) => unknown }).Get(fieldName);
        }
        return record[fieldName];
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
