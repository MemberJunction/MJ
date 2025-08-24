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

  // Modern style helpers
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '2px solid transparent',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(10px)',
    transition: 'all 0.3s ease',
    outline: 'none',
    color: '#2d3748'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#4a5568',
    letterSpacing: '0.025em',
    textTransform: 'uppercase'
  };

  const sectionStyle = {
    marginBottom: '20px',
    padding: '16px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(249,250,251,0.95) 100%)',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.8)'
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '12px',
    cursor: isProcessing ? 'not-allowed' : 'pointer',
    transition: 'all 0.3s ease',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {/* Search */}
      <div style={sectionStyle}>
        <label style={labelStyle}>
          <i className="fa-solid fa-magnifying-glass" style={{ marginRight: '6px' }}></i>
          Search
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search prompts..."
            style={{
              ...inputStyle,
              paddingLeft: '40px'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#667eea';
              e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'transparent';
              e.target.style.boxShadow = 'none';
            }}
            disabled={isProcessing}
          />
          <i className="fa-solid fa-magnifying-glass" style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#a0aec0',
            fontSize: '14px'
          }}></i>
        </div>
      </div>

      {/* Filters */}
      <div style={sectionStyle}>
        <h4 style={{
          margin: '0 0 16px 0',
          fontSize: '15px',
          fontWeight: '600',
          color: '#2d3748',
          display: 'flex',
          alignItems: 'center'
        }}>
          <i className="fa-solid fa-filter" style={{ marginRight: '8px', color: '#667eea' }}></i>
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
          margin: '0 0 16px 0',
          fontSize: '15px',
          fontWeight: '600',
          color: '#2d3748',
          display: 'flex',
          alignItems: 'center'
        }}>
          <i className="fa-solid fa-diagram-project" style={{ marginRight: '8px', color: '#667eea' }}></i>
          Clustering
        </h4>

        {/* Number of clusters */}
        <div style={{ marginBottom: styles.spacing?.sm || '8px' }}>
          <label style={{...labelStyle, display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
            <span>Clusters</span>
            <span style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600'
            }}>{clusterCount}</span>
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
          <label style={{...labelStyle, display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
            <span>Similarity</span>
            <span style={{
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600'
            }}>{(similarityThreshold * 100).toFixed(0)}%</span>
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
            opacity: isProcessing ? 0.6 : 1,
            marginBottom: '12px'
          }}
          onMouseEnter={e => !isProcessing && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          {isProcessing ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
              Processing...
            </>
          ) : (
            <>
              <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: '8px' }}></i>
              Generate Clusters
            </>
          )}
        </button>

        <button
          onClick={onExport}
          disabled={isProcessing}
          style={{
            ...buttonStyle,
            background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
            color: '#4a5568',
            border: '2px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}
          onMouseEnter={e => !isProcessing && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <i className="fa-solid fa-download" style={{ marginRight: '8px' }}></i>
          Export CSV
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