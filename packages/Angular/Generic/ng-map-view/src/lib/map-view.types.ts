/**
 * Rendering modes for the map view component.
 */
export type MapRenderMode = 'point' | 'boundary' | 'choropleth' | 'heatmap';

/**
 * Choropleth grouping level.
 */
export type ChoroplethGroupBy = 'country' | 'state_province';

/**
 * Map display state persisted in UserView.DisplayState JSON.
 */
export interface MapDisplayState {
    ZoomLevel?: number;
    CenterLat?: number;
    CenterLng?: number;
    ClusterMarkers?: boolean;
    ChoroplethGroupBy?: ChoroplethGroupBy;
    ChoroplethMetric?: 'count' | 'sum' | 'average';
}

/**
 * Event emitted when a map marker is clicked.
 */
export interface MapMarkerClickEvent {
    RecordID: string;
    Latitude: number;
    Longitude: number;
    Record: Record<string, unknown>;
}

/**
 * Event emitted when a choropleth region is clicked.
 */
export interface MapRegionClickEvent {
    RegionName: string;
    GroupBy: ChoroplethGroupBy;
    RecordCount: number;
    Records: Record<string, unknown>[];
}
