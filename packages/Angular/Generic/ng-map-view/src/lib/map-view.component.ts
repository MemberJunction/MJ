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
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { MapRenderMode, MapDisplayState, MapMarkerClickEvent, MapRegionClickEvent } from './map-view.types';
import * as L from 'leaflet';

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

    /** Array of entity records to render on the map. */
    @Input() Records: BaseEntity[] = [];

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
    IsLoading = true;
    MarkerCount = 0;

    ngOnInit(): void {
        // Map initialization happens in AfterViewInit
    }

    ngAfterViewInit(): void {
        this.InitializeMap();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if ((changes['Records'] || changes['RenderMode']) && this.map) {
            this.RenderMarkers();
        }
    }

    ngOnDestroy(): void {
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

        this.RenderMarkers();
        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    /**
     * Render markers from the Records input.
     */
    private RenderMarkers(): void {
        if (!this.map || !this.markerLayer) return;

        this.markerLayer.clearLayers();
        const bounds: L.LatLng[] = [];

        for (const record of this.Records) {
            const lat = record.Get(this.LatitudeField) as number;
            const lng = record.Get(this.LongitudeField) as number;

            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

            const latLng = L.latLng(lat, lng);
            bounds.push(latLng);

            const marker = L.marker(latLng);

            // Build popup with record name fields
            const nameField = this.Entity.NameField;
            const label = nameField ? String(record.Get(nameField.Name) ?? '') : `Record ${record.PrimaryKey.ToString()}`;
            marker.bindPopup(`<b>${this.EscapeHtml(label)}</b>`);

            marker.on('click', () => {
                this.MarkerClick.emit({
                    RecordID: record.PrimaryKey.ToString(),
                    Latitude: lat,
                    Longitude: lng,
                    Record: record.GetAll()
                });
            });

            this.markerLayer.addLayer(marker);
        }

        this.MarkerCount = bounds.length;

        // Auto-fit map to marker bounds
        if (bounds.length > 0 && !this.DisplayState?.CenterLat) {
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
     * Escape HTML for popup content.
     */
    private EscapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
