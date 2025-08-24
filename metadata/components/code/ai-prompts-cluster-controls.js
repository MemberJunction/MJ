function AIPromptsClusterControls({
  categories,
  types,
  currentFilters,
  clusterCount,
  similarityThreshold,
  isProcessing,
  onSearchChange,
  onFilterChange,
  onClusterCountChange,
  onSimilarityThresholdChange,
  onRecalculate,
  onExport,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  const [localSearch, setLocalSearch] = useState(currentFilters.search || '');
  const searchTimeout = useRef(null);

  // Debounce search input
  const handleSearchChange = (value) => {
    setLocalSearch(value);
    
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    searchTimeout.current = setTimeout(() => {
      onSearchChange(value);
    }, 300);
  };

  // Style helpers
  const inputStyle = {
    width: '100%',
    padding: styles.spacing?.xs || '4px',
    fontSize: styles.fonts?.sizes?.sm || '14px',
    border: `1px solid ${styles.colors?.border || '#ddd'}`,
    borderRadius: styles.borders?.radius || '4px',
    backgroundColor: styles.colors?.surface || 'white'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: styles.spacing?.xs || '4px',
    fontSize: styles.fonts?.sizes?.sm || '14px',
    fontWeight: '500',
    color: styles.colors?.text?.primary || '#333'
  };

  const sectionStyle = {
    marginBottom: styles.spacing?.md || '16px',
    padding: styles.spacing?.sm || '8px',
    backgroundColor: styles.colors?.surface || 'white',
    borderRadius: styles.borders?.radius || '4px'
  };

  const buttonStyle = {
    width: '100%',
    padding: `${styles.spacing?.xs || '4px'} ${styles.spacing?.sm || '8px'}`,
    fontSize: styles.fonts?.sizes?.sm || '14px',
    border: 'none',
    borderRadius: styles.borders?.radius || '4px',
    cursor: isProcessing ? 'not-allowed' : 'pointer',
    transition: 'background-color 0.2s'
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {/* Search */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Search Prompts</label>
        <input
          type="text"
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name, description, or content..."
          style={inputStyle}
          disabled={isProcessing}
        />
      </div>

      {/* Filters */}
      <div style={sectionStyle}>
        <h4 style={{
          margin: `0 0 ${styles.spacing?.sm || '8px'} 0`,
          fontSize: styles.fonts?.sizes?.md || '16px',
          color: styles.colors?.text?.primary || '#333'
        }}>
          Filters
        </h4>

        {/* Category filter */}
        <div style={{ marginBottom: styles.spacing?.sm || '8px' }}>
          <label style={labelStyle}>Category</label>
          <select
            value={currentFilters.category || ''}
            onChange={(e) => onFilterChange({
              ...currentFilters,
              category: e.target.value || null
            })}
            style={inputStyle}
            disabled={isProcessing}
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Type filter */}
        <div style={{ marginBottom: styles.spacing?.sm || '8px' }}>
          <label style={labelStyle}>Type</label>
          <select
            value={currentFilters.type || ''}
            onChange={(e) => onFilterChange({
              ...currentFilters,
              type: e.target.value || null
            })}
            style={inputStyle}
            disabled={isProcessing}
          >
            <option value="">All Types</option>
            {types.map(type => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div style={{ marginBottom: styles.spacing?.sm || '8px' }}>
          <label style={labelStyle}>Status</label>
          <select
            value={currentFilters.status || ''}
            onChange={(e) => onFilterChange({
              ...currentFilters,
              status: e.target.value || null
            })}
            style={inputStyle}
            disabled={isProcessing}
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Disabled">Disabled</option>
          </select>
        </div>

        {/* Role filter */}
        <div>
          <label style={labelStyle}>Prompt Role</label>
          <select
            value={currentFilters.role || ''}
            onChange={(e) => onFilterChange({
              ...currentFilters,
              role: e.target.value || null
            })}
            style={inputStyle}
            disabled={isProcessing}
          >
            <option value="">All Roles</option>
            <option value="System">System</option>
            <option value="User">User</option>
            <option value="Assistant">Assistant</option>
            <option value="SystemOrUser">System or User</option>
          </select>
        </div>
      </div>

      {/* Clustering Parameters */}
      <div style={sectionStyle}>
        <h4 style={{
          margin: `0 0 ${styles.spacing?.sm || '8px'} 0`,
          fontSize: styles.fonts?.sizes?.md || '16px',
          color: styles.colors?.text?.primary || '#333'
        }}>
          Clustering Parameters
        </h4>

        {/* Number of clusters */}
        <div style={{ marginBottom: styles.spacing?.sm || '8px' }}>
          <label style={labelStyle}>
            Number of Clusters: {clusterCount}
          </label>
          <input
            type="range"
            min="2"
            max="15"
            value={clusterCount}
            onChange={(e) => onClusterCountChange(parseInt(e.target.value))}
            style={{ width: '100%' }}
            disabled={isProcessing}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: styles.fonts?.sizes?.xs || '10px',
            color: styles.colors?.text?.secondary || '#666'
          }}>
            <span>2</span>
            <span>15</span>
          </div>
        </div>

        {/* Similarity threshold */}
        <div>
          <label style={labelStyle}>
            Similarity Threshold: {(similarityThreshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={similarityThreshold * 100}
            onChange={(e) => onSimilarityThresholdChange(parseInt(e.target.value) / 100)}
            style={{ width: '100%' }}
            disabled={isProcessing}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: styles.fonts?.sizes?.xs || '10px',
            color: styles.colors?.text?.secondary || '#666'
          }}>
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={sectionStyle}>
        <button
          onClick={onRecalculate}
          disabled={isProcessing}
          style={{
            ...buttonStyle,
            backgroundColor: isProcessing 
              ? styles.colors?.disabled || '#ccc'
              : styles.colors?.primary || '#007bff',
            color: 'white',
            marginBottom: styles.spacing?.xs || '4px'
          }}
        >
          {isProcessing ? 'Processing...' : 'Generate Clusters'}
        </button>

        <button
          onClick={onExport}
          disabled={isProcessing}
          style={{
            ...buttonStyle,
            backgroundColor: styles.colors?.surface || 'white',
            color: styles.colors?.text?.primary || '#333',
            border: `1px solid ${styles.colors?.border || '#ddd'}`
          }}
        >
          Export Clusters (CSV)
        </button>
      </div>

      {/* Statistics */}
      <div style={{
        ...sectionStyle,
        fontSize: styles.fonts?.sizes?.xs || '12px',
        color: styles.colors?.text?.secondary || '#666'
      }}>
        <h4 style={{
          margin: `0 0 ${styles.spacing?.xs || '4px'} 0`,
          fontSize: styles.fonts?.sizes?.sm || '14px',
          color: styles.colors?.text?.primary || '#333'
        }}>
          Statistics
        </h4>
        <div>Categories: {categories.length}</div>
        <div>Types: {types.length}</div>
        <div>Active Filters: {
          Object.values(currentFilters).filter(v => v).length
        }</div>
      </div>
    </div>
  );
}