function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, createStandardEventHandler) {
  'use strict';
  
  function EntityFieldExplorer({ data, utilities, userState, callbacks, styles }) {
    const [fullUserState, setFullUserState] = useState({
      entityList: {
        search: '',
        sortBy: 'Name',
        sortAsc: true,
        selectedEntityID: null,
        ...((userState && userState.entityList) || {})
      },
      fieldsTable: {
        filter: '',
        ...((userState && userState.fieldsTable) || {})
      },
      ...userState
    });

    const updateUserState = (stateUpdate) => {
      const newState = { ...fullUserState, ...stateUpdate };
      setFullUserState(newState);
      if (callbacks?.UpdateUserState) {
        callbacks.UpdateUserState(newState);
      }
    };
    
    function EntityListTable({ data, styles, config, userState, statePath, onEvent, callbacks, utilities }) {
        // State initialization: merge persisted userState with sensible defaults
        const defaultSortField = (config.sortFields && config.sortFields.length > 0) ? config.sortFields[0] : 'Name';
        const [localState, setLocalState] = useState({
            search: '',
            sortField: userState.sortField || defaultSortField,
            sortDirection: userState.sortDirection || 'asc', // 'asc' | 'desc'
            selectedEntityID: userState.selectedEntityID || null,
            ...userState
        });

        // Update state and notify parent via onEvent
        const updateState = (newPartialState) => {
            const newState = { ...localState, ...newPartialState };
            setLocalState(newState);
            onEvent({
                type: 'stateChanged',
                source: 'EntityListTable',
                payload: {
                    statePath: statePath,
                    newState: newState
                },
                bubbles: true
            });
        };

        // Event: Search box changes
        const handleSearchChange = (e) => {
            updateState({ search: e.target.value });
        };

        // Event: Sort column header click
        const handleSortChange = (field) => {
            if (!config.sortFields.includes(field)) return;
            let direction = 'asc';
            if (localState.sortField === field) {
                direction = localState.sortDirection === 'asc' ? 'desc' : 'asc';
            }
            updateState({ sortField: field, sortDirection: direction });
        };

        // Event: Row selection (mouse click or keyboard)
        const handleRowSelect = (entityID) => {
            updateState({ selectedEntityID: entityID });
            onEvent({
                type: 'entitySelected',
                source: 'EntityListTable',
                payload: { entityID },
                bubbles: true
            });
        };

        // Keyboard navigation: store row refs
        const rowRefs = {};
        const rowOrder = [];

        // Filter data by search
        let filteredEntities = Array.isArray(data) ? data : [];
        if (config.showSearch && localState.search) {
            const s = localState.search.toLowerCase();
            filteredEntities = filteredEntities.filter(ent =>
                (ent.Name && ent.Name.toLowerCase().includes(s)) ||
                (ent.Description && ent.Description.toLowerCase().includes(s))
            );
        }

        // Sort data
        if (localState.sortField) {
            filteredEntities = filteredEntities.slice().sort((a, b) => {
                const aVal = a[localState.sortField] || '';
                const bVal = b[localState.sortField] || '';
                if (aVal === bVal) return 0;
                if (localState.sortDirection === 'asc') {
                    return aVal > bVal ? 1 : -1;
                } else {
                    return aVal < bVal ? 1 : -1;
                }
            });
        }

        // Keyboard navigation handler (up/down/enter)
        const handleTableKeyDown = (e) => {
            const idx = filteredEntities.findIndex(ent => ent.ID === localState.selectedEntityID);
            if (e.key === 'ArrowDown') {
                const nextIdx = idx < filteredEntities.length - 1 ? idx + 1 : 0;
                const nextID = filteredEntities[nextIdx]?.ID;
                if (nextID) {
                    handleRowSelect(nextID);
                    if (rowRefs[nextID] && rowRefs[nextID].current) {
                        rowRefs[nextID].current.focus();
                    }
                }
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                const prevIdx = idx > 0 ? idx - 1 : filteredEntities.length - 1;
                const prevID = filteredEntities[prevIdx]?.ID;
                if (prevID) {
                    handleRowSelect(prevID);
                    if (rowRefs[prevID] && rowRefs[prevID].current) {
                        rowRefs[prevID].current.focus();
                    }
                }
                e.preventDefault();
            } else if (e.key === 'Enter' && idx >= 0) {
                handleRowSelect(filteredEntities[idx].ID);
                e.preventDefault();
            }
        };

        // For accessibility: generate header IDs
        const tableId = `entity-list-table-\${statePath.replace(/\\./g, '-')}`;

        // Prepare styles
        const s = styles;
        const tableStyle = {
            width: '100%',
            borderCollapse: 'collapse',
            background: s.colors.surface,
            fontFamily: s.typography.fontFamily,
            fontSize: s.typography.fontSize.md,
            color: s.colors.text
        };
        const thStyle = {
            padding: s.spacing.sm,
            borderBottom: `\${s.borders.width} solid \${s.colors.border}`,
            background: s.colors.background,
            textAlign: 'left',
            cursor: 'pointer',
            userSelect: 'none',
            fontWeight: 600
        };
        const tdStyle = {
            padding: s.spacing.sm,
            borderBottom: `\${s.borders.width} solid \${s.colors.border}`,
            background: s.colors.surface
        };
        const rowStyle = (isSelected, isHover) => ({
            background: isSelected ? s.colors.primary : isHover ? s.colors.surface : s.colors.background,
            color: isSelected ? '#fff' : s.colors.text,
            outline: isSelected ? `2px solid \${s.colors.primaryHover}` : 'none',
            cursor: config.selectable ? 'pointer' : 'default',
            borderRadius: s.borders.radius
        });
        const searchBoxStyle = {
            width: '100%',
            padding: s.spacing.sm,
            marginBottom: s.spacing.sm,
            fontSize: s.typography.fontSize.md,
            border: `\${s.borders.width} solid \${s.colors.border}`,
            borderRadius: s.borders.radius,
            outline: 'none',
            background: s.colors.surface
        };

        // For accessibility: aria-sort values
        function getAriaSort(col) {
            if (localState.sortField !== col) return 'none';
            return localState.sortDirection === 'asc' ? 'ascending' : 'descending';
        }

        // For row focus: create refs for each row
        filteredEntities.forEach(ent => {
            if (!rowRefs[ent.ID]) {
                rowRefs[ent.ID] = React.createRef();
            }
            rowOrder.push(ent.ID);
        });

        // Render
        return (
            <div style={{ background: s.colors.background, padding: s.spacing.md, borderRadius: s.borders.radius, overflow: s.overflow }}>
                {config.showSearch && (
                    <input
                        type="text"
                        aria-label="Search entities"
                        placeholder="Search entities..."
                        value={localState.search}
                        onChange={handleSearchChange}
                        style={searchBoxStyle}
                        autoComplete="off"
                    />
                )}
                <div style={{ overflowX: 'auto', borderRadius: s.borders.radius }}>
                    <table
                        id={tableId}
                        style={tableStyle}
                        aria-label="Entity list"
                        role="grid"
                        tabIndex={0}
                        onKeyDown={handleTableKeyDown}
                    >
                        <thead>
                            <tr>
                                <th
                                    style={thStyle}
                                    scope="col"
                                    tabIndex={0}
                                    onClick={() => handleSortChange('Name')}
                                    aria-sort={getAriaSort('Name')}
                                >
                                    Name {localState.sortField === 'Name' && (localState.sortDirection === 'asc' ? '?' : '?')}
                                </th>
                                <th
                                    style={thStyle}
                                    scope="col"
                                    tabIndex={0}
                                    onClick={() => handleSortChange('Description')}
                                    aria-sort={getAriaSort('Description')}
                                >
                                    Description {localState.sortField === 'Description' && (localState.sortDirection === 'asc' ? '?' : '?')}
                                </th>
                                <th
                                    style={thStyle}
                                    scope="col"
                                    tabIndex={0}
                                    onClick={() => handleSortChange('Status')}
                                    aria-sort={getAriaSort('Status')}
                                >
                                    Status {localState.sortField === 'Status' && (localState.sortDirection === 'asc' ? '?' : '?')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEntities.length === 0 && (
                                <tr>
                                    <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: s.colors.textSecondary }}>
                                        No entities found.
                                    </td>
                                </tr>
                            )}
                            {filteredEntities.map((ent, idx) => {
                                const isSelected = ent.ID === localState.selectedEntityID;
                                return (
                                    <tr
                                        key={ent.ID}
                                        ref={rowRefs[ent.ID]}
                                        tabIndex={0}
                                        aria-selected={isSelected}
                                        role="row"
                                        style={rowStyle(isSelected, false)}
                                        onClick={() => config.selectable && handleRowSelect(ent.ID)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                if (config.selectable) handleRowSelect(ent.ID);
                                                e.preventDefault();
                                            }
                                        }}
                                    >
                                        <td style={tdStyle}>{ent.Name}</td>
                                        <td style={tdStyle}>{ent.Description}</td>
                                        <td style={tdStyle}>{ent.Status}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    function EntityFieldsTable({ data, styles, config, userState, statePath, onEvent, callbacks, utilities }) {
        // Initialize state with defaults and merge userState (never use ||)
        const [localState, setLocalState] = useState({
            filter: '',
            sortBy: 'name',
            sortDirection: 'asc',
            ...userState
        });

        // Update state and notify parent
        const updateState = (newPartialState) => {
            const newState = { ...localState, ...newPartialState };
            setLocalState(newState);
            onEvent({
                type: 'stateChanged',
                source: 'EntityFieldsTable',
                payload: {
                    statePath: statePath,
                    newState: newState
                },
                bubbles: true
            });
        };

        // Filter function
        const getFilteredFields = () => {
            let fields = Array.isArray(data) ? data : [];
            if (config && config.showFilter && localState.filter) {
                const filterText = localState.filter.toLowerCase();
                fields = fields.filter(f => {
                    const name = (f.name || '').toLowerCase();
                    const desc = (f.description || '').toLowerCase();
                    return name.includes(filterText) || desc.includes(filterText);
                });
            }
            return fields;
        };

        // Sorting
        const getSortedFields = (fields) => {
            const { sortBy, sortDirection } = localState;
            if (!sortBy) return fields;
            return [...fields].sort((a, b) => {
                let aVal = a[sortBy];
                let bVal = b[sortBy];
                // Special handling for booleans and strings
                if (typeof aVal === 'boolean' || typeof bVal === 'boolean') {
                    aVal = !!aVal ? 1 : 0;
                    bVal = !!bVal ? 1 : 0;
                } else if (typeof aVal === 'string' && typeof bVal === 'string') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }
                if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        };

        const handleFilterChange = (e) => {
            updateState({ filter: e.target.value });
        };

        // Table column sort handler
        const handleSort = (column) => {
            if (localState.sortBy === column) {
                updateState({ sortDirection: localState.sortDirection === 'asc' ? 'desc' : 'asc' });
            } else {
                updateState({ sortBy: column, sortDirection: 'asc' });
            }
        };

        // Always update if userState prop changes (eg. entity selection changes in parent)
        useEffect(() => {
            setLocalState({
                filter: '',
                sortBy: 'name',
                sortDirection: 'asc',
                ...userState
            });
        }, [userState, data]);

        // Prepare filtered/sorted fields
        let filteredFields = getFilteredFields();
        let sortedFields = getSortedFields(filteredFields);

        // Column configuration
        const columns = [
            { key: 'name', label: 'Field Name', sortable: true },
            config && config.showTypes ? { key: 'type', label: 'Type', sortable: true } : null,
            { key: 'allowsNull', label: 'Allows Null', sortable: true },
            { key: 'isPrimaryKey', label: 'Is Primary Key', sortable: true },
            { key: 'isUnique', label: 'Is Unique', sortable: true },
            { key: 'description', label: 'Description', sortable: false }
        ].filter(Boolean);

        // Style helpers
        const s = styles || {};
        const tableStyle = {
            width: '100%',
            borderCollapse: 'collapse',
            background: s.colors?.surface || '#f8f9fa',
            fontFamily: s.typography?.fontFamily,
            fontSize: s.typography?.fontSize?.md,
            color: s.colors?.text,
            borderRadius: s.borders?.radius,
            overflow: s.overflow || 'auto',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
        };
        const thStyle = {
            background: s.colors?.background || '#fff',
            color: s.colors?.textSecondary || '#656565',
            fontWeight: 600,
            fontSize: s.typography?.fontSize?.sm,
            textAlign: 'left',
            padding: s.spacing?.sm || '8px',
            borderBottom: `\${s.borders?.width || '1px'} solid \${s.colors?.border || '#e2e8f0'}`,
            cursor: 'pointer',
            userSelect: 'none'
        };
        const tdStyle = {
            padding: s.spacing?.sm || '8px',
            borderBottom: `\${s.borders?.width || '1px'} solid \${s.colors?.border || '#e2e8f0'}`,
            fontSize: s.typography?.fontSize?.sm,
            background: s.colors?.surface || '#f8f9fa',
            verticalAlign: 'top'
        };
        const filterBoxStyle = {
            marginBottom: s.spacing?.sm || '8px',
            padding: s.spacing?.sm || '8px',
            border: `\${s.borders?.width || '1px'} solid \${s.colors?.border || '#e2e8f0'}`,
            borderRadius: s.borders?.radius || '4px',
            fontSize: s.typography?.fontSize?.sm,
            width: '100%',
            background: s.colors?.background || '#fff',
            color: s.colors?.text || '#333'
        };
        const boolCellStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: s.spacing?.xs || '4px',
            fontWeight: 500
        };
        // Render sort indicator
        const renderSortIcon = (col) => {
            if (!col.sortable) return null;
            if (localState.sortBy !== col.key) return <span style={{ opacity: 0.3, marginLeft: 4 }}>&#8597;</span>;
            return (
                <span style={{ marginLeft: 4 }}>
                    {localState.sortDirection === 'asc' ? '\\u25B2' : '\\u25BC'}
                </span>
            );
        };

        // Render boolean cell with icon/text
        const renderBool = (val) => val ? (
            <span style={{ color: s.colors?.success || '#4caf50', ...boolCellStyle }}>?</span>
        ) : (
            <span style={{ color: s.colors?.border || '#e2e8f0', ...boolCellStyle }}>—</span>
        );

        return (
            <div style={{ width: '100%' }}>
                {config && config.showFilter && (
                    <input
                        type="text"
                        aria-label="Filter fields"
                        style={filterBoxStyle}
                        placeholder="Filter by name or description..."
                        value={localState.filter || ''}
                        onChange={handleFilterChange}
                    />
                )}
                <div style={{ overflowX: 'auto', borderRadius: s.borders?.radius }}>
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        style={thStyle}
                                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                        tabIndex={col.sortable ? 0 : -1}
                                        aria-sort={localState.sortBy === col.key ? (localState.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                                    >
                                        {col.label}
                                        {renderSortIcon(col)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedFields.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} style={{ ...tdStyle, textAlign: 'center', color: s.colors?.textSecondary }}>
                                        No fields found.
                                    </td>
                                </tr>
                            ) : (
                                sortedFields.map((f, idx) => (
                                    <tr key={f.name || idx}>
                                        <td style={tdStyle}>{f.displayName || f.name}</td>
                                        {config && config.showTypes ? <td style={tdStyle}>{f.type}</td> : null}
                                        <td style={tdStyle}>{renderBool(f.allowsNull)}</td>
                                        <td style={tdStyle}>{renderBool(f.isPrimaryKey)}</td>
                                        <td style={tdStyle}>{renderBool(f.isUnique)}</td>
                                        <td style={tdStyle}>{f.description || ''}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }


    const handleComponentEvent = createStandardEventHandler(updateUserState, callbacks);

    // Find selected entityID and filter fields accordingly
    const entities = data?.data_item_0 || [];
    const fields = data?.data_item_2 || [];
    const selectedEntityID = fullUserState.entityList.selectedEntityID;
    const selectedFields = selectedEntityID ? fields.filter(f => f.EntityID === selectedEntityID) : [];

    return (
      <div style={{ display: 'flex', flexDirection: 'row', background: styles?.colors?.surface, padding: styles?.spacing?.md }}>
        <EntityListTable
          data={entities}
          config={{ showSearch: true, selectable: true, sortFields: ['Name', 'Status'] }}
          userState={fullUserState.entityList || {}}
          onEvent={handleComponentEvent}
          styles={styles}
          callbacks={callbacks}
          utilities={utilities}
          statePath="entityList"
        />
        <div style={{ marginLeft: styles?.spacing?.lg, flex: 1 }}>
          <EntityFieldsTable
            data={selectedFields}
            config={{ showFilter: true, showTypes: true }}
            userState={fullUserState.fieldsTable || {}}
            onEvent={handleComponentEvent}
            styles={styles}
            callbacks={callbacks}
            utilities={utilities}
            statePath="fieldsTable"
          />
        </div>
      </div>
    );
  }

  return {
    component: EntityFieldExplorer,
    print: function() { window.print(); },
    refresh: function() { /* optional */ }
  };
}