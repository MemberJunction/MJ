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
  const chartRef = useRef(null);

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
    if (onSaveUserSettings) {
      onSaveUserSettings({ 
        ...savedUserSettings, 
        startDate: start, 
        endDate: end,
        timeFilter: 'custom'
      });
    }
  };
  
  const handlePresetChange = (preset) => {
    setTimeFilter(preset);
    setStartDate(null);
    setEndDate(null);
    if (onSaveUserSettings) {
      onSaveUserSettings({ 
        ...savedUserSettings, 
        timeFilter: preset,
        startDate: null,
        endDate: null
      });
    }
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
          ExtraFilter: `CreatedAt >= '${dayjs().subtract(30, 'day').format('YYYY-MM-DD')}'`,
          OrderBy: 'CreatedAt DESC',
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
        </div>
        
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
        DealCards={DealCards}
        DealList={DealList}
      />
    </div>
  );
}