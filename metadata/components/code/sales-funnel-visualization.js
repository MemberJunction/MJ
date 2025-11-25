function SalesFunnelVisualization({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Extract sub-components from components
  const {
    AIInsightsPanel,
    SalesFunnelChart,
    SalesFunnelStagePanel
  } = components;

  if (!AIInsightsPanel) {
    console.warn('AIInsightsPanel component not available');
  }

  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'count');
  const [timeFilter, setTimeFilter] = useState(savedUserSettings?.timeFilter || 'quarter');
  const [startDate, setStartDate] = useState(savedUserSettings?.startDate || null);
  const [endDate, setEndDate] = useState(savedUserSettings?.endDate || null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // AI Insights state
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

  // Debounce settings saves
  const saveSettingsTimeoutRef = useRef(null);

  // Define pipeline stages in order
  const pipelineStages = [
    { name: 'Lead', color: '#3B82F6' },
    { name: 'Qualified', color: '#6366F1' },
    { name: 'Proposal', color: '#8B5CF6' },
    { name: 'Negotiation', color: '#A855F7' },
    { name: 'Closed Won', color: '#10B981' },
    { name: 'Closed Lost', color: '#EF4444' }
  ];

  useEffect(() => {
    loadDeals();
  }, [timeFilter, startDate, endDate]);

  const loadDeals = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const dateFilter = getDateFilter();
      const result = await utilities.rv.RunView({
        EntityName: 'Deals',
        ExtraFilter: dateFilter,
        OrderBy: 'CloseDate DESC'
      });

      if (result.Success) {
        setDeals(result.Results || []);
      } else {
        setError(result.ErrorMessage || 'Failed to load deals');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = () => {
    // If custom dates are set, use them
    if (startDate && endDate) {
      return `CloseDate >= '${startDate}' AND CloseDate <= '${endDate}'`;
    }
    
    // Otherwise use preset filter
    const now = new Date();
    let filterStart;
    
    switch (timeFilter) {
      case 'month':
        filterStart = new Date(now);
        filterStart.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        filterStart = new Date(now);
        filterStart.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        filterStart = new Date(now);
        filterStart.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
        return '';
      default:
        return '';
    }
    
    return filterStart ? `CloseDate >= '${filterStart.toISOString().split('T')[0]}'` : '';
  };
  
  const handleDateRangeChange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
    setTimeFilter('custom');

    // Debounce settings save to avoid excessive writes
    if (saveSettingsTimeoutRef.current) {
      clearTimeout(saveSettingsTimeoutRef.current);
    }
    saveSettingsTimeoutRef.current = setTimeout(() => {
      if (onSaveUserSettings) {
        onSaveUserSettings({
          ...savedUserSettings,
          startDate: start,
          endDate: end,
          timeFilter: 'custom'
        });
      }
    }, 500);
  };

  const handlePresetChange = (preset) => {
    setTimeFilter(preset);
    setStartDate(null);
    setEndDate(null);

    // Debounce settings save to avoid excessive writes
    if (saveSettingsTimeoutRef.current) {
      clearTimeout(saveSettingsTimeoutRef.current);
    }
    saveSettingsTimeoutRef.current = setTimeout(() => {
      if (onSaveUserSettings) {
        onSaveUserSettings({
          ...savedUserSettings,
          timeFilter: preset,
          startDate: null,
          endDate: null
        });
      }
    }, 500);
  };

  const calculateFunnelData = () => {
    const funnelData = [];
    const closedLost = { count: 0, value: 0 };
    
    // Calculate metrics for each stage
    pipelineStages.forEach((stage, index) => {
      let stageDeals;
      
      if (stage.name === 'Closed Lost') {
        stageDeals = deals.filter(d => d.Stage === 'Closed Lost');
        closedLost.count = stageDeals.length;
        closedLost.value = stageDeals.reduce((sum, d) => sum + (d.Amount || 0), 0);
      } else if (stage.name === 'Closed Won') {
        stageDeals = deals.filter(d => d.Stage === 'Closed Won');
      } else {
        // For other stages, include all deals at or after this stage (except closed lost)
        stageDeals = deals.filter(d => {
          if (d.Stage === 'Closed Lost') return false;
          const dealStageIndex = pipelineStages.findIndex(s => s.name === d.Stage);
          return dealStageIndex >= index;
        });
      }
      
      if (stage.name !== 'Closed Lost') {
        const totalValue = stageDeals.reduce((sum, d) => sum + (d.Amount || 0), 0);
        const prevStageCount = index > 0 ? funnelData[index - 1].count : 0;
        const conversionRate = prevStageCount > 0 ? (stageDeals.length / prevStageCount) * 100 : 100;
        
        funnelData.push({
          stage: stage.name,
          count: stageDeals.length,
          value: totalValue,
          color: stage.color,
          width: Math.max(30, 100 - (index * 15)), // Visual width for funnel effect
          conversionRate,
          deals: stageDeals
        });
      }
    });
    
    return { funnelData, closedLost };
  };

  const handleStageClick = (stageData) => {
    setSelectedStage({
      ...stageData,
      title: `${stageData.stage} Stage`
    });
    setIsPanelOpen(true);
  };

  const formatCurrency = (amount) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };
  
  // Format insights text using marked library for proper markdown rendering

  const generateAIInsights = async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    
    try {
      const { funnelData, closedLost } = calculateFunnelData();
      const totalDeals = deals.length;
      const totalValue = deals.reduce((sum, d) => sum + (d.Amount || 0), 0);
      const avgDealSize = totalDeals > 0 ? totalValue / totalDeals : 0;
      const winRate = totalDeals > 0 ? 
        (deals.filter(d => d.Stage === 'Closed Won').length / totalDeals * 100) : 0;
      
      const prompt = `Analyze this sales funnel data and provide insights:

Time Filter: ${timeFilter}${startDate && endDate ? ` (${startDate} to ${endDate})` : ''}
Total Deals: ${totalDeals}
Total Value: ${formatCurrency(totalValue)}
Win Rate: ${winRate.toFixed(1)}%
Average Deal Size: ${formatCurrency(avgDealSize)}

Funnel Stage Breakdown:
${funnelData.map(stage => `${stage.stage}: ${stage.count} deals (${formatCurrency(stage.value)}) - ${stage.conversionRate?.toFixed(1) || '0'}% conversion`).join('\n')}

Closed Lost: ${closedLost.count} deals (${formatCurrency(closedLost.value)})

Conversion Analysis:
${funnelData.map((stage, index) => {
  if (index === 0) return `${stage.stage}: Entry point`;
  const prevStage = funnelData[index - 1];
  const dropoff = prevStage.count - stage.count;
  const dropoffRate = prevStage.count > 0 ? (dropoff / prevStage.count * 100) : 0;
  return `${prevStage.stage} → ${stage.stage}: ${dropoff} deals lost (${dropoffRate.toFixed(1)}% drop-off)`;
}).join('\n')}

Provide:
1. Sales funnel performance analysis and trends
2. Conversion rate analysis between stages
3. Identification of bottlenecks and drop-off points
4. Win rate and deal velocity insights
5. Specific recommendations to improve conversion rates
6. Strategies to reduce drop-offs at critical stages
7. Deal size and value optimization opportunities

Focus on actionable recommendations to improve sales performance and funnel efficiency.`;
      
      const result = await utilities.ai.ExecutePrompt({
        systemPrompt: 'You are an expert sales analyst with deep knowledge of sales funnels, conversion optimization, and revenue growth strategies. Provide clear, actionable insights with specific recommendations. Format your response in clear markdown.',
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
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading sales funnel data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#EF4444' }}>Error: {error}</div>
      </div>
    );
  }

  const { funnelData, closedLost } = calculateFunnelData();
  const totalDeals = deals.length;
  const totalValue = deals.reduce((sum, d) => sum + (d.Amount || 0), 0);
  const avgDealSize = totalDeals > 0 ? totalValue / totalDeals : 0;
  const winRate = totalDeals > 0 ? 
    (deals.filter(d => d.Stage === 'Closed Won').length / totalDeals * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#F3F4F6' }}>
      <style>{`
        @keyframes fadeInUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <style>{`
        .ai-insights-content h1, .ai-insights-content h2, .ai-insights-content h3 {
          margin-top: 16px;
          margin-bottom: 8px;
          color: #111827;
        }
        .ai-insights-content h1 { font-size: 1.5em; }
        .ai-insights-content h2 { font-size: 1.3em; }
        .ai-insights-content h3 { font-size: 1.1em; }
        .ai-insights-content p {
          margin: 8px 0;
          line-height: 1.6;
          color: #374151;
        }
        .ai-insights-content ul, .ai-insights-content ol {
          margin: 8px 0;
          padding-left: 24px;
        }
        .ai-insights-content li {
          margin: 4px 0;
          color: #374151;
        }
        .ai-insights-content strong {
          color: #111827;
          font-weight: 600;
        }
        .ai-insights-content code {
          background: #F3F4F6;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.9em;
        }
        .ai-insights-content blockquote {
          border-left: 4px solid #10B981;
          padding-left: 16px;
          margin: 12px 0;
          color: #4B5563;
        }
      `}</style>
      
      <div style={{ padding: '20px', borderBottom: '1px solid #E5E7EB', backgroundColor: 'white' }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Sales Funnel</h2>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
          
          <button
            onClick={() => {
              setViewMode(viewMode === 'count' ? 'value' : 'count');
              onSaveUserSettings({ ...savedUserSettings, viewMode: viewMode === 'count' ? 'value' : 'count' });
            }}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Show {viewMode === 'count' ? 'Values' : 'Counts'}
          </button>
          
          {/* AI Insights Button */}
          <button
            onClick={generateAIInsights}
            disabled={loadingInsights || loading}
            style={{
              padding: '6px 12px',
              backgroundColor: '#10B981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loadingInsights || loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: loadingInsights || loading ? 0.6 : 1
            }}
          >
            <i className={`fa-solid fa-${loadingInsights ? 'spinner fa-spin' : 'wand-magic-sparkles'}`}></i>
            {loadingInsights ? 'Analyzing...' : 'Get AI Insights'}
          </button>
        </div>
        
        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Total Deals</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {totalDeals}
            </div>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Total Value</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {formatCurrency(totalValue)}
            </div>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Win Rate</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {winRate.toFixed(1)}%
            </div>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Avg Deal Size</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {formatCurrency(avgDealSize)}
            </div>
          </div>
        </div>
      </div>
      
      {/* AI Insights Panel - Outside header to preserve funnel width */}
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
        title="Sales Funnel Insights"
        icon="fa-wand-magic-sparkles"
        iconColor={styles?.colors?.primary || '#8B5CF6'}
        position="top"
        onClose={() => {
          setAiInsights(null);
          setInsightsError(null);
        }}
      />
      
      {SalesFunnelChart && (
        <SalesFunnelChart
          funnelData={funnelData}
          viewMode={viewMode}
          onStageClick={handleStageClick}
          closedLost={closedLost}
          formatCurrency={formatCurrency}
          styles={styles}
          utilities={utilities}
          components={components}
        />
      )}

      {SalesFunnelStagePanel && (
        <SalesFunnelStagePanel
          isOpen={isPanelOpen}
          stageData={selectedStage}
          onClose={() => {
            setIsPanelOpen(false);
            setSelectedStage(null);
          }}
          components={components}
          callbacks={callbacks}
          formatCurrency={formatCurrency}
          styles={styles}
          utilities={utilities}
        />
      )}
      
    </div>
  );
}