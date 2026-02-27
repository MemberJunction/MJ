function TestEntityDataGrid({
  initialCacheLimit = 1000,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Get EntityDataGrid component
  const { EntityDataGrid } = components;

  // Test controls state
  const [showIndicators, setShowIndicators] = React.useState(true);
  const [showWarnings, setShowWarnings] = React.useState(true);
  const [cacheLimit, setCacheLimit] = React.useState(initialCacheLimit);
  const [leftCacheMode, setLeftCacheMode] = React.useState('loading');
  const [rightCacheMode, setRightCacheMode] = React.useState('loading');
  const [eventLog, setEventLog] = React.useState([]);

  // Log events
  const logEvent = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setEventLog(prev => [logEntry, ...prev].slice(0, 20)); // Keep last 20 events
  };

  // Handle cache mode changes
  const handleLeftCacheModeChange = (info) => {
    setLeftCacheMode(info.cacheMode);
    logEvent(`LEFT GRID: Cache mode changed to '${info.cacheMode}' (${info.totalRecords} total records, max ${info.maxCachedRows})`);
  };

  const handleRightCacheModeChange = (info) => {
    setRightCacheMode(info.cacheMode);
    logEvent(`RIGHT GRID: Cache mode changed to '${info.cacheMode}' (${info.totalRecords} total records, max ${info.maxCachedRows})`);
  };

  // Handle page changes
  const handleLeftPageChange = (info) => {
    const hitStatus = info.cacheHit ? '✓ CACHE HIT' : '⚠ SERVER FETCH';
    logEvent(`LEFT GRID: Page ${info.pageNumber} loaded - ${hitStatus} (${info.cacheMode} mode)`);
  };

  const handleRightPageChange = (info) => {
    const hitStatus = info.cacheHit ? '✓ CACHE HIT' : '⚠ SERVER FETCH';
    logEvent(`RIGHT GRID: Page ${info.pageNumber} loaded - ${hitStatus} (${info.cacheMode} mode)`);
  };

  if (!EntityDataGrid) {
    return (
      <div style={{
        padding: '24px',
        border: '1px solid #ff4d4f',
        borderRadius: '4px',
        backgroundColor: '#fff2f0',
        color: '#cf1322',
        textAlign: 'center'
      }}>
        Error: EntityDataGrid component not found. Please ensure EntityDataGrid is properly registered.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '20px', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #d9d9d9'
      }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#262626' }}>
          EntityDataGrid Test Harness
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#595959' }}>
          Testing with Action Params entity (~1800 rows). Left grid: no filter (partial cache). Right grid: filtered (full cache).
        </p>
      </div>

      {/* Test Controls */}
      <div style={{
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #d9d9d9'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#262626' }}>
          Test Controls
        </h3>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Show Indicators Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showIndicators}
              onChange={(e) => setShowIndicators(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: '#262626' }}>Show Cache Mode Indicators</span>
          </label>

          {/* Show Warnings Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showWarnings}
              onChange={(e) => setShowWarnings(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: '#262626' }}>Show Partial Result Warnings</span>
          </label>

          {/* Max Cached Rows Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#262626' }}>Max Cached Rows:</label>
            <input
              type="number"
              value={cacheLimit}
              onChange={(e) => setCacheLimit(Number(e.target.value))}
              min={100}
              max={5000}
              step={100}
              style={{
                padding: '4px 8px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px',
                width: '100px'
              }}
            />
            <button
              onClick={() => {
                logEvent(`Cache limit changed to ${cacheLimit} - grids will reload`);
                // Force re-render by updating a key would be ideal, but state change will trigger useEffect
              }}
              style={{
                padding: '4px 12px',
                backgroundColor: '#1890ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Apply
            </button>
          </div>
        </div>

        {/* Cache Mode Status */}
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#fafafa',
          borderRadius: '4px',
          border: '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', gap: '32px', fontSize: '13px' }}>
            <div>
              <strong>Left Grid Cache Mode:</strong>{' '}
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: leftCacheMode === 'full' ? '#f6ffed' : '#fff7e6',
                color: leftCacheMode === 'full' ? '#389e0d' : '#d48806',
                fontWeight: 600
              }}>
                {leftCacheMode.toUpperCase()}
              </span>
            </div>
            <div>
              <strong>Right Grid Cache Mode:</strong>{' '}
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: rightCacheMode === 'full' ? '#f6ffed' : '#fff7e6',
                color: rightCacheMode === 'full' ? '#389e0d' : '#d48806',
                fontWeight: 600
              }}>
                {rightCacheMode.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Grid Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px'
      }}>
        {/* Left Grid - No Filter (Partial Cache Mode) */}
        <div style={{
          padding: '16px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #d9d9d9'
        }}>
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            color: '#262626',
            paddingBottom: '12px',
            borderBottom: '1px solid #f0f0f0'
          }}>
            Test 1: All Action Params (No Filter)
          </h3>
          <p style={{
            margin: '0 0 16px 0',
            fontSize: '13px',
            color: '#8c8c8c',
            fontStyle: 'italic'
          }}>
            Expected: ~1800 rows → Partial cache mode (server-side sort/filter, page caching)
          </p>

          <EntityDataGrid
            entityName="MJ: Action Params"
            fields={['InvalidField1', 'Name', 'BadColumn', 'Type', 'ValueType', 'FakeProperty', 'IsRequired', 'IsArray', 'DefaultValue']}
            orderBy="Name ASC"
            pageSize={20}
            maxCachedRows={cacheLimit}
            enablePageCache={true}
            showPageSizeChanger={true}
            enableSorting={true}
            enableFiltering={true}
            showRefreshButton={true}
            showCacheModeIndicator={showIndicators}
            warnOnPartialResults={showWarnings}
            onCacheModeChanged={handleLeftCacheModeChange}
            onPageChanged={handleLeftPageChange}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings}
            onSaveUserSettings={onSaveUserSettings}
          />
        </div>

        {/* Right Grid - Filtered (Full Cache Mode) */}
        <div style={{
          padding: '16px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #d9d9d9'
        }}>
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            color: '#262626',
            paddingBottom: '12px',
            borderBottom: '1px solid #f0f0f0'
          }}>
            Test 2: Custom Column Styling (Filtered)
          </h3>
          <p style={{
            margin: '0 0 16px 0',
            fontSize: '13px',
            color: '#8c8c8c',
            fontStyle: 'italic'
          }}>
            Mixed field definitions (strings + ColumnDef objects): Name & Type (simple strings), ValueType (color-coded badges), IsRequired (conditional icons, sortable=false), IsArray (emoji), DefaultValue (null handling, truncation). Tests custom headers, widths, render functions, and per-column sortable override.
          </p>

          <EntityDataGrid
            entityName="MJ: Action Params"
            extraFilter="IsRequired=1"
            fields={[
              'Name',  // Simple string field
              'Type',  // Simple string field
              {
                field: 'ValueType',
                header: '📊 Value Type',
                width: 120,
                render: (value) => {
                  const typeColors = {
                    'string': '#52c41a',
                    'number': '#1890ff',
                    'boolean': '#722ed1',
                    'object': '#fa8c16',
                    'array': '#eb2f96'
                  };
                  const color = typeColors[value?.toLowerCase()] || '#8c8c8c';
                  return (
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: `${color}15`,
                      color: color,
                      fontWeight: 600,
                      fontSize: '12px',
                      border: `1px solid ${color}40`
                    }}>
                      {value || 'unknown'}
                    </span>
                  );
                }
              },
              {
                field: 'IsRequired',
                header: '⚡ Required?',
                width: 100,
                sortable: false,  // Test per-column sortable override
                render: (value) => (
                  <span style={{ fontSize: '16px', textAlign: 'center', display: 'block' }}>
                    {value ? (
                      <span style={{ color: '#ff4d4f' }} title="Required">✓ Yes</span>
                    ) : (
                      <span style={{ color: '#d9d9d9' }} title="Optional">○ No</span>
                    )}
                  </span>
                )
              },
              {
                field: 'IsArray',
                header: '📦 Array',
                width: 80,
                render: (value) => (
                  <span style={{ fontSize: '18px', display: 'block', textAlign: 'center' }}>
                    {value ? '📦' : '📄'}
                  </span>
                )
              },
              {
                field: 'DefaultValue',
                header: 'Default Value',
                width: 150,
                render: (value) => {
                  if (value == null || value === '') {
                    return <span style={{ color: '#bfbfbf', fontStyle: 'italic' }}>none</span>;
                  }
                  const displayValue = String(value);
                  if (displayValue.length > 20) {
                    return (
                      <span title={displayValue} style={{ cursor: 'help' }}>
                        {displayValue.substring(0, 20)}...
                      </span>
                    );
                  }
                  return <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{displayValue}</span>;
                }
              }
            ]}
            orderBy="Name ASC"
            pageSize={20}
            maxCachedRows={1000}
            enablePageCache={true}
            showPageSizeChanger={true}
            enableSorting={true}
            enableFiltering={true}
            showRefreshButton={true}
            showCacheModeIndicator={showIndicators}
            warnOnPartialResults={showWarnings}
            onCacheModeChanged={handleRightCacheModeChange}
            onPageChanged={handleRightPageChange}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings}
            onSaveUserSettings={onSaveUserSettings}
          />
        </div>
      </div>

      {/* Event Log */}
      <div style={{
        padding: '16px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #d9d9d9'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#262626' }}>
            Event Log (Last 20 Events)
          </h3>
          <button
            onClick={() => {
              setEventLog([]);
              logEvent('Event log cleared');
            }}
            style={{
              padding: '4px 12px',
              backgroundColor: '#fff',
              color: '#595959',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Clear Log
          </button>
        </div>

        <div style={{
          maxHeight: '300px',
          overflowY: 'auto',
          backgroundColor: '#fafafa',
          border: '1px solid #e8e8e8',
          borderRadius: '4px',
          padding: '12px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {eventLog.length === 0 ? (
            <div style={{ color: '#8c8c8c', fontStyle: 'italic' }}>
              No events logged yet. Interact with the grids above to see events.
            </div>
          ) : (
            eventLog.map((log, index) => (
              <div
                key={index}
                style={{
                  padding: '4px 0',
                  borderBottom: index < eventLog.length - 1 ? '1px solid #e8e8e8' : 'none',
                  color: '#262626'
                }}
              >
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Testing Instructions */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: '#e6f7ff',
        borderRadius: '8px',
        border: '1px solid #91d5ff'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#0050b3' }}>
          📋 Testing Scenarios
        </h3>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#096dd9', lineHeight: '1.8' }}>
          <li><strong>Pagination Test:</strong> Click through multiple pages in left grid. Watch for cache hits vs server fetches in event log.</li>
          <li><strong>Sorting Test:</strong> Click column headers in both grids. Left should show loading overlay (server-side), right should be instant (client-side).</li>
          <li><strong>Filtering Test:</strong> Use text search box in both grids. Left grid should show warning about using extraFilter prop (if warnings enabled).</li>
          <li><strong>Cache Mode Transition:</strong> Change maxCachedRows to 2000 and click Apply. Left grid should switch from partial to full cache mode.</li>
          <li><strong>Page Size Change:</strong> Change "Show" dropdown in left grid. Observe cache clear and reload behavior in event log.</li>
          <li><strong>Refresh Test:</strong> Click refresh button in either grid. Cache should clear and data reload.</li>
          <li><strong>Performance Comparison:</strong> With indicators on, compare sort/page speed between full (right) and partial (left) cache modes.</li>
        </ol>
      </div>
    </div>
  );
}
