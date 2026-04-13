/**
 * SimpleMap — Interactive map component for MemberJunction.
 *
 * Renders geo-enabled entity data on an OpenStreetMap tile layer via Leaflet.
 * Defaults to reading __mj_Latitude / __mj_Longitude virtual fields.
 *
 * Three render modes:
 *   - point:      Individual markers with optional clustering (L.markerClusterGroup)
 *   - heatmap:    Density circles via spatial clustering
 *   - choropleth: GeoJSON country polygons loaded from MJ: Countries entity
 *
 * @requires Leaflet 1.9.4 (declared in spec as globalVariable "L")
 */
function SimpleMap({
    data,
    latitudeField = '__mj_Latitude',
    longitudeField = '__mj_Longitude',
    entityName,
    entityPrimaryKeys,
    renderMode: initialRenderMode = 'point',
    clusterMarkers = true,
    clusterRadius = 2.0,
    height = 400,
    title,
    popupFields,
    center,
    zoom,
    colors,
    countryField = 'Country',
    maxPopupRecords = 5,
    // Standard MJ component props
    utilities,
    styles,
    components,
    callbacks,
    savedUserSettings,
    onSaveUserSettings
}) {
    // -----------------------------------------------------------------------
    // Refs and state
    // -----------------------------------------------------------------------
    var containerRef = React.useRef(null);
    var mapRef = React.useRef(null);
    var markerLayerRef = React.useRef(null);
    var observerRef = React.useRef(null);
    var pendingRenderRef = React.useRef(false);
    var countryCacheRef = React.useRef(null);

    var _renderModeState = React.useState(initialRenderMode);
    var renderMode = _renderModeState[0];
    var setRenderMode = _renderModeState[1];

    var _markerCountState = React.useState(0);
    var markerCount = _markerCountState[0];
    var setMarkerCount = _markerCountState[1];

    var _errorState = React.useState(null);
    var error = _errorState[0];
    var setError = _errorState[1];

    var _loadingState = React.useState(true);
    var isLoading = _loadingState[0];
    var setIsLoading = _loadingState[1];

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /** Read a field from a record, supporting BaseEntity .Get() and plain objects. */
    function getField(record, fieldName) {
        if (record && typeof record.Get === 'function') {
            return record.Get(fieldName);
        }
        return record ? record[fieldName] : undefined;
    }

    /** Escape HTML for safe popup content. */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /** Extract a composite primary key string from a record. */
    function getRecordId(record) {
        if (!entityPrimaryKeys || entityPrimaryKeys.length === 0) return '';
        return entityPrimaryKeys.map(function (k) {
            return String(getField(record, k) || '');
        }).join('||');
    }

    /** Get display name for a record using entity metadata. */
    function getRecordName(record) {
        if (entityName && utilities && utilities.md) {
            var entity = utilities.md.Entities.find(function (e) { return e.Name === entityName; });
            if (entity) {
                var nameField = entity.Fields.find(function (f) { return f.IsNameField; });
                if (nameField) {
                    var val = getField(record, nameField.Name);
                    if (val != null) return String(val);
                }
            }
        }
        // Fallback: first non-coordinate non-system string field
        var keys = Object.keys(record).filter(function (k) {
            return k !== latitudeField && k !== longitudeField && !k.startsWith('__mj_');
        });
        for (var i = 0; i < keys.length; i++) {
            var v = record[keys[i]];
            if (v != null && typeof v === 'string' && v.length > 0) return v;
        }
        return 'Record';
    }

    // -----------------------------------------------------------------------
    // Spatial clustering algorithm (for heatmap and choropleth fallback)
    // Groups nearby records within configurable lat/lng radius
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Find country match: free-text country name to reference data
    // Matches via Name, ISO2, and CommonAliases
    // -----------------------------------------------------------------------
    function findCountryMatch(countries, searchName) {
        var normalized = searchName.trim().toLowerCase();

        // Direct name match
        var match = countries.find(function (c) {
            return String(c.Name || '').toLowerCase() === normalized;
        });
        if (match) return match;

        // ISO2 match
        match = countries.find(function (c) {
            return String(c.ISO2 || '').toLowerCase() === normalized;
        });
        if (match) return match;

        // CommonAliases match
        match = countries.find(function (c) {
            var aliases = c.CommonAliases;
            if (!aliases) return false;
            try {
                var arr = JSON.parse(String(aliases));
                return arr.some(function (a) { return a.toLowerCase() === normalized; });
            } catch (e) { return false; }
        });
        return match || null;
    }

    // -----------------------------------------------------------------------
    // Build clickable popup HTML for a cluster of records
    // Shows first N records as clickable blue links, "and X more..." overflow
    // -----------------------------------------------------------------------
    function buildClusterPopup(records, titleText) {
        var maxShow = maxPopupRecords;
        var shown = records.slice(0, maxShow);
        var remaining = records.length - maxShow;

        var html = '<div style="font-size:12px;min-width:160px;">' +
            '<b>' + escapeHtml(titleText) + '</b>' +
            '<hr style="margin:4px 0;border-color:#e5e7eb;">';

        for (var i = 0; i < shown.length; i++) {
            var rec = shown[i];
            var name = getRecordName(rec);
            var recordId = getRecordId(rec);
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

    /** Build popup for a single record (used in point mode). */
    function buildSinglePopup(record) {
        var name = getRecordName(record);
        var recordId = getRecordId(record);
        return '<div style="font-size:12px;min-width:120px;">' +
            '<div style="padding:2px 0;cursor:pointer;color:#2563eb;" ' +
            'class="mj-map-popup-record" data-record-id="' + escapeHtml(recordId) + '">' +
            '<b>' + escapeHtml(name) + '</b></div></div>';
    }

    // -----------------------------------------------------------------------
    // Setup popup click handler for record drill-through
    // -----------------------------------------------------------------------
    function setupPopupClickHandler(map) {
        map.on('popupopen', function () {
            setTimeout(function () {
                var links = document.querySelectorAll('.mj-map-popup-record');
                links.forEach(function (link) {
                    link.addEventListener('click', function (e) {
                        var recordId = e.currentTarget.getAttribute('data-record-id') || '';
                        if (callbacks && callbacks.OpenEntityRecord && entityName && entityPrimaryKeys) {
                            var pkValues = recordId.split('||');
                            var keyPairs = entityPrimaryKeys.map(function (k, idx) {
                                return { FieldName: k, Value: pkValues[idx] || '' };
                            });
                            callbacks.OpenEntityRecord(entityName, keyPairs);
                        }
                    });
                });
            }, 50);
        });
    }

    // -----------------------------------------------------------------------
    // Fit map bounds to encompass all markers
    // -----------------------------------------------------------------------
    function fitBoundsToMarkers(map, bounds) {
        if (bounds.length > 0 && !center) {
            var boundsObj = L.latLngBounds(bounds);
            map.fitBounds(boundsObj, { padding: [30, 30], maxZoom: 12 });
        }
    }

    // -----------------------------------------------------------------------
    // Emit map rendered event
    // -----------------------------------------------------------------------
    function emitMapRendered(map, count) {
        // If an onMapRendered callback is provided, fire it
        if (callbacks && callbacks.onMapRendered) {
            var b = map.getBounds();
            callbacks.onMapRendered({
                renderMode: renderMode,
                markerCount: count,
                bounds: {
                    north: b.getNorth(),
                    south: b.getSouth(),
                    east: b.getEast(),
                    west: b.getWest()
                }
            });
        }
    }

    // -----------------------------------------------------------------------
    // RENDER MODE: Point markers with optional clustering
    // -----------------------------------------------------------------------
    function renderPointMarkers(map, layer) {
        var bounds = [];
        var useCluster = clusterMarkers && typeof L.markerClusterGroup === 'function';
        var clusterGroup = useCluster ? L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false
        }) : null;

        var records = data || [];
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var lat = getField(record, latitudeField);
            var lng = getField(record, longitudeField);

            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

            var latLng = L.latLng(lat, lng);
            bounds.push(latLng);

            var marker = L.marker(latLng);
            marker.bindPopup(buildSinglePopup(record));

            if (clusterGroup) {
                clusterGroup.addLayer(marker);
            } else {
                layer.addLayer(marker);
            }
        }

        if (clusterGroup) {
            layer.addLayer(clusterGroup);
        }

        setMarkerCount(bounds.length);
        fitBoundsToMarkers(map, bounds);
        emitMapRendered(map, bounds.length);
    }

    // -----------------------------------------------------------------------
    // RENDER MODE: Heatmap (density circles via spatial clustering)
    // -----------------------------------------------------------------------
    function renderHeatmap(map, layer) {
        var bounds = [];
        var recordsWithCoords = [];

        var records = data || [];
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var lat = getField(record, latitudeField);
            var lng = getField(record, longitudeField);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));
            recordsWithCoords.push({ lat: lat, lng: lng, record: record });
        }

        var clusters = spatialCluster(recordsWithCoords, clusterRadius);

        for (var c = 0; c < clusters.length; c++) {
            var cluster = clusters[c];
            var radius = Math.min(12 + cluster.records.length * 5, 40);
            var opacity = Math.min(0.3 + cluster.records.length * 0.08, 0.85);

            var circle = L.circleMarker([cluster.centerLat, cluster.centerLng], {
                radius: radius,
                fillColor: '#e74c3c',
                fillOpacity: opacity,
                color: '#c0392b',
                weight: 1,
                opacity: 0.7
            });

            circle.bindPopup(buildClusterPopup(
                cluster.records,
                cluster.records.length + ' record' + (cluster.records.length !== 1 ? 's' : '')
            ));

            layer.addLayer(circle);
        }

        setMarkerCount(bounds.length);
        fitBoundsToMarkers(map, bounds);
        emitMapRendered(map, bounds.length);
    }

    // -----------------------------------------------------------------------
    // RENDER MODE: Choropleth / Regions
    // Loads GeoJSON boundaries from MJ: Countries entity via utilities.rv.RunView
    // -----------------------------------------------------------------------
    function renderChoropleth(map, layer) {
        var bounds = [];
        var recordsByCountry = {};

        var records = data || [];
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var lat = getField(record, latitudeField);
            var lng = getField(record, longitudeField);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
            bounds.push(L.latLng(lat, lng));

            var country = String(getField(record, countryField) || 'Unknown');
            if (!recordsByCountry[country]) recordsByCountry[country] = [];
            recordsByCountry[country].push(record);
        }

        setMarkerCount(bounds.length);

        // Load country boundaries and render regions
        loadAndRenderRegions(map, layer, recordsByCountry, bounds);
    }

    /** Load country data from MJ: Countries and render GeoJSON polygons. */
    function loadAndRenderRegions(map, layer, recordsByCountry, bounds) {
        var regionColors = colors || [
            '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
            '#1abc9c', '#e67e22', '#2980b9', '#27ae60', '#c0392b',
            '#16a085', '#d35400', '#8e44ad', '#2c3e50', '#f1c40f'
        ];

        // Use cached country data if available
        if (countryCacheRef.current) {
            renderRegionsWithData(map, layer, recordsByCountry, bounds, countryCacheRef.current, regionColors);
            return;
        }

        // Load countries via utilities.rv.RunView
        if (!utilities || !utilities.rv || typeof utilities.rv.RunView !== 'function') {
            // No RunView available, fall back to spatial clustering
            renderChoroplethFallback(map, layer, recordsByCountry, bounds, regionColors);
            return;
        }

        utilities.rv.RunView({
            EntityName: 'MJ: Countries',
            Fields: ['ID', 'Name', 'ISO2', 'BoundaryGeoJSON', 'CommonAliases'],
            ResultType: 'simple'
        }).then(function (result) {
            if (result && result.Success && result.Results && result.Results.length > 0) {
                countryCacheRef.current = result.Results;
                renderRegionsWithData(map, layer, recordsByCountry, bounds, result.Results, regionColors);
            } else {
                renderChoroplethFallback(map, layer, recordsByCountry, bounds, regionColors);
            }
        }).catch(function () {
            renderChoroplethFallback(map, layer, recordsByCountry, bounds, regionColors);
        });
    }

    /** Render shaded GeoJSON polygons for each country with data. */
    function renderRegionsWithData(map, layer, recordsByCountry, bounds, countries, regionColors) {
        var colorIdx = 0;
        var countryNames = Object.keys(recordsByCountry);

        for (var ci = 0; ci < countryNames.length; ci++) {
            var countryName = countryNames[ci];
            var records = recordsByCountry[countryName];
            var countryData = findCountryMatch(countries, countryName);
            var color = regionColors[colorIdx % regionColors.length];
            var renderedGeoJSON = false;

            if (countryData && countryData.BoundaryGeoJSON) {
                try {
                    var geojson = typeof countryData.BoundaryGeoJSON === 'string'
                        ? JSON.parse(countryData.BoundaryGeoJSON)
                        : countryData.BoundaryGeoJSON;

                    var geoLayer = L.geoJSON(geojson, {
                        style: {
                            fillColor: color,
                            fillOpacity: 0.35,
                            color: color,
                            weight: 2,
                            opacity: 0.8
                        }
                    });

                    geoLayer.bindPopup(buildClusterPopup(records, countryName + ' (' + records.length + ')'));

                    // Emit region click when polygon is clicked
                    (function (name, recs) {
                        geoLayer.on('click', function () {
                            if (callbacks && callbacks.onRegionClick) {
                                callbacks.onRegionClick({
                                    region: name,
                                    records: recs,
                                    groupBy: 'country',
                                    count: recs.length
                                });
                            }
                        });
                    })(countryName, records);

                    layer.addLayer(geoLayer);
                    renderedGeoJSON = true;
                } catch (e) {
                    // GeoJSON parse failed, fall through to circle fallback
                }
            }

            if (!renderedGeoJSON) {
                // Fallback: colored circle for countries without boundary data
                var firstRecord = records[0];
                var lat = getField(firstRecord, latitudeField);
                var lng = getField(firstRecord, longitudeField);
                if (lat && lng) {
                    var radius = Math.min(20 + records.length * 6, 60);
                    var circle = L.circleMarker([lat, lng], {
                        radius: radius,
                        fillColor: color,
                        fillOpacity: 0.45,
                        color: color,
                        weight: 2,
                        opacity: 0.85
                    });
                    circle.bindPopup(buildClusterPopup(records, countryName));
                    layer.addLayer(circle);
                }
            }

            colorIdx++;
        }

        fitBoundsToMarkers(map, bounds);
        emitMapRendered(map, bounds.length);
    }

    /** Fallback choropleth: colored circles when boundary loading fails entirely. */
    function renderChoroplethFallback(map, layer, recordsByCountry, bounds, regionColors) {
        var colorIdx = 0;
        var countryNames = Object.keys(recordsByCountry);

        for (var ci = 0; ci < countryNames.length; ci++) {
            var name = countryNames[ci];
            var records = recordsByCountry[name];
            var firstRecord = records[0];
            var lat = getField(firstRecord, latitudeField);
            var lng = getField(firstRecord, longitudeField);
            if (lat && lng) {
                var color = regionColors[colorIdx % regionColors.length];
                var radius = Math.min(20 + records.length * 6, 60);
                var circle = L.circleMarker([lat, lng], {
                    radius: radius,
                    fillColor: color,
                    fillOpacity: 0.45,
                    color: color,
                    weight: 2,
                    opacity: 0.85
                });
                circle.bindPopup(buildClusterPopup(records, name));
                layer.addLayer(circle);
            }
            colorIdx++;
        }

        fitBoundsToMarkers(map, bounds);
        emitMapRendered(map, bounds.length);
    }

    // -----------------------------------------------------------------------
    // Master render dispatcher
    // -----------------------------------------------------------------------
    function renderMarkers(map, layer) {
        if (!map || !layer) return;
        layer.clearLayers();

        switch (renderMode) {
            case 'heatmap':
                renderHeatmap(map, layer);
                break;
            case 'choropleth':
                renderChoropleth(map, layer);
                break;
            case 'point':
            default:
                renderPointMarkers(map, layer);
                break;
        }
    }

    // -----------------------------------------------------------------------
    // Initialize Leaflet map
    // -----------------------------------------------------------------------
    function initializeMap() {
        if (!containerRef.current || mapRef.current) return;

        try {
            var defaultCenter = center || { lat: 20, lng: 0 };
            var defaultZoom = zoom || 2;

            var map = L.map(containerRef.current, {
                center: [defaultCenter.lat, defaultCenter.lng],
                zoom: defaultZoom,
                zoomControl: true,
                attributionControl: false
            });

            // Compact attribution (required by OSM terms)
            L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
                maxZoom: 18
            }).addTo(map);

            var markerLayer = L.layerGroup().addTo(map);
            mapRef.current = map;
            markerLayerRef.current = markerLayer;

            // Setup popup click handlers for record drill-through
            setupPopupClickHandler(map);

            // Invalidate size then render markers
            setTimeout(function () {
                if (mapRef.current) {
                    mapRef.current.invalidateSize();
                    renderMarkers(mapRef.current, markerLayerRef.current);
                    setIsLoading(false);

                    // Double-invalidate to fix partial tile rendering
                    setTimeout(function () {
                        if (mapRef.current) mapRef.current.invalidateSize();
                    }, 500);
                }
            }, 100);
        } catch (e) {
            setError('Failed to initialize map: ' + e.message);
            setIsLoading(false);
        }
    }

    // -----------------------------------------------------------------------
    // IntersectionObserver for deferred map initialization
    // Only init Leaflet when container is visible (saves resources)
    // -----------------------------------------------------------------------
    React.useEffect(function () {
        if (!containerRef.current) return;

        // If IntersectionObserver is not available, init immediately
        if (typeof IntersectionObserver === 'undefined') {
            initializeMap();
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            var entry = entries[0];
            if (entry.isIntersecting && !mapRef.current) {
                // First time visible: initialize the map
                initializeMap();
            } else if (entry.isIntersecting && mapRef.current) {
                // Becoming visible again: fix tiles and render pending changes
                mapRef.current.invalidateSize();
                if (pendingRenderRef.current) {
                    renderMarkers(mapRef.current, markerLayerRef.current);
                    pendingRenderRef.current = false;
                }
            }
        }, { threshold: 0.1 });

        observer.observe(containerRef.current);
        observerRef.current = observer;

        return function () {
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                markerLayerRef.current = null;
            }
        };
    }, []);

    // -----------------------------------------------------------------------
    // Re-render when data or renderMode changes
    // -----------------------------------------------------------------------
    React.useEffect(function () {
        if (mapRef.current && markerLayerRef.current) {
            setTimeout(function () {
                if (mapRef.current) {
                    mapRef.current.invalidateSize();
                    renderMarkers(mapRef.current, markerLayerRef.current);
                }
            }, 100);
        } else {
            // Map not initialized yet: mark for render when visible
            pendingRenderRef.current = true;
        }
    }, [data, renderMode]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    if (error) {
        return React.createElement('div', {
            style: {
                padding: '20px',
                background: '#fee2e2',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '14px'
            }
        }, error);
    }

    if (!data || data.length === 0) {
        return React.createElement('div', {
            style: {
                padding: '40px',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '14px'
            }
        }, 'No data available for map display.');
    }

    return React.createElement('div', {
        style: { width: '100%', display: 'flex', flexDirection: 'column' }
    },
        // Title
        title ? React.createElement('div', {
            style: {
                padding: '8px 12px',
                fontWeight: '600',
                fontSize: '15px',
                color: '#1f2937'
            }
        }, title) : null,

        // Toolbar with mode buttons and marker count
        React.createElement('div', {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                borderBottom: '1px solid #e5e7eb',
                fontSize: '13px'
            }
        },
            React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                ['point', 'choropleth', 'heatmap'].map(function (mode) {
                    return React.createElement('button', {
                        key: mode,
                        onClick: function () { setRenderMode(mode); },
                        style: {
                            padding: '4px 10px',
                            border: '1px solid ' + (renderMode === mode ? '#3b82f6' : '#d1d5db'),
                            borderRadius: '4px',
                            background: renderMode === mode ? '#3b82f6' : '#fff',
                            color: renderMode === mode ? '#fff' : '#374151',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }
                    }, mode.charAt(0).toUpperCase() + mode.slice(1));
                })
            ),
            React.createElement('span', {
                style: { color: '#9ca3af' }
            }, markerCount + ' location' + (markerCount !== 1 ? 's' : ''))
        ),

        // Loading indicator
        isLoading ? React.createElement('div', {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: height + 'px',
                color: '#6b7280',
                fontSize: '14px'
            }
        }, 'Loading map...') : null,

        // Map container
        React.createElement('div', {
            ref: containerRef,
            style: {
                width: '100%',
                height: height + 'px',
                minHeight: '200px',
                display: isLoading ? 'none' : 'block'
            }
        })
    );
}
