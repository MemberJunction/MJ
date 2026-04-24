/**
 * @file map-core.js — Framework-agnostic Leaflet map engine for MemberJunction.
 *
 * Provides point markers, heatmap, and choropleth rendering with optional
 * GeoDataEngine integration for coordinate-based region resolution.
 *
 * Consumed by:
 * - Angular ng-map-view (via npm import)
 * - React simple-map.js (via @file: embedding in component spec)
 *
 * @requires L (Leaflet 1.9.4) — must be available as a global
 */
var MapCore = (function () {
    'use strict';

    // ================================================================
    // Constants
    // ================================================================

    var DEFAULT_COLORS = [
        '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#2980b9', '#27ae60', '#c0392b',
        '#16a085', '#d35400', '#8e44ad', '#2c3e50', '#f1c40f'
    ];

    var HEATMAP_FILL_COLOR = '#e74c3c';
    var HEATMAP_STROKE_COLOR = '#c0392b';
    var UNMATCHED_COLOR = '#95a5a6';

    // ================================================================
    // Helpers
    // ================================================================

    /** Escape HTML for safe popup content. */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /** Read a field from a record, supporting BaseEntity .Get() and plain objects. */
    function getField(record, fieldName) {
        if (record && typeof record.Get === 'function') {
            return record.Get(fieldName);
        }
        return record ? record[fieldName] : undefined;
    }

    /** Get a numeric field value, returning null if not a valid number. */
    function getNumericField(record, fieldName) {
        var val = getField(record, fieldName);
        if (val == null) return null;
        var num = Number(val);
        return isNaN(num) ? null : num;
    }

    function defaultGetRecordId(record) {
        var id = getField(record, 'ID') || getField(record, 'id') || '';
        return String(id);
    }

    function defaultGetRecordName(record) {
        var name = getField(record, 'Name') || getField(record, 'name') || 'Record';
        return String(name);
    }

    // ================================================================
    // Spatial Clustering
    // ================================================================

    /**
     * Group nearby points within a lat/lng radius into clusters.
     * Returns clusters with center coordinates and member records.
     * Pure math — no Leaflet dependency.
     *
     * @param {Array<{lat: number, lng: number, record: Object}>} items
     * @param {number} radiusDegrees
     * @returns {Array<{centerLat: number, centerLng: number, records: Object[]}>}
     */
    function spatialCluster(items, radiusDegrees) {
        var assigned = {};
        var clusters = [];

        for (var i = 0; i < items.length; i++) {
            if (assigned[i]) continue;

            var seed = items[i];
            var members = [seed.record];
            var sumLat = seed.lat;
            var sumLng = seed.lng;
            assigned[i] = true;

            for (var j = i + 1; j < items.length; j++) {
                if (assigned[j]) continue;
                var candidate = items[j];
                if (Math.abs(candidate.lat - seed.lat) <= radiusDegrees &&
                    Math.abs(candidate.lng - seed.lng) <= radiusDegrees) {
                    members.push(candidate.record);
                    sumLat += candidate.lat;
                    sumLng += candidate.lng;
                    assigned[j] = true;
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

    // ================================================================
    // Point-in-Polygon (ray-casting)
    // ================================================================

    /**
     * Ray-casting point-in-polygon test.
     * @param {number} lat
     * @param {number} lng
     * @param {Array<[number, number]>} ring - GeoJSON ring ([lng, lat] pairs)
     * @returns {boolean}
     */
    function pointInPolygon(lat, lng, ring) {
        var inside = false;
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            // GeoJSON coordinates are [longitude, latitude]
            var xi = ring[i][0], yi = ring[i][1];
            var xj = ring[j][0], yj = ring[j][1];
            var intersect = ((yi > lat) !== (yj > lat)) &&
                (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // ================================================================
    // Country Name Matching (text-field fallback for choropleth)
    // ================================================================

    /**
     * Match a free-text country name to reference data via Name, ISO2, or CommonAliases.
     * @param {Object[]} countries - Array of country records with Name, ISO2, CommonAliases
     * @param {string} searchName
     * @returns {Object|null}
     */
    function findCountryMatch(countries, searchName) {
        var normalized = searchName.trim().toLowerCase();

        for (var i = 0; i < countries.length; i++) {
            if (String(countries[i].Name || '').toLowerCase() === normalized) return countries[i];
        }

        for (var i = 0; i < countries.length; i++) {
            if (String(countries[i].ISO2 || '').toLowerCase() === normalized) return countries[i];
        }

        for (var i = 0; i < countries.length; i++) {
            var aliases = countries[i].CommonAliases;
            if (!aliases) continue;
            try {
                var arr = JSON.parse(String(aliases));
                for (var j = 0; j < arr.length; j++) {
                    if (arr[j].toLowerCase() === normalized) return countries[i];
                }
            } catch (e) { /* ignore parse errors */ }
        }

        return null;
    }

    // ================================================================
    // Popup HTML Construction
    // ================================================================

    /**
     * Build clickable popup HTML for a cluster of records.
     * Shows first N records as links, "and X more..." overflow.
     */
    function buildClusterPopup(records, title, config) {
        var maxShow = config.maxPopupRecords || 5;
        var shown = records.slice(0, maxShow);
        var remaining = records.length - maxShow;
        var getId = config.getRecordId || defaultGetRecordId;
        var getName = config.getRecordName || defaultGetRecordName;

        var html = '<div style="font-size:12px;min-width:160px;">' +
            '<b>' + escapeHtml(title) + '</b>' +
            '<hr style="margin:4px 0;border-color:#e5e7eb;">';

        for (var i = 0; i < shown.length; i++) {
            var name = getName(shown[i]);
            var recordId = getId(shown[i]);
            html += '<div style="padding:2px 0;cursor:pointer;color:#2563eb;" ' +
                'class="mj-map-popup-record" data-record-id="' + escapeHtml(recordId) + '">' +
                escapeHtml(name) + '</div>';
        }

        if (remaining > 0) {
            html += '<div style="padding:4px 0 0;color:#6b7280;font-style:italic;">' +
                'and ' + remaining + ' more...</div>';
        }

        html += '</div>';
        return html;
    }

    /** Build popup for a single record (point mode). */
    function buildSinglePopup(record, config) {
        var getId = config.getRecordId || defaultGetRecordId;
        var getName = config.getRecordName || defaultGetRecordName;
        var name = getName(record);
        var recordId = getId(record);
        return '<div style="font-size:12px;min-width:120px;">' +
            '<div style="padding:2px 0;cursor:pointer;color:#2563eb;" ' +
            'class="mj-map-popup-record" data-record-id="' + escapeHtml(recordId) + '">' +
            '<b>' + escapeHtml(name) + '</b></div></div>';
    }

    // ================================================================
    // Popup Click Handler
    // ================================================================

    function setupPopupClickHandler(map, config) {
        map.on('popupopen', function () {
            setTimeout(function () {
                var links = document.querySelectorAll('.mj-map-popup-record');
                links.forEach(function (link) {
                    link.addEventListener('click', function (e) {
                        var recordId = e.currentTarget.getAttribute('data-record-id') || '';
                        if (config.onPopupRecordClick) {
                            config.onPopupRecordClick(recordId);
                        }
                    });
                });
            }, 50);
        });
    }

    // ================================================================
    // Bounds Fitting
    // ================================================================

    function fitBounds(map, bounds, maxZoom) {
        if (bounds.length > 0) {
            var boundsObj = L.latLngBounds(bounds);
            map.fitBounds(boundsObj, { padding: [30, 30], maxZoom: maxZoom || 14 });
        }
    }

    // ================================================================
    // Rendering: GeoJSON Boundary Region
    // ================================================================

    /**
     * Render a single GeoJSON boundary region with shading.
     * Returns true if rendered successfully, false if fallback needed.
     */
    function renderBoundaryRegion(layer, regionName, boundaryGeoJSON, records, color, groupBy, config) {
        if (!boundaryGeoJSON) return false;

        try {
            var geojson = typeof boundaryGeoJSON === 'string'
                ? JSON.parse(boundaryGeoJSON)
                : boundaryGeoJSON;

            var geoLayer = L.geoJSON(geojson, {
                style: {
                    fillColor: color,
                    fillOpacity: 0.35,
                    color: color,
                    weight: 2,
                    opacity: 0.8
                }
            });

            geoLayer.bindPopup(buildClusterPopup(records, regionName + ' (' + records.length + ')', config));

            if (config.onRegionClick) {
                (function (name, recs, gb) {
                    geoLayer.on('click', function () {
                        config.onRegionClick({
                            regionName: name,
                            groupBy: gb,
                            recordCount: recs.length,
                            records: recs
                        });
                    });
                })(regionName, records, groupBy);
            }

            layer.addLayer(geoLayer);
            return true;
        } catch (e) {
            console.warn('[MapCore] GeoJSON render failed for "' + regionName + '"', e);
            return false;
        }
    }

    // ================================================================
    // Rendering: Circle Fallback
    // ================================================================

    /** Render a colored circle marker as fallback for regions without boundary data. */
    function renderCircleFallback(layer, regionName, records, color, config) {
        var latField = config.latitudeField || '__mj_Latitude';
        var lngField = config.longitudeField || '__mj_Longitude';
        var sumLat = 0, sumLng = 0, count = 0;

        for (var i = 0; i < records.length; i++) {
            var lat = getNumericField(records[i], latField);
            var lng = getNumericField(records[i], lngField);
            if (lat && lng) { sumLat += lat; sumLng += lng; count++; }
        }

        if (count > 0) {
            var radius = Math.min(15 + records.length * 5, 50);
            var circle = L.circleMarker([sumLat / count, sumLng / count], {
                radius: radius,
                fillColor: color,
                fillOpacity: 0.45,
                color: color,
                weight: 2,
                opacity: 0.85
            });
            circle.bindPopup(buildClusterPopup(records, regionName + ' (' + records.length + ')', config));
            layer.addLayer(circle);
        }
    }

    // ================================================================
    // Rendering: Point Markers
    // ================================================================

    function renderPointMarkers(map, layer, records, config) {
        var latField = config.latitudeField || '__mj_Latitude';
        var lngField = config.longitudeField || '__mj_Longitude';
        var bounds = [];
        var useCluster = (config.clusterMarkers !== false) && (typeof L.markerClusterGroup === 'function');
        var clusterGroup = useCluster ? L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false
        }) : null;

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var lat = getNumericField(record, latField);
            var lng = getNumericField(record, lngField);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

            var latLng = L.latLng(lat, lng);
            bounds.push(latLng);

            var marker = L.marker(latLng);
            marker.bindPopup(buildSinglePopup(record, config));

            if (config.onMarkerClick) {
                (function (rec, la, ln) {
                    marker.on('click', function () {
                        var getId = config.getRecordId || defaultGetRecordId;
                        config.onMarkerClick({
                            recordId: getId(rec),
                            lat: la,
                            lng: ln,
                            record: rec
                        });
                    });
                })(record, lat, lng);
            }

            if (clusterGroup) {
                clusterGroup.addLayer(marker);
            } else {
                layer.addLayer(marker);
            }
        }

        if (clusterGroup) {
            layer.addLayer(clusterGroup);
        }

        fitBounds(map, bounds, config.maxZoom);
        return bounds.length;
    }

    // ================================================================
    // Rendering: Heatmap (density circles via spatial clustering)
    // ================================================================

    function renderHeatmap(map, layer, records, config) {
        var latField = config.latitudeField || '__mj_Latitude';
        var lngField = config.longitudeField || '__mj_Longitude';
        var bounds = [];
        var recordsWithCoords = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var lat = getNumericField(record, latField);
            var lng = getNumericField(record, lngField);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));
            recordsWithCoords.push({ lat: lat, lng: lng, record: record });
        }

        var clusters = spatialCluster(recordsWithCoords, config.clusterRadius || 2.0);

        for (var c = 0; c < clusters.length; c++) {
            var cluster = clusters[c];
            var radius = Math.min(12 + cluster.records.length * 5, 40);
            var opacity = Math.min(0.3 + cluster.records.length * 0.08, 0.85);

            var circle = L.circleMarker([cluster.centerLat, cluster.centerLng], {
                radius: radius,
                fillColor: HEATMAP_FILL_COLOR,
                fillOpacity: opacity,
                color: HEATMAP_STROKE_COLOR,
                weight: 1,
                opacity: 0.7
            });

            var title = cluster.records.length + ' record' + (cluster.records.length !== 1 ? 's' : '');
            circle.bindPopup(buildClusterPopup(cluster.records, title, config));

            if (config.onRegionClick) {
                (function (cl) {
                    circle.on('click', function () {
                        config.onRegionClick({
                            regionName: 'Cluster (' + cl.records.length + ' records)',
                            groupBy: 'cluster',
                            recordCount: cl.records.length,
                            records: cl.records
                        });
                    });
                })(cluster);
            }

            layer.addLayer(circle);
        }

        fitBounds(map, bounds, config.maxZoom);
        return bounds.length;
    }

    // ================================================================
    // Rendering: Boundary (one polygon per record)
    // ================================================================

    /**
     * Render one GeoJSON polygon per record using a boundary field.
     * Each record is expected to carry its own GeoJSON in config.boundaryField.
     * Records without boundary data fall back to a centroid marker if lat/lng exist.
     */
    var BOUNDARY_MAX_POLYGONS = 200;

    function renderBoundary(map, layer, records, config) {
        // Too many polygons causes stack overflow and browser freeze.
        // Fall back to point markers when the dataset is too large.
        if (records.length > BOUNDARY_MAX_POLYGONS) {
            console.warn('[MapCore] Boundary mode: ' + records.length + ' records exceeds ' + BOUNDARY_MAX_POLYGONS + ' polygon limit, falling back to point markers');
            return renderPointMarkers(map, layer, records, config);
        }

        var boundaryField = config.boundaryField || 'BoundaryGeoJSON';
        var latField = config.latitudeField || '__mj_Latitude';
        var lngField = config.longitudeField || '__mj_Longitude';
        var colors = config.colors || DEFAULT_COLORS;
        var getId = config.getRecordId || defaultGetRecordId;
        var getName = config.getRecordName || defaultGetRecordName;
        var bounds = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var color = colors[i % colors.length];
            var name = getName(record);
            var boundaryRaw = getField(record, boundaryField);

            if (boundaryRaw) {
                try {
                    var geojson = typeof boundaryRaw === 'string'
                        ? JSON.parse(boundaryRaw) : boundaryRaw;

                    // IIFE to capture color and record per iteration
                    (function (rec, recName, recColor, recId) {
                        var baseStyle = {
                            fillColor: recColor,
                            fillOpacity: 0.5,
                            color: recColor,
                            weight: 2,
                            opacity: 0.8
                        };

                        var geoLayer = L.geoJSON(geojson, {
                            style: baseStyle,
                            onEachFeature: function (feature, featureLayer) {
                                featureLayer.on({
                                    mouseover: function (e) {
                                        e.target.setStyle({ fillOpacity: 0.8, weight: 3 });
                                        if (e.target.bringToFront) e.target.bringToFront();
                                    },
                                    mouseout: function (e) {
                                        e.target.setStyle(baseStyle);
                                    }
                                });
                            }
                        });

                        geoLayer.bindTooltip(escapeHtml(recName), { sticky: true, direction: 'auto' });
                        geoLayer.bindPopup(buildSinglePopup(rec, config));

                        // Fire onMarkerClick for per-record clicks
                        geoLayer.on('click', function () {
                            if (config.onMarkerClick) {
                                config.onMarkerClick({
                                    recordId: recId,
                                    lat: 0,
                                    lng: 0,
                                    record: rec
                                });
                            }
                            // Also fire onRegionClick so parent components can use either event
                            if (config.onRegionClick) {
                                config.onRegionClick({
                                    regionName: recName,
                                    groupBy: 'boundary',
                                    recordCount: 1,
                                    records: [rec]
                                });
                            }
                        });

                        layer.addLayer(geoLayer);

                        // Collect bounds from the rendered layer
                        var layerBounds = geoLayer.getBounds();
                        if (layerBounds && layerBounds.isValid()) {
                            bounds.push(layerBounds.getSouthWest());
                            bounds.push(layerBounds.getNorthEast());
                        }
                    })(record, name, color, getId(record));
                } catch (e) {
                    console.warn('[MapCore] Boundary GeoJSON parse failed for "' + name + '"', e);
                }
            } else {
                // Fallback to centroid marker if lat/lng available
                var lat = getNumericField(record, latField);
                var lng = getNumericField(record, lngField);
                if (lat != null && lng != null) {
                    var marker = L.circleMarker([lat, lng], {
                        radius: 8, fillColor: color, fillOpacity: 0.6,
                        color: color, weight: 2, opacity: 0.8
                    });
                    marker.bindTooltip(escapeHtml(name), { sticky: true });
                    marker.bindPopup(buildSinglePopup(record, config));
                    if (config.onMarkerClick) {
                        (function (rec, la, ln) {
                            marker.on('click', function () {
                                config.onMarkerClick({ recordId: getId(rec), lat: la, lng: ln, record: rec });
                            });
                        })(record, lat, lng);
                    }
                    layer.addLayer(marker);
                    bounds.push(L.latLng(lat, lng));
                }
            }
        }

        fitBounds(map, bounds, config.maxZoom);
        return bounds.length > 0 ? records.length : 0;
    }

    // ================================================================
    // Rendering: Choropleth — coordinate-based (with GeoResolver)
    // ================================================================

    function renderChoroplethWithGeoResolver(map, layer, records, config) {
        var latField = config.latitudeField || '__mj_Latitude';
        var lngField = config.longitudeField || '__mj_Longitude';
        var geo = config.geoResolver;
        var colors = config.colors || DEFAULT_COLORS;
        var bounds = [];

        // Group records by resolved country/state
        var recordsByCountryId = {};
        var countryInfoById = {};
        var recordsByStateId = {};
        var stateInfoById = {};
        var unmatchedRecords = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var lat = getNumericField(record, latField);
            var lng = getNumericField(record, lngField);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));

            var resolution = geo.ResolvePointToLocation(lat, lng);

            if (resolution.Country) {
                var countryId = String(resolution.Country.ID).toLowerCase();
                if (!recordsByCountryId[countryId]) {
                    recordsByCountryId[countryId] = [];
                    countryInfoById[countryId] = resolution.Country;
                }
                recordsByCountryId[countryId].push(record);

                if (resolution.State) {
                    var stateId = String(resolution.State.ID).toLowerCase();
                    if (!recordsByStateId[stateId]) {
                        recordsByStateId[stateId] = [];
                        stateInfoById[stateId] = resolution.State;
                    }
                    recordsByStateId[stateId].push(record);
                }
            } else {
                unmatchedRecords.push(record);
            }
        }

        // Auto-detect grouping: single country → state-level, multiple → country-level
        var countryIds = Object.keys(recordsByCountryId);
        var stateIds = Object.keys(recordsByStateId);
        var colorIdx = 0;

        if (countryIds.length <= 1 && stateIds.length > 1) {
            // State-level rendering
            for (var s = 0; s < stateIds.length; s++) {
                var sid = stateIds[s];
                var stateInfo = stateInfoById[sid];
                var stateRecords = recordsByStateId[sid];
                var color = colors[colorIdx % colors.length];
                var rendered = renderBoundaryRegion(
                    layer, stateInfo.Name, stateInfo.BoundaryGeoJSON,
                    stateRecords, color, 'state_province', config
                );
                if (!rendered) {
                    renderCircleFallback(layer, stateInfo.Name, stateRecords, color, config);
                }
                colorIdx++;
            }
        } else {
            // Country-level rendering
            for (var ci = 0; ci < countryIds.length; ci++) {
                var cid = countryIds[ci];
                var countryInfo = countryInfoById[cid];
                var countryRecords = recordsByCountryId[cid];
                var color = colors[colorIdx % colors.length];
                var rendered = renderBoundaryRegion(
                    layer, countryInfo.Name, countryInfo.BoundaryGeoJSON,
                    countryRecords, color, 'country', config
                );
                if (!rendered) {
                    renderCircleFallback(layer, countryInfo.Name, countryRecords, color, config);
                }
                colorIdx++;
            }
        }

        if (unmatchedRecords.length > 0) {
            renderCircleFallback(layer, 'Unmatched', unmatchedRecords, UNMATCHED_COLOR, config);
        }

        fitBounds(map, bounds, config.maxZoom);
        return bounds.length;
    }

    // ================================================================
    // Rendering: Choropleth — text-field fallback (without GeoResolver)
    // ================================================================

    function renderChoroplethWithTextFallback(map, layer, records, config, countryCache) {
        var latField = config.latitudeField || '__mj_Latitude';
        var lngField = config.longitudeField || '__mj_Longitude';
        var countryField = config.countryField || 'Country';
        var colors = config.colors || DEFAULT_COLORS;
        var bounds = [];
        var recordsByCountry = {};

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var lat = getNumericField(record, latField);
            var lng = getNumericField(record, lngField);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));

            var country = String(getField(record, countryField) || 'Unknown');
            if (!recordsByCountry[country]) recordsByCountry[country] = [];
            recordsByCountry[country].push(record);
        }

        var countryNames = Object.keys(recordsByCountry);
        var colorIdx = 0;

        for (var ci = 0; ci < countryNames.length; ci++) {
            var countryName = countryNames[ci];
            var countryRecords = recordsByCountry[countryName];
            var color = colors[colorIdx % colors.length];
            var rendered = false;

            if (countryCache) {
                var countryData = findCountryMatch(countryCache, countryName);
                if (countryData && countryData.BoundaryGeoJSON) {
                    rendered = renderBoundaryRegion(
                        layer, countryName, countryData.BoundaryGeoJSON,
                        countryRecords, color, 'country', config
                    );
                }
            }

            if (!rendered) {
                // Circle fallback at centroid of records
                renderCircleFallback(layer, countryName, countryRecords, color, config);
            }

            colorIdx++;
        }

        fitBounds(map, bounds, config.maxZoom);
        return bounds.length;
    }

    // ================================================================
    // MapEngine Factory
    // ================================================================

    /**
     * Create a new map engine attached to a DOM container.
     *
     * @param {Object} config
     * @param {HTMLDivElement} config.container - DOM element to render into
     * @param {Object} [config.center] - Initial center {lat, lng}
     * @param {number} [config.zoom] - Initial zoom level
     * @param {string} [config.latitudeField] - Latitude field name (default '__mj_Latitude')
     * @param {string} [config.longitudeField] - Longitude field name (default '__mj_Longitude')
     * @param {Object} [config.geoResolver] - GeoDataEngine-compatible resolver with ResolvePointToLocation()
     * @param {string} [config.countryField] - Country field name for text-field fallback (default 'Country')
     * @param {Function} [config.loadCountryData] - Async function returning country reference data
     * @param {Function} [config.getRecordId] - Returns composite PK string for a record
     * @param {Function} [config.getRecordName] - Returns display name for a record
     * @param {Function} [config.onMarkerClick] - Callback when a point marker is clicked
     * @param {Function} [config.onRegionClick] - Callback when a choropleth region or heatmap cluster is clicked
     * @param {Function} [config.onPopupRecordClick] - Callback when a record link in a popup is clicked
     * @param {Function} [config.onMoveEnd] - Callback when the map is panned/zoomed
     * @param {Function} [config.onRenderComplete] - Callback after rendering finishes
     * @param {boolean} [config.clusterMarkers] - Enable marker clustering (default true)
     * @param {number} [config.clusterRadius] - Spatial clustering radius in degrees (default 2.0)
     * @param {number} [config.maxPopupRecords] - Max records shown in popups (default 5)
     * @param {string[]} [config.colors] - Color palette for choropleth regions
     * @param {number} [config.maxZoom] - Max zoom for fitBounds (default 14)
     * @returns {Object} MapEngine instance
     */
    function createEngine(config) {
        if (!config || !config.container) {
            throw new Error('[MapCore] config.container is required');
        }

        var _config = config;
        var _records = [];
        var _mode = 'point';
        var _markerCount = 0;
        var _countryCache = null;
        var _map = null;
        var _markerLayer = null;

        // Initialize the Leaflet map
        var defaultCenter = config.center || { lat: 20, lng: 0 };
        var defaultZoom = config.zoom || 2;

        _map = L.map(config.container, {
            center: [defaultCenter.lat, defaultCenter.lng],
            zoom: defaultZoom,
            zoomControl: true,
            attributionControl: false
        });

        // Compact attribution — required by OSM terms
        L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(_map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
            maxZoom: 18
        }).addTo(_map);

        _markerLayer = L.layerGroup().addTo(_map);

        // Set up popup click handler for record drill-through
        setupPopupClickHandler(_map, _config);

        // Set up moveend handler for display state persistence
        if (config.onMoveEnd) {
            _map.on('moveend', function () {
                if (!_map) return;
                var center = _map.getCenter();
                config.onMoveEnd({
                    zoom: _map.getZoom(),
                    centerLat: center.lat,
                    centerLng: center.lng
                });
            });
        }

        // ---- Render dispatcher ----

        function doRender(records, mode) {
            if (!_map || !_markerLayer) return;
            _markerLayer.clearLayers();
            _records = records || [];
            if (mode) _mode = mode;

            switch (_mode) {
                case 'heatmap':
                    _markerCount = renderHeatmap(_map, _markerLayer, _records, _config);
                    break;
                case 'choropleth':
                    renderChoroplethDispatch();
                    break;
                case 'boundary':
                    _markerCount = renderBoundary(_map, _markerLayer, _records, _config);
                    break;
                case 'point':
                default:
                    _markerCount = renderPointMarkers(_map, _markerLayer, _records, _config);
                    break;
            }

            notifyRenderComplete();
        }

        function renderChoroplethDispatch() {
            if (_config.geoResolver) {
                _markerCount = renderChoroplethWithGeoResolver(_map, _markerLayer, _records, _config);
            } else if (_config.loadCountryData) {
                if (_countryCache) {
                    _markerCount = renderChoroplethWithTextFallback(_map, _markerLayer, _records, _config, _countryCache);
                } else {
                    _config.loadCountryData().then(function (countries) {
                        _countryCache = countries;
                        _markerCount = renderChoroplethWithTextFallback(_map, _markerLayer, _records, _config, _countryCache);
                        notifyRenderComplete();
                    }).catch(function () {
                        _markerCount = renderChoroplethWithTextFallback(_map, _markerLayer, _records, _config, null);
                        notifyRenderComplete();
                    });
                    return; // async — notifyRenderComplete called in .then/.catch
                }
            } else {
                _markerCount = renderChoroplethWithTextFallback(_map, _markerLayer, _records, _config, null);
            }
        }

        function notifyRenderComplete() {
            if (_config.onRenderComplete && _map) {
                var b = _map.getBounds();
                _config.onRenderComplete({
                    mode: _mode,
                    markerCount: _markerCount,
                    bounds: {
                        north: b.getNorth(),
                        south: b.getSouth(),
                        east: b.getEast(),
                        west: b.getWest()
                    }
                });
            }
        }

        // ---- Public MapEngine API ----

        return {
            /** Render records in the given mode. Stores records/mode for re-renders. */
            render: doRender,

            /** Switch render mode and re-render with stored records. */
            setRenderMode: function (mode) {
                _mode = mode;
                doRender(_records, _mode);
            },

            /** Fix tile rendering after visibility/size change. */
            invalidateSize: function () {
                if (_map) _map.invalidateSize();
            },

            /** Clean up Leaflet instance and layers. */
            destroy: function () {
                if (_map) {
                    _map.remove();
                    _map = null;
                    _markerLayer = null;
                }
            },

            /** Get current render statistics. */
            getStats: function () {
                return { markerCount: _markerCount };
            },

            /** Access the underlying Leaflet map instance (escape hatch). */
            getMap: function () {
                return _map;
            }
        };
    }

    // ================================================================
    // Public API
    // ================================================================

    return {
        createEngine: createEngine,
        spatialCluster: spatialCluster,
        pointInPolygon: pointInPolygon,
        findCountryMatch: findCountryMatch,
        VERSION: '1.0.0'
    };
})();

// Support CommonJS module export for npm package consumption
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapCore;
}
