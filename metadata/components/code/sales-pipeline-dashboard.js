function SalesPipelineDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRep, setSelectedRep] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'cards');
  const [timeFilter, setTimeFilter] = useState(savedUserSettings?.timeFilter || 'quarter');
  const [startDate, setStartDate] = useState(savedUserSettings?.startDate || null);
  const [endDate, setEndDate] = useState(savedUserSettings?.endDate || null);
  const [drillDownData, setDrillDownData] = useState(null);
  const [drillDownType, setDrillDownType] = useState(null);
  const chartRef = useRef(null);
  const velocityChartRef = useRef(null);

  const stages = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
  const stageColors = {
    'Lead': '#3B82F6',
    'Qualified': '#6366F1',
    'Proposal': '#8B5CF6',
    'Negotiation': '#A855F7',
    'Closed Won': '#10B981',
    'Closed Lost': '#EF4444'
  };

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
          OrderBy: 'CloseDate DESC',
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Activities',
          ExtraFilter: `CreatedAt >= '${dayjs().subtract(30, 'day').format('YYYY-MM-DD')}'`,
          OrderBy: 'CreatedAt DESC',
          MaxRows: 100,
          ResultType: 'entity_object'
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

  useEffect(() => {
    if (!loading && deals.length > 0) {
      renderPipelineChart();
      renderVelocityChart();
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

  const renderVelocityChart = () => {
    if (!velocityChartRef.current) return;
    
    // Calculate average days in each stage
    const velocityData = stages.slice(0, -2).map(stage => {
      const stageDeals = deals.filter(d => d.Stage === stage);
      const avgDays = stageDeals.length > 0 ? 
        stageDeals.reduce((sum, d) => {
          const created = new Date(d.CreatedAt || d.__mj_CreatedAt);
          const now = new Date();
          return sum + Math.floor((now - created) / (1000 * 60 * 60 * 24));
        }, 0) / stageDeals.length : 0;
      
      return avgDays;
    });

    const options = {
      series: [{
        name: 'Average Days',
        data: velocityData
      }],
      chart: {
        type: 'area',
        height: 200,
        toolbar: { show: false },
        sparkline: { enabled: true }
      },
      stroke: {
        curve: 'smooth',
        width: 2
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.3
        }
      },
      colors: ['#8B5CF6'],
      tooltip: {
        fixed: {
          enabled: false
        },
        x: {
          show: false
        },
        y: {
          title: {
            formatter: () => 'Days in stage: '
          }
        }
      }
    };

    if (velocityChartRef.current._chart) {
      velocityChartRef.current._chart.destroy();
    }
    velocityChartRef.current._chart = new ApexCharts(velocityChartRef.current, options);
    velocityChartRef.current._chart.render();
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

  const getTeamPerformance = () => {
    const repData = {};
    
    deals.forEach(deal => {
      const owner = deal.Owner || 'Unassigned';
      if (!repData[owner]) {
        repData[owner] = {
          name: owner,
          dealsCount: 0,
          wonCount: 0,
          lostCount: 0,
          totalValue: 0,
          wonValue: 0,
          activities: 0
        };
      }
      
      repData[owner].dealsCount++;
      repData[owner].totalValue += deal.Amount || 0;
      
      if (deal.Stage === 'Closed Won') {
        repData[owner].wonCount++;
        repData[owner].wonValue += deal.Amount || 0;
      } else if (deal.Stage === 'Closed Lost') {
        repData[owner].lostCount++;
      }
    });
    
    // Count activities per rep
    activities.forEach(activity => {
      const owner = activity.Owner || 'Unassigned';
      if (repData[owner]) {
        repData[owner].activities++;
      }
    });
    
    return Object.values(repData).sort((a, b) => b.wonValue - a.wonValue);
  };

  const formatCurrency = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  const handleDrillDown = (title, dealList, type, metadata) => {
    setDrillDownData({ title, deals: dealList, type, metadata });
    setSelectedRep(null);
    setIsPanelOpen(true);
  };

  // Sub-component: Drill Down Panel
  const DrillDownPanel = () => {
    const [localFilter, setLocalFilter] = useState('');
    const [localSort, setLocalSort] = useState('Amount');
    const [displayMode, setDisplayMode] = useState('cards');
    
    if (!drillDownData) return null;
    
    const filteredDeals = drillDownData.deals.filter(deal => 
      deal.DealName?.toLowerCase().includes(localFilter.toLowerCase()) ||
      deal.AccountName?.toLowerCase().includes(localFilter.toLowerCase())
    );
    
    const sortedDeals = [...filteredDeals].sort((a, b) => {
      switch (localSort) {
        case 'Amount':
          return (b.Amount || 0) - (a.Amount || 0);
        case 'CloseDate':
          return new Date(b.CloseDate || 0) - new Date(a.CloseDate || 0);
        case 'Probability':
          return (b.Probability || 0) - (a.Probability || 0);
        default:
          return 0;
      }
    });
    
    return (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-500px',
          top: '75px',
          bottom: 0,
          width: '500px',
          backgroundColor: '#fff',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          transition: 'right 0.3s ease'
        }}
      >
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: drillDownData.type === 'stage' ? stageColors[drillDownData.metadata] : '#3B82F6',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{drillDownData.title}</h3>
            <button
              onClick={() => {
                setIsPanelOpen(false);
                setDrillDownData(null);
              }}
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
          <div style={{ marginTop: '8px', fontSize: '14px', opacity: 0.9 }}>
            {sortedDeals.length} deals • ${(sortedDeals.reduce((sum, d) => sum + (d.Amount || 0), 0) / 1000000).toFixed(1)}M
          </div>
        </div>
        
        <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB' }}>
          <input
            type="text"
            placeholder="Filter deals..."
            value={localFilter}
            onChange={(e) => setLocalFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              marginBottom: '12px'
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setDisplayMode('cards')}
              style={{
                padding: '6px 12px',
                backgroundColor: displayMode === 'cards' ? '#3B82F6' : '#F3F4F6',
                color: displayMode === 'cards' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Cards
            </button>
            <button
              onClick={() => setDisplayMode('list')}
              style={{
                padding: '6px 12px',
                backgroundColor: displayMode === 'list' ? '#3B82F6' : '#F3F4F6',
                color: displayMode === 'list' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              List
            </button>
            <select
              value={localSort}
              onChange={(e) => setLocalSort(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                flex: 1
              }}
            >
              <option value="Amount">Sort by Amount</option>
              <option value="CloseDate">Sort by Close Date</option>
              <option value="Probability">Sort by Probability</option>
            </select>
          </div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {displayMode === 'cards' ? (
            <DealCards deals={sortedDeals} />
          ) : (
            <DealList deals={sortedDeals} />
          )}
        </div>
      </div>
    );
  };
  
  // Sub-component: Deal Cards
  const DealCards = ({ deals }) => (
    <div style={{ display: 'grid', gap: '12px' }}>
      {deals.map((deal, index) => (
        <div
          key={deal.ID || index}
          style={{
            padding: '16px',
            backgroundColor: '#F9FAFB',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => {
            if (callbacks?.OpenEntityRecord) {
              callbacks.OpenEntityRecord('Deals', deal.ID);
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F3F4F6';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#F9FAFB';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontWeight: 'bold', flex: 1 }}>{deal.DealName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontWeight: 'bold', color: '#059669' }}>
                ${((deal.Amount || 0) / 1000).toFixed(0)}K
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (callbacks?.OpenEntityRecord) {
                    callbacks.OpenEntityRecord('Deals', deal.ID);
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6B7280',
                  cursor: 'pointer',
                  padding: '2px',
                  fontSize: '14px'
                }}
                title="Open in Explorer"
              >
                <i className="fa-solid fa-up-right-from-square"></i>
              </button>
            </div>
          </div>
          <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '4px' }}>
            {deal.AccountName || 'No Account'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9CA3AF' }}>
            <span>Close: {deal.CloseDate ? new Date(deal.CloseDate).toLocaleDateString() : 'TBD'}</span>
            <span>{deal.Probability || 0}% probability</span>
          </div>
          <div style={{ 
            marginTop: '8px',
            padding: '4px 8px',
            backgroundColor: stageColors[deal.Stage] || '#6B7280',
            color: 'white',
            borderRadius: '4px',
            fontSize: '11px',
            display: 'inline-block'
          }}>
            {deal.Stage}
          </div>
        </div>
      ))}
    </div>
  );
  
  // Sub-component: Deal List
  const DealList = ({ deals }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
          <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#6B7280' }}>Deal</th>
          <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#6B7280' }}>Stage</th>
          <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#6B7280' }}>Amount</th>
          <th style={{ padding: '8px', width: '30px' }}></th>
        </tr>
      </thead>
      <tbody>
        {deals.map((deal, index) => (
          <tr
            key={deal.ID || index}
            style={{
              borderBottom: '1px solid #F3F4F6',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onClick={() => {
              if (callbacks?.OpenEntityRecord) {
                callbacks.OpenEntityRecord('Deals', deal.ID);
              }
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <td style={{ padding: '12px 8px' }}>
              <div style={{ fontWeight: '500' }}>{deal.DealName}</div>
              <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{deal.AccountName}</div>
            </td>
            <td style={{ padding: '12px 8px' }}>
              <span style={{
                padding: '2px 6px',
                backgroundColor: stageColors[deal.Stage] || '#6B7280',
                color: 'white',
                borderRadius: '3px',
                fontSize: '11px'
              }}>
                {deal.Stage}
              </span>
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '500' }}>
              ${((deal.Amount || 0) / 1000).toFixed(0)}K
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (callbacks?.OpenEntityRecord) {
                    callbacks.OpenEntityRecord('Deals', deal.ID);
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6B7280',
                  cursor: 'pointer',
                  padding: '2px',
                  fontSize: '14px'
                }}
                title="Open in Explorer"
              >
                <i className="fa-solid fa-up-right-from-square"></i>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Sub-component: Pipeline Kanban
  const PipelineKanban = () => (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: `repeat(${stages.length}, 1fr)`,
      gap: '12px',
      marginBottom: '20px'
    }}>
      {stages.map(stage => {
        const stageDeals = deals.filter(d => d.Stage === stage);
        const stageValue = stageDeals.reduce((sum, d) => sum + (d.Amount || 0), 0);
        
        return (
          <div
            key={stage}
            onClick={() => handleDrillDown(`${stage} Deals`, stageDeals, 'stage', stage)}
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: '8px',
              padding: '12px',
              borderTop: `3px solid ${stageColors[stage]}`,
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
              {stage}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: stageColors[stage] }}>
              {stageDeals.length}
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>
              {formatCurrency(stageValue)}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Sub-component: Team Leaderboard
  const TeamLeaderboard = () => {
    const teamData = getTeamPerformance();
    
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Team Performance</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={() => setViewMode('cards')}
            style={{
              padding: '4px 8px',
              backgroundColor: viewMode === 'cards' ? '#3B82F6' : '#F3F4F6',
              color: viewMode === 'cards' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '4px 8px',
              backgroundColor: viewMode === 'list' ? '#3B82F6' : '#F3F4F6',
              color: viewMode === 'list' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            List
          </button>
        </div>
        
        {viewMode === 'cards' ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            {teamData.slice(0, 5).map((rep, index) => (
              <div
                key={rep.name}
                style={{
                  padding: '12px',
                  backgroundColor: index === 0 ? '#FEF3C7' : '#F9FAFB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onClick={() => {
                  setSelectedRep(rep);
                  setIsPanelOpen(true);
                }}
              >
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                    {index === 0 && '🏆 '}{rep.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    {rep.wonCount} won • {rep.activities} activities
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#059669' }}>
                    {formatCurrency(rep.wonValue)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6B7280' }}>
                    {((rep.wonCount / (rep.wonCount + rep.lostCount)) * 100).toFixed(0)}% win
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                <th style={{ padding: '4px', textAlign: 'left' }}>Rep</th>
                <th style={{ padding: '4px', textAlign: 'center' }}>Deals</th>
                <th style={{ padding: '4px', textAlign: 'center' }}>Won</th>
                <th style={{ padding: '4px', textAlign: 'right' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {teamData.slice(0, 5).map(rep => (
                <tr
                  key={rep.name}
                  style={{ borderBottom: '1px solid #E5E7EB', cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedRep(rep);
                    setIsPanelOpen(true);
                  }}
                >
                  <td style={{ padding: '4px' }}>{rep.name}</td>
                  <td style={{ padding: '4px', textAlign: 'center' }}>{rep.dealsCount}</td>
                  <td style={{ padding: '4px', textAlign: 'center' }}>{rep.wonCount}</td>
                  <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                    {formatCurrency(rep.wonValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  // Sub-component: Activity Feed
  const ActivityFeed = () => (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Recent Activity</h3>
      <div style={{ maxHeight: '300px', overflow: 'auto' }}>
        {activities.slice(0, 10).map(activity => (
          <div
            key={activity.ID}
            style={{
              padding: '8px',
              borderBottom: '1px solid #E5E7EB',
              fontSize: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 'bold' }}>{activity.Type}</span>
              <span style={{ color: '#6B7280' }}>
                {dayjs(activity.CreatedAt).fromNow()}
              </span>
            </div>
            <div style={{ color: '#4B5563' }}>{activity.Subject}</div>
            <div style={{ color: '#9CA3AF', fontSize: '11px' }}>by {activity.Owner}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // Sub-component: Rep Details Panel
  const RepDetailsPanel = () => {
    if (!selectedRep) return null;
    
    const repDeals = deals.filter(d => d.Owner === selectedRep.name);
    const repActivities = activities.filter(a => a.Owner === selectedRep.name);
    
    return isPanelOpen && (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-400px',
          top: '75px',
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
          backgroundColor: '#3B82F6',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{selectedRep.name}</h3>
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
        
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Performance Summary</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Won Deals</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{selectedRep.wonCount}</div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Revenue</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatCurrency(selectedRep.wonValue)}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Win Rate</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {((selectedRep.wonCount / (selectedRep.wonCount + selectedRep.lostCount)) * 100).toFixed(0)}%
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Activities</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{selectedRep.activities}</div>
              </div>
            </div>
          </div>
          
          <div>
            <h4 style={{ margin: '0 0 12px 0' }}>Active Deals</h4>
            {repDeals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage)).map(deal => (
              <div
                key={deal.ID}
                style={{
                  padding: '8px',
                  marginBottom: '8px',
                  backgroundColor: '#F9FAFB',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onClick={() => callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }])}
              >
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{deal.DealName}</div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  {deal.Stage} • {formatCurrency(deal.Amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const metrics = calculateMetrics();

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading pipeline dashboard...</div>
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
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div 
            style={{ 
              padding: '16px', 
              backgroundColor: 'white', 
              borderRadius: '8px', 
              border: '1px solid #E5E7EB',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onClick={() => handleDrillDown('All Pipeline Deals', deals, 'all', null)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Pipeline Value</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
              {formatCurrency(metrics.totalValue)}
            </div>
          </div>
          <div 
            style={{ 
              padding: '16px', 
              backgroundColor: 'white', 
              borderRadius: '8px', 
              border: '1px solid #E5E7EB',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onClick={() => {
              const activeDeals = deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage));
              handleDrillDown('Active Deals', activeDeals, 'active', null);
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Active Deals</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
              {metrics.activeCount}
            </div>
          </div>
          <div 
            style={{ 
              padding: '16px', 
              backgroundColor: 'white', 
              borderRadius: '8px', 
              border: '1px solid #E5E7EB',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onClick={() => {
              const wonDeals = deals.filter(d => d.Stage === 'Closed Won');
              handleDrillDown('Won Deals', wonDeals, 'won', null);
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Win Rate</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
              {metrics.winRate.toFixed(0)}%
            </div>
          </div>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Avg Deal Size</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
              {formatCurrency(metrics.avgDealSize)}
            </div>
          </div>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Avg Cycle</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
              {metrics.avgCycleTime.toFixed(0)} days
            </div>
          </div>
        </div>
        
        <PipelineKanban />
        
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', marginBottom: '20px', border: '1px solid #E5E7EB' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Pipeline Overview</h3>
          <div ref={chartRef} />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', marginBottom: '20px', border: '1px solid #E5E7EB' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Deal Velocity</h3>
              <div ref={velocityChartRef} />
            </div>
            <ActivityFeed />
          </div>
          <TeamLeaderboard />
        </div>
      </div>
      
      <RepDetailsPanel />
      <DrillDownPanel />
    </div>
  );
}