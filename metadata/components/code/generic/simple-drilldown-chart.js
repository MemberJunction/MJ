function SimpleDrilldownChart({
  data,
  groupBy,
  valueField,
  aggregateMethod = 'count',
  chartType = 'auto',
  title,
  gridFields,
  entityName,
  entityPrimaryKeys,
  showDrilldown = true,
  drilldownHeight = 300,
  showSingleRecordView = false,
  singleRecordViewFields,
  onSegmentSelected,
  onSelectionCleared,
  onDataPointClick,
  onRowSelected,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Theme tokens, with the previous hardcoded values kept as fallbacks for a host
  // that renders this component without styles.
  const colors = styles?.colors || {};
  const textColor = colors.text || '#333';
  const mutedColor = colors.textSecondary || '#666';
  const borderColor = colors.border || '#d9d9d9';
  const surfaceColor = colors.background || '#fff';
  const surfaceAltColor = colors.surface || '#fafafa';
  const primaryColor = colors.primary || '#1890ff';
  // Translucent version of a themed color. Appending hex alpha to the token directly
  // would break on any theme that expresses the color as rgb() or a named color.
  const withAlpha = (color, alpha, fallback) => {
    if (typeof color !== 'string') return fallback;
    const hex = color.trim().replace('#', '');
    const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
    const int = parseInt(full, 16);
    return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
  };
  // Pale tint of primary for the selection banner — primaryLight itself can resolve to a
  // saturated mid-tone in some themes, which would leave dark text unreadable.
  const primaryTintColor = withAlpha(colors.primary, 0.08, '#f0f5ff');
  const successColor = colors.success || '#52c41a';
  const errorColor = colors.error || '#ff4d4f';
  const accentColor = colors.info || colors.secondary || '#722ed1';

  // State for drill-down
  const [selectedSegment, setSelectedSegment] = React.useState(null);
  const [showGrid, setShowGrid] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState(null);
  
  // Get components from registry
  const { SimpleChart, DataGrid, SingleRecordView } = components;
  
  // Handle chart click
  const handleChartClick = (clickData) => {
    // Always bubble up the chart click event
    if (onDataPointClick) {
      onDataPointClick(clickData);
    }
    
    if (!showDrilldown) return;
    
    // Set selected segment
    setSelectedSegment(clickData);
    setShowGrid(true);
    setSelectedRecord(null); // Clear any selected record when new segment is selected
    
    // Fire segment selected event
    if (onSegmentSelected) {
      onSegmentSelected({ segment: clickData });
    }
  };
  
  // Clear selection
  const handleClearSelection = () => {
    setSelectedSegment(null);
    setShowGrid(false);
    setSelectedRecord(null);
    
    if (onSelectionCleared) {
      onSelectionCleared();
    }
  };
  
  // Handle row selection in grid
  const handleRowClick = (event) => {
    // event has shape: { record: object, cancel: boolean }
    setSelectedRecord(event.record);

    // Bubble up the row selection event
    if (onRowSelected) {
      onRowSelected({
        record: event.record,
        segment: selectedSegment
      });
    }

    // Don't prevent default OpenEntityRecord behavior
    // (leave event.cancel as false to allow DataGrid to open record if entityPrimaryKeys provided)
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
        border: selectedSegment ? `2px solid ${primaryColor}` : 'none',
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
          backgroundColor: primaryTintColor,
          borderLeft: `4px solid ${primaryColor}`,
          marginTop: '16px',
          borderRadius: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div>
              <strong style={{ color: textColor }}>Selected:</strong>{' '}
              <span style={{ color: primaryColor, fontWeight: 600 }}>
                {selectedSegment.label}
              </span>
            </div>
            <div>
              <strong style={{ color: textColor }}>Value:</strong>{' '}
              <span style={{ color: successColor, fontWeight: 600 }}>
                {typeof selectedSegment.value === 'number' 
                  ? selectedSegment.value.toLocaleString()
                  : selectedSegment.value}
              </span>
            </div>
            <div>
              <strong style={{ color: textColor }}>Records:</strong>{' '}
              <span style={{ color: mutedColor, fontWeight: 600 }}>
                {selectedSegment.records?.length || 0}
              </span>
            </div>
            {selectedSegment.percentage != null && (
              <div>
                <strong style={{ color: textColor }}>Percentage:</strong>{' '}
                <span style={{ color: accentColor, fontWeight: 600 }}>
                  {selectedSegment.percentage?.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleClearSelection}
            style={{
              padding: '6px 12px',
              backgroundColor: surfaceColor,
              border: `1px solid ${borderColor}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              color: textColor,
              transition: 'all 0.3s'
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = primaryColor;
              e.target.style.color = primaryColor;
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = borderColor;
              e.target.style.color = textColor;
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
          display: showSingleRecordView && selectedRecord ? 'flex' : 'block',
          gap: '16px'
        }}>
          {/* Grid Section */}
          <div style={{
            flex: showSingleRecordView && selectedRecord ? '1 1 60%' : '1',
            height: drilldownHeight,
            overflow: 'auto',
            border: `1px solid ${borderColor}`,
            borderRadius: '4px',
            animation: 'slideDown 0.3s ease'
          }}>
            {DataGrid ? (
              <DataGrid
                data={getDrilldownData()}
                entityName={entityName}
                entityPrimaryKeys={entityPrimaryKeys}
                columns={getGridFields()}
                sorting={true}
                paging={true}
                pageSize={10}
                filtering={true}
                onRowClick={showSingleRecordView ? handleRowClick : undefined}
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
                color: errorColor
              }}>
                Error: DataGrid component not found. Please ensure DataGrid is properly registered.
              </div>
            )}
          </div>
          
          {/* Single Record View */}
          {showSingleRecordView && selectedRecord && SingleRecordView && (
            <div style={{
              flex: '1 1 40%',
              height: drilldownHeight,
              overflow: 'auto',
              border: `1px solid ${borderColor}`,
              borderRadius: '4px',
              padding: '16px',
              backgroundColor: surfaceAltColor,
              animation: 'slideIn 0.3s ease'
            }}>
              <SingleRecordView
                record={selectedRecord}
                entityName={entityName}
                fields={singleRecordViewFields}
                layout="list"
                showLabels={true}
                allowOpenRecord={true}
                utilities={utilities}
                styles={styles}
                components={components}
                callbacks={callbacks}
                savedUserSettings={savedUserSettings}
                onSaveUserSettings={onSaveUserSettings}
              />
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
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}