/**
 * Framework-agnostic Leaflet map engine for MemberJunction.
 *
 * Provides point markers, heatmap, and choropleth rendering with optional
 * GeoDataEngine integration for coordinate-based region resolution.
 */

/** Configuration for creating a MapEngine instance. */
export interface MapConfig {
    /** DOM element to render into. */
    container: HTMLDivElement;
    /** Initial center coordinates. Defaults to {lat: 20, lng: 0}. */
    center?: { lat: number; lng: number };
    /** Initial zoom level. Defaults to 2. */
    zoom?: number;
    /** Latitude field name. Defaults to '__mj_Latitude'. */
    latitudeField?: string;
    /** Longitude field name. Defaults to '__mj_Longitude'. */
    longitudeField?: string;
    /**
     * GeoDataEngine-compatible resolver. Required for choropleth (Regions) mode —
     * no text-field fallback, records must carry pre-geocoded lat/lng.
     */
    geoResolver?: GeoResolver;
    /** Returns a composite primary key string for a record. */
    getRecordId?: (record: Record<string, unknown>) => string;
    /** Returns a display name for a record. */
    getRecordName?: (record: Record<string, unknown>) => string;
    /** Callback when a point marker is clicked. */
    onMarkerClick?: (event: MarkerClickEvent) => void;
    /** Callback when a choropleth region or heatmap cluster is clicked. */
    onRegionClick?: (event: RegionClickEvent) => void;
    /** Callback when a record link in a popup is clicked. */
    onPopupRecordClick?: (recordId: string) => void;
    /** Callback when the map is panned or zoomed. */
    onMoveEnd?: (state: MoveEndEvent) => void;
    /** Callback after rendering finishes. */
    onRenderComplete?: (stats: RenderCompleteEvent) => void;
    /** Enable marker clustering in point mode. Defaults to true. */
    clusterMarkers?: boolean;
    /** Spatial clustering radius in degrees for heatmap mode. Defaults to 2.0. */
    clusterRadius?: number;
    /** Max records shown as links in popups. Defaults to 5. */
    maxPopupRecords?: number;
    /** Color palette for choropleth regions. */
    colors?: string[];
    /** Max zoom level for fitBounds. Defaults to 14. */
    maxZoom?: number;
    /** Field name containing GeoJSON boundary data on each record (for boundary mode). Defaults to 'BoundaryGeoJSON'. */
    boundaryField?: string;
}

/** GeoDataEngine-compatible resolver interface. */
export interface GeoResolver {
    ResolvePointToLocation(lat: number, lng: number): GeoPointResolution;
    /** Awaited before the first choropleth resolve when the resolver lazy-loads. */
    EnsureLoaded?: () => Promise<void>;
    /** When true, MapCore skips the EnsureLoaded await on the fast path. */
    Loaded?: boolean;
}

/** Result of resolving a coordinate to geographic regions. */
export interface GeoPointResolution {
    Country?: { ID: string; Name: string; BoundaryGeoJSON?: string | null } | undefined;
    State?: { ID: string; Name: string; BoundaryGeoJSON?: string | null } | undefined;
}

/** Emitted when a point marker is clicked. */
export interface MarkerClickEvent {
    recordId: string;
    lat: number;
    lng: number;
    record: Record<string, unknown>;
}

/** Emitted when a choropleth region or heatmap cluster is clicked. */
export interface RegionClickEvent {
    regionName: string;
    groupBy: string;
    recordCount: number;
    records: Record<string, unknown>[];
}

/** Emitted when the map is panned or zoomed. */
export interface MoveEndEvent {
    zoom: number;
    centerLat: number;
    centerLng: number;
}

/** Emitted after rendering completes. */
export interface RenderCompleteEvent {
    mode: string;
    markerCount: number;
    bounds: { north: number; south: number; east: number; west: number };
}

/** Spatial cluster result. */
export interface SpatialClusterResult {
    centerLat: number;
    centerLng: number;
    records: Record<string, unknown>[];
}

/** Map engine instance returned by createEngine(). */
export interface MapEngine {
    /** Render records in the given mode. Stores records/mode for re-renders. */
    render(records: Record<string, unknown>[], mode?: string): void;
    /** Switch render mode and re-render with stored records. */
    setRenderMode(mode: string): void;
    /** Fix tile rendering after visibility/size change. */
    invalidateSize(): void;
    /** Clean up Leaflet instance and layers. */
    destroy(): void;
    /** Get current render statistics. */
    getStats(): { markerCount: number };
    /** Access the underlying Leaflet map instance (escape hatch). */
    getMap(): unknown;
}

/** Create a new map engine attached to a DOM container. */
export function createEngine(config: MapConfig): MapEngine;

/** Group nearby points within a lat/lng radius into clusters. */
export function spatialCluster(
    items: Array<{ lat: number; lng: number; record: Record<string, unknown> }>,
    radiusDegrees: number
): SpatialClusterResult[];

/** Ray-casting point-in-polygon test. Ring uses GeoJSON [lng, lat] pairs. */
export function pointInPolygon(lat: number, lng: number, ring: Array<[number, number]>): boolean;

/** Library version. */
export const VERSION: string;
