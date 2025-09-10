function QueryGrid({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Initialize with null to indicate "not yet loaded" state
  // DataGrid will show loading spinner when data is null
  const [queries, setQueries] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  

  // Get DataGrid component from registry
  // This demonstrates component composition via registry lookup
  const { DataGrid } = components;

  // Load queries on mount using RunView
  React.useEffect(() => {
    async function loadQueries() {
      try {
        setLoading(true);
        setError(null);
        
        // Use RunView to fetch all queries from the system
        const result = await utilities.rv.RunView({
          EntityName: 'Queries' // MJ entity name for queries
        });
        
        if (result.Success) {
          // Set queries to empty array if no results to avoid null issues
          setQueries(result.Results || []);
        } else {
          setError(result.ErrorMessage || 'Failed to load queries');
          // Set queries to empty array on error so DataGrid doesn't break
          setQueries([]);
        }
      } catch (err) {
        setError(err.message || 'Error loading queries');
        console.error('Error loading queries:', err);
        // Set queries to empty array on error so DataGrid doesn't break
        setQueries([]);
      } finally {
        setLoading(false);
      }
    }
    
    loadQueries();
  }, [utilities]);
  
  // Define which fields to display in the grid
  // These are optimized for query viewing - showing most relevant info
  const displayFields = [
    'Name',
    'Description', 
    'Category',
    'Status',
    '__mj_UpdatedAt'
  ];
  
  // Define which fields to search when user types in filter box
  // Include SQL field for searching even though we don't display it
  const filterFields = [
    'Name',
    'Description',
    'Category' 
  ];
  
  // Error state: Failed to load queries
  // Shows the specific error message to help with debugging
  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#ff4d4f' }}>
        Error loading queries: {error}
      </div>
    );
  }
  
  // Render the DataGrid with our query data
  // The DataGrid handles all the UI - we just provide the data and configuration
  // Note: queries is null during initial load, which DataGrid handles by showing a spinner
  // Wrapped in a div with padding for better visual spacing
  return (
    <div style={{ padding: '10px', width: '100%' }}>
      <DataGrid
        entityName="Queries"
        data={queries}  // null initially, then array of query objects
        fields={displayFields}
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