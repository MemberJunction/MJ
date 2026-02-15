function EntityBrowser({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Extract child components
  const { EntityList, EntityDetails, EntityFilter } = components;
  
  // Initialize state from saved settings where appropriate
  const [selectedEntityId, setSelectedEntityId] = useState(savedUserSettings?.selectedEntityId);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'grid');
  const [filters, setFilters] = useState(savedUserSettings?.filters || {});
  const [sortBy, setSortBy] = useState(savedUserSettings?.sortBy || 'Name');
  const [sortDirection, setSortDirection] = useState(savedUserSettings?.sortDirection || 'asc');
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(savedUserSettings?.filterPanelCollapsed || false);
  
  // Runtime UI state (not persisted)
  const [entities, setEntities] = useState([]);
  const [entityFields, setEntityFields] = useState([]);
  const [entityRelationships, setEntityRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uniqueSchemas, setUniqueSchemas] = useState([]);
  const [uniqueTables, setUniqueTables] = useState([]);
  
  // Load entities on mount and when filters/sort change
  useEffect(() => {
    const loadEntities = async () => {
      setLoading(true);
      try {
        // Build filter string
        let filterParts = [];
        if (filters.schema) {
          filterParts.push(`SchemaName = '${filters.schema}'`);
        }
        if (filters.table) {
          filterParts.push(`BaseTable = '${filters.table}'`);
        }
        if (searchQuery) {
          filterParts.push(`(Name LIKE '%${searchQuery}%' OR DisplayName LIKE '%${searchQuery}%' OR Description LIKE '%${searchQuery}%')`);
        }
        
        const result = await utilities.rv.RunView({
          EntityName: 'MJ: Entities',
          Fields: ['ID', 'Name', 'DisplayName', 'NameSuffix', 'Description', 'SchemaName', 'BaseTable', 'BaseView'],
          OrderBy: `${sortBy} ${sortDirection.toUpperCase()}`,
          ExtraFilter: filterParts.length > 0 ? filterParts.join(' AND ') : undefined
        });
        
        if (result?.Success && result?.Results) {
          setEntities(result.Results);
          
          // Extract unique schemas and tables for filter dropdowns
          const schemas = [...new Set(result.Results.map(e => e.SchemaName).filter(Boolean))];
          const tables = [...new Set(result.Results.map(e => e.BaseTable).filter(Boolean))];
          setUniqueSchemas(schemas);
          setUniqueTables(tables);
        } else {
          console.error('Failed to load entities:', result?.ErrorMessage);
          setEntities([]);
        }
      } catch (error) {
        console.error('Error loading entities:', error);
        setEntities([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadEntities();
  }, [filters, sortBy, sortDirection, searchQuery]);
  
  // Load entity details when selection changes
  useEffect(() => {
    const loadEntityDetails = async () => {
      if (!selectedEntityId) {
        setEntityFields([]);
        setEntityRelationships([]);
        return;
      }
      
      try {
        // Load fields
        const fieldsResult = await utilities.rv.RunView({
          EntityName: 'MJ: Entity Fields',
          Fields: ['Name', 'DisplayName', 'Type', 'Length', 'AllowsNull', 'IsPrimaryKey', 'IsUnique', 'Sequence'],
          OrderBy: 'Sequence ASC, Name ASC',
          ExtraFilter: `EntityID = '${selectedEntityId}'`
        });
        
        if (fieldsResult?.Success && fieldsResult?.Results) {
          setEntityFields(fieldsResult.Results);
        } else {
          setEntityFields([]);
        }
        
        // Load relationships
        const relationshipsResult = await utilities.rv.RunView({
          EntityName: 'MJ: Entity Relationships',
          Fields: ['RelatedEntity', 'Type', 'DisplayName', 'RelatedEntityJoinField', 'Sequence'],
          OrderBy: 'Sequence ASC, RelatedEntity ASC',
          ExtraFilter: `EntityID = '${selectedEntityId}'`
        });
        
        if (relationshipsResult?.Success && relationshipsResult?.Results) {
          setEntityRelationships(relationshipsResult.Results);
        } else {
          setEntityRelationships([]);
        }
      } catch (error) {
        console.error('Error loading entity details:', error);
        setEntityFields([]);
        setEntityRelationships([]);
      }
    };
    
    loadEntityDetails();
  }, [selectedEntityId]);
  
  // Handle entity selection
  const handleSelectEntity = useCallback((entityId) => {
    setSelectedEntityId(entityId);
    setDetailsPanelOpen(true);
    
    // Save user preference
    onSaveUserSettings?.({
      ...savedUserSettings,
      selectedEntityId: entityId
    });
  }, [savedUserSettings, onSaveUserSettings]);
  
  // Handle view mode change
  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);
    
    // Save preference
    onSaveUserSettings?.({
      ...savedUserSettings,
      viewMode: mode
    });
  }, [savedUserSettings, onSaveUserSettings]);
  
  // Handle filter changes
  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    
    // Save filter preferences
    onSaveUserSettings?.({
      ...savedUserSettings,
      filters: newFilters
    });
  }, [savedUserSettings, onSaveUserSettings]);
  
  // Handle sort changes
  const handleSortChange = useCallback((newSortBy, newSortDirection) => {
    setSortBy(newSortBy);
    setSortDirection(newSortDirection);
    
    // Save sort preferences
    onSaveUserSettings?.({
      ...savedUserSettings,
      sortBy: newSortBy,
      sortDirection: newSortDirection
    });
  }, [savedUserSettings, onSaveUserSettings]);
  
  // Handle filter panel toggle
  const handleToggleFilter = useCallback(() => {
    const newCollapsed = !filterPanelCollapsed;
    setFilterPanelCollapsed(newCollapsed);
    
    // Save collapsed state
    onSaveUserSettings?.({
      ...savedUserSettings,
      filterPanelCollapsed: newCollapsed
    });
  }, [filterPanelCollapsed, savedUserSettings, onSaveUserSettings]);
  
  // Handle opening entity record (kept for backward compatibility with details panel)
  const handleOpenRecord = useCallback((entityName) => {
    console.log('Root handleOpenRecord called with entityName:', entityName);
    console.log('Callbacks object:', callbacks);
    if (callbacks?.OpenEntityRecord && entityName) {
      console.log('Calling OpenEntityRecord callback with:', 'MJ: Entities', entityName);
      // Open the Entities entity record for the selected entity
      callbacks.OpenEntityRecord('MJ: Entities', [{ FieldName: 'Name', Value: entityName }]);
    } else {
      console.error('OpenEntityRecord callback not available or entityName missing');
    }
  }, [callbacks]);
  
  // Handle closing details panel
  const handleCloseDetails = useCallback(() => {
    setDetailsPanelOpen(false);
  }, []);
  
  // Handle search
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
  }, []);
  
  // Get selected entity object
  const selectedEntity = entities.find(e => e.ID === selectedEntityId);
  
  // Helper function to get border radius value
  const getBorderRadius = (size) => {
    return typeof styles?.borders?.radius === 'object' ? styles?.borders?.radius?.[size] : styles?.borders?.radius;
  };
  
  // Loading state
  if (loading && entities.length === 0) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: styles.typography.fontSize.lg,
        color: styles.colors.textSecondary
      }}>
        Loading entities...
      </div>
    );
  }
  
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: styles.colors.background,
      overflow: 'hidden'
    }}>
      {/* Filter Panel */}
      {EntityFilter && (
        <EntityFilter
          filters={filters}
          onFilterChange={handleFilterChange}
          schemas={uniqueSchemas}
          tables={uniqueTables}
          isCollapsed={filterPanelCollapsed}
          onToggleCollapse={handleToggleFilter}
          savedUserSettings={savedUserSettings?.filterPanel}
          onSaveUserSettings={(settings) => onSaveUserSettings?.({
            ...savedUserSettings,
            filterPanel: settings
          })}
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
        />
      )}
      
      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: styles.spacing.lg,
          borderBottom: `1px solid ${styles.colors.border}`,
          backgroundColor: styles.colors.surface
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: styles.spacing.md
          }}>
            <h1 style={{
              margin: 0,
              fontSize: styles.typography.fontSize.xxl || styles.typography.fontSize.xl,
              fontWeight: styles.typography.fontWeight?.bold || '700',
              color: styles.colors.text
            }}>
              Entity Browser
            </h1>
            
            {/* View Mode Toggle */}
            <div style={{
              display: 'flex',
              gap: styles.spacing.sm,
              alignItems: 'center'
            }}>
              <span style={{
                fontSize: styles.typography.fontSize.md,
                color: styles.colors.textSecondary
              }}>
                View:
              </span>
              <button
                onClick={() => handleViewModeChange('grid')}
                style={{
                  padding: `${styles.spacing.sm} ${styles.spacing.md}`,
                  backgroundColor: viewMode === 'grid' ? styles.colors.primary : styles.colors.background,
                  color: viewMode === 'grid' ? 'white' : styles.colors.text,
                  border: `1px solid ${styles.colors.border}`,
                  borderRadius: getBorderRadius('sm'),
                  cursor: 'pointer',
                  fontSize: styles.typography.fontSize.md
                }}
              >
                Grid
              </button>
              <button
                onClick={() => handleViewModeChange('card')}
                style={{
                  padding: `${styles.spacing.sm} ${styles.spacing.md}`,
                  backgroundColor: viewMode === 'card' ? styles.colors.primary : styles.colors.background,
                  color: viewMode === 'card' ? 'white' : styles.colors.text,
                  border: `1px solid ${styles.colors.border}`,
                  borderRadius: getBorderRadius('sm'),
                  cursor: 'pointer',
                  fontSize: styles.typography.fontSize.md
                }}
              >
                Cards
              </button>
            </div>
          </div>
          
          {/* Search Bar */}
          <div style={{
            display: 'flex',
            gap: styles.spacing.md
          }}>
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                flex: 1,
                padding: styles.spacing.md,
                fontSize: styles.typography.fontSize.md,
                border: `1px solid ${styles.colors.border}`,
                borderRadius: getBorderRadius('sm'),
                backgroundColor: styles.colors.background
              }}
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch('')}
                style={{
                  padding: `${styles.spacing.sm} ${styles.spacing.md}`,
                  backgroundColor: styles.colors.surfaceHover || styles.colors.surface,
                  color: styles.colors.text,
                  border: `1px solid ${styles.colors.border}`,
                  borderRadius: getBorderRadius('sm'),
                  cursor: 'pointer',
                  fontSize: styles.typography.fontSize.md
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        {/* Entity List */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: styles.spacing.lg
        }}>
          {EntityList && (
            <EntityList
              entities={entities}
              viewMode={viewMode}
              selectedEntityId={selectedEntityId}
              onSelectEntity={handleSelectEntity}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              savedUserSettings={savedUserSettings?.entityList}
              onSaveUserSettings={(settings) => onSaveUserSettings?.({
                ...savedUserSettings,
                entityList: settings
              })}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          )}
          
          {/* Empty State */}
          {entities.length === 0 && !loading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: styles.spacing.xxl || styles.spacing.xl,
              color: styles.colors.textSecondary
            }}>
              <div style={{
                fontSize: styles.typography.fontSize.xl,
                marginBottom: styles.spacing.md
              }}>
                No entities found
              </div>
              <div style={{
                fontSize: styles.typography.fontSize.md
              }}>
                {searchQuery || Object.keys(filters).length > 0
                  ? 'Try adjusting your filters or search query'
                  : 'No entities are available'}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Details Panel */}
      {EntityDetails && (
        <EntityDetails
          entity={selectedEntity}
          fields={entityFields}
          relationships={entityRelationships}
          isOpen={detailsPanelOpen}
          onClose={handleCloseDetails}
          onOpenRecord={() => handleOpenRecord(selectedEntity?.Name)}
          savedUserSettings={savedUserSettings?.detailsPanel}
          onSaveUserSettings={(settings) => onSaveUserSettings?.({
            ...savedUserSettings,
            detailsPanel: settings
          })}
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
        />
      )}
    </div>
  );
}