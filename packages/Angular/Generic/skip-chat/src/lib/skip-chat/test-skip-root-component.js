function EntityViewer({ data, utilities, userState, callbacks, styles, components }) {
    const {
        EntityTree,
        EntityBreadcrumbs,
        EntityMetadataPanel,
        SchemaDiagram,
        EntitySearchFilterBar,
        FieldDetailDrawer
    } = components;
    const React = window.React;
    const { useState, useEffect, useRef } = React;

    // ---- State Management ----
    const defaultState = {
        expandedEntityIds: [],         // IDs of expanded entities in the tree
        activeEntityId: null,          // Currently selected entity
        breadcrumbTrail: [],           // Array of IDs for breadcrumbs
        searchQuery: '',               // Current search string
        entityFilter: {},              // { type, dataClass, tags, date, permission }
        viewMode: 'Technical',         // 'Technical' | 'Business'
        schemaDiagramVisible: false,   // Show/hide ERD diagram
        childCounts: {},               // { entityId: childCount }
        metadataPanel: {},             // Child state: EntityMetadataPanel
        fieldDetail: null,             // Field ID for FieldDetailDrawer
        searchFilterBar: {},           // Child state: EntitySearchFilterBar
        tree: {},                      // Child state: EntityTree
        breadcrumbs: {},               // Child: EntityBreadcrumbs
        diagram: {},                   // Child: SchemaDiagram
        drawer: {},                    // Child: FieldDetailDrawer
        loading: false,                // Loading dynamic data
        error: null                    // Top-level error
    };
    // Merge incoming userState (from persistence)
    const [fullUserState, setFullUserState] = useState({ ...defaultState, ...userState });

    // ---- State Updater ----
    const updateUserState = (stateUpdate) => {
        const newState = { ...fullUserState, ...stateUpdate };
        setFullUserState(newState);
        if (callbacks?.UpdateUserState) callbacks.UpdateUserState(newState);
    };

    // ---- Child Event Handler ----
    const handleComponentEvent = (event) => {
        // Accessibility live region feedback
        if (event.type === 'error') {
        updateUserState({ error: event.payload.error });
        return;
        }
        // Tree selection: Navigates (updates breadcrumbs, resets details)
        if (event.type === 'entitySelected') {
        const entityId = event.payload.itemId;
        updateUserState({
            activeEntityId: entityId,
            fieldDetail: null,
            schemaDiagramVisible: false
        });
        // Compute breadcrumbs (root-to-active)
        const entityList = entityArray;
        let trail = [];
        let currId = entityId;
        while (currId) {
            const ent = entityList.find(e => e.ID === currId);
            if (ent) {
            trail.unshift({ ID: ent.ID, Name: ent.Name });
            currId = ent.ParentID;
            } else break;
        }
        updateUserState({ breadcrumbTrail: trail });
        return;
        }
        // Breadcrumb nav: Jump to ancestor entity
        if (event.type === 'breadcrumbNavigate') {
        const { itemId } = event.payload;
        updateUserState({ activeEntityId: itemId, fieldDetail: null, schemaDiagramVisible: false });
        // Update breadcrumbs accordingly (handled above)
        return;
        }
        // Drill into field (open drawer)
        if (event.type === 'fieldSelected') {
        updateUserState({ fieldDetail: event.payload.itemId });
        return;
        }
        // Search/filter change
        if (event.type === 'searchChanged') {
        updateUserState({ searchQuery: event.payload.value });
        return;
        }
        if (event.type === 'filterChanged') {
        updateUserState({ entityFilter: event.payload.filter });
        return;
        }
        // Toggle schema diagram
        if (event.type === 'toggleSchemaDiagram') {
        updateUserState({ schemaDiagramVisible: !fullUserState.schemaDiagramVisible });
        return;
        }
        // Close field drawer
        if (event.type === 'drawerClosed') {
        updateUserState({ fieldDetail: null });
        return;
        }
        // Default: delegate to standard handler
        const standardHandler = createStandardEventHandler(updateUserState, callbacks);
        standardHandler(event);
    };

    // ---- Dynamic DATA: Entities/Fields/Relationships via utilities.rv.runView ----
    const [entityArray, setEntityArray] = useState([]);
    const [fullFieldMap, setFullFieldMap] = useState({}); // { entityId: [fields] }
    const [relationshipMap, setRelationshipMap] = useState({}); // { entityId: [relationships] }
    const [childCounts, setChildCounts] = useState({}); // { entityId: childCount }

    // Helper: load all entities/fields/relationships as needed for tree and detail panels
    useEffect(() => {
        let isMounted = true;
        async function loadEntitiesAndRelated() {
        updateUserState({ loading: true, error: null });
        try {
            // Entities - always load
            const entResult = await utilities.rv.runView({
            EntityName: 'Entities',
            Fields: ['ID','Name','Description','ParentID'],
            OrderBy: 'Name',
            ResultType: 'simple'
            });
            if (!entResult.Success) throw new Error(entResult.Message || 'Entities fetch failed');
            const entities = entResult.Results;
            // Map: {ID: entity, ...}
            // Compute child counts
            const childCountMap = {};
            entities.forEach(e => { childCountMap[e.ID] = 0; });
            entities.forEach(e => { if (e.ParentID && childCountMap[e.ParentID] != null) childCountMap[e.ParentID]++; });
            // (Optional: Compute hierarchy tree if needed for performance)

            // Fields for all entities
            const fieldsResult = await utilities.rv.runView({
            EntityName: 'Entity Fields',
            Fields: ['ID','Name','Description','RelatedEntityID','AllowUpdateAPI','IncludeInGeneratedForm','EntityID'],
            ResultType: 'simple',
            MaxRows: 10000
            });
            if (!fieldsResult.Success) throw new Error(fieldsResult.Message || 'Entity Fields fetch failed');
            const allFields = fieldsResult.Results;
            const fieldsByEntity = entities.reduce((acc,e) => {
            acc[e.ID] = allFields.filter(f => f.EntityID === e.ID);
            return acc;
            }, {});
            // Relationships
            const relResult = await utilities.rv.runView({
            EntityName: 'Entity Relationships',
            Fields: ['ID','EntityID','RelatedEntityID','Type','DisplayName'],
            ResultType: 'simple',
            MaxRows: 10000
            });
            if (!relResult.Success) throw new Error(relResult.Message || 'Relationships fetch failed');
            const allRels = relResult.Results;
            const relsByEntity = entities.reduce((acc,e) => {
            acc[e.ID] = allRels.filter(r => r.EntityID === e.ID);
            return acc;
            }, {});

            if (isMounted) {
            setEntityArray(entities);
            setFullFieldMap(fieldsByEntity);
            setRelationshipMap(relsByEntity);
            setChildCounts(childCountMap);
            updateUserState({ loading: false, error: null });
            }
        } catch (err) {
            if (isMounted) {
            setEntityArray([]);
            setFullFieldMap({});
            setRelationshipMap({});
            setChildCounts({});
            updateUserState({ loading: false, error: err.message || 'Data Load Error', error: err.message });
            }
        }
        }
        loadEntitiesAndRelated();
        return () => { isMounted = false; };
        // Only on initial mount or RefreshData
        // eslint-disable-next-line
    }, []);
    // Allow explicit refresh
    useEffect(() => {
        if (fullUserState._requireRefresh) {
        // Trigger reload on demand
        setFullUserState(s => ({ ...s, _requireRefresh: false }));
        callbacks?.RefreshData && callbacks.RefreshData();
        }
        // eslint-disable-next-line
    }, [fullUserState._requireRefresh]);

    // ---- FILTER entities for search/filter bar ----
    let filteredEntities = entityArray;
    if (fullUserState.searchQuery) {
        const q = fullUserState.searchQuery.toLowerCase();
        filteredEntities = filteredEntities.filter(e => (e.Name||'').toLowerCase().includes(q) || (e.Description||'').toLowerCase().includes(q));
    }
    // Add future filter logic by entityFilter

    // Active entity
    const activeEntity = entityArray.find(e => e.ID === fullUserState.activeEntityId) || null;
    const activeFields = activeEntity ? (fullFieldMap[activeEntity.ID]||[]) : [];
    const activeRelationships = activeEntity ? (relationshipMap[activeEntity.ID]||[]) : [];
    const breadCrumbTrail = fullUserState.breadcrumbTrail.length > 0
        ? fullUserState.breadcrumbTrail
        : (activeEntity ? (() => { // Compute trail on first load if none
            let trail = [];
            let currId = activeEntity.ID;
            while (currId) {
            const ent = entityArray.find(e => e.ID === currId);
            if (!ent) break;
            trail.unshift({ ID: ent.ID, Name: ent.Name });
            currId = ent.ParentID;
            }
            return trail;
        })() : []);

    // ---- Accessibility: ARIA live region for errors ----
    const ariaLiveRef = useRef(null);
    useEffect(() => {
        if (ariaLiveRef.current && fullUserState.error) {
        ariaLiveRef.current.textContent = fullUserState.error;
        }
    }, [fullUserState.error]);

    // ---- Layout ----
    return (
        React.createElement('div', {
        role: 'main',
        'aria-label': 'Entity Metadata Explorer',
        style: {
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: styles.colors.background,
            color: styles.colors.text
        }
        },
        // Toolbar (search + filters)
        React.createElement('div', {
            style: {
            borderBottom: `1px solid ${styles.colors.border}`,
            background: styles.colors.surface,
            padding: styles.spacing.sm,
            display: 'flex',
            alignItems: 'center',
            gap: styles.spacing.sm,
            minHeight: 56
            }
        },
            React.createElement(EntitySearchFilterBar, {
            data: { entities: entityArray },
            userState: fullUserState.searchFilterBar,
            onEvent: handleComponentEvent,
            styles,
            callbacks,
            utilities,
            statePath: 'searchFilterBar',
            query: fullUserState.searchQuery,
            filter: fullUserState.entityFilter
            })
        ),
        // Accessibility live feedback
        React.createElement('div', {
            ref: ariaLiveRef,
            'aria-live': 'polite',
            style: { position: 'absolute', left: -9999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }
        }, (fullUserState.error ? fullUserState.error : '')),
        // MAIN window split
        React.createElement('div', {
            style: {
            display: 'flex',
            flex: 1,
            height: '100%',
            minHeight: 0,
            minWidth: 0,
            gap: styles.spacing.md
            }
        },
            // Left panel: Entity Tree
            React.createElement('div', {
            style: {
                width: 340,
                minWidth: 240,
                maxWidth: 400,
                background: styles.colors.surface,
                borderRight: `1px solid ${styles.colors.border}`,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column'
            },
            role: 'region',
            'aria-label': 'Entity Hierarchy'
            },
            React.createElement('div', {
                style: { flex: 1, minHeight: 0 }
            },
                React.createElement(EntityTree, {
                data: filteredEntities,
                userState: fullUserState.tree,
                onEvent: handleComponentEvent,
                statePath: 'tree',
                styles,
                callbacks,
                utilities,
                expandedIds: fullUserState.expandedEntityIds,
                childCounts: childCounts,
                selectedId: fullUserState.activeEntityId,
                filter: fullUserState.entityFilter
                })
            )
            ),
            // Central panel: Breadcrumbs + Metadata
            React.createElement('div', {
            style: {
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                background: styles.colors.surface
            }
            },
            // Breadcrumbs
            React.createElement('div', {
                style: {
                padding: styles.spacing.sm,
                borderBottom: `1px solid ${styles.colors.border}`,
                background: styles.colors.surface,
                minHeight: 44
                },
                role: 'navigation',
                'aria-label': 'Breadcrumb Navigation'
            },
                React.createElement(EntityBreadcrumbs, {
                path: breadCrumbTrail,
                userState: fullUserState.breadcrumbs,
                onEvent: handleComponentEvent,
                statePath: 'breadcrumbs',
                styles,
                callbacks,
                utilities
                })
            ),
            // Entity Metadata
            React.createElement('div', {
                style: { flex: 1, minHeight: 0, overflow: 'auto', background: styles.colors.surface }
            },
                activeEntity && React.createElement(EntityMetadataPanel, {
                entity: activeEntity,
                fields: activeFields,
                userState: fullUserState.metadataPanel,
                onEvent: handleComponentEvent,
                statePath: 'metadataPanel',
                styles,
                callbacks,
                utilities,
                viewMode: fullUserState.viewMode,
                relationships: activeRelationships
                }),
                !activeEntity && React.createElement('div', {
                style: { padding: styles.spacing.xl, color: styles.colors.textSecondary, textAlign: 'center' }
                }, 'Select an entity from the left to view details.')
            ),
            // Toggle ERD button (only if selection)
            activeEntity && React.createElement('div', {
                style: {
                textAlign: 'right',
                borderTop: `1px solid ${styles.colors.border}`,
                padding: styles.spacing.sm,
                background: styles.colors.surface,
                minHeight: 44
                }
            },
                React.createElement('button', {
                onClick: () => handleComponentEvent({ type: 'toggleSchemaDiagram', source: 'EntityViewer', payload: {}, bubbles: true }),
                style: {
                    background: styles.colors.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: styles.borders.radius,
                    padding: `${styles.spacing.xs} ${styles.spacing.lg}`,
                    minHeight: 36,
                    cursor: 'pointer',
                    fontSize: styles.typography.fontSize.md,
                    marginLeft: styles.spacing.sm
                },
                'aria-label': (fullUserState.schemaDiagramVisible ? 'Hide schema diagram' : 'Show schema diagram')
                },
                (fullUserState.schemaDiagramVisible ? 'Hide' : 'Show') + ' Schema Diagram'
                )
            ),
            // ERD diagram, floating panel or inline
            (activeEntity && fullUserState.schemaDiagramVisible) && React.createElement('div', {
                style: {
                height: 300,
                borderTop: `1px solid ${styles.colors.border}`,
                background: styles.colors.surface,
                padding: styles.spacing.md,
                overflow: 'auto',
                position: 'relative'
                }
            },
                React.createElement(SchemaDiagram, {
                entity: activeEntity,
                relationships: activeRelationships,
                userState: fullUserState.diagram,
                onEvent: handleComponentEvent,
                statePath: 'diagram',
                styles,
                callbacks,
                utilities,
                display: true
                })
            )
            )
        ),
        // Field detail drawer
        (fullUserState.fieldDetail && activeFields.length > 0) && React.createElement(FieldDetailDrawer, {
            field: activeFields.find(f => f.ID === fullUserState.fieldDetail),
            userState: fullUserState.drawer,
            onEvent: handleComponentEvent,
            statePath: 'drawer',
            styles,
            callbacks,
            utilities,
            visible: !!fullUserState.fieldDetail,
            onClose: () => handleComponentEvent({ type: 'drawerClosed', source: 'EntityViewer', payload: {}, bubbles: true })
        }),
        // Loading & error
        (fullUserState.loading) && React.createElement('div', {
            role: 'status',
            'aria-live': 'polite',
            style: { position: 'fixed', left: 0, top: 0, right: 0, textAlign: 'center', padding: styles.spacing.md, background: styles.colors.info, color: '#fff', zIndex: 90, fontSize: styles.typography.fontSize.lg }
        }, 'Loading, please wait...'),
        (fullUserState.error && !fullUserState.loading) && React.createElement('div', {
            role: 'alert',
            style: { position: 'fixed', left: 0, top: 0, right: 0, textAlign: 'center', padding: styles.spacing.md, background: styles.colors.error, color: '#fff', zIndex: 100, fontSize: styles.typography.fontSize.lg }
        }, fullUserState.error)
        )
    );
}
