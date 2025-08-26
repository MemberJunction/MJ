function WinLossAnalysis({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Load DataExportPanel component
  const DataExportPanel = components['DataExportPanel'];
  
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'overview');
  const [timeRange, setTimeRange] = useState(savedUserSettings?.timeRange || 'quarter');
  const [selectedFactor, setSelectedFactor] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [drillDownData, setDrillDownData] = useState(null);
  const [drillDownType, setDrillDownType] = useState(null);
  const [filterReason, setFilterReason] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'CloseDate', direction: 'desc' });
  
  const gridRef = useRef(null);
  const chartRefs = useRef({});

  useEffect(() => {
    loadDeals();
  }, [timeRange]);

  const loadDeals = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const dateFilter = getDateFilter();
      const result = await utilities.rv.RunView({
        EntityName: 'Deals',
        ExtraFilter: dateFilter ? `CloseDate >= '${dateFilter}' AND Stage IN ('Closed Won', 'Closed Lost')` : `Stage IN ('Closed Won', 'Closed Lost')`,
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
    const now = new Date();
    let months = 3;
    
    switch (timeRange) {
      case 'month': months = 1; break;
      case 'quarter': months = 3; break;
      case 'year': months = 12; break;
      case 'all': return null;
      default: months = 3;
    }
    
    const startDate = new Date(now.setMonth(now.getMonth() - months));
    return startDate.toISOString().split('T')[0];
  };

  const calculateWinLossMetrics = () => {
    const filteredDeals = deals.filter(d => {
      if (filterReason !== 'all' && d.LossReason !== filterReason) return false;
      return true;
    });

    const wonDeals = filteredDeals.filter(d => d.Stage === 'Closed Won');
    const lostDeals = filteredDeals.filter(d => d.Stage === 'Closed Lost');
    
    const metrics = {
      totalDeals: filteredDeals.length,
      wonCount: wonDeals.length,
      lostCount: lostDeals.length,
      winRate: filteredDeals.length > 0 ? (wonDeals.length / filteredDeals.length * 100) : 0,
      wonValue: wonDeals.reduce((sum, d) => sum + (d.Amount || 0), 0),
      lostValue: lostDeals.reduce((sum, d) => sum + (d.Amount || 0), 0),
      avgWonDealSize: wonDeals.length > 0 ? wonDeals.reduce((sum, d) => sum + (d.Amount || 0), 0) / wonDeals.length : 0,
      avgLostDealSize: lostDeals.length > 0 ? lostDeals.reduce((sum, d) => sum + (d.Amount || 0), 0) / lostDeals.length : 0,
      avgCycleTime: {
        won: 0,
        lost: 0
      }
    };
    
    // Calculate average cycle times
    const wonCycleTimes = wonDeals.map(d => {
      const created = new Date(d.CreatedAt || d.__mj_CreatedAt);
      const closed = new Date(d.CloseDate);
      return Math.floor((closed - created) / (1000 * 60 * 60 * 24));
    });
    
    const lostCycleTimes = lostDeals.map(d => {
      const created = new Date(d.CreatedAt || d.__mj_CreatedAt);
      const closed = new Date(d.CloseDate);
      return Math.floor((closed - created) / (1000 * 60 * 60 * 24));
    });
    
    metrics.avgCycleTime.won = wonCycleTimes.length > 0 ? 
      Math.round(wonCycleTimes.reduce((a, b) => a + b, 0) / wonCycleTimes.length) : 0;
    metrics.avgCycleTime.lost = lostCycleTimes.length > 0 ?
      Math.round(lostCycleTimes.reduce((a, b) => a + b, 0) / lostCycleTimes.length) : 0;
    
    
    // Loss reasons
    metrics.lossReasons = {};
    lostDeals.forEach(deal => {
      const reason = deal.LossReason || 'Unknown';
      if (!metrics.lossReasons[reason]) {
        metrics.lossReasons[reason] = { count: 0, value: 0, deals: [] };
      }
      metrics.lossReasons[reason].count++;
      metrics.lossReasons[reason].value += deal.Amount || 0;
      metrics.lossReasons[reason].deals.push(deal);
    });
    
    // Competitor analysis
    metrics.competitors = {};
    lostDeals.forEach(deal => {
      if (deal.Competitor) {
        if (!metrics.competitors[deal.Competitor]) {
          metrics.competitors[deal.Competitor] = { count: 0, value: 0, deals: [] };
        }
        metrics.competitors[deal.Competitor].count++;
        metrics.competitors[deal.Competitor].value += deal.Amount || 0;
        metrics.competitors[deal.Competitor].deals.push(deal);
      }
    });

    // Monthly trend
    metrics.monthlyTrend = {};
    filteredDeals.forEach(deal => {
      const month = new Date(deal.CloseDate).toISOString().substring(0, 7);
      if (!metrics.monthlyTrend[month]) {
        metrics.monthlyTrend[month] = { won: 0, lost: 0, wonValue: 0, lostValue: 0 };
      }
      if (deal.Stage === 'Closed Won') {
        metrics.monthlyTrend[month].won++;
        metrics.monthlyTrend[month].wonValue += deal.Amount || 0;
      } else {
        metrics.monthlyTrend[month].lost++;
        metrics.monthlyTrend[month].lostValue += deal.Amount || 0;
      }
    });
    
    return metrics;
  };

  const calculateCorrelationFactors = () => {
    // Advanced correlation analysis
    const factors = {
      dealSize: { won: [], lost: [], correlation: 0 },
      cycleTime: { won: [], lost: [], correlation: 0 },
      discount: { won: [], lost: [], correlation: 0 },
      interactions: { won: [], lost: [], correlation: 0 }
    };
    
    deals.forEach(deal => {
      const isWon = deal.Stage === 'Closed Won';
      const created = new Date(deal.CreatedAt || deal.__mj_CreatedAt);
      const closed = new Date(deal.CloseDate);
      const cycleTime = Math.floor((closed - created) / (1000 * 60 * 60 * 24));
      const discount = deal.Discount || 0;
      const interactions = Math.floor(Math.random() * 20) + 5; // Simulated
      
      if (isWon) {
        factors.dealSize.won.push(deal.Amount || 0);
        factors.cycleTime.won.push(cycleTime);
        factors.discount.won.push(discount);
        factors.interactions.won.push(interactions);
      } else {
        factors.dealSize.lost.push(deal.Amount || 0);
        factors.cycleTime.lost.push(cycleTime);
        factors.discount.lost.push(discount);
        factors.interactions.lost.push(interactions);
      }
    });
    
    // Calculate averages and correlation strength
    const avgFactors = {};
    Object.keys(factors).forEach(factor => {
      const wonAvg = factors[factor].won.length > 0 ? 
        factors[factor].won.reduce((a, b) => a + b, 0) / factors[factor].won.length : 0;
      const lostAvg = factors[factor].lost.length > 0 ? 
        factors[factor].lost.reduce((a, b) => a + b, 0) / factors[factor].lost.length : 0;
      
      avgFactors[factor] = {
        wonAvg,
        lostAvg,
        impact: ((wonAvg - lostAvg) / (lostAvg || 1)) * 100,
        correlation: Math.abs(wonAvg - lostAvg) / (Math.max(wonAvg, lostAvg) || 1)
      };
    });
    
    return avgFactors;
  };

  const openDrillDown = (type, data) => {
    setDrillDownType(type);
    setDrillDownData(data);
    setIsPanelOpen(true);
  };

  // Prepare data for export
  const prepareExportData = () => {
    const metrics = calculateWinLossMetrics();
    const exportData = [];
    
    // Add summary metrics
    exportData.push({
      Category: 'Summary',
      Metric: 'Win Rate',
      Value: `${metrics.winRate.toFixed(1)}%`
    });
    exportData.push({
      Category: 'Summary',
      Metric: 'Won Deals',
      Value: metrics.wonCount
    });
    exportData.push({
      Category: 'Summary', 
      Metric: 'Lost Deals',
      Value: metrics.lostCount
    });
    exportData.push({
      Category: 'Summary',
      Metric: 'Won Revenue',
      Value: metrics.wonValue
    });
    exportData.push({
      Category: 'Summary',
      Metric: 'Lost Revenue',
      Value: metrics.lostValue
    });
    
    // Add deal details
    getFilteredDeals().forEach(deal => {
      exportData.push({
        Category: 'Deal Details',
        DealName: deal.DealName,
        Account: deal.AccountName,
        Stage: deal.Stage,
        Status: deal.Status,
        Amount: deal.Amount,
        CloseDate: deal.CloseDate,
        WinLossReason: deal.WinLossReason || 'N/A'
      });
    });
    
    return exportData;
  };

  // Define export columns
  const getExportColumns = () => {
    return [
      { field: 'Category', header: 'Category' },
      { field: 'Metric', header: 'Metric' },
      { field: 'Value', header: 'Value' },
      { field: 'DealName', header: 'Deal Name' },
      { field: 'Account', header: 'Account' },
      { field: 'Stage', header: 'Stage' },
      { field: 'Status', header: 'Status' },
      { field: 'Amount', header: 'Amount' },
      { field: 'CloseDate', header: 'Close Date' },
      { field: 'WinLossReason', header: 'Win/Loss Reason' }
    ];
  };

  // Enhanced Sub-component: Overview Cards with drill-down
  const OverviewCards = () => {
    const metrics = calculateWinLossMetrics();
    
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div 
          style={{ 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            border: '1px solid #E5E7EB',
            cursor: 'pointer',
            transition: 'all 0.2s',
            position: 'relative',
            overflow: 'hidden'
          }}
          onClick={() => openDrillDown('winrate', metrics)}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${metrics.winRate}%`,
            height: '3px',
            backgroundColor: metrics.winRate > 50 ? '#10B981' : '#EF4444',
            transition: 'width 0.5s'
          }} />
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Win Rate</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: metrics.winRate > 50 ? '#10B981' : '#EF4444' }}>
            {metrics.winRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            {metrics.wonCount} won / {metrics.totalDeals} total
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px' }}>
            Click to view details →
          </div>
        </div>
        
        <div 
          style={{ 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            border: '1px solid #E5E7EB',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => openDrillDown('revenue', { type: 'won', deals: deals.filter(d => d.Stage === 'Closed Won') })}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Won Revenue</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10B981' }}>
            ${(metrics.wonValue / 1000).toFixed(0)}K
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            Avg: ${(metrics.avgWonDealSize / 1000).toFixed(0)}K
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            Cycle: {metrics.avgCycleTime.won} days avg
          </div>
        </div>
        
        <div 
          style={{ 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            border: '1px solid #E5E7EB',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => openDrillDown('revenue', { type: 'lost', deals: deals.filter(d => d.Stage === 'Closed Lost') })}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Lost Revenue</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#EF4444' }}>
            ${(metrics.lostValue / 1000).toFixed(0)}K
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            Avg: ${(metrics.avgLostDealSize / 1000).toFixed(0)}K
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            Cycle: {metrics.avgCycleTime.lost} days avg
          </div>
        </div>
        
        <div 
          style={{ 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            border: '1px solid #E5E7EB',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => openDrillDown('reasons', metrics.lossReasons)}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Top Loss Reason</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F59E0B' }}>
            {Object.keys(metrics.lossReasons).sort((a, b) => 
              metrics.lossReasons[b].count - metrics.lossReasons[a].count)[0] || 'N/A'}
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            {metrics.lossReasons[Object.keys(metrics.lossReasons)[0]]?.count || 0} occurrences
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px' }}>
            View all reasons →
          </div>
        </div>
      </div>
    );
  };


  // Drill-down Panel Component
  const DrillDownPanel = () => {
    const [localSearchTerm, setLocalSearchTerm] = useState('');
    
    if (!isPanelOpen || !drillDownData) return null;

    const handleSort = (key) => {
      setSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
    };

    const sortedDeals = (deals) => {
      return [...deals].sort((a, b) => {
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return (aVal - bVal) * multiplier;
        }
        return aVal.toString().localeCompare(bVal.toString()) * multiplier;
      });
    };

    const renderDrillDownContent = () => {
      switch (drillDownType) {
        case 'winrate':
          return (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>Win Rate Analysis</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', backgroundColor: '#F0FDF4', borderRadius: '6px' }}>
                  <div style={{ fontSize: '14px', color: '#166534' }}>Won Deals</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
                    {drillDownData.wonCount}
                  </div>
                  <div style={{ fontSize: '12px', color: '#166534' }}>
                    ${(drillDownData.wonValue / 1000).toFixed(0)}K total
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#FEF2F2', borderRadius: '6px' }}>
                  <div style={{ fontSize: '14px', color: '#991B1B' }}>Lost Deals</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#EF4444' }}>
                    {drillDownData.lostCount}
                  </div>
                  <div style={{ fontSize: '12px', color: '#991B1B' }}>
                    ${(drillDownData.lostValue / 1000).toFixed(0)}K total
                  </div>
                </div>
              </div>
              <div>
                <h4 style={{ margin: '16px 0 8px 0' }}>Monthly Trend</h4>
                <div style={{ display: 'grid', gap: '4px' }}>
                  {Object.entries(drillDownData.monthlyTrend).sort().slice(-6).map(([month, data]) => (
                    <div key={month} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '80px', fontSize: '12px' }}>{month}</div>
                      <div style={{ flex: 1, display: 'flex', height: '20px' }}>
                        <div style={{
                          width: `${(data.won / (data.won + data.lost)) * 100}%`,
                          backgroundColor: '#10B981',
                          borderRadius: '4px 0 0 4px'
                        }} />
                        <div style={{
                          flex: 1,
                          backgroundColor: '#EF4444',
                          borderRadius: '0 4px 4px 0'
                        }} />
                      </div>
                      <div style={{ fontSize: '12px', width: '60px', textAlign: 'right' }}>
                        {((data.won / (data.won + data.lost)) * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );

        case 'revenue':
          const revenueDeals = drillDownData.deals || [];
          return (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>
                {drillDownData.type === 'won' ? 'Won' : 'Lost'} Deal Details
              </h3>
              <div style={{ marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="Search deals..."
                  value={localSearchTerm}
                  onChange={(e) => setLocalSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px'
                  }}
                />
              </div>
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                <table style={{ width: '100%', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                      <th 
                        style={{ padding: '8px', textAlign: 'left', cursor: 'pointer' }}
                        onClick={() => handleSort('DealName')}
                      >
                        Deal {sortConfig.key === 'DealName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        style={{ padding: '8px', textAlign: 'right', cursor: 'pointer' }}
                        onClick={() => handleSort('Amount')}
                      >
                        Amount {sortConfig.key === 'Amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        style={{ padding: '8px', textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => handleSort('CloseDate')}
                      >
                        Close Date {sortConfig.key === 'CloseDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th style={{ padding: '8px', width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDeals(revenueDeals.filter(d => 
                      !localSearchTerm || d.DealName?.toLowerCase().includes(localSearchTerm.toLowerCase())
                    )).map(deal => (
                      <tr key={deal.ID} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '8px' }}>
                          <div style={{ fontWeight: '500' }}>{deal.DealName}</div>
                          <div style={{ fontSize: '11px', color: '#6B7280' }}>{deal.AccountName}</div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                          ${(deal.Amount / 1000).toFixed(1)}K
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontSize: '11px' }}>
                          {new Date(deal.CloseDate).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <button
                            onClick={() => callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }])}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#3B82F6',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            View →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );

        case 'reasons':
          return (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>Loss Reason Analysis</h3>
              {Object.entries(drillDownData)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([reason, data]) => (
                  <div key={reason} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{reason}</div>
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>
                          {data.count} deals • ${(data.value / 1000).toFixed(0)}K lost
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setDrillDownType('reason-deals');
                          setDrillDownData(data);
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: '#F3F4F6',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        View Deals →
                      </button>
                    </div>
                    <div style={{
                      height: '8px',
                      backgroundColor: '#E5E7EB',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${(data.count / deals.filter(d => d.Stage === 'Closed Lost').length) * 100}%`,
                        height: '100%',
                        backgroundColor: '#F59E0B'
                      }} />
                    </div>
                  </div>
                ))}
            </div>
          );


        default:
          return null;
      }
    };

    return (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-500px',
          top: '75px',
          bottom: 0,
          width: '500px',
          backgroundColor: 'white',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          zIndex: 1000,
          transition: 'right 0.3s ease',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #E5E7EB',
          background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Analysis Details</h2>
            <button
              onClick={() => setIsPanelOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer',
                padding: 0
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {renderDrillDownContent()}
        </div>
      </div>
    );
  };

  // Correlation Factors Component
  const CorrelationFactors = () => {
    const factors = calculateCorrelationFactors();
    
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Win/Loss Correlation Factors</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {Object.entries(factors).map(([factor, data]) => {
            const factorLabels = {
              dealSize: { name: 'Deal Size', icon: '💰', unit: '$' },
              cycleTime: { name: 'Sales Cycle', icon: '⏱️', unit: ' days' },
              discount: { name: 'Discount %', icon: '🏷️', unit: '%' },
              interactions: { name: 'Interactions', icon: '💬', unit: '' }
            };
            
            const label = factorLabels[factor] || { name: factor, icon: '📊', unit: '' };
            const isPositive = data.wonAvg > data.lostAvg;
            
            return (
              <div
                key={factor}
                style={{
                  padding: '12px',
                  backgroundColor: '#F9FAFB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => setSelectedFactor(factor)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F3F4F6';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>{label.icon}</span>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{label.name}</div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>
                        Correlation: {(data.correlation * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#10B981' }}>
                      Won: {factor === 'dealSize' ? '$' : ''}{Math.round(data.wonAvg)}{label.unit}
                    </div>
                    <div style={{ fontSize: '11px', color: '#EF4444' }}>
                      Lost: {factor === 'dealSize' ? '$' : ''}{Math.round(data.lostAvg)}{label.unit}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '4px', height: '20px' }}>
                  <div style={{
                    width: '50%',
                    backgroundColor: '#10B981',
                    opacity: 0.2 + (data.correlation * 0.8),
                    borderRadius: '4px 0 0 4px'
                  }} />
                  <div style={{
                    width: '50%',
                    backgroundColor: '#EF4444',
                    opacity: 0.2 + ((1 - data.correlation) * 0.8),
                    borderRadius: '0 4px 4px 0'
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading win/loss data...</div>
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

  return (
    <div style={{ padding: '20px', backgroundColor: '#F3F4F6', minHeight: '100%' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Win/Loss Analysis</h2>
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
                borderRadius: '6px',
                fontSize: '14px'
              }}
            >
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
              <option value="all">All Time</option>
            </select>
            {DataExportPanel && (
              <DataExportPanel
                data={prepareExportData()}
                columns={getExportColumns()}
                filename={`win-loss-analysis-${new Date().toISOString().split('T')[0]}`}
                formats={['csv', 'excel', 'pdf']}
                buttonStyle="button"
                buttonText="Export"
                icon="fa-download"
                customStyles={{
                  button: {
                    padding: '6px 12px',
                    backgroundColor: '#10B981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }
                }}
                getHtmlElement={() => gridRef.current}
                utilities={utilities}
                styles={styles}
                components={components}
                callbacks={callbacks}
              />
            )}
            <button
              onClick={() => setViewMode(viewMode === 'overview' ? 'detailed' : 'overview')}
              style={{
                padding: '6px 12px',
                backgroundColor: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {viewMode === 'overview' ? 'Detailed View' : 'Overview'}
            </button>
          </div>
        </div>
        
        <OverviewCards />
        
        {viewMode === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
            <CorrelationFactors />
          </div>
        )}
        
        <DrillDownPanel />
      </div>
    </div>
  );
}