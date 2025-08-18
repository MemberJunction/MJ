function AIPerformanceDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  console.log('[AIPerformanceDashboard] Initializing with settings:', savedUserSettings);
  console.log('[AIPerformanceDashboard] Available components:', components ? Object.keys(components) : 'none');
  
  // Extract child components with fallbacks
  const AITimeSeriesChart = components?.AITimeSeriesChart;
  const AIDistributionChart = components?.AIDistributionChart;
  const AIDetailTable = components?.AIDetailTable;
  const AIMetricsSummary = components?.AIMetricsSummary;
  
  // Check if required components are available
  if (!AITimeSeriesChart || !AIDistributionChart || !AIDetailTable || !AIMetricsSummary) {
    return (
      <div style={{
        padding: styles?.spacing?.lg || '20px',
        color: styles?.colors?.error || 'red',
        textAlign: 'center'
      }}>
        Error: Required child components are not available. Please ensure all dashboard components are loaded.
        <br />
        Missing: {[
          !AITimeSeriesChart && 'AITimeSeriesChart',
          !AIDistributionChart && 'AIDistributionChart',
          !AIDetailTable && 'AIDetailTable',
          !AIMetricsSummary && 'AIMetricsSummary'
        ].filter(Boolean).join(', ')}
      </div>
    );
  }
  
  // Initialize state from saved settings
  const [timeRange, setTimeRange] = useState(savedUserSettings?.timeRange || '30d');
  const [groupBy, setGroupBy] = useState(savedUserSettings?.groupBy || 'day');
  const [activeTab, setActiveTab] = useState(savedUserSettings?.activeTab || 'agents');
  const [selectedPoint, setSelectedPoint] = useState(null);
  
  // Data state
  const [agentRuns, setAgentRuns] = useState([]);
  const [promptRuns, setPromptRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Calculate date range
  const getDateRange = useCallback(() => {
    const end = new Date();
    const start = new Date();
    
    switch(timeRange) {
      case '7d':
        start.setDate(end.getDate() - 7);
        break;
      case '30d':
        start.setDate(end.getDate() - 30);
        break;
      case '90d':
        start.setDate(end.getDate() - 90);
        break;
      case '1y':
        start.setFullYear(end.getFullYear() - 1);
        break;
      default:
        start.setDate(end.getDate() - 30);
    }
    
    return { start, end };
  }, [timeRange]);
  
  // Load data
  useEffect(() => {
    const loadData = async () => {
      console.log('[AIPerformanceDashboard] Loading data for range:', timeRange);
      setLoading(true);
      setError(null);
      
      const { start, end } = getDateRange();
      
      try {
        // Load agent runs
        const agentFilter = `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`;
        console.log('[AIPerformanceDashboard] Loading agent runs with filter:', agentFilter);
        
        const agentResult = await utilities.rv.RunView({
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: agentFilter,
          OrderBy: 'StartedAt ASC',
          Fields: ['ID', 'AgentID', 'Agent', 'StartedAt', 'CompletedAt', 'Success', 'TotalTokensUsed', 'TotalCost'],
          MaxRows: 10000
        });
        
        console.log('[AIPerformanceDashboard] Agent runs loaded:', {
          success: agentResult?.Success,
          count: agentResult?.Results?.length,
          error: agentResult?.ErrorMessage
        });
        
        if (agentResult?.Success) {
          setAgentRuns(agentResult.Results || []);
        } else {
          console.error('[AIPerformanceDashboard] Failed to load agent runs:', agentResult?.ErrorMessage);
        }
        
        // Load prompt runs
        const promptFilter = `RunAt >= '${start.toISOString()}' AND RunAt <= '${end.toISOString()}'`;
        console.log('[AIPerformanceDashboard] Loading prompt runs with filter:', promptFilter);
        
        const promptResult = await utilities.rv.RunView({
          EntityName: 'MJ: AI Prompt Runs',
          ExtraFilter: promptFilter,
          OrderBy: 'RunAt ASC',
          Fields: ['ID', 'PromptID', 'Prompt', 'ModelID', 'Model', 'RunAt', 'CompletedAt', 'Success', 'TokensUsed', 'TotalCost'],
          MaxRows: 10000
        });
        
        console.log('[AIPerformanceDashboard] Prompt runs loaded:', {
          success: promptResult?.Success,
          count: promptResult?.Results?.length,
          error: promptResult?.ErrorMessage
        });
        
        if (promptResult?.Success) {
          setPromptRuns(promptResult.Results || []);
        } else {
          console.error('[AIPerformanceDashboard] Failed to load prompt runs:', promptResult?.ErrorMessage);
        }
        
      } catch (error) {
        console.error('[AIPerformanceDashboard] Error loading data:', error);
        setError(error.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [timeRange, utilities.rv, getDateRange]);
  
  // Aggregate data by time period
  const aggregateData = useCallback((data, dateField, grouping) => {
    console.log(`[AIPerformanceDashboard] Aggregating ${data.length} records by ${grouping}`);
    
    const grouped = {};
    
    data.forEach(item => {
      const date = new Date(item[dateField]);
      let key;
      
      switch(grouping) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'quarter':
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `${date.getFullYear()}-Q${quarter}`;
          break;
        default:
          key = date.toISOString().split('T')[0];
      }
      
      if (!grouped[key]) {
        grouped[key] = {
          date: key,
          runs: 0,
          tokens: 0,
          cost: 0,
          items: []
        };
      }
      
      grouped[key].runs++;
      grouped[key].tokens += (item.TotalTokensUsed || item.TokensUsed || 0);
      grouped[key].cost += (item.TotalCost || 0);
      grouped[key].items.push(item);
    });
    
    const result = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    console.log(`[AIPerformanceDashboard] Aggregated into ${result.length} groups`);
    return result;
  }, []);
  
  // Get aggregated data for current view
  const chartData = useMemo(() => {
    const data = activeTab === 'agents' ? agentRuns : promptRuns;
    const dateField = activeTab === 'agents' ? 'StartedAt' : 'RunAt';
    return aggregateData(data, dateField, groupBy);
  }, [activeTab, agentRuns, promptRuns, groupBy, aggregateData]);
  
  // Handle drill-down
  const handleChartClick = useCallback((dataPoint) => {
    console.log('[AIPerformanceDashboard] Chart clicked:', dataPoint);
    setSelectedPoint(dataPoint);
  }, []);
  
  // Handle time range change
  const handleTimeRangeChange = useCallback((range) => {
    console.log('[AIPerformanceDashboard] Time range changed to:', range);
    setTimeRange(range);
    setSelectedPoint(null);
    onSaveUserSettings?.({
      ...savedUserSettings,
      timeRange: range
    });
  }, [savedUserSettings, onSaveUserSettings]);
  
  // Handle grouping change
  const handleGroupByChange = useCallback((grouping) => {
    console.log('[AIPerformanceDashboard] Grouping changed to:', grouping);
    setGroupBy(grouping);
    setSelectedPoint(null);
    onSaveUserSettings?.({
      ...savedUserSettings,
      groupBy: grouping
    });
  }, [savedUserSettings, onSaveUserSettings]);
  
  // Handle tab change
  const handleTabChange = useCallback((tab) => {
    console.log('[AIPerformanceDashboard] Tab changed to:', tab);
    setActiveTab(tab);
    setSelectedPoint(null);
    onSaveUserSettings?.({
      ...savedUserSettings,
      activeTab: tab
    });
  }, [savedUserSettings, onSaveUserSettings]);
  
  // Calculate summary metrics
  const metrics = useMemo(() => {
    const data = activeTab === 'agents' ? agentRuns : promptRuns;
    return {
      totalRuns: data.length,
      totalTokens: data.reduce((sum, item) => sum + (item.TotalTokensUsed || item.TokensUsed || 0), 0),
      totalCost: data.reduce((sum, item) => sum + (item.TotalCost || 0), 0),
      avgTokensPerRun: data.length > 0 ? Math.round(data.reduce((sum, item) => sum + (item.TotalTokensUsed || item.TokensUsed || 0), 0) / data.length) : 0,
      avgCostPerRun: data.length > 0 ? data.reduce((sum, item) => sum + (item.TotalCost || 0), 0) / data.length : 0
    };
  }, [activeTab, agentRuns, promptRuns]);
  
  console.log('[AIPerformanceDashboard] Current state:', {
    timeRange,
    groupBy,
    activeTab,
    agentRunsCount: agentRuns.length,
    promptRunsCount: promptRuns.length,
    chartDataPoints: chartData.length,
    selectedPoint: selectedPoint?.date
  });
  
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        color: styles.colors.textSecondary
      }}>
        Loading performance data...
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        color: styles.colors.error
      }}>
        Error: {error}
      </div>
    );
  }
  
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: styles.colors.background,
      padding: styles.spacing.md
    }}>
      {/* Header Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: styles.spacing.lg,
        flexWrap: 'wrap',
        gap: styles.spacing.md
      }}>
        {/* Tab Selector */}
        <div style={{
          display: 'flex',
          gap: styles.spacing.xs,
          backgroundColor: styles.colors.surface,
          padding: styles.spacing.xs,
          borderRadius: styles.borders?.radius || '4px'
        }}>
          <button
            onClick={() => handleTabChange('agents')}
            style={{
              padding: `${styles.spacing.sm} ${styles.spacing.md}`,
              backgroundColor: activeTab === 'agents' ? styles.colors.primary : 'transparent',
              color: activeTab === 'agents' ? 'white' : styles.colors.text,
              border: 'none',
              borderRadius: styles.borders?.radius || '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'agents' ? '600' : '400'
            }}
          >
            Agent Runs
          </button>
          <button
            onClick={() => handleTabChange('prompts')}
            style={{
              padding: `${styles.spacing.sm} ${styles.spacing.md}`,
              backgroundColor: activeTab === 'prompts' ? styles.colors.primary : 'transparent',
              color: activeTab === 'prompts' ? 'white' : styles.colors.text,
              border: 'none',
              borderRadius: styles.borders?.radius || '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'prompts' ? '600' : '400'
            }}
          >
            Prompt Runs
          </button>
        </div>
        
        {/* Time Controls */}
        <div style={{
          display: 'flex',
          gap: styles.spacing.md,
          alignItems: 'center'
        }}>
          {/* Time Range */}
          <select
            value={timeRange}
            onChange={(e) => handleTimeRangeChange(e.target.value)}
            style={{
              padding: styles.spacing.sm,
              border: `1px solid ${styles.colors.border}`,
              borderRadius: styles.borders?.radius || '4px',
              backgroundColor: styles.colors.surface,
              color: styles.colors.text
            }}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="1y">Last Year</option>
          </select>
          
          {/* Group By */}
          <select
            value={groupBy}
            onChange={(e) => handleGroupByChange(e.target.value)}
            style={{
              padding: styles.spacing.sm,
              border: `1px solid ${styles.colors.border}`,
              borderRadius: styles.borders?.radius || '4px',
              backgroundColor: styles.colors.surface,
              color: styles.colors.text
            }}
          >
            <option value="day">By Day</option>
            <option value="week">By Week</option>
            <option value="month">By Month</option>
            <option value="quarter">By Quarter</option>
          </select>
        </div>
      </div>
      
      {/* Metrics Summary */}
      <AIMetricsSummary
        metrics={metrics}
        styles={styles}
        utilities={utilities}
        components={components}
        callbacks={callbacks}
        savedUserSettings={savedUserSettings?.metricsSummary}
        onSaveUserSettings={(settings) => onSaveUserSettings?.({
          ...savedUserSettings,
          metricsSummary: settings
        })}
      />
      
      {/* Main Chart Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: styles.spacing.lg,
        minHeight: 0
      }}>
        {/* Time Series Chart */}
        <div style={{
          flex: selectedPoint ? '0 0 400px' : '1',
          minHeight: '300px'
        }}>
          <AITimeSeriesChart
            data={chartData}
            groupBy={groupBy}
            activeTab={activeTab}
            selectedPoint={selectedPoint}
            onPointClick={handleChartClick}
            styles={styles}
            utilities={utilities}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings?.timeSeriesChart}
            onSaveUserSettings={(settings) => onSaveUserSettings?.({
              ...savedUserSettings,
              timeSeriesChart: settings
            })}
          />
        </div>
        
        {/* Drill-down Area */}
        {selectedPoint && (
          <div style={{
            flex: 1,
            display: 'flex',
            gap: styles.spacing.md,
            minHeight: 0
          }}>
            {/* Distribution Chart */}
            <div style={{ flex: '0 0 400px' }}>
              <AIDistributionChart
                data={selectedPoint.items}
                activeTab={activeTab}
                groupBy={groupBy}
                styles={styles}
                utilities={utilities}
                components={components}
                callbacks={callbacks}
                savedUserSettings={savedUserSettings?.distributionChart}
                onSaveUserSettings={(settings) => onSaveUserSettings?.({
                  ...savedUserSettings,
                  distributionChart: settings
                })}
              />
            </div>
            
            {/* Detail Table */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <AIDetailTable
                data={selectedPoint.items}
                activeTab={activeTab}
                styles={styles}
                utilities={utilities}
                components={components}
                callbacks={callbacks}
                savedUserSettings={savedUserSettings?.detailTable}
                onSaveUserSettings={(settings) => onSaveUserSettings?.({
                  ...savedUserSettings,
                  detailTable: settings
                })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}