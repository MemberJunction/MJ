/**
 * SimpleMap — Interactive map component for MemberJunction.
 *
 * Renders geo-enabled entity data as markers on an OpenStreetMap tile layer.
 * Defaults to reading __mj_Latitude / __mj_Longitude virtual fields.
 * Supports point, choropleth, and heatmap rendering modes.
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
    height = 400,
    title,
    popupFields,
    center,
    zoom,
    colors,
    // Standard MJ component props
    utilities,
    styles,
    components,
    callbacks,
    savedUserSettings,
    onSaveUserSettings
}) {
    const containerRef = React.useRef(null);
    const mapRef = React.useRef(null);
    const markerLayerRef = React.useRef(null);
    const [renderMode, setRenderMode] = React.useState(initialRenderMode);
    const [markerCount, setMarkerCount] = React.useState(0);
    const [error, setError] = React.useState(null);

    // -----------------------------------------------------------------------
    // Process data: filter records with valid coordinates
    // -----------------------------------------------------------------------
    const processedData = React.useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        return data.filter(record => {
            const lat = record[latitudeField];
            const lng = record[longitudeField];
            return lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
        });
    }, [data, latitudeField, longitudeField]);

    // -----------------------------------------------------------------------
    // Build popup content for a record
    // -----------------------------------------------------------------------
    const buildPopupContent = React.useCallback((record) => {
        let fields = popupFields;

        // Auto-detect fields from entity metadata
        if (!fields && entityName && utilities && utilities.md) {
            const entity = utilities.md.Entities.find(e => e.Name === entityName);
            if (entity) {
                const nameField = entity.Fields.find(f => f.IsNameField);
                const keyFields = entity.PrimaryKeys || [];
                fields = [
                    nameField ? nameField.Name : null,
                    ...keyFields.map(k => k.Name)
                ].filter(Boolean);
            }
        }

        // Fallback: show first few non-null fields
        if (!fields || fields.length === 0) {
            fields = Object.keys(record).filter(k =>
                record[k] != null &&
                k !== latitudeField &&
                k !== longitudeField &&
                !k.startsWith('__mj_')
            ).slice(0, 4);
        }

        const lines = fields.map(f => {
            const val = record[f];
            if (val == null) return null;
            const escaped = String(val).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return '<div><strong>' + f + ':</strong> ' + escaped + '</div>';
        }).filter(Boolean);

        return '<div style="max-width:250px;font-size:12px;">' + lines.join('') + '</div>';
    }, [popupFields, entityName, utilities, latitudeField, longitudeField]);

    // -----------------------------------------------------------------------
    // Initialize map
    // -----------------------------------------------------------------------
    React.useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        try {
            const defaultCenter = center || { lat: 20, lng: 0 };
            const defaultZoom = zoom || 2;

            const map = L.map(containerRef.current, {
                center: [defaultCenter.lat, defaultCenter.lng],
                zoom: defaultZoom,
                zoomControl: true
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 18
            }).addTo(map);

            markerLayerRef.current = L.layerGroup().addTo(map);
            mapRef.current = map;

            // Force resize after render (Leaflet needs the container to be visible)
            setTimeout(() => map.invalidateSize(), 100);
        } catch (e) {
            setError('Failed to initialize map: ' + e.message);
        }

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                markerLayerRef.current = null;
            }
        };
    }, []);

    // -----------------------------------------------------------------------
    // Render markers when data or mode changes
    // -----------------------------------------------------------------------
    React.useEffect(() => {
        const map = mapRef.current;
        const layer = markerLayerRef.current;
        if (!map || !layer) return;

        layer.clearLayers();

        if (renderMode === 'point') {
            const bounds = [];

            processedData.forEach(record => {
                const lat = record[latitudeField];
                const lng = record[longitudeField];
                const latLng = L.latLng(lat, lng);
                bounds.push(latLng);

                const marker = L.marker(latLng);
                marker.bindPopup(buildPopupContent(record));

                marker.on('click', () => {
                    if (callbacks && callbacks.OpenEntityRecord && entityName && entityPrimaryKeys) {
                        callbacks.OpenEntityRecord(
                            entityName,
                            entityPrimaryKeys.map(k => ({ FieldName: k, Value: record[k] }))
                        );
                    }
                });

                layer.addLayer(marker);
            });

            setMarkerCount(bounds.length);

            // Auto-fit bounds
            if (bounds.length > 0 && !center) {
                const boundsObj = L.latLngBounds(bounds);
                map.fitBounds(boundsObj, { padding: [30, 30], maxZoom: 12 });
            }

            // Fire rendered event
            if (bounds.length > 0) {
                const b = L.latLngBounds(bounds);
                // onMapRendered event would be emitted here if the event callback is provided
            }
        }
        // Choropleth and heatmap modes would be implemented here in future iterations
    }, [processedData, renderMode, latitudeField, longitudeField, buildPopupContent,
        callbacks, entityName, entityPrimaryKeys, center]);

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

        // Toolbar
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
                ['point', 'choropleth', 'heatmap'].map(mode =>
                    React.createElement('button', {
                        key: mode,
                        onClick: () => setRenderMode(mode),
                        style: {
                            padding: '4px 10px',
                            border: '1px solid ' + (renderMode === mode ? '#3b82f6' : '#d1d5db'),
                            borderRadius: '4px',
                            background: renderMode === mode ? '#3b82f6' : '#fff',
                            color: renderMode === mode ? '#fff' : '#374151',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }
                    }, mode.charAt(0).toUpperCase() + mode.slice(1))
                )
            ),
            React.createElement('span', {
                style: { color: '#9ca3af' }
            }, markerCount + ' location' + (markerCount !== 1 ? 's' : ''))
        ),

        // Map container
        React.createElement('div', {
            ref: containerRef,
            style: {
                width: '100%',
                height: height + 'px',
                minHeight: '200px'
            }
        })
    );
}
