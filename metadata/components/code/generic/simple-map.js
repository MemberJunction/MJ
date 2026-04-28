/**
 * SimpleMap — React wrapper for the MapCore engine.
 *
 * All map rendering is delegated to MapCore.createEngine().
 * MapCore is loaded as a component library from CDN (declared in spec).
 * Source of truth for rendering logic: packages/geo/geo-maps/src/map-core.js
 *
 * @requires MapCore (from @memberjunction/geo-maps, loaded via CDN as component library)
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
    boundaryField,
    maxPopupRecords = 5,
    // Event callback props (passed by parent/Skip-generated root component)
    onMarkerClick,
    onRegionClick,
    onMapRendered,
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
    var engineRef = React.useRef(null);

    var _renderModeState = React.useState(initialRenderMode);
    var renderMode = _renderModeState[0];
    var setRenderMode = _renderModeState[1];

    var _markerCountState = React.useState(0);
    var markerCount = _markerCountState[0];
    var setMarkerCount = _markerCountState[1];

    var _errorState = React.useState(null);
    var error = _errorState[0];
    var setError = _errorState[1];

    // -----------------------------------------------------------------------
    // Helpers for record identity (used in MapCore callbacks)
    // -----------------------------------------------------------------------

    function getField(record, fieldName) {
        if (record && typeof record.Get === 'function') return record.Get(fieldName);
        return record ? record[fieldName] : undefined;
    }

    function getRecordId(record) {
        if (!entityPrimaryKeys || entityPrimaryKeys.length === 0) return '';
        return entityPrimaryKeys.map(function (k) {
            return String(getField(record, k) || '');
        }).join('||');
    }

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
        // Try common name fields before iterating all keys
        var commonNames = ['Name', 'name', 'Title', 'title', 'DisplayName', 'Label'];
        for (var n = 0; n < commonNames.length; n++) {
            var nameVal = getField(record, commonNames[n]);
            if (nameVal != null && typeof nameVal === 'string' && nameVal.length > 0) return nameVal;
        }
        var keys = Object.keys(record).filter(function (k) {
            return k !== 'ID' && k !== 'id' && k !== latitudeField && k !== longitudeField && !k.startsWith('__mj_');
        });
        for (var i = 0; i < keys.length; i++) {
            var v = record[keys[i]];
            if (v != null && typeof v === 'string' && v.length > 0) return v;
        }
        return 'Record';
    }

    // -----------------------------------------------------------------------
    // Initialize the MapCore engine
    // -----------------------------------------------------------------------
    function initializeEngine() {
        if (!containerRef.current || engineRef.current) return;

        try {
            // Build loadCountryData callback for text-field fallback choropleth
            var loadCountryData = null;
            if (utilities && utilities.rv && typeof utilities.rv.RunView === 'function') {
                loadCountryData = function () {
                    return utilities.rv.RunView({
                        EntityName: 'MJ: Countries',
                        Fields: ['ID', 'Name', 'ISO2', 'BoundaryGeoJSON', 'CommonAliases'],
                        ResultType: 'simple'
                    }).then(function (result) {
                        return (result && result.Success && result.Results) ? result.Results : [];
                    });
                };
            }

            var engine = MapCore.createEngine({
                container: containerRef.current,
                center: center || { lat: 20, lng: 0 },
                zoom: zoom || 2,
                latitudeField: latitudeField,
                longitudeField: longitudeField,
                geoResolver: (utilities && utilities.geoDataEngine) || null,
                countryField: countryField,
                boundaryField: boundaryField,
                loadCountryData: loadCountryData,
                clusterMarkers: clusterMarkers,
                clusterRadius: clusterRadius,
                maxPopupRecords: maxPopupRecords,
                colors: colors,
                maxZoom: 12,
                getRecordId: getRecordId,
                getRecordName: getRecordName,
                onMarkerClick: function (event) {
                    if (onMarkerClick) {
                        onMarkerClick({
                            record: event.record,
                            lat: event.lat,
                            lng: event.lng,
                            entityName: entityName,
                            recordId: event.recordId
                        });
                    }
                },
                onPopupRecordClick: function (recordId) {
                    if (callbacks && callbacks.OpenEntityRecord && entityName && entityPrimaryKeys) {
                        var pkValues = recordId.split('||');
                        var keyPairs = entityPrimaryKeys.map(function (k, idx) {
                            return { FieldName: k, Value: pkValues[idx] || '' };
                        });
                        callbacks.OpenEntityRecord(entityName, keyPairs);
                    }
                    if (onMarkerClick) {
                        onMarkerClick({ recordId: recordId, entityName: entityName });
                    }
                },
                onRegionClick: function (event) {
                    var payload = {
                        region: event.regionName,
                        records: event.records,
                        groupBy: event.groupBy,
                        count: event.recordCount
                    };
                    if (onRegionClick) {
                        onRegionClick(payload);
                    }
                    if (callbacks && callbacks.onRegionClick) {
                        callbacks.onRegionClick(payload);
                    }
                },
                onRenderComplete: function (stats) {
                    setMarkerCount(stats.markerCount);
                    var payload = {
                        renderMode: stats.mode,
                        markerCount: stats.markerCount,
                        bounds: stats.bounds
                    };
                    if (onMapRendered) {
                        onMapRendered(payload);
                    }
                    if (callbacks && callbacks.onMapRendered) {
                        callbacks.onMapRendered(payload);
                    }
                }
            });

            engineRef.current = engine;

            // Invalidate size then render
            setTimeout(function () {
                if (engineRef.current) {
                    engineRef.current.invalidateSize();
                    engineRef.current.render(data || [], renderMode);

                    setTimeout(function () {
                        if (engineRef.current) engineRef.current.invalidateSize();
                    }, 500);
                }
            }, 100);
        } catch (e) {
            setError('Failed to initialize map: ' + e.message);
        }
    }

    // -----------------------------------------------------------------------
    // Initialize engine when container is available
    // -----------------------------------------------------------------------
    React.useEffect(function () {
        if (!containerRef.current) return;

        initializeEngine();

        return function () {
            if (engineRef.current) {
                engineRef.current.destroy();
                engineRef.current = null;
            }
        };
    }, []);

    // -----------------------------------------------------------------------
    // Re-render when data or renderMode changes
    // -----------------------------------------------------------------------
    React.useEffect(function () {
        if (engineRef.current) {
            setTimeout(function () {
                if (engineRef.current) {
                    engineRef.current.invalidateSize();
                    engineRef.current.render(data || [], renderMode);
                }
            }, 100);
        } else if (containerRef.current) {
            initializeEngine();
        }
    }, [data, renderMode]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    if (error) {
        return React.createElement('div', {
            style: {
                padding: '20px', background: '#fee2e2', borderRadius: '6px',
                color: '#991b1b', fontSize: '14px'
            }
        }, error);
    }

    if (!data || data.length === 0) {
        return React.createElement('div', {
            style: {
                padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '14px'
            }
        }, 'No data available for map display.');
    }

    return React.createElement('div', {
        style: { width: '100%', display: 'flex', flexDirection: 'column' }
    },
        // Title
        title ? React.createElement('div', {
            style: { padding: '8px 12px', fontWeight: '600', fontSize: '15px', color: '#1f2937' }
        }, title) : null,

        // Toolbar
        React.createElement('div', {
            style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px', borderBottom: '1px solid #e5e7eb', fontSize: '13px'
            }
        },
            React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                ['point', 'boundary', 'choropleth', 'heatmap'].map(function (mode) {
                    return React.createElement('button', {
                        key: mode,
                        onClick: function () { setRenderMode(mode); },
                        style: {
                            padding: '4px 10px',
                            border: '1px solid ' + (renderMode === mode ? '#3b82f6' : '#d1d5db'),
                            borderRadius: '4px',
                            background: renderMode === mode ? '#3b82f6' : '#fff',
                            color: renderMode === mode ? '#fff' : '#374151',
                            cursor: 'pointer', fontSize: '12px'
                        }
                    }, mode.charAt(0).toUpperCase() + mode.slice(1));
                })
            ),
            React.createElement('span', {
                style: { color: '#9ca3af' }
            }, markerCount + ' location' + (markerCount !== 1 ? 's' : ''))
        ),

        // Map container
        React.createElement('div', {
            ref: containerRef,
            style: {
                width: '100%', height: height + 'px', minHeight: '200px'
            }
        })
    );
}
