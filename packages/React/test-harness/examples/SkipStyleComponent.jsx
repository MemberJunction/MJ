/**
 * Example Skip-style React Component for MemberJunction
 * Demonstrates the standard props structure used in Skip components
 */
const Component = (props) => {
  const { data, userState, onStateChanged, utilities, styles } = props;
  
  // Handle null or undefined data
  if (!data) {
    return <div className="error">No data provided</div>;
  }

  // Extract data fields
  const { 
    title = 'Default Title',
    items = [],
    metrics = {},
    status = 'active'
  } = data;

  // Extract user state
  const {
    selectedItemId,
    viewMode = 'grid',
    showDetails = false,
    activeFilter = 'all'
  } = userState || {};

  // Handle item selection
  const handleItemClick = (itemId) => {
    if (onStateChanged) {
      onStateChanged({ selectedItemId: itemId });
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    console.log('Refresh button clicked');
    if (onStateChanged) {
      onStateChanged({ refresh: Date.now() });
    }
  };

  // Filter items based on active filter
  const filteredItems = items.filter(item => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'active') return item.status === 'active';
    if (activeFilter === 'inactive') return item.status === 'inactive';
    return true;
  });

  // Apply custom styles
  const containerStyle = {
    ...styles?.container,
    padding: '20px',
    fontFamily: styles?.typography?.fontFamily || 'Arial, sans-serif'
  };

  const headerStyle = {
    ...styles?.header,
    color: styles?.colors?.primary || '#333',
    marginBottom: '20px'
  };

  const buttonStyle = {
    ...styles?.button,
    backgroundColor: styles?.colors?.buttonBackground || '#007bff',
    color: styles?.colors?.buttonText || 'white',
    border: 'none',
    padding: '10px 20px',
    cursor: 'pointer',
    borderRadius: '4px',
    marginRight: '10px'
  };

  return (
    <div className="skip-component" style={containerStyle}>
      {/* Header */}
      <div className="header" style={headerStyle}>
        <h1>{title}</h1>
        <div className="status">Status: {status}</div>
      </div>

      {/* Actions */}
      <div className="actions">
        <button 
          onClick={handleRefresh}
          style={buttonStyle}
          className="refresh-button"
        >
          Refresh Data
        </button>
        
        {/* Filter buttons */}
        <button 
          onClick={() => onStateChanged?.({ activeFilter: 'all' })}
          style={{
            ...buttonStyle,
            backgroundColor: activeFilter === 'all' ? '#28a745' : '#6c757d'
          }}
        >
          All ({items.length})
        </button>
        <button 
          onClick={() => onStateChanged?.({ activeFilter: 'active' })}
          style={{
            ...buttonStyle,
            backgroundColor: activeFilter === 'active' ? '#28a745' : '#6c757d'
          }}
        >
          Active
        </button>
        <button 
          onClick={() => onStateChanged?.({ activeFilter: 'inactive' })}
          style={{
            ...buttonStyle,
            backgroundColor: activeFilter === 'inactive' ? '#28a745' : '#6c757d'
          }}
        >
          Inactive
        </button>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="metrics" style={{ margin: '20px 0' }}>
          <div>Total Items: {metrics.total || 0}</div>
          <div>Active Items: {metrics.active || 0}</div>
          <div>Success Rate: {metrics.successRate || 0}%</div>
        </div>
      )}

      {/* Items display */}
      <div className={`items-container ${viewMode}`}>
        {filteredItems.length === 0 ? (
          <div className="empty-state">No items to display</div>
        ) : (
          filteredItems.map(item => (
            <div 
              key={item.id}
              className={`item ${selectedItemId === item.id ? 'selected' : ''}`}
              onClick={() => handleItemClick(item.id)}
              style={{
                padding: '10px',
                margin: '5px',
                border: '1px solid #ddd',
                cursor: 'pointer',
                backgroundColor: selectedItemId === item.id ? '#e0e0e0' : 'white'
              }}
            >
              <div className="item-name">{item.name}</div>
              <div className="item-status">{item.status}</div>
              {showDetails && (
                <div className="item-details">
                  <div>Created: {item.createdAt}</div>
                  <div>Value: {item.value}</div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer with utilities */}
      {utilities?.formatDate && (
        <div className="footer" style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
          Last updated: {utilities.formatDate(new Date())}
        </div>
      )}
    </div>
  );
};