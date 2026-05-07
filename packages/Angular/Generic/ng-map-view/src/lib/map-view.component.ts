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
import * as MapCore from '@memberjunction/geo-maps';
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
 * - **heatmap**: Density visualization
 *
 * Delegates all rendering logic to @memberjunction/geo-maps.
 * This component is a thin Angular wrapper managing lifecycle, inputs/outputs,
 * and IntersectionObserver-based deferred initialization.
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

    /** Field name containing GeoJSON boundary data on each record (for boundary mode). */
    @Input() BoundaryField: string = 'BoundaryGeoJSON';


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

    private engine: MapCore.MapEngine | null = null;
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
            if (entry.isIntersecting && !this.engine) {
                // First time visible — initialize the map
                this.InitializeMap();
            } else if (entry.isIntersecting && this.engine) {
                // Becoming visible again — fix tile rendering and re-fit
                this.engine.invalidateSize();
                if (this.pendingRender) {
                    this.DoRender();
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
            if (this.engine) {
                setTimeout(() => {
                    if (this.engine) {
                        this.engine.invalidateSize();
                        this.DoRender();
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
        if (this.engine) {
            this.engine.destroy();
            this.engine = null;
        }
    }

    /**
     * Initialize the map engine via MapCore.
     */
    private InitializeMap(): void {
        if (!this.mapContainer?.nativeElement || this.engine) return;

        this.engine = MapCore.createEngine({
            container: this.mapContainer.nativeElement,
            center: {
                lat: this.DisplayState?.CenterLat ?? 20,
                lng: this.DisplayState?.CenterLng ?? 0
            },
            zoom: this.DisplayState?.ZoomLevel ?? 2,
            latitudeField: this.LatitudeField,
            longitudeField: this.LongitudeField,
            boundaryField: this.BoundaryField,
            geoResolver: GeoDataEngine.Instance,
            getRecordId: (record: Record<string, unknown>) => {
                const pkFields = this.Entity?.PrimaryKeys ?? [];
                return pkFields.map(pk => this.GetField(record, pk.Name)).join('||');
            },
            getRecordName: (record: Record<string, unknown>) => {
                const nameField = this.Entity?.NameField;
                return nameField ? String(this.GetField(record, nameField.Name) ?? '') : 'Record';
            },
            onMarkerClick: (event: MapCore.MarkerClickEvent) => {
                this.MarkerClick.emit({
                    RecordID: event.recordId,
                    Latitude: event.lat,
                    Longitude: event.lng,
                    Record: event.record
                });
            },
            onRegionClick: (event: MapCore.RegionClickEvent) => {
                this.RegionClick.emit({
                    RegionName: event.regionName,
                    GroupBy: event.groupBy as 'country' | 'state_province',
                    RecordCount: event.recordCount,
                    Records: event.records
                });
            },
            onPopupRecordClick: (recordId: string) => {
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
            },
            onMoveEnd: (state: MapCore.MoveEndEvent) => {
                this.DisplayStateChange.emit({
                    ZoomLevel: state.zoom,
                    CenterLat: state.centerLat,
                    CenterLng: state.centerLng,
                    ClusterMarkers: true
                });
            },
            maxPopupRecords: 5
        });

        // invalidateSize after a short delay to ensure tile rendering is correct
        // then render markers and fit bounds
        setTimeout(() => {
            if (this.engine) {
                this.engine.invalidateSize();
                this.DoRender();
                this.IsLoading = false;
                this.cdr.detectChanges();

                // Double-invalidate after tiles start loading to fix partial rendering
                setTimeout(() => {
                    if (this.engine) this.engine.invalidateSize();
                }, 500);
            }
        }, 100);
    }

    /**
     * Render records using the current mode, update marker count.
     */
    private DoRender(): void {
        if (!this.engine) return;
        this.engine.render(this.Records, this.RenderMode);
        this.MarkerCount = this.engine.getStats().markerCount;
        this.cdr.detectChanges();
    }

    /**
     * Set rendering mode (called from template toolbar buttons).
     */
    SetRenderMode(mode: MapRenderMode): void {
        this.RenderMode = mode;
        this.RenderModeChange.emit(mode);
        this.DoRender();
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
}
