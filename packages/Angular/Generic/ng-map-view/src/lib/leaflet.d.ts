/**
 * Minimal Leaflet type declarations for the map view component.
 * Full @types/leaflet will be installed when this package is consumed by MJExplorer.
 */
declare namespace L {
    function map(element: HTMLElement, options?: Record<string, unknown>): Map;
    function tileLayer(urlTemplate: string, options?: Record<string, unknown>): TileLayer;
    function marker(latlng: LatLngExpression, options?: Record<string, unknown>): Marker;
    function latLng(lat: number, lng: number): LatLng;
    function latLngBounds(latlngs: LatLng[]): LatLngBounds;
    function layerGroup(): LayerGroup;
    function circleMarker(latlng: LatLngExpression, options?: Record<string, unknown>): CircleMarker;
    function geoJSON(geojson?: Record<string, unknown>, options?: Record<string, unknown>): GeoJSONLayer;
    const control: { attribution(options?: Record<string, unknown>): { addTo(map: Map): unknown } };

    interface CircleMarker extends Marker {}

    function markerClusterGroup(options?: Record<string, unknown>): MarkerClusterGroup;

    interface MarkerClusterGroup extends LayerGroup {}

    interface GeoJSONLayer extends Layer {
        addTo(map: Map): GeoJSONLayer;
        getBounds(): LatLngBounds;
        setStyle(style: Record<string, unknown> | ((feature: unknown) => Record<string, unknown>)): GeoJSONLayer;
        bindPopup(content: string): GeoJSONLayer;
        on(event: string, handler: (...args: unknown[]) => void): GeoJSONLayer;
        eachLayer(fn: (layer: unknown) => void): void;
    }

    type LatLngExpression = [number, number] | LatLng;

    interface LatLng {
        lat: number;
        lng: number;
    }

    interface LatLngBounds {
        getNorth(): number;
        getSouth(): number;
        getEast(): number;
        getWest(): number;
    }

    interface Map {
        setView(center: LatLngExpression, zoom: number): Map;
        fitBounds(bounds: LatLngBounds, options?: Record<string, unknown>): Map;
        getCenter(): LatLng;
        getZoom(): number;
        on(event: string, handler: (...args: unknown[]) => void): Map;
        remove(): void;
        invalidateSize(): void;
    }

    interface TileLayer {
        addTo(map: Map): TileLayer;
    }

    interface Marker extends Layer {
        addTo(map: Map): Marker;
        bindPopup(content: string): Marker;
        on(event: string, handler: (...args: unknown[]) => void): Marker;
        remove(): void;
    }

    /** Base layer type — Marker, CircleMarker, GeoJSONLayer, LayerGroup all qualify. */
    interface Layer {
        addTo?(map: Map): Layer;
    }

    interface LayerGroup extends Layer {
        addTo(map: Map): LayerGroup;
        addLayer(layer: Layer): LayerGroup;
        clearLayers(): LayerGroup;
    }
}

declare module 'leaflet' {
    export = L;
}
