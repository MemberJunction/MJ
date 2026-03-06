function AIModelBrowser({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Extract child components
  const { AIModelList, AIModelDetails, AIModelFilter, AIModelAnalytics } = components;
  console.log('=== AIModelBrowser initialized with callbacks:', callbacks);
  
  // Initialize state from saved settings where appropriate
  const [selectedModelId, setSelectedModelId] = useState(savedUserSettings?.selectedModelId);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'grid');
  const [filters, setFilters] = useState(savedUserSettings?.filters || {});
  const [sortBy, setSortBy] = useState(savedUserSettings?.sortBy || 'Name');
  const [sortDirection, setSortDirection] = useState(savedUserSettings?.sortDirection || 'asc');
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(savedUserSettings?.filterPanelCollapsed || false);
  const [analyticsView, setAnalyticsView] = useState(savedUserSettings?.analyticsView || 'prompts');
  
  // Runtime UI state (not persisted)
  const [models, setModels] = useState([]);
  const [modelVendors, setModelVendors] = useState([]);
  const [promptRuns, setPromptRuns] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [modelTypes, setModelTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Load models on mount and when filters/sort change
  useEffect(() => {
    const loadModels = async () => {
      console.log('=== Loading models with filters:', filters, 'search:', searchQuery);
      setLoading(true);
      try {
        // Build filter string for models
        let filterParts = [];
        if (searchQuery) {
          filterParts.push(`(Name LIKE '%${searchQuery}%' OR APIName LIKE '%${searchQuery}%' OR Description LIKE '%${searchQuery}%')`);
        }
        if (filters.modelType) {
          filterParts.push(`AIModelTypeID = '${filters.modelType}'`);
        }
        if (filters.isActive !== undefined) {
          filterParts.push(`IsActive = '${filters.isActive}'`);
        }
        
        // Load AI Models
        const modelsResult = await utilities.rv.RunView({
          EntityName: 'MJ: AI Models',
          Fields: ['ID', 'Name', 'APIName', 'Description', 'AIModelTypeID', 'InputTokenLimit', 
                   'CostRank', 'IsActive', '__mj_CreatedAt', '__mj_UpdatedAt'],
          OrderBy: `${sortBy} ${sortDirection.toUpperCase()}`,
          ExtraFilter: filterParts.length > 0 ? filterParts.join(' AND ') : undefined
        });
        
        if (modelsResult?.Success && modelsResult?.Results) {
          console.log(`Loaded ${modelsResult.Results.length} models`);
          setModels(modelsResult.Results);
        } else {
          console.error('Failed to load models:', modelsResult?.ErrorMessage);
          setModels([]);
        }
        
        // Load Model Types for filter
        const typesResult = await utilities.rv.RunView({
          EntityName: 'MJ: AI Model Types',
          Fields: ['ID', 'Name', 'Description'],
          OrderBy: 'Name ASC'
        });
        
        if (typesResult?.Success && typesResult?.Results) {
          setModelTypes(typesResult.Results);
        }
        
        // Load Vendors (from AI Model Vendors)
        const vendorsResult = await utilities.rv.RunView({
          EntityName: 'MJ: AI Model Vendors',
          Fields: ['ID', 'ModelID', 'VendorID', 'TypeID', 'Model', 'Vendor', 'Type', 'Status', 'Priority'],
          OrderBy: 'Vendor ASC, Model ASC'
        });
        
        if (vendorsResult?.Success && vendorsResult?.Results) {
          const vendorData = vendorsResult.Results;
          console.log(`Loaded ${vendorData.length} vendor associations`);
          setModelVendors(vendorData);
          
          // Extract unique vendors
          const uniqueVendors = [...new Set(vendorData.map(v => v.Vendor))].filter(Boolean);
          setVendors(uniqueVendors.map(name => ({ Name: name })));
          console.log(`Found ${uniqueVendors.length} unique vendors`);
          
          // Apply vendor-based filters
          if ((filters.developer || filters.provider) && modelsResult?.Results) {
            console.log('Applying vendor filters - developer:', filters.developer, 'provider:', filters.provider);
            let vendorFilteredModels = modelsResult.Results;
            
            if (filters.developer) {
              const developerModelIds = vendorData
                .filter(v => v.Vendor === filters.developer && v.Type?.includes('Developer'))
                .map(v => v.ModelID);
              vendorFilteredModels = vendorFilteredModels.filter(m => developerModelIds.includes(m.ID));
              console.log(`After developer filter: ${vendorFilteredModels.length} models`);
            }
            
            if (filters.provider) {
              const providerModelIds = vendorData
                .filter(v => v.Vendor === filters.provider && v.Type?.includes('Provider'))
                .map(v => v.ModelID);
              vendorFilteredModels = vendorFilteredModels.filter(m => providerModelIds.includes(m.ID));
              console.log(`After provider filter: ${vendorFilteredModels.length} models`);
            }
            
            setModels(vendorFilteredModels);
          }
        }
      } catch (error) {
        console.error('Error loading models:', error);
        setModels([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadModels();
  }, [filters, sortBy, sortDirection, searchQuery]);
  
  // Load model details and analytics when selection changes
  useEffect(() => {
    const loadModelDetails = async () => {
      if (!selectedModelId) {
        setPromptRuns([]);
        return;
      }
      
      console.log('=== Loading prompt runs for model:', selectedModelId);
      
      try {
        // Use the correct entity name for prompt runs: MJ: AI Prompt Runs
        console.log('Loading prompt runs with entity: MJ: AI Prompt Runs');
        
        const promptRunsResult = await utilities.rv.RunView({
          EntityName: 'MJ: AI Prompt Runs',
          Fields: ['ID', 'PromptID', 'ModelID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 
                   'TokensPrompt', 'TokensCompletion', 'TokensUsed', 'Success', 'ErrorMessage'],
          OrderBy: 'RunAt DESC',
            ExtraFilter: `ModelID = '${selectedModelId}'`,
            MaxRows: 1000
        });
        
        if (promptRunsResult?.Success && promptRunsResult?.Results) {
          console.log(`Found ${promptRunsResult.Results.length} prompt runs`);
          // Enrich with prompt names
          const promptIds = [...new Set(promptRunsResult.Results.map(r => r.PromptID))].filter(Boolean);
          
          if (promptIds.length > 0) {
            const promptsResult = await utilities.rv.RunView({
              EntityName: 'MJ: AI Prompts',
              Fields: ['ID', 'Name', 'Description', 'CategoryID'],
              ExtraFilter: `ID IN ('${promptIds.join("','")}')`
            });
            
            const promptMap = {};
            if (promptsResult?.Success && promptsResult?.Results) {
              promptsResult.Results.forEach(p => {
                promptMap[p.ID] = p;
              });
            }
            
            // Enrich prompt runs with prompt names and convert fields for compatibility
            const enrichedRuns = promptRunsResult.Results.map(run => ({
              ...run,
              PromptName: promptMap[run.PromptID]?.Name || 'Unknown Prompt',
              PromptDescription: promptMap[run.PromptID]?.Description,
              // Map fields for analytics component compatibility
              StartTime: run.RunAt,
              EndTime: run.CompletedAt,
              TotalExecutionTime: run.ExecutionTimeMS,
              Status: run.Success ? 'Success' : 'Failed',
              Error: run.ErrorMessage,
              TotalTokens: run.TokensUsed
            }));
            
            console.log(`Enriched ${enrichedRuns.length} runs with prompt names`);
            setPromptRuns(enrichedRuns);
          } else {
            setPromptRuns(promptRunsResult.Results);
          }
        } else {
          console.log('No prompt runs found:', promptRunsResult?.ErrorMessage);
          setPromptRuns([]);
        }
      } catch (error) {
        console.error('Error loading model details:', error);
        setPromptRuns([]);
      }
    };
    
    loadModelDetails();
  }, [selectedModelId]);
  
  // Handle model selection
  const handleSelectModel = useCallback((modelId) => {
    setSelectedModelId(modelId);
    setDetailsPanelOpen(true);
    
    // Save user preference
    onSaveUserSettings?.({
      ...savedUserSettings,
      selectedModelId: modelId
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
  
  // Handle analytics view change
  const handleAnalyticsViewChange = useCallback((view) => {
    setAnalyticsView(view);
    
    // Save preference
    onSaveUserSettings?.({
      ...savedUserSettings,
      analyticsView: view
    });
  }, [savedUserSettings, onSaveUserSettings]);
  
  // Handle opening model record (kept for backward compatibility with details panel)
  const handleOpenRecord = useCallback((modelName) => {
    console.log('Opening AI Model record:', modelName);
    if (callbacks?.OpenEntityRecord && modelName) {
      callbacks.OpenEntityRecord('MJ: AI Models', [{ FieldName: 'Name', Value: modelName }]);
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
  
  // Get selected model object
  const selectedModel = models.find(m => m.ID === selectedModelId);
  
  // Get vendors for selected model
  const selectedModelVendors = modelVendors.filter(v => v.ModelID === selectedModelId);
  
  // Helper function to get border radius value
  const getBorderRadius = (size) => {
    return typeof styles?.borders?.radius === 'object' ? styles?.borders?.radius?.[size] : styles?.borders?.radius || '4px';
  };
  
  // Loading state
  if (loading && models.length === 0) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: styles.typography.fontSize.lg,
        color: styles.colors.textSecondary
      }}>
        Loading AI models...
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
      {AIModelFilter && (
        <AIModelFilter
          filters={filters}
          onFilterChange={handleFilterChange}
          modelTypes={modelTypes}
          vendors={vendors}
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
              AI Model Browser
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
                onClick={() => handleViewModeChange('list')}
                style={{
                  padding: `${styles.spacing.sm} ${styles.spacing.md}`,
                  backgroundColor: viewMode === 'list' ? styles.colors.primary : styles.colors.background,
                  color: viewMode === 'list' ? 'white' : styles.colors.text,
                  border: `1px solid ${styles.colors.border}`,
                  borderRadius: getBorderRadius('sm'),
                  cursor: 'pointer',
                  fontSize: styles.typography.fontSize.md
                }}
              >
                List
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
              placeholder="Search AI models..."
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
        
        {/* Model List and Analytics Split View */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden'
        }}>
          {/* Model List */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: styles.spacing.lg
          }}>
            {AIModelList && (
              <AIModelList
                models={models}
                modelVendors={modelVendors}
                viewMode={viewMode}
                selectedModelId={selectedModelId}
                onSelectModel={handleSelectModel}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
                savedUserSettings={savedUserSettings?.modelList}
                onSaveUserSettings={(settings) => onSaveUserSettings?.({
                  ...savedUserSettings,
                  modelList: settings
                })}
                utilities={utilities}
                styles={styles}
                components={components}
                callbacks={callbacks}
              />
            )}
            
            {/* Empty State */}
            {models.length === 0 && !loading && (
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
                  No AI models found
                </div>
                <div style={{
                  fontSize: styles.typography.fontSize.md
                }}>
                  {searchQuery || Object.keys(filters).length > 0
                    ? 'Try adjusting your filters or search query'
                    : 'No AI models are available'}
                </div>
              </div>
            )}
          </div>
          
          {/* Analytics Panel */}
          {selectedModel && AIModelAnalytics && (
            <div style={{
              width: '400px',
              borderLeft: `1px solid ${styles.colors.border}`,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <AIModelAnalytics
                model={selectedModel}
                promptRuns={promptRuns}
                view={analyticsView}
                onViewChange={handleAnalyticsViewChange}
                savedUserSettings={savedUserSettings?.analytics}
                onSaveUserSettings={(settings) => onSaveUserSettings?.({
                  ...savedUserSettings,
                  analytics: settings
                })}
                utilities={utilities}
                styles={styles}
                components={components}
                callbacks={callbacks}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Details Panel */}
      {AIModelDetails && (
        <AIModelDetails
          model={selectedModel}
          vendors={selectedModelVendors}
          promptRuns={promptRuns}
          isOpen={detailsPanelOpen}
          onClose={handleCloseDetails}
          onOpenRecord={() => handleOpenRecord(selectedModel?.Name)}
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