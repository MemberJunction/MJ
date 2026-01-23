function TestSimpleChart(props) {
  // Destructure props following MJ component patterns
  const { utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings } = props;
  const initialTab = props.initialTab || 'bar';

  // Get required components
  const { SimpleChart, DataGrid } = components;

  // State - use direct hook functions (not React.useState)
  const [activeTab, setActiveTab] = useState(initialTab);
  const [clickedData, setClickedData] = useState(null);
  const [eventLog, setEventLog] = useState([]);
  const [actionsData, setActionsData] = useState([]);
  const [actionParamsData, setActionParamsData] = useState([]);
  const [aiModelCostsData, setAIModelCostsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Custom chart controls (for Custom tab)
  const [customConfig, setCustomConfig] = useState({
    entityName: 'Actions',
    groupBy: 'Category',
    stackBy: '',
    valueField: '',
    aggregateMethod: 'count',
    chartType: 'bar',
    sortBy: undefined,
    sortOrder: 'asc',
    limit: null,
    showLegend: true,
    enableExport: true,
    height: 400
  });

  // Load data on mount - use direct useEffect (not React.useEffect)
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use utilities.rv.RunView() - NOT new RunView()
      const actionsResult = await utilities.rv.RunView({
        EntityName: 'Actions',
        ExtraFilter: '',
        ResultType: 'simple'
      });

      if (!actionsResult.Success) {
        throw new Error(`Failed to load Actions: ${actionsResult.ErrorMessage}`);
      }

      // Load Action Params data
      const paramsResult = await utilities.rv.RunView({
        EntityName: 'Action Params',
        ExtraFilter: '',
        ResultType: 'simple'
      });

      if (!paramsResult.Success) {
        throw new Error(`Failed to load Action Params: ${paramsResult.ErrorMessage}`);
      }

      // Load AI Model Costs data
      const costsResult = await utilities.rv.RunView({
        EntityName: 'MJ: AI Model Costs',
        ExtraFilter: '',
        ResultType: 'simple'
      });

      if (!costsResult.Success) {
        throw new Error(`Failed to load AI Model Costs: ${costsResult.ErrorMessage}`);
      }

      setActionsData(actionsResult.Results || []);
      setActionParamsData(paramsResult.Results || []);
      setAIModelCostsData(costsResult.Results || []);
      setLoading(false);

      logEvent('Data loaded successfully', {
        actions: actionsResult.Results?.length || 0,
        params: paramsResult.Results?.length || 0,
        costs: costsResult.Results?.length || 0
      });
    } catch (err) {
      console.error('Error loading test data:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Log events
  const logEvent = (message, data) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      message,
      data
    };
    console.log(`[${timestamp}] ${message}`, data);
    setEventLog(prev => [logEntry, ...prev].slice(0, 10)); // Keep last 10 events
  };

  // Handle chart click
  const handleChartClick = (clickInfo) => {
    setClickedData(clickInfo);
    logEvent('Chart clicked', {
      label: clickInfo.label,
      value: clickInfo.value,
      records: clickInfo.records.length
    });
  };

  // Handle chart rendered
  const handleChartRendered = (info) => {
    logEvent('Chart rendered', info);
  };

  // Update custom config
  const updateCustomConfig = (field, value) => {
    setCustomConfig(prev => ({ ...prev, [field]: value }));
  };

  // Component check
  if (!SimpleChart || !DataGrid) {
    return (
      <div style={{
        padding: '24px',
        border: '1px solid #ff4d4f',
        borderRadius: '4px',
        backgroundColor: '#fff2f0',
        color: '#cf1322',
        textAlign: 'center'
      }}>
        Error: Required components not found. Please ensure SimpleChart and DataGrid are properly registered.
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div style={{
        padding: '48px',
        textAlign: 'center',
        fontSize: '16px',
        color: '#595959'
      }}>
        Loading test data...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        padding: '24px',
        border: '1px solid #ff4d4f',
        borderRadius: '4px',
        backgroundColor: '#fff2f0',
        color: '#cf1322'
      }}>
        <strong>Error loading data:</strong> {error}
      </div>
    );
  }

  // Tab definitions
  const tabs = [
    { id: 'bar', label: 'Bar Chart' },
    { id: 'stacked', label: 'Stacked Bar' },
    { id: 'pie', label: 'Pie Chart' },
    { id: 'line', label: 'Line Chart' },
    { id: 'custom', label: 'Custom' }
  ];

  // Render active chart
  const renderChart = () => {
    switch (activeTab) {
      case 'bar':
        return (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#262626' }}>
              Actions by Category (Bar Chart)
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#595959' }}>
              Tests: count aggregation, auto colors, bar chart type, onClick drill-down
            </p>
            <SimpleChart
              entityName="Actions"
              data={actionsData}
              groupBy="Category"
              aggregateMethod="count"
              chartType="bar"
              title="Actions by Category"
              height={400}
              showLegend={true}
              enableExport={true}
              onDataPointClick={handleChartClick}
              onChartRendered={handleChartRendered}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          </div>
        );

      case 'stacked':
        return (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#262626' }}>
              Action Params by Action + Type (Stacked Bar)
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#595959' }}>
              Tests: stackBy feature, secondary grouping, multi-series datasets
            </p>
            <SimpleChart
              entityName="Action Params"
              data={actionParamsData}
              groupBy="Action"
              stackBy="Type"
              aggregateMethod="count"
              chartType="bar"
              title="Action Parameters by Action and Type"
              height={400}
              showLegend={true}
              enableExport={true}
              sortBy="label"
              limit={10}
              onDataPointClick={handleChartClick}
              onChartRendered={handleChartRendered}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          </div>
        );

      case 'pie':
        return (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#262626' }}>
              Top 5 Action Categories (Pie Chart)
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#595959' }}>
              Tests: limit feature, pie chart type, percentage display, top-N
            </p>
            <SimpleChart
              entityName="Actions"
              data={actionsData}
              groupBy="Category"
              aggregateMethod="count"
              chartType="pie"
              title="Top 5 Action Categories"
              height={400}
              sortBy="value"
              sortOrder="desc"
              limit={5}
              showLegend={true}
              legendPosition="right"
              enableExport={true}
              onDataPointClick={handleChartClick}
              onChartRendered={handleChartRendered}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          </div>
        );

      case 'line':
        return (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#262626' }}>
              Average AI Model Input Price Over Time (Line Chart)
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#595959' }}>
              Tests: date field handling, line chart type, average aggregation, time-series
            </p>
            <SimpleChart
              entityName="MJ: AI Model Costs"
              data={aiModelCostsData}
              groupBy="StartedAt"
              valueField="InputPricePerUnit"
              aggregateMethod="average"
              chartType="line"
              title="Average Input Price Per Unit Over Time"
              height={400}
              showLegend={false}
              enableExport={true}
              onDataPointClick={handleChartClick}
              onChartRendered={handleChartRendered}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          </div>
        );

      case 'custom':
        // Get data based on selected entity
        let customData = actionsData;
        if (customConfig.entityName === 'Action Params') {
          customData = actionParamsData;
        } else if (customConfig.entityName === 'MJ: AI Model Costs') {
          customData = aiModelCostsData;
        }

        return (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#262626' }}>
              Custom Chart Configuration
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#595959' }}>
              Adjust all props below to test different configurations
            </p>

            {/* Custom Controls */}
            <div style={{
              padding: '16px',
              backgroundColor: '#fafafa',
              borderRadius: '4px',
              marginBottom: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px'
            }}>
              <label>
                Entity:
                <select
                  value={customConfig.entityName}
                  onChange={(e) => updateCustomConfig('entityName', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                >
                  <option value="Actions">Actions</option>
                  <option value="Action Params">Action Params</option>
                  <option value="MJ: AI Model Costs">AI Model Costs</option>
                </select>
              </label>

              <label>
                Group By:
                <input
                  type="text"
                  value={customConfig.groupBy}
                  onChange={(e) => updateCustomConfig('groupBy', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                />
              </label>

              <label>
                Stack By (optional):
                <input
                  type="text"
                  value={customConfig.stackBy}
                  onChange={(e) => updateCustomConfig('stackBy', e.target.value)}
                  placeholder="Leave empty for non-stacked"
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                />
              </label>

              <label>
                Value Field:
                <input
                  type="text"
                  value={customConfig.valueField}
                  onChange={(e) => updateCustomConfig('valueField', e.target.value)}
                  placeholder="Omit for count"
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                />
              </label>

              <label>
                Aggregate Method:
                <select
                  value={customConfig.aggregateMethod}
                  onChange={(e) => updateCustomConfig('aggregateMethod', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                >
                  <option value="count">count</option>
                  <option value="sum">sum</option>
                  <option value="average">average</option>
                  <option value="min">min</option>
                  <option value="max">max</option>
                </select>
              </label>

              <label>
                Chart Type:
                <select
                  value={customConfig.chartType}
                  onChange={(e) => updateCustomConfig('chartType', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                >
                  <option value="auto">auto</option>
                  <option value="bar">bar</option>
                  <option value="line">line</option>
                  <option value="pie">pie</option>
                  <option value="doughnut">doughnut</option>
                  <option value="area">area</option>
                </select>
              </label>

              <label>
                Sort By:
                <select
                  value={customConfig.sortBy || ''}
                  onChange={(e) => updateCustomConfig('sortBy', e.target.value || undefined)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                >
                  <option value="">undefined (preserve order)</option>
                  <option value="label">label</option>
                  <option value="value">value</option>
                </select>
              </label>

              <label>
                Sort Order:
                <select
                  value={customConfig.sortOrder}
                  onChange={(e) => updateCustomConfig('sortOrder', e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                >
                  <option value="asc">asc</option>
                  <option value="desc">desc</option>
                </select>
              </label>

              <label>
                Limit (top N):
                <input
                  type="number"
                  value={customConfig.limit || ''}
                  onChange={(e) => updateCustomConfig('limit', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="No limit"
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                />
              </label>

              <label>
                Height (px):
                <input
                  type="number"
                  value={customConfig.height}
                  onChange={(e) => updateCustomConfig('height', parseInt(e.target.value) || 400)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '4px' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={customConfig.showLegend}
                  onChange={(e) => updateCustomConfig('showLegend', e.target.checked)}
                />
                Show Legend
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={customConfig.enableExport}
                  onChange={(e) => updateCustomConfig('enableExport', e.target.checked)}
                />
                Enable Export
              </label>
            </div>

            {/* Custom Chart */}
            <SimpleChart
              entityName={customConfig.entityName}
              data={customData}
              groupBy={customConfig.groupBy}
              stackBy={customConfig.stackBy || undefined}
              valueField={customConfig.valueField || undefined}
              aggregateMethod={customConfig.aggregateMethod}
              chartType={customConfig.chartType}
              title="Custom Chart Configuration"
              height={customConfig.height}
              sortBy={customConfig.sortBy}
              sortOrder={customConfig.sortOrder}
              limit={customConfig.limit}
              showLegend={customConfig.showLegend}
              enableExport={customConfig.enableExport}
              onDataPointClick={handleChartClick}
              onChartRendered={handleChartRendered}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          </div>
        );

      default:
        return null;
    }
  };

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
          SimpleChart Test Harness
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#595959' }}>
          Testing with MemberJunction data: Actions (~217 records, 28 categories), Action Params (~1800 records), AI Model Costs (~71 records).
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        marginBottom: '20px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #d9d9d9',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #d9d9d9' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setClickedData(null); // Clear clicked data when switching tabs
              }}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#1890ff' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#262626',
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Chart Area */}
        <div style={{ padding: '24px' }}>
          {renderChart()}
        </div>
      </div>

      {/* Clicked Data - DataGrid */}
      {clickedData && clickedData.records && clickedData.records.length > 0 && (
        <div style={{
          marginBottom: '20px',
          padding: '16px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #d9d9d9'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#262626' }}>
            Clicked Segment: {clickedData.label} ({clickedData.records.length} records)
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#595959' }}>
            Value: {clickedData.value} | Percentage: {clickedData.percentage?.toFixed(1)}%
          </p>
          <DataGrid
            data={clickedData.records}
            columns={Object.keys(clickedData.records[0] || {}).slice(0, 6)} // Show first 6 columns
            pageSize={10}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
          />
        </div>
      )}

      {/* Event Log */}
      <div style={{
        padding: '16px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #d9d9d9'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#262626' }}>
          Event Log
        </h3>
        <div style={{
          maxHeight: '200px',
          overflowY: 'auto',
          fontSize: '12px',
          fontFamily: 'monospace',
          backgroundColor: '#fafafa',
          padding: '8px',
          borderRadius: '4px'
        }}>
          {eventLog.length === 0 && (
            <div style={{ color: '#8c8c8c', fontStyle: 'italic' }}>No events yet</div>
          )}
          {eventLog.map((log, index) => (
            <div key={index} style={{ marginBottom: '4px', color: '#262626' }}>
              <span style={{ color: '#1890ff' }}>[{log.timestamp}]</span> {log.message}
              {log.data && (
                <span style={{ color: '#8c8c8c' }}> {JSON.stringify(log.data)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
