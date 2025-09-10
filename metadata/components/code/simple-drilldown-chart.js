function SimpleDrilldownChart({
  entityName,
  data,
  groupBy,
  valueField,
  aggregateMethod = 'count',
  chartType = 'auto',
  title,
  gridFields,
  showDrilldown = true,
  drilldownHeight = 300,
  onSegmentSelected,
  onSelectionCleared,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // State for drill-down
  const [selectedSegment, setSelectedSegment] = React.useState(null);
  const [showGrid, setShowGrid] = React.useState(false);
  
  // Get components from registry
  const { SimpleChart, DataGrid } = components;
  
  // Handle chart click
  const handleChartClick = (clickData) => {
    if (!showDrilldown) return;
    
    // Set selected segment
    setSelectedSegment(clickData);
    setShowGrid(true);
    
    // Fire event
    if (onSegmentSelected) {
      onSegmentSelected({ segment: clickData });
    }
  };
  
  // Clear selection
  const handleClearSelection = () => {
    setSelectedSegment(null);
    setShowGrid(false);
    
    if (onSelectionCleared) {
      onSelectionCleared();
    }
  };
  
  // Filter data for selected segment
  const getDrilldownData = () => {
    if (!selectedSegment || !selectedSegment.records) {
      return [];
    }
    return selectedSegment.records;
  };
  
  // Determine which fields to show in grid
  const getGridFields = () => {
    if (gridFields && gridFields.length > 0) {
      return gridFields;
    }
    
    // Auto-detect fields from first record
    const records = getDrilldownData();
    if (records.length > 0) {
      const firstRecord = records[0];
      return Object.keys(firstRecord).filter(key => 
        !key.startsWith('__mj') && 
        key !== 'ID' &&
        typeof firstRecord[key] !== 'object'
      ).slice(0, 10); // Limit to 10 fields
    }
    
    return [];
  };
  
  return (
    <div style={{ width: '100%' }}>
      {/* Chart Section */}
      <div style={{ 
        width: '100%',
        border: selectedSegment ? '2px solid #1890ff' : 'none',
        borderRadius: '8px',
        padding: selectedSegment ? '2px' : '0',
        transition: 'all 0.3s ease'
      }}>
        <SimpleChart
          entityName={entityName}
          data={data}
          groupBy={groupBy}
          valueField={valueField}
          aggregateMethod={aggregateMethod}
          chartType={chartType}
          title={title || `${entityName} by ${groupBy}`}
          onDataPointClick={handleChartClick}
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
          savedUserSettings={savedUserSettings}
          onSaveUserSettings={onSaveUserSettings}
        />
      </div>
      
      {/* Selection Info Bar */}
      {showDrilldown && selectedSegment && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: '#f0f5ff',
          borderLeft: '4px solid #1890ff',
          marginTop: '16px',
          borderRadius: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div>
              <strong style={{ color: '#333' }}>Selected:</strong>{' '}
              <span style={{ color: '#1890ff', fontWeight: 600 }}>
                {selectedSegment.label}
              </span>
            </div>
            <div>
              <strong style={{ color: '#333' }}>Value:</strong>{' '}
              <span style={{ color: '#52c41a', fontWeight: 600 }}>
                {typeof selectedSegment.value === 'number' 
                  ? selectedSegment.value.toLocaleString()
                  : selectedSegment.value}
              </span>
            </div>
            <div>
              <strong style={{ color: '#333' }}>Records:</strong>{' '}
              <span style={{ color: '#666', fontWeight: 600 }}>
                {selectedSegment.records?.length || 0}
              </span>
            </div>
            {selectedSegment.percentage != null && (
              <div>
                <strong style={{ color: '#333' }}>Percentage:</strong>{' '}
                <span style={{ color: '#722ed1', fontWeight: 600 }}>
                  {selectedSegment.percentage.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleClearSelection}
            style={{
              padding: '6px 12px',
              backgroundColor: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#333',
              transition: 'all 0.3s'
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#1890ff';
              e.target.style.color = '#1890ff';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#d9d9d9';
              e.target.style.color = '#333';
            }}
          >
            ✕ Clear Selection
          </button>
        </div>
      )}
      
      {/* Drill-down Grid */}
      {showDrilldown && showGrid && selectedSegment && (
        <div style={{
          marginTop: '16px',
          height: drilldownHeight,
          overflow: 'auto',
          border: '1px solid #d9d9d9',
          borderRadius: '4px',
          animation: 'slideDown 0.3s ease'
        }}>
          {DataGrid ? (
            <DataGrid
              entityName={entityName}
              data={getDrilldownData()}
              fields={getGridFields()}
              sorting={true}
              paging={true}
              pageSize={10}
              filtering={true}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
              savedUserSettings={savedUserSettings}
              onSaveUserSettings={onSaveUserSettings}
            />
          ) : (
            <div style={{ 
              padding: '20px', 
              textAlign: 'center',
              color: '#ff4d4f'
            }}>
              Error: DataGrid component not found. Please ensure DataGrid is properly registered.
            </div>
          )}
        </div>
      )}
      
      {/* Animation keyframes */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}