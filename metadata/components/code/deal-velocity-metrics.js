function DealVelocityMetrics({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [deals, setDeals] = useState([]);
  const [stageHistory, setStageHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'heatmap');
  const [timeRange, setTimeRange] = useState(savedUserSettings?.timeRange || '30');
  
  const heatmapRef = useRef(null);
  const trendRef = useRef(null);
  const distributionRef = useRef(null);

  const stages = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'];

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const dateFilter = `CreatedAt >= '${new Date(Date.now() - parseInt(timeRange) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}'`;
      
      const [dealsResult, historyResult] = await Promise.all([
        utilities.rv.RunView({
          EntityName: 'Deals',
          ExtraFilter: dateFilter,
          OrderBy: 'CreatedAt DESC',
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Deal Stage History',
          ExtraFilter: dateFilter,
          OrderBy: 'EnteredAt ASC',
          ResultType: 'entity_object'
        })
      ]);

      if (dealsResult.Success) {
        setDeals(dealsResult.Results || []);
      }
      if (historyResult.Success) {
        setStageHistory(historyResult.Results || []);
      }
      
      if (!dealsResult.Success) {
        setError(dealsResult.ErrorMessage || 'Failed to load data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && deals.length > 0) {
      renderHeatmap();
      renderTrendChart();
      renderDistribution();
    }
  }, [deals, stageHistory, loading, viewMode]);

  const calculateVelocityData = () => {
    // Simulate stage history if not available
    const velocityData = {};
    const repVelocity = {};
    
    deals.forEach(deal => {
      const owner = deal.Owner || 'Unassigned';
      if (!repVelocity[owner]) {
        repVelocity[owner] = {};
        stages.forEach(stage => {
          repVelocity[owner][stage] = [];
        });
      }
      
      // Calculate days in current stage
      const createdDate = new Date(deal.CreatedAt || deal.__mj_CreatedAt);
      const now = new Date();
      const daysInStage = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
      
      if (repVelocity[owner][deal.Stage]) {
        repVelocity[owner][deal.Stage].push(daysInStage);
      }
    });
    
    // Calculate averages and statistics
    Object.keys(repVelocity).forEach(rep => {
      velocityData[rep] = {};
      stages.forEach(stage => {
        const durations = repVelocity[rep][stage];
        if (durations.length > 0) {
          velocityData[rep][stage] = {
            mean: ss.mean(durations),
            median: ss.median(durations),
            min: ss.min(durations),
            max: ss.max(durations),
            count: durations.length,
            stdev: durations.length > 1 ? ss.standardDeviation(durations) : 0
          };
        } else {
          velocityData[rep][stage] = {
            mean: 0,
            median: 0,
            min: 0,
            max: 0,
            count: 0,
            stdev: 0
          };
        }
      });
    });
    
    return velocityData;
  };

  const renderHeatmap = () => {
    if (!heatmapRef.current || viewMode !== 'heatmap') return;
    
    const velocityData = calculateVelocityData();
    const reps = Object.keys(velocityData);
    
    // Prepare data for heatmap
    const data = [];
    reps.forEach((rep, repIndex) => {
      stages.forEach((stage, stageIndex) => {
        const metrics = velocityData[rep][stage];
        data.push([stageIndex, repIndex, metrics.mean || 0]);
      });
    });
    
    const option = {
      tooltip: {
        position: 'top',
        formatter: (params) => {
          const rep = reps[params.data[1]];
          const stage = stages[params.data[0]];
          const value = params.data[2];
          return `${rep}<br/>${stage}: ${value.toFixed(1)} days avg`;
        }
      },
      grid: {
        height: '70%',
        top: '10%'
      },
      xAxis: {
        type: 'category',
        data: stages,
        splitArea: { show: true }
      },
      yAxis: {
        type: 'category',
        data: reps,
        splitArea: { show: true }
      },
      visualMap: {
        min: 0,
        max: 30,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: ['#10B981', '#F59E0B', '#EF4444']
        }
      },
      series: [{
        name: 'Velocity',
        type: 'heatmap',
        data: data,
        label: {
          show: true,
          formatter: (params) => params.data[2].toFixed(0)
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    };
    
    if (heatmapRef.current._chart) {
      heatmapRef.current._chart.dispose();
    }
    heatmapRef.current._chart = echarts.init(heatmapRef.current);
    heatmapRef.current._chart.setOption(option);
    
    // Add click handler
    heatmapRef.current._chart.on('click', (params) => {
      const rep = reps[params.data[1]];
      const stage = stages[params.data[0]];
      setSelectedMetric({ rep, stage, data: velocityData[rep][stage] });
      setIsPanelOpen(true);
    });
  };

  const renderTrendChart = () => {
    if (!trendRef.current || viewMode !== 'trend') return;
    
    // Generate trend data (simulated)
    const dates = [];
    const trendData = {};
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    stages.forEach(stage => {
      trendData[stage] = dates.map(() => Math.random() * 20 + 5);
    });
    
    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: stages,
        top: '5%'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates.map(d => d.substring(5))
      },
      yAxis: {
        type: 'value',
        name: 'Days',
        axisLabel: {
          formatter: '{value}d'
        }
      },
      series: stages.map(stage => ({
        name: stage,
        type: 'line',
        smooth: true,
        data: trendData[stage],
        emphasis: { focus: 'series' }
      }))
    };
    
    if (trendRef.current._chart) {
      trendRef.current._chart.dispose();
    }
    trendRef.current._chart = echarts.init(trendRef.current);
    trendRef.current._chart.setOption(option);
  };

  const renderDistribution = () => {
    if (!distributionRef.current || viewMode !== 'distribution') return;
    
    // Calculate distribution data
    const distributions = stages.map(stage => {
      const durations = deals
        .filter(d => d.Stage === stage)
        .map(d => {
          const created = new Date(d.CreatedAt || d.__mj_CreatedAt);
          const now = new Date();
          return Math.floor((now - created) / (1000 * 60 * 60 * 24));
        });
      
      if (durations.length > 0) {
        return [
          ss.min(durations),
          ss.quantile(durations, 0.25),
          ss.median(durations),
          ss.quantile(durations, 0.75),
          ss.max(durations)
        ];
      }
      return [0, 0, 0, 0, 0];
    });
    
    const option = {
      title: {
        text: 'Stage Duration Distribution',
        left: 'center'
      },
      tooltip: {
        trigger: 'item',
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%'
      },
      xAxis: {
        type: 'category',
        data: stages,
        boundaryGap: true,
        nameGap: 30,
        splitArea: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'Days',
        splitArea: { show: true }
      },
      series: [{
        name: 'boxplot',
        type: 'boxplot',
        data: distributions,
        tooltip: {
          formatter: (param) => {
            return [
              `${param.name}`,
              `Upper: ${param.data[4]} days`,
              `Q3: ${param.data[3]} days`,
              `Median: ${param.data[2]} days`,
              `Q1: ${param.data[1]} days`,
              `Lower: ${param.data[0]} days`
            ].join('<br/>');
          }
        }
      }]
    };
    
    if (distributionRef.current._chart) {
      distributionRef.current._chart.dispose();
    }
    distributionRef.current._chart.setOption(option);
  };

  const exportToCSV = () => {
    const velocityData = calculateVelocityData();
    const csvData = [];
    
    // Header
    csvData.push(['Rep', 'Stage', 'Avg Days', 'Median Days', 'Min Days', 'Max Days', 'Count', 'Std Dev']);
    
    // Data rows
    Object.keys(velocityData).forEach(rep => {
      stages.forEach(stage => {
        const metrics = velocityData[rep][stage];
        csvData.push([
          rep,
          stage,
          metrics.mean.toFixed(2),
          metrics.median.toFixed(2),
          metrics.min,
          metrics.max,
          metrics.count,
          metrics.stdev.toFixed(2)
        ]);
      });
    });
    
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `velocity-metrics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sub-component: Metrics Panel
  const MetricsPanel = () => {
    if (!selectedMetric) return null;
    
    return isPanelOpen && (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-400px',
          top: 0,
          bottom: 0,
          width: '400px',
          backgroundColor: 'white',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
          zIndex: 1000,
          transition: 'right 0.3s ease',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#8B5CF6',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>
              {selectedMetric.rep} - {selectedMetric.stage}
            </h3>
            <button
              onClick={() => setIsPanelOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        <div style={{ padding: '20px' }}>
          <h4>Detailed Metrics</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Average</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {selectedMetric.data.mean.toFixed(1)} days
              </div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Median</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {selectedMetric.data.median.toFixed(1)} days
              </div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Fastest</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10B981' }}>
                {selectedMetric.data.min} days
              </div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Slowest</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#EF4444' }}>
                {selectedMetric.data.max} days
              </div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Deals Count</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {selectedMetric.data.count}
              </div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Std Deviation</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {selectedMetric.data.stdev.toFixed(1)}
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: '20px' }}>
            <h4>Recommendations</h4>
            <ul style={{ paddingLeft: '20px', color: '#4B5563' }}>
              {selectedMetric.data.mean > 15 && (
                <li>Consider reviewing deals stuck in this stage</li>
              )}
              {selectedMetric.data.stdev > 10 && (
                <li>High variance indicates inconsistent process</li>
              )}
              {selectedMetric.data.count < 5 && (
                <li>Limited data - more deals needed for reliable metrics</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const calculateSummaryMetrics = () => {
    const totalDeals = deals.length;
    const avgVelocity = deals.reduce((sum, deal) => {
      const created = new Date(deal.CreatedAt || deal.__mj_CreatedAt);
      const now = new Date();
      return sum + Math.floor((now - created) / (1000 * 60 * 60 * 24));
    }, 0) / (totalDeals || 1);
    
    const fastestDeal = Math.min(...deals.map(deal => {
      const created = new Date(deal.CreatedAt || deal.__mj_CreatedAt);
      const now = new Date();
      return Math.floor((now - created) / (1000 * 60 * 60 * 24));
    }));
    
    const bottleneckStage = stages.reduce((slowest, stage) => {
      const stageDeals = deals.filter(d => d.Stage === stage);
      if (stageDeals.length === 0) return slowest;
      
      const avgDays = stageDeals.reduce((sum, deal) => {
        const created = new Date(deal.CreatedAt || deal.__mj_CreatedAt);
        const now = new Date();
        return sum + Math.floor((now - created) / (1000 * 60 * 60 * 24));
      }, 0) / stageDeals.length;
      
      if (!slowest || avgDays > slowest.days) {
        return { stage, days: avgDays };
      }
      return slowest;
    }, null);
    
    return { totalDeals, avgVelocity, fastestDeal, bottleneckStage };
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading velocity metrics...</div>
      </div>
    );
  }

  const summaryMetrics = calculateSummaryMetrics();

  return (
    <div style={{ padding: '20px', backgroundColor: '#F3F4F6', minHeight: '100%' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Deal Velocity Metrics</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={timeRange}
              onChange={(e) => {
                setTimeRange(e.target.value);
                onSaveUserSettings({ ...savedUserSettings, timeRange: e.target.value });
              }}
              style={{
                padding: '6px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px'
              }}
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
            <button
              onClick={exportToCSV}
              style={{
                padding: '6px 12px',
                backgroundColor: '#10B981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Export CSV
            </button>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Avg Velocity</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {summaryMetrics.avgVelocity.toFixed(0)} days
            </div>
          </div>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Fastest Deal</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
              {summaryMetrics.fastestDeal} days
            </div>
          </div>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Bottleneck Stage</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#EF4444' }}>
              {summaryMetrics.bottleneckStage?.stage || 'N/A'}
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>
              {summaryMetrics.bottleneckStage ? `${summaryMetrics.bottleneckStage.days.toFixed(0)} days avg` : ''}
            </div>
          </div>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Active Deals</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {summaryMetrics.totalDeals}
            </div>
          </div>
        </div>
        
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setViewMode('heatmap')}
              style={{
                padding: '6px 12px',
                backgroundColor: viewMode === 'heatmap' ? '#8B5CF6' : '#F3F4F6',
                color: viewMode === 'heatmap' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Heatmap
            </button>
            <button
              onClick={() => setViewMode('trend')}
              style={{
                padding: '6px 12px',
                backgroundColor: viewMode === 'trend' ? '#8B5CF6' : '#F3F4F6',
                color: viewMode === 'trend' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Trend
            </button>
            <button
              onClick={() => setViewMode('distribution')}
              style={{
                padding: '6px 12px',
                backgroundColor: viewMode === 'distribution' ? '#8B5CF6' : '#F3F4F6',
                color: viewMode === 'distribution' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Distribution
            </button>
          </div>
          
          <div 
            ref={viewMode === 'heatmap' ? heatmapRef : viewMode === 'trend' ? trendRef : distributionRef}
            style={{ height: '400px' }}
          />
        </div>
      </div>
      
      <MetricsPanel />
    </div>
  );
}