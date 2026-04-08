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
     * Heatmap mode: circle markers with size proportional to density.
     * Uses Leaflet's built-in circleMarker — no external heatmap plugin needed.
     */
    private RenderHeatmap(): void {
        const bounds: L.LatLng[] = [];
        const points: { lat: number; lng: number }[] = [];

        for (const record of this.Records) {
            const lat = this.GetField(record, this.LatitudeField) as number;
            const lng = this.GetField(record, this.LongitudeField) as number;
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));
            points.push({ lat, lng });
        }

        // Create density-based circle markers
        // Calculate proximity density for each point
        for (const pt of points) {
            // Count nearby points within ~0.5 degrees (~50km) for density
            const nearby = points.filter(p =>
                Math.abs(p.lat - pt.lat) < 0.5 && Math.abs(p.lng - pt.lng) < 0.5
            ).length;

            const radius = Math.min(8 + nearby * 4, 30);
            const opacity = Math.min(0.3 + nearby * 0.1, 0.8);

            const circle = L.circleMarker([pt.lat, pt.lng], {
                radius,
                fillColor: '#e74c3c',
                fillOpacity: opacity,
                color: '#c0392b',
                weight: 1,
                opacity: 0.6
            });
            this.markerLayer!.addLayer(circle);
        }

        this.MarkerCount = bounds.length;
        this.FitBoundsToMarkers(bounds);
    }

    /**
     * Choropleth mode: colored circle markers sized by region grouping.
     * Full choropleth with GeoJSON boundaries requires loading boundary data
     * from Country/StateProvince entities (future enhancement).
     * For now, uses large translucent circles as regional indicators.
     */
    private RenderChoropleth(): void {
        const bounds: L.LatLng[] = [];
        const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
                        '#1abc9c', '#e67e22', '#2980b9', '#27ae60', '#c0392b'];

        // Group records by country field if available
        const groups = new Map<string, { lat: number; lng: number; count: number }>();

        for (const record of this.Records) {
            const lat = this.GetField(record, this.LatitudeField) as number;
            const lng = this.GetField(record, this.LongitudeField) as number;
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));

            // Group by country or state field if available
            const country = String(this.GetField(record, 'Country') ?? this.GetField(record, 'State') ?? 'Unknown');
            const existing = groups.get(country);
            if (existing) {
                existing.count++;
                // Average the coordinates for the group center
                existing.lat = (existing.lat * (existing.count - 1) + lat) / existing.count;
                existing.lng = (existing.lng * (existing.count - 1) + lng) / existing.count;
            } else {
                groups.set(country, { lat, lng, count: 1 });
            }
        }

        // Render each group as a large translucent circle
        let colorIdx = 0;
        for (const [name, group] of groups) {
            const color = colors[colorIdx % colors.length];
            const radius = Math.min(15 + group.count * 8, 60);

            const circle = L.circleMarker([group.lat, group.lng], {
                radius,
                fillColor: color,
                fillOpacity: 0.4,
                color: color,
                weight: 2,
                opacity: 0.8
            });
            circle.bindPopup(`<b>${this.EscapeHtml(name)}</b><br>${group.count} record${group.count !== 1 ? 's' : ''}`);
            this.markerLayer!.addLayer(circle);
            colorIdx++;
        }

        this.MarkerCount = bounds.length;
        this.FitBoundsToMarkers(bounds);
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
