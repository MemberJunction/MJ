function EntityGrid({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Initialize with null to indicate "not yet loaded" state
  // DataGrid will show loading spinner when data is null
  const [entities, setEntities] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  

  // Get DataGrid component from registry
  // This demonstrates component composition via registry lookup
  const { DataGrid } = components;

  // Load entities on mount using RunView
  React.useEffect(() => {
    async function loadEntities() {
      try {
        setLoading(true);
        setError(null);
        
        // Use RunView to fetch all entities from the system
        const result = await utilities.rv.RunView({
          EntityName: 'MJ: Entities' // MJ entity name for entities metadata
        });
        
        if (result.Success) {
          // Set entities to empty array if no results to avoid null issues
          setEntities(result.Results || []);
        } else {
          setError(result.ErrorMessage || 'Failed to load entities');
          // Set entities to empty array on error so DataGrid doesn't break
          setEntities([]);
        }
      } catch (err) {
        setError(err.message || 'Error loading entities');
        console.error('Error loading entities:', err);
        // Set entities to empty array on error so DataGrid doesn't break
        setEntities([]);
      } finally {
        setLoading(false);
      }
    }
    
    loadEntities();
  }, [utilities]);
  
  // Define columns for the grid
  // These are optimized for entity viewing - showing most relevant info
  const columns = [
    'Name',
    'DisplayName',
    'Description',
    'SchemaName',
    'BaseTable',
    'Status',
    '__mj_CreatedAt'
  ];
  
  // Define which fields to search when user types in filter box
  // Include more fields for comprehensive searching
  const filterFields = [
    'Name',
    'DisplayName',
    'Description',
    'SchemaName',
    'BaseTable',
    'BaseView',
    'Status'
  ];
  
  // Error state: Failed to load entities
  // Shows the specific error message to help with debugging
  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#ff4d4f' }}>
        Error loading entities: {error}
      </div>
    );
  }
  
  // Render the DataGrid with our entity data
  // The DataGrid handles all the UI - we just provide the data and configuration
  // Note: entities is null during initial load, which DataGrid handles by showing a spinner
  // Wrapped in a div with padding for better visual spacing
  return (
    <div style={{ padding: '10px', width: '100%' }}>
      <DataGrid
        entityName="MJ: Entities"
        data={entities}  // null initially, then array of entity objects
        columns={columns}
        filterFields={filterFields}
        utilities={utilities}
        styles={styles}
        components={components}
        callbacks={callbacks}
        savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
      />
    </div>
  );
}