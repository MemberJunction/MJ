function SalesPipelineDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState(savedUserSettings?.timeFilter || 'quarter');
  const [startDate, setStartDate] = useState(savedUserSettings?.startDate || null);
  const [endDate, setEndDate] = useState(savedUserSettings?.endDate || null);
  const [drillDownData, setDrillDownData] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const chartRef = useRef(null);
  const saveSettingsTimeoutRef = useRef(null);

  // Debounced save settings function
  const debouncedSaveSettings = useCallback((newSettings) => {
    if (saveSettingsTimeoutRef.current) {
      clearTimeout(saveSettingsTimeoutRef.current);
    }
    saveSettingsTimeoutRef.current = setTimeout(() => {
      if (onSaveUserSettings) {
        onSaveUserSettings(newSettings);
      }
    }, 1000); // Save after 1 second of no changes
  }, [onSaveUserSettings]);

  const stages = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
  const stageColors = {
    'Lead': '#3B82F6',
    'Qualified': '#6366F1',
    'Proposal': '#8B5CF6',
    'Negotiation': '#A855F7',
    'Closed Won': '#10B981',
    'Closed Lost': '#EF4444'
  };

  // Load sub-components from registry
  const PipelineMetricsCards = components['PipelineMetricsCards'];
  const PipelineKanban = components['PipelineKanban'];
  const DealCards = components['DealCards'];
  const DealList = components['DealList'];
  const DrillDownPanel = components['DrillDownPanel'];

  useEffect(() => {
    loadData();
  }, [timeFilter, startDate, endDate]);

  const getDateFilter = () => {
    if (startDate && endDate) {
      return `CloseDate >= '${startDate}' AND CloseDate <= '${endDate}'`;
    }
    
    const now = dayjs();
    let filterStart;
    
    switch (timeFilter) {
      case 'month':
        filterStart = now.subtract(1, 'month');
        break;
      case 'quarter':
        filterStart = now.subtract(3, 'month');
        break;
      case 'year':
        filterStart = now.subtract(1, 'year');
        break;
      case 'all':
        return '';
      default:
        return '';
    }
    
    return `CloseDate >= '${filterStart.format('YYYY-MM-DD')}'`;
  };

  const handleDateRangeChange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
    setTimeFilter('custom');
    debouncedSaveSettings({ 
      ...savedUserSettings, 
      startDate: start, 
      endDate: end,
      timeFilter: 'custom'
    });
  };
  
  const handlePresetChange = (preset) => {
    setTimeFilter(preset);
    setStartDate(null);
    setEndDate(null);
    debouncedSaveSettings({ 
      ...savedUserSettings, 
      timeFilter: preset,
      startDate: null,
      endDate: null
    });
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    const dateFilter = getDateFilter();
    
    try {
      const [dealsResult, activitiesResult] = await Promise.all([
        utilities.rv.RunView({
          EntityName: 'Deals',
          ExtraFilter: dateFilter,
          OrderBy: 'CloseDate DESC'
        }),
        utilities.rv.RunView({
          EntityName: 'Activities',
          ExtraFilter: `__mj_CreatedAt >= '${dayjs().subtract(30, 'day').format('YYYY-MM-DD')}'`,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 100
        })
      ]);

      if (dealsResult.Success) {
        setDeals(dealsResult.Results || []);
      }
      if (activitiesResult.Success) {
        setActivities(activitiesResult.Results || []);
      }
      
      if (!dealsResult.Success && !activitiesResult.Success) {
        setError('Failed to load dashboard data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = () => {
    const totalValue = deals.reduce((sum, d) => sum + (d.Amount || 0), 0);
    const wonDeals = deals.filter(d => d.Stage === 'Closed Won');
    const lostDeals = deals.filter(d => d.Stage === 'Closed Lost');
    const activeDeals = deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage));
    
    const avgDealSize = deals.length > 0 ? totalValue / deals.length : 0;
    const winRate = deals.length > 0 ? (wonDeals.length / (wonDeals.length + lostDeals.length) * 100) : 0;
    const avgCycleTime = activeDeals.length > 0 ?
      activeDeals.reduce((sum, d) => {
        const created = new Date(d.CreatedAt || d.__mj_CreatedAt);
        const now = new Date();
        return sum + Math.floor((now - created) / (1000 * 60 * 60 * 24));
      }, 0) / activeDeals.length : 0;
    
    return {
      totalValue,
      avgDealSize,
      winRate,
      avgCycleTime,
      activeCount: activeDeals.length,
      wonCount: wonDeals.length,
      lostCount: lostDeals.length
    };
  };

  const generateAIInsights = async () => {
    console.log('🎯 generateAIInsights called');
    console.log('📦 utilities object:', utilities);
    console.log('🤖 utilities.ai:', utilities?.ai);
    console.log('🔧 utilities.ai.ExecutePrompt type:', typeof utilities?.ai?.ExecutePrompt);
    
    if (!deals || deals.length === 0) {
      setInsightsError('No data available for analysis');
      return;
    }
    
    if (!utilities?.ai?.ExecutePrompt) {
      console.error('❌ utilities.ai.ExecutePrompt is not available');
      setInsightsError('AI service not available');
      return;
    }

    setLoadingInsights(true);
    setInsightsError(null);
    
    try {
      const metrics = calculateMetrics();
      const activeDeals = deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage));
      
      // Calculate stage distribution and conversion rates
      const stageDistribution = {};
      stages.forEach(stage => {
        stageDistribution[stage] = deals.filter(d => d.Stage === stage).length;
      });
      
      // Calculate conversion rates between stages
      const conversionRates = {};
      for (let i = 0; i < stages.length - 2; i++) { // Exclude closed stages
        const currentStage = stages[i];
        const nextStage = stages[i + 1];
        const currentCount = stageDistribution[currentStage] || 0;
        const nextCount = stageDistribution[nextStage] || 0;
        const totalDownstream = stages.slice(i + 1).reduce((sum, s) => sum + (stageDistribution[s] || 0), 0);
        
        if (currentCount > 0) {
          conversionRates[`${currentStage} → ${nextStage}`] = 
            ((totalDownstream / (currentCount + totalDownstream)) * 100).toFixed(1);
        }
      }
      
      // Calculate velocity metrics
      const dealsByAge = activeDeals.map(d => {
        const created = new Date(d.CreatedAt || d.__mj_CreatedAt);
        const now = new Date();
        const daysOld = Math.floor((now - created) / (1000 * 60 * 60 * 24));
        return { stage: d.Stage, daysOld, amount: d.Amount || 0 };
      });
      
      const stuckDeals = dealsByAge.filter(d => d.daysOld > metrics.avgCycleTime * 1.5);
      
      // Prepare data snapshot for AI
      const dataSnapshot = {
        summary: {
          totalDeals: deals.length,
          totalPipelineValue: metrics.totalValue,
          averageDealSize: metrics.avgDealSize,
          winRate: metrics.winRate.toFixed(1),
          averageCycleTime: Math.round(metrics.avgCycleTime),
          activeDeals: metrics.activeCount,
          wonDeals: metrics.wonCount,
          lostDeals: metrics.lostCount
        },
        stageDistribution,
        conversionRates,
        bottlenecks: {
          stuckDealsCount: stuckDeals.length,
          stuckDealsValue: stuckDeals.reduce((sum, d) => sum + d.amount, 0),
          averageStuckDays: stuckDeals.length > 0 ? 
            Math.round(stuckDeals.reduce((sum, d) => sum + d.daysOld, 0) / stuckDeals.length) : 0
        },
        recentTrends: {
          dealsClosedThisMonth: deals.filter(d => {
            const closeDate = new Date(d.CloseDate);
            const now = new Date();
            return closeDate.getMonth() === now.getMonth() && 
                   closeDate.getFullYear() === now.getFullYear();
          }).length,
          timeFrame: timeFilter
        }
      };
      
      // Call AI for insights with formatted data
      const prompt = `Analyze this sales pipeline data and provide actionable insights:

## Pipeline Summary
- **Total Deals:** ${dataSnapshot.summary.totalDeals}
- **Pipeline Value:** $${dataSnapshot.summary.totalPipelineValue.toLocaleString()}
- **Average Deal Size:** $${dataSnapshot.summary.averageDealSize.toLocaleString()}
- **Win Rate:** ${dataSnapshot.summary.winRate}%
- **Average Cycle Time:** ${dataSnapshot.summary.averageCycleTime} days
- **Active Deals:** ${dataSnapshot.summary.activeDeals}
- **Won Deals:** ${dataSnapshot.summary.wonDeals}
- **Lost Deals:** ${dataSnapshot.summary.lostDeals}

## Stage Distribution
${Object.entries(stageDistribution).map(([stage, count]) => `- **${stage}:** ${count} deals`).join('\n')}

## Conversion Rates
${Object.entries(conversionRates).map(([transition, rate]) => `- ${transition}: ${rate}%`).join('\n')}

## Bottlenecks
- **Stuck Deals:** ${dataSnapshot.bottlenecks.stuckDealsCount} deals
- **Value at Risk:** $${dataSnapshot.bottlenecks.stuckDealsValue.toLocaleString()}
- **Average Days Stuck:** ${dataSnapshot.bottlenecks.averageStuckDays} days

## Recent Activity
- **Deals Closed This Month:** ${dataSnapshot.recentTrends.dealsClosedThisMonth}
- **Time Frame Analyzed:** ${dataSnapshot.recentTrends.timeFrame}

Based on this specific data, please provide:
1. **Key Performance Highlights** - What's working well based on these numbers?
2. **Pipeline Health Assessment** - Is this pipeline balanced and healthy?
3. **Bottleneck Analysis** - Where specifically are the ${dataSnapshot.bottlenecks.stuckDealsCount} stuck deals concentrated?
4. **Conversion Rate Analysis** - Which specific transitions need improvement?
5. **3 Specific Recommendations** - Based on the data, what actions would improve velocity and win rate?
6. **Risk Indicators** - What specific risks do you see in these numbers?

Use markdown formatting with headers (##), bullet points, and **bold** text. Reference the actual numbers in your analysis.`;

      console.log('🔍 Calling utilities.ai.ExecutePrompt with:', {
        systemPrompt: 'You are a sales analytics expert...',
        messageLength: prompt.length,
        modelPower: 'medium',
        fullPrompt: prompt.substring(0, 500) + '...' // Show first 500 chars
      });
      
      // Use the correct parameter structure with systemPrompt and better models
      const aiParams = {
        systemPrompt: 'You are a sales analytics expert. Analyze sales pipeline data and provide clear, actionable business insights formatted with sections and bullet points. Focus on strategic recommendations, not technical implementation.',
        messages: prompt,  // Just pass the prompt as messages
        preferredModels: ['GPT-OSS-120B', 'Qwen3 32B'],  // Use more capable models
        modelPower: 'high'  // Use higher power for better reasoning
      };
      
      console.log('📝 AI params with systemPrompt:', {
        hasSystemPrompt: !!aiParams.systemPrompt,
        messagesLength: aiParams.messages?.length,
        modelPower: aiParams.modelPower
      });
      
      const result = await utilities.ai.ExecutePrompt(aiParams);
      
      console.log('📊 ExecutePrompt result:', {
        fullResult: result,
        hasSuccess: 'Success' in result,
        successValue: result?.Success,
        hasResponse: 'Response' in result,
        responseType: typeof result?.Response,
        responseLength: result?.Response?.length,
        errorMessage: result?.ErrorMessage,
        allKeys: Object.keys(result || {}),
        // Check for alternative property names
        hasSuccess2: 'success' in result,
        success: result?.success,
        hasResult: 'result' in result,
        result: result?.result,
        hasResponse2: 'response' in result,
        response: result?.response,
        hasError: 'error' in result,
        error: result?.error,
        hasMessage: 'message' in result,
        message: result?.message
      });
      
      if (result.success && result.result) {
        console.log('✅ Setting AI insights to:', result.result);
        setAiInsights(result.result);
      } else {
        const error = result.error || result.message || 'Failed to generate insights';
        console.log('❌ Setting error:', error, 'Full result:', result);
        setInsightsError(error);
      }
    } catch (err) {
      console.error('🚨 Error in generateAIInsights:', {
        error: err,
        message: err.message,
        stack: err.stack,
        type: err.constructor.name
      });
      setInsightsError(`Error generating insights: ${err.message}`);
    } finally {
      setLoadingInsights(false);
    }
  };

  // Format insights text using marked library for proper markdown rendering
  const formatInsights = (text) => {
    if (!text) return null;
    
    // Use marked to parse markdown to HTML
    const htmlContent = marked.parse(text);
    
    // Return the HTML with dangerouslySetInnerHTML for React
    // Apply custom styling via a wrapper div with markdown-insights class
    return (
      <div 
        className="markdown-insights"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        style={{
          color: '#374151',
          lineHeight: '1.6'
        }}
      />
    );
  };
  
  // Copy markdown content to clipboard
  const copyInsightsToClipboard = async () => {
    if (!aiInsights) return;
    
    const textToCopy = typeof aiInsights === 'string' ? aiInsights : 
                       aiInsights.rawInsight || JSON.stringify(aiInsights, null, 2);
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      const copyBtn = document.querySelector('.copy-insights-btn');
      if (copyBtn) {
        const originalTitle = copyBtn.title;
        copyBtn.title = 'Copied!';
        setTimeout(() => {
          copyBtn.title = originalTitle;
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy insights:', err);
    }
  };
  
  // Export insights as markdown file
  const exportInsightsAsMarkdown = () => {
    if (!aiInsights) return;
    
    const textToExport = typeof aiInsights === 'string' ? aiInsights : 
                         aiInsights.rawInsight || JSON.stringify(aiInsights, null, 2);
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `sales-pipeline-insights-${timestamp}.md`;
    
    const markdownContent = `# Sales Pipeline Insights
Generated: ${new Date().toLocaleString()}
Time Period: ${timeFilter === 'custom' ? `${startDate} to ${endDate}` : timeFilter}

---

${textToExport}`;
    
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDrillDown = (title, dealList, type, metadata) => {
    setDrillDownData({ title, deals: dealList, type, metadata });
    setIsPanelOpen(true);
  };

  useEffect(() => {
    if (!loading && deals.length > 0) {
      renderPipelineChart();
    }
  }, [deals, loading]);

  const renderPipelineChart = () => {
    if (!chartRef.current) return;
    
    const stageData = stages.map(stage => ({
      name: stage,
      count: deals.filter(d => d.Stage === stage).length,
      value: deals.filter(d => d.Stage === stage).reduce((sum, d) => sum + (d.Amount || 0), 0)
    }));

    const options = {
      series: [{
        name: 'Deal Count',
        data: stageData.map(s => s.count)
      }, {
        name: 'Total Value',
        data: stageData.map(s => s.value / 1000) // In thousands
      }],
      chart: {
        type: 'bar',
        height: 300,
        toolbar: { show: false }
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%'
        }
      },
      colors: ['#3B82F6', '#10B981'],
      xaxis: {
        categories: stages
      },
      yaxis: [{
        title: { text: 'Number of Deals' }
      }, {
        opposite: true,
        title: { text: 'Value ($K)' }
      }],
      tooltip: {
        y: [{
          formatter: (val) => `${val} deals`
        }, {
          formatter: (val) => `$${val.toFixed(0)}K`
        }]
      },
      legend: {
        position: 'top'
      }
    };

    if (chartRef.current._chart) {
      chartRef.current._chart.destroy();
    }
    chartRef.current._chart = new ApexCharts(chartRef.current, options);
    chartRef.current._chart.render();
  };

  const metrics = calculateMetrics();

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading pipeline dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#FEE2E2', borderRadius: '8px', margin: '20px' }}>
        <div style={{ color: '#991B1B', fontWeight: 'bold' }}>Error loading data</div>
        <div style={{ color: '#DC2626', marginTop: '8px' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#F3F4F6', minHeight: '100%' }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
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
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>
          Sales Pipeline Dashboard
        </h2>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
          <select
            value={timeFilter}
            onChange={(e) => handlePresetChange(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px'
            }}
          >
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="year">Last Year</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </select>
          
          {timeFilter === 'custom' && (
            <>
              <input
                type="date"
                value={startDate || ''}
                onChange={(e) => handleDateRangeChange(e.target.value, endDate)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px'
                }}
              />
              <span>to</span>
              <input
                type="date"
                value={endDate || ''}
                onChange={(e) => handleDateRangeChange(startDate, e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px'
                }}
              />
            </>
          )}
          
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={generateAIInsights}
              disabled={loadingInsights || !deals.length}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6366F1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: loadingInsights || !deals.length ? 'not-allowed' : 'pointer',
                opacity: loadingInsights || !deals.length ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loadingInsights ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                  Analyzing...
                </>
              ) : (
                <>
                  <span>✨</span>
                  Get AI Insights
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* AI Insights Panel */}
        {aiInsights && (
          <div 
            onDoubleClick={() => setInsightsCollapsed(!insightsCollapsed)}
            style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px',
            border: '1px solid #E5E7EB',
            background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
            transition: 'all 0.3s ease'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: insightsCollapsed ? '0' : '16px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: '600',
                color: '#1F2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#6366F1' }}></i>
                AI-Powered Pipeline Insights
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Collapse/Expand button */}
                <button
                  onClick={() => setInsightsCollapsed(!insightsCollapsed)}
                  style={{
                    background: 'none',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    color: '#6B7280',
                    cursor: 'pointer',
                    padding: '6px 10px',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title={insightsCollapsed ? 'Expand' : 'Collapse'}
                >
                  <i className={`fa-solid fa-chevron-${insightsCollapsed ? 'down' : 'up'}`}></i>
                </button>
                
                {/* Copy button */}
                <button
                  className="copy-insights-btn"
                  onClick={copyInsightsToClipboard}
                  style={{
                    background: 'none',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    color: '#6B7280',
                    cursor: 'pointer',
                    padding: '6px 10px',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Copy to clipboard"
                >
                  <i className="fa-solid fa-copy"></i>
                </button>
                
                {/* Export button */}
                <button
                  onClick={exportInsightsAsMarkdown}
                  style={{
                    background: 'none',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    color: '#6B7280',
                    cursor: 'pointer',
                    padding: '6px 10px',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Export as Markdown"
                >
                  <i className="fa-solid fa-download"></i>
                </button>
                
                {/* Refresh button */}
                <button
                  onClick={() => {
                    setInsightsCollapsed(false);
                    generateAIInsights();
                  }}
                  disabled={loadingInsights}
                  style={{
                    background: 'none',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    cursor: loadingInsights ? 'not-allowed' : 'pointer',
                    color: '#6B7280',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: loadingInsights ? 0.5 : 1
                  }}
                  title="Refresh analysis"
                >
                  <i className={`fa-solid fa-${loadingInsights ? 'spinner fa-spin' : 'arrows-rotate'}`}></i>
                </button>
                
                {/* Collapse/Expand button */}
                <button
                  onClick={() => setInsightsCollapsed(!insightsCollapsed)}
                  style={{
                    background: 'none',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    color: '#6B7280',
                    fontSize: '14px'
                  }}
                  title={insightsCollapsed ? 'Expand' : 'Collapse'}
                >
                  <i className={`fa-solid fa-chevron-${insightsCollapsed ? 'down' : 'up'}`}></i>
                </button>
                
                {/* Close button */}
                <button
                  onClick={() => {
                    setAiInsights(null);
                    setInsightsCollapsed(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: '#6B7280',
                    padding: '4px'
                  }}
                  title="Close"
                >
                  ×
                </button>
              </div>
            </div>
            
            {!insightsCollapsed && (
              <div style={{
                backgroundColor: '#F9FAFB',
                padding: '16px',
                borderRadius: '6px',
                maxHeight: '500px',
                overflowY: 'auto'
              }}>
                {typeof aiInsights === 'string' ? (
                  // Format the markdown-style text
                  <div>
                    {formatInsights(aiInsights)}
                  </div>
                ) : aiInsights?.formatted === false ? (
                  // Unformatted text response with rawInsight property
                  <div>
                    {formatInsights(aiInsights.rawInsight)}
                  </div>
                ) : (
                  // Formatted JSON response
                  <div style={{ display: 'grid', gap: '16px' }}>
                {/* Key Performance Highlights */}
                {aiInsights.keyPerformanceHighlights && (
                  <div>
                    <h4 style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#4B5563',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Key Performance Highlights
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#6B7280' }}>
                      {Array.isArray(aiInsights.keyPerformanceHighlights) 
                        ? aiInsights.keyPerformanceHighlights.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: '4px' }}>{item}</li>
                          ))
                        : <li>{aiInsights.keyPerformanceHighlights}</li>
                      }
                    </ul>
                  </div>
                )}
                
                {/* Pipeline Health Assessment */}
                {aiInsights.pipelineHealthAssessment && (
                  <div>
                    <h4 style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#4B5563',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Pipeline Health Assessment
                    </h4>
                    <div style={{
                      backgroundColor: '#F0F9FF',
                      padding: '12px',
                      borderRadius: '6px',
                      borderLeft: '4px solid #3B82F6',
                      color: '#1E40AF'
                    }}>
                      {aiInsights.pipelineHealthAssessment}
                    </div>
                  </div>
                )}
                
                {/* Bottleneck Analysis */}
                {aiInsights.bottleneckAnalysis && (
                  <div>
                    <h4 style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#4B5563',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Bottleneck Analysis
                    </h4>
                    <div style={{
                      backgroundColor: '#FEF3C7',
                      padding: '12px',
                      borderRadius: '6px',
                      borderLeft: '4px solid #F59E0B',
                      color: '#92400E'
                    }}>
                      {aiInsights.bottleneckAnalysis}
                    </div>
                  </div>
                )}
                
                {/* Recommendations */}
                {aiInsights.recommendations && (
                  <div>
                    <h4 style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#4B5563',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Recommendations
                    </h4>
                    <ol style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: '#059669'
                    }}>
                      {Array.isArray(aiInsights.recommendations)
                        ? aiInsights.recommendations.map((rec, idx) => (
                            <li key={idx} style={{
                              marginBottom: '8px',
                              backgroundColor: '#ECFDF5',
                              padding: '8px',
                              borderRadius: '4px',
                              marginLeft: '-20px',
                              paddingLeft: '28px'
                            }}>
                              {rec}
                            </li>
                          ))
                        : <li>{aiInsights.recommendations}</li>
                      }
                    </ol>
                  </div>
                )}
                
                {/* Risk Indicators */}
                {aiInsights.riskIndicators && (
                  <div>
                    <h4 style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#4B5563',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Risk Indicators
                    </h4>
                    <div style={{
                      backgroundColor: '#FEF2F2',
                      padding: '12px',
                      borderRadius: '6px',
                      borderLeft: '4px solid #EF4444',
                      color: '#991B1B'
                    }}>
                      {aiInsights.riskIndicators}
                    </div>
                  </div>
                )}
              </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Error display for insights */}
        {insightsError && (
          <div style={{
            backgroundColor: '#FEE2E2',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '20px',
            border: '1px solid #FCA5A5'
          }}>
            <div style={{ color: '#DC2626', fontWeight: '500' }}>
              {insightsError}
            </div>
          </div>
        )}
        
        <PipelineMetricsCards
          metrics={metrics}
          deals={deals}
          onCardClick={handleDrillDown}
        />
        
        <PipelineKanban
          deals={deals}
          stages={stages}
          stageColors={stageColors}
          onStageClick={handleDrillDown}
        />
        
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', marginBottom: '20px', border: '1px solid #E5E7EB' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Pipeline Overview</h3>
          <div ref={chartRef} />
        </div>
        
        <DrillDownPanel
          isOpen={isPanelOpen}
          drillDownData={drillDownData}
          stageColors={stageColors}
          onClose={() => {
            setIsPanelOpen(false);
            setDrillDownData(null);
          }}
          onOpenDeal={(entityName, primaryKey) => callbacks?.OpenEntityRecord && callbacks.OpenEntityRecord(entityName, primaryKey)}
          components={components}
        />
      </div>
    </div>
  );
}