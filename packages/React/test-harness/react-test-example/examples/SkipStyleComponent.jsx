import React, { useState, useEffect } from 'react';

/**
 * Skip-style component that follows the standard MemberJunction Skip component pattern
 * with data, userState, callbacks, utilities, and styles props
 */
export function SkipStyleComponent({ data, userState, onStateChanged, utilities, styles }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle data refresh
  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (onStateChanged) {
        onStateChanged({ refresh: Date.now() });
      }
    } catch (err) {
      setError(err.message || 'Failed to refresh data');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle user state updates
  const handleToggleView = () => {
    if (onStateChanged) {
      onStateChanged({
        viewMode: userState?.viewMode === 'grid' ? 'list' : 'grid'
      });
    }
  };

  const handleFilterChange = (filter) => {
    if (onStateChanged) {
      onStateChanged({
        activeFilter: filter
      });
    }
  };

  // Use utilities if available
  useEffect(() => {
    if (utilities?.logEvent) {
      utilities.logEvent('SkipStyleComponent mounted');
    }
  }, [utilities]);

  // Apply filtering based on userState
  const filteredData = data?.items?.filter(item => {
    if (!userState?.activeFilter || userState.activeFilter === 'all') {
      return true;
    }
    return item.category === userState.activeFilter;
  }) || [];

  // Apply styles
  const containerStyle = {
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    ...styles?.container
  };

  const headerStyle = {
    marginBottom: '20px',
    ...styles?.header
  };

  const buttonStyle = {
    padding: '8px 16px',
    marginRight: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    ...styles?.button
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '15px',
    ...styles?.grid
  };

  const listStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    ...styles?.list
  };

  const itemStyle = {
    padding: '15px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    ...styles?.item
  };

  return (
    <div style={containerStyle} data-testid="skip-component">
      {/* Header Section */}
      <div style={headerStyle}>
        <h2>{data?.title || 'Skip Component'}</h2>
        {data?.description && <p>{data.description}</p>}
      </div>

      {/* Controls */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          style={buttonStyle} 
          onClick={handleRefresh}
          disabled={isLoading}
          data-testid="refresh-button"
        >
          {isLoading ? 'Loading...' : 'Refresh Data'}
        </button>
        
        <button 
          style={buttonStyle} 
          onClick={handleToggleView}
          data-testid="toggle-view"
        >
          View: {userState?.viewMode || 'list'}
        </button>

        {/* Filter Buttons */}
        <span style={{ marginLeft: '20px', marginRight: '10px' }}>Filter:</span>
        {['all', 'category1', 'category2'].map(filter => (
          <button
            key={filter}
            style={{
              ...buttonStyle,
              backgroundColor: userState?.activeFilter === filter ? '#007bff' : 'white',
              color: userState?.activeFilter === filter ? 'white' : 'black'
            }}
            onClick={() => handleFilterChange(filter)}
            data-testid={`filter-${filter}`}
          >
            {filter === 'all' ? 'All' : filter}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }} data-testid="error-message">
          Error: {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div data-testid="loading-indicator">Loading...</div>
      )}

      {/* Data Display */}
      {!isLoading && filteredData.length > 0 && (
        <div style={userState?.viewMode === 'grid' ? gridStyle : listStyle} data-testid="data-container">
          {filteredData.map((item, index) => (
            <div key={item.id || index} style={itemStyle} data-testid={`item-${item.id || index}`}>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <small>Category: {item.category}</small>
              {item.value && <div><strong>Value: {item.value}</strong></div>}
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredData.length === 0 && (
        <div data-testid="empty-state">
          No items to display. Try changing the filter or refreshing the data.
        </div>
      )}

      {/* Summary Section */}
      {data?.summary && (
        <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
          <h3>Summary</h3>
          <p>{data.summary}</p>
          <p>Total Items: {filteredData.length} / {data?.items?.length || 0}</p>
        </div>
      )}
    </div>
  );
}

// Default export for easier testing
export default SkipStyleComponent;