function AIPerformanceDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  console.log('[AIPerformanceDashboard] Initializing with settings:', savedUserSettings);
  console.log('[AIPerformanceDashboard] Available components:', components ? Object.keys(components) : 'none');
  
  // Extract child components with fallbacks
  const {
    AITimeSeriesChart,
    AIDistributionChart,
    AIDetailTable,
    AIMetricsSummary,
    AIInsightsPanel,
    DataExportPanel
  } = components;
  
  // Check if required components are available
  if (!AITimeSeriesChart || !AIDistributionChart || !AIDetailTable || !AIMetricsSummary || !AIInsightsPanel) {
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
          !AIMetricsSummary && 'AIMetricsSummary',
          !AIInsightsPanel && 'AIInsightsPanel'
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
  
  // AI Insights state
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  
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

    // Ensure all numeric values are valid (not NaN) before returning
    const result = Object.values(grouped)
      .map(group => ({
        ...group,
        runs: Number.isFinite(group.runs) ? group.runs : 0,
        tokens: Number.isFinite(group.tokens) ? group.tokens : 0,
        cost: Number.isFinite(group.cost) ? group.cost : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
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

  // Prepare data for export - memoized to prevent re-computation
  const prepareExportData = React.useMemo(() => {
    const currentData = activeTab === 'agents' ? agentRuns : promptRuns;
    const dateField = activeTab === 'agents' ? 'StartedAt' : 'RunAt';

    return currentData.map(item => ({
      ID: item.ID || '',
      Name: activeTab === 'agents' ? (item.Agent || '') : (item.Prompt || ''),
      Type: activeTab === 'agents' ? 'Agent Run' : 'Prompt Run',
      Model: item.Model || '',
      ExecutionDate: item[dateField] ? new Date(item[dateField]).toLocaleDateString() : '',
      Success: item.Success ? 'Yes' : 'No',
      TokensUsed: item.TotalTokensUsed || item.TokensUsed || 0,
      Cost: item.TotalCost ? `$${item.TotalCost.toFixed(4)}` : '$0.0000',
      CompletedAt: item.CompletedAt ? new Date(item.CompletedAt).toLocaleDateString() : ''
    }));
  }, [activeTab, agentRuns, promptRuns]);

  // Define export columns - memoized to prevent re-creation
  const getExportColumns = React.useMemo(() => {
    return [
      { key: 'ID', label: 'ID' },
      { key: 'Name', label: activeTab === 'agents' ? 'Agent Name' : 'Prompt Name' },
      { key: 'Type', label: 'Type' },
      { key: 'Model', label: 'Model' },
      { key: 'ExecutionDate', label: 'Execution Date' },
      { key: 'Success', label: 'Success' },
      { key: 'TokensUsed', label: 'Tokens Used' },
      { key: 'Cost', label: 'Cost' },
      { key: 'CompletedAt', label: 'Completed At' }
    ];
  }, [activeTab]);
  

  // Generate AI Insights - wrap with useCallback
  const generateAIInsights = React.useCallback(async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    
    try {
      const currentData = activeTab === 'agents' ? agentRuns : promptRuns;
      const dataType = activeTab === 'agents' ? 'AI Agent' : 'AI Prompt';
      
      // Calculate additional metrics for deeper analysis
      const modelDistribution = {};
      const agentDistribution = {};
      let successRate = 0;
      let failureCount = 0;
      
      currentData.forEach(run => {
        // Model distribution
        const model = run.Model || run.ModelID || 'Unknown';
        modelDistribution[model] = (modelDistribution[model] || 0) + 1;
        
        // Agent/Prompt distribution
        const name = run.Agent || run.AgentName || run.Prompt || run.PromptName || 'Unknown';
        agentDistribution[name] = (agentDistribution[name] || 0) + 1;
        
        // Success tracking
        if (run.IsSuccess === true || run.Status === 'Success') {
          successRate++;
        } else if (run.IsSuccess === false || run.Status === 'Failed') {
          failureCount++;
        }
      });
      
      successRate = currentData.length > 0 ? ((successRate / currentData.length) * 100).toFixed(1) : 0;
      
      const prompt = `Analyze this ${dataType} performance data and provide actionable insights:

## Performance Overview
- **Time Period:** ${timeRange}
- **Data Grouping:** ${groupBy}
- **Total Runs:** ${metrics.totalRuns}
- **Total Tokens Used:** ${metrics.totalTokens.toLocaleString()}
- **Total Cost:** $${metrics.totalCost.toFixed(2)}
- **Average Tokens per Run:** ${metrics.avgTokensPerRun.toLocaleString()}
- **Average Cost per Run:** $${metrics.avgCostPerRun.toFixed(4)}
- **Success Rate:** ${successRate}%
- **Failed Runs:** ${failureCount}

## Model Distribution
${Object.entries(modelDistribution)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([model, count]) => `- **${model}:** ${count} runs (${((count/metrics.totalRuns)*100).toFixed(1)}%)`)
  .join('\n')}

## Top ${dataType === 'AI Agent' ? 'Agents' : 'Prompts'}
${Object.entries(agentDistribution)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([name, count]) => `- **${name}:** ${count} runs`)
  .join('\n')}

## Recent Performance Trends (Last 5 ${groupBy === 'hour' ? 'Hours' : groupBy === 'day' ? 'Days' : 'Periods'})
${chartData.slice(-5).map(d =>
  `- **${d.date}:** ${d.runs} runs, ${d.tokens?.toLocaleString() || '0'} tokens, $${d.cost?.toFixed(2) || '0.00'}`
).join('\n')}

## Cost Analysis
- **Highest Cost Period:** ${chartData.reduce((max, d) => d.cost > max.cost ? d : max, chartData?.[0] || {}).date || 'N/A'}
- **Most Active Period:** ${chartData.reduce((max, d) => d.runs > max.runs ? d : max, chartData?.[0] || {}).date || 'N/A'}
- **Token Efficiency Trend:** ${chartData.length > 1 
  ? (chartData[chartData.length-1].tokens/chartData[chartData.length-1].runs < chartData[0].tokens/chartData[0].runs 
    ? 'Improving' : 'Declining')
  : 'Stable'}

Based on this specific data, please provide:
1. **Key Performance Insights** - What patterns and trends are evident in the data?
2. **Cost Efficiency Analysis** - Are costs justified by usage patterns? Where can we optimize?
3. **Token Usage Patterns** - Any unusual spikes or inefficiencies?
4. **Model Optimization** - Should we adjust model selection based on the distribution?
5. **Specific Recommendations** - 3-4 actionable steps to improve performance and reduce costs
6. **Risk Indicators** - Any anomalies or concerns that need immediate attention?

Use markdown formatting with headers (##), bullet points, and **bold** text. Reference the actual numbers in your analysis.`;
      
      const result = await utilities.ai.ExecutePrompt({
        systemPrompt: 'You are an expert AI performance analyst specializing in token usage optimization, cost management, and AI system efficiency. Analyze the specific metrics provided and give actionable recommendations. Always reference the actual numbers and percentages from the data. Format your response in clear markdown.',
        messages: prompt,
        preferredModels: ['GPT-OSS-120B', 'Qwen3 32B'],
        modelPower: 'high',
        temperature: 0.7,
        maxTokens: 1500
      });
      
      if (result?.success && result?.result) {
        setAiInsights(result.result);
      } else {
        setInsightsError('Failed to generate insights. Please try again.');
      }
    } catch (error) {
      setInsightsError(error.message || 'Failed to generate AI insights');
    } finally {
      setLoadingInsights(false);
    }
  }, [activeTab, agentRuns, promptRuns, utilities.ai]);
  
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
      <style>{`
        /* Markdown content styling */
        .markdown-insights h1 { font-size: 20px; font-weight: 600; color: #111827; margin: 16px 0 12px 0; }
        .markdown-insights h2 { font-size: 18px; font-weight: 600; color: #1F2937; margin: 14px 0 10px 0; }
        .markdown-insights h3 { font-size: 16px; font-weight: 600; color: #374151; margin: 12px 0 8px 0; }
        .markdown-insights h4 { font-size: 14px; font-weight: 600; color: #4B5563; margin: 10px 0 6px 0; }
        .markdown-insights p { margin: 8px 0; color: #374151; line-height: 1.6; }
        .markdown-insights ul, .markdown-insights ol { margin: 8px 0; padding-left: 24px; color: #374151; }
        .markdown-insights li { margin: 4px 0; line-height: 1.5; }
        .markdown-insights strong { font-weight: 600; color: #1F2937; }
        .markdown-insights em { font-style: italic; }
        .markdown-insights code { background: #F3F4F6; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
        .markdown-insights blockquote { border-left: 3px solid #6366F1; padding-left: 12px; margin: 12px 0; color: #4B5563; }
        .markdown-insights hr { border: none; border-top: 1px solid #E5E7EB; margin: 16px 0; }
        .markdown-insights a { color: #6366F1; text-decoration: none; }
        .markdown-insights a:hover { text-decoration: underline; }
      `}</style>
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
          
          {/* Export Button */}
          {DataExportPanel && (
            <DataExportPanel
              key="export-panel"  // Add stable key
              data={prepareExportData}
              columns={getExportColumns}
              filename={`ai-performance-${activeTab}-${new Date().toISOString().split('T')[0]}`}
              formats={['csv', 'excel', 'pdf']}
              buttonStyle="dropdown"
              buttonText="Export"
              icon="fa-download"
              customStyles={{
                button: {
                  padding: `${styles.spacing.sm} ${styles.spacing.md}`,
                  backgroundColor: '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: styles.borders?.radius || '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: styles.spacing.xs
                }
              }}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          )}

          {/* AI Insights Button */}
          <button
            onClick={generateAIInsights}
            disabled={loadingInsights || loading}
            style={{
              padding: `${styles.spacing.sm} ${styles.spacing.md}`,
              backgroundColor: styles.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: styles.borders?.radius || '4px',
              cursor: loadingInsights || loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: styles.spacing.xs,
              opacity: loadingInsights || loading ? 0.6 : 1
            }}
          >
            <i className={`fa-solid fa-${loadingInsights ? 'spinner fa-spin' : 'wand-magic-sparkles'}`}></i>
            {loadingInsights ? 'Analyzing...' : 'Get AI Insights'}
          </button>
        </div>
      </div>
      
      {/* AI Insights Panel */}
      <AIInsightsPanel
        utilities={utilities}
        styles={styles}
        components={components}
        callbacks={callbacks}
        savedUserSettings={savedUserSettings?.aiInsights}
        onSaveUserSettings={(settings) => onSaveUserSettings?.({
          ...savedUserSettings,
          aiInsights: settings
        })}
        insights={aiInsights}
        loading={loadingInsights}
        error={insightsError}
        onGenerate={generateAIInsights}
        title="AI-Powered Performance Analysis"
        icon="fa-wand-magic-sparkles"
        iconColor={styles.colors.primary}
        position="top"
        onClose={() => {
          setAiInsights(null);
          setInsightsError(null);
        }}
      />
      
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