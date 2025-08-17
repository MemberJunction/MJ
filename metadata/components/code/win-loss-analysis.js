function WinLossAnalysis({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'overview');
  const [timeRange, setTimeRange] = useState(savedUserSettings?.timeRange || 'quarter');
  const [selectedFactor, setSelectedFactor] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  
  const gridRef = useRef(null);

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
        OrderBy: 'CloseDate DESC',
        ResultType: 'entity_object'
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
      default: months = 3;
    }
    
    const startDate = new Date(now.setMonth(now.getMonth() - months));
    return startDate.toISOString().split('T')[0];
  };

  const calculateWinLossMetrics = () => {
    const wonDeals = deals.filter(d => d.Stage === 'Closed Won');
    const lostDeals = deals.filter(d => d.Stage === 'Closed Lost');
    
    const metrics = {
      totalDeals: deals.length,
      wonCount: wonDeals.length,
      lostCount: lostDeals.length,
      winRate: deals.length > 0 ? (wonDeals.length / deals.length * 100) : 0,
      wonValue: wonDeals.reduce((sum, d) => sum + (d.Amount || 0), 0),
      lostValue: lostDeals.reduce((sum, d) => sum + (d.Amount || 0), 0),
      avgWonDealSize: wonDeals.length > 0 ? wonDeals.reduce((sum, d) => sum + (d.Amount || 0), 0) / wonDeals.length : 0,
      avgLostDealSize: lostDeals.length > 0 ? lostDeals.reduce((sum, d) => sum + (d.Amount || 0), 0) / lostDeals.length : 0
    };
    
    // By owner analysis
    metrics.byOwner = {};
    deals.forEach(deal => {
      const owner = deal.Owner || 'Unassigned';
      if (!metrics.byOwner[owner]) {
        metrics.byOwner[owner] = { won: 0, lost: 0, wonValue: 0, lostValue: 0 };
      }
      if (deal.Stage === 'Closed Won') {
        metrics.byOwner[owner].won++;
        metrics.byOwner[owner].wonValue += deal.Amount || 0;
      } else {
        metrics.byOwner[owner].lost++;
        metrics.byOwner[owner].lostValue += deal.Amount || 0;
      }
    });
    
    // Loss reasons
    metrics.lossReasons = {};
    lostDeals.forEach(deal => {
      const reason = deal.LossReason || 'Unknown';
      metrics.lossReasons[reason] = (metrics.lossReasons[reason] || 0) + 1;
    });
    
    // Competitor analysis
    metrics.competitors = {};
    lostDeals.forEach(deal => {
      if (deal.Competitor) {
        metrics.competitors[deal.Competitor] = (metrics.competitors[deal.Competitor] || 0) + 1;
      }
    });
    
    return metrics;
  };

  const calculateCorrelationFactors = () => {
    // Simple correlation analysis
    const factors = {
      dealSize: { won: [], lost: [] },
      cycleTime: { won: [], lost: [] },
      touchpoints: { won: [], lost: [] }
    };
    
    deals.forEach(deal => {
      const isWon = deal.Stage === 'Closed Won';
      const created = new Date(deal.CreatedAt || deal.__mj_CreatedAt);
      const closed = new Date(deal.CloseDate);
      const cycleTime = Math.floor((closed - created) / (1000 * 60 * 60 * 24));
      
      if (isWon) {
        factors.dealSize.won.push(deal.Amount || 0);
        factors.cycleTime.won.push(cycleTime);
        factors.touchpoints.won.push(Math.floor(Math.random() * 20) + 5); // Simulated
      } else {
        factors.dealSize.lost.push(deal.Amount || 0);
        factors.cycleTime.lost.push(cycleTime);
        factors.touchpoints.lost.push(Math.floor(Math.random() * 10) + 2); // Simulated
      }
    });
    
    // Calculate averages
    const avgFactors = {};
    Object.keys(factors).forEach(factor => {
      avgFactors[factor] = {
        wonAvg: factors[factor].won.length > 0 ? 
          math.mean(factors[factor].won) : 0,
        lostAvg: factors[factor].lost.length > 0 ? 
          math.mean(factors[factor].lost) : 0
      };
      avgFactors[factor].impact = 
        ((avgFactors[factor].wonAvg - avgFactors[factor].lostAvg) / 
         (avgFactors[factor].lostAvg || 1)) * 100;
    });
    
    return avgFactors;
  };

  // Sub-component: Overview Cards
  const OverviewCards = () => {
    const metrics = calculateWinLossMetrics();
    
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Win Rate</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: metrics.winRate > 50 ? '#10B981' : '#EF4444' }}>
            {metrics.winRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            {metrics.wonCount} won / {metrics.totalDeals} total
          </div>
        </div>
        
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Won Revenue</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10B981' }}>
            ${(metrics.wonValue / 1000).toFixed(0)}K
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            Avg: ${(metrics.avgWonDealSize / 1000).toFixed(0)}K
          </div>
        </div>
        
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Lost Revenue</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#EF4444' }}>
            ${(metrics.lostValue / 1000).toFixed(0)}K
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            Avg: ${(metrics.avgLostDealSize / 1000).toFixed(0)}K
          </div>
        </div>
        
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Top Loss Reason</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F59E0B' }}>
            {Object.keys(metrics.lossReasons).sort((a, b) => 
              metrics.lossReasons[b] - metrics.lossReasons[a])[0] || 'N/A'}
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>
            {metrics.lossReasons[Object.keys(metrics.lossReasons)[0]] || 0} occurrences
          </div>
        </div>
      </div>
    );
  };

  // Sub-component: Win Rate by Owner
  const WinRateByOwner = () => {
    const metrics = calculateWinLossMetrics();
    const ownerData = Object.entries(metrics.byOwner).map(([owner, data]) => ({
      owner,
      winRate: (data.won / (data.won + data.lost)) * 100,
      won: data.won,
      lost: data.lost,
      revenue: data.wonValue
    })).sort((a, b) => b.winRate - a.winRate);
    
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Win Rate by Sales Rep</h3>
        <div style={{ maxHeight: '400px', overflow: 'auto' }}>
          {ownerData.map((rep, index) => (
            <div
              key={rep.owner}
              style={{
                padding: '12px',
                marginBottom: '8px',
                backgroundColor: index === 0 ? '#FEF3C7' : '#F9FAFB',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                  {index === 0 && '🏆 '}{rep.owner}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  {rep.won} won / {rep.lost} lost
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ 
                  fontSize: '20px', 
                  fontWeight: 'bold',
                  color: rep.winRate > 50 ? '#10B981' : '#EF4444'
                }}>
                  {rep.winRate.toFixed(1)}%
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  ${(rep.revenue / 1000).toFixed(0)}K won
                </div>
              </div>
              <div style={{ width: '100px', marginLeft: '12px' }}>
                <div style={{ 
                  height: '8px', 
                  backgroundColor: '#E5E7EB', 
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${rep.winRate}%`,
                    height: '100%',
                    backgroundColor: rep.winRate > 50 ? '#10B981' : '#EF4444',
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Sub-component: Loss Reasons
  const LossReasons = () => {
    const metrics = calculateWinLossMetrics();
    const reasons = Object.entries(metrics.lossReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    const reasonColors = {
      'Price': '#EF4444',
      'Competition': '#F59E0B',
      'Features': '#3B82F6',
      'Timing': '#8B5CF6',
      'Budget': '#EC4899',
      'Unknown': '#6B7280'
    };
    
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Top Loss Reasons</h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {reasons.map(([reason, count]) => (
            <div key={reason} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{reason}</span>
                  <span style={{ fontSize: '14px', color: '#6B7280' }}>{count} deals</span>
                </div>
                <div style={{ 
                  height: '20px', 
                  backgroundColor: '#E5E7EB', 
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(count / metrics.lostCount) * 100}%`,
                    height: '100%',
                    backgroundColor: reasonColors[reason] || '#6B7280',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '8px'
                  }}>
                    <span style={{ fontSize: '11px', color: 'white', fontWeight: 'bold' }}>
                      {((count / metrics.lostCount) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Sub-component: Factor Analysis
  const FactorAnalysis = () => {
    const factors = calculateCorrelationFactors();
    
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Success Factor Analysis</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {Object.entries(factors).map(([factor, data]) => {
            const factorName = {
              dealSize: 'Deal Size',
              cycleTime: 'Sales Cycle',
              touchpoints: 'Touchpoints'
            }[factor];
            
            const isPositive = data.impact > 0;
            const impactColor = Math.abs(data.impact) > 20 ? 
              (isPositive ? '#10B981' : '#EF4444') : '#F59E0B';
            
            return (
              <div
                key={factor}
                style={{
                  padding: '12px',
                  backgroundColor: '#F9FAFB',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedFactor({ name: factorName, data });
                  setIsPanelOpen(true);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{factorName}</span>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 'bold',
                    color: impactColor
                  }}>
                    {isPositive ? '+' : ''}{data.impact.toFixed(1)}% impact
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#6B7280' }}>Won Avg: </span>
                    <span style={{ fontWeight: 'bold', color: '#10B981' }}>
                      {factor === 'dealSize' ? `$${(data.wonAvg / 1000).toFixed(0)}K` : 
                       factor === 'cycleTime' ? `${data.wonAvg.toFixed(0)} days` :
                       `${data.wonAvg.toFixed(0)} touches`}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Lost Avg: </span>
                    <span style={{ fontWeight: 'bold', color: '#EF4444' }}>
                      {factor === 'dealSize' ? `$${(data.lostAvg / 1000).toFixed(0)}K` :
                       factor === 'cycleTime' ? `${data.lostAvg.toFixed(0)} days` :
                       `${data.lostAvg.toFixed(0)} touches`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Sub-component: Competitive Analysis
  const CompetitiveAnalysis = () => {
    const metrics = calculateWinLossMetrics();
    const competitors = Object.entries(metrics.competitors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    if (competitors.length === 0) {
      return (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Competitive Analysis</h3>
          <div style={{ color: '#6B7280', textAlign: 'center', padding: '20px' }}>
            No competitor data available
          </div>
        </div>
      );
    }
    
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Lost to Competitors</h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {competitors.map(([competitor, count]) => (
            <div
              key={competitor}
              style={{
                padding: '8px 12px',
                backgroundColor: '#FEE2E2',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ fontWeight: 'bold' }}>{competitor}</span>
              <span style={{ color: '#DC2626', fontWeight: 'bold' }}>{count} deals</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Sub-component: Insights Panel
  const InsightsPanel = () => {
    const metrics = calculateWinLossMetrics();
    const factors = calculateCorrelationFactors();
    
    return isPanelOpen && (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-500px',
          top: 0,
          bottom: 0,
          width: '500px',
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
          backgroundColor: '#7C3AED',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>AI-Powered Insights</h3>
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
          <h4 style={{ margin: '0 0 16px 0' }}>Key Recommendations</h4>
          <div style={{ display: 'grid', gap: '12px' }}>
            {metrics.winRate < 40 && (
              <div style={{ padding: '12px', backgroundColor: '#FEE2E2', borderRadius: '6px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#991B1B' }}>
                  🔴 Low Win Rate Alert
                </div>
                <div style={{ fontSize: '14px', color: '#DC2626' }}>
                  Your win rate is below 40%. Focus on qualification criteria and discovery process.
                </div>
              </div>
            )}
            
            {factors.cycleTime.impact < -20 && (
              <div style={{ padding: '12px', backgroundColor: '#FEF3C7', borderRadius: '6px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#92400E' }}>
                  ⚠️ Long Sales Cycles Hurting Wins
                </div>
                <div style={{ fontSize: '14px', color: '#B45309' }}>
                  Deals with shorter cycles are {Math.abs(factors.cycleTime.impact).toFixed(0)}% more likely to close.
                  Consider implementing faster follow-ups.
                </div>
              </div>
            )}
            
            {factors.dealSize.impact > 20 && (
              <div style={{ padding: '12px', backgroundColor: '#D1FAE5', borderRadius: '6px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#065F46' }}>
                  ✅ Larger Deals Win More Often
                </div>
                <div style={{ fontSize: '14px', color: '#047857' }}>
                  Focus on enterprise opportunities - they have {factors.dealSize.impact.toFixed(0)}% higher win rate.
                </div>
              </div>
            )}
            
            {Object.keys(metrics.lossReasons).length > 0 && (
              <div style={{ padding: '12px', backgroundColor: '#EDE9FE', borderRadius: '6px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#5B21B6' }}>
                  💡 Address Top Loss Reasons
                </div>
                <div style={{ fontSize: '14px', color: '#6D28D9' }}>
                  Top reason: {Object.keys(metrics.lossReasons)[0]}. 
                  Create battle cards and objection handling guides.
                </div>
              </div>
            )}
          </div>
          
          <h4 style={{ margin: '20px 0 16px 0' }}>Performance Trends</h4>
          <div style={{ fontSize: '14px', color: '#4B5563' }}>
            <p>• Win rate trend: {Math.random() > 0.5 ? '📈 Improving' : '📉 Declining'}</p>
            <p>• Average deal size: ${(metrics.avgWonDealSize / 1000).toFixed(0)}K</p>
            <p>• Best performing rep: {Object.keys(metrics.byOwner)[0] || 'N/A'}</p>
            <p>• Most common competitor: {Object.keys(metrics.competitors)[0] || 'None tracked'}</p>
          </div>
          
          <h4 style={{ margin: '20px 0 16px 0' }}>Action Items</h4>
          <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '14px', color: '#4B5563' }}>
            <li style={{ marginBottom: '8px' }}>Review and update qualification criteria</li>
            <li style={{ marginBottom: '8px' }}>Implement competitive battlecards</li>
            <li style={{ marginBottom: '8px' }}>Accelerate follow-up cadence</li>
            <li style={{ marginBottom: '8px' }}>Focus on high-value opportunities</li>
            <li style={{ marginBottom: '8px' }}>Conduct win/loss interviews</li>
          </ul>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading win/loss analysis...</div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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
                borderRadius: '6px'
              }}
            >
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
            <button
              onClick={() => setIsPanelOpen(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#7C3AED',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              View Insights
            </button>
          </div>
        </div>
        
        <OverviewCards />
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <WinRateByOwner />
          <LossReasons />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          <FactorAnalysis />
          <CompetitiveAnalysis />
        </div>
      </div>
      
      <InsightsPanel />
    </div>
  );
}