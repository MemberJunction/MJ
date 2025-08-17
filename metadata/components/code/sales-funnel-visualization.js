function SalesFunnelVisualization({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'count');
  const [displayMode, setDisplayMode] = useState(savedUserSettings?.displayMode || 'cards');
  const [timeFilter, setTimeFilter] = useState(savedUserSettings?.timeFilter || 'quarter');
  const [startDate, setStartDate] = useState(savedUserSettings?.startDate || null);
  const [endDate, setEndDate] = useState(savedUserSettings?.endDate || null);
  const [sortBy, setSortBy] = useState('Amount');
  const [filterText, setFilterText] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [drillDownData, setDrillDownData] = useState(null);

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
    // If custom dates are set, use them
    if (startDate && endDate) {
      return `CloseDate >= '${startDate}' AND CloseDate <= '${endDate}'`;
    }
    
    // Otherwise use preset filter
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

  const calculateFunnelData = () => {
    const stageData = {};
    
    // Initialize stages
    pipelineStages.forEach(stage => {
      stageData[stage.name] = {
        count: 0,
        value: 0,
        deals: [],
        color: stage.color
      };
    });
    
    // Group deals by stage
    deals.forEach(deal => {
      if (stageData[deal.Stage]) {
        stageData[deal.Stage].count++;
        stageData[deal.Stage].value += deal.Amount || 0;
        stageData[deal.Stage].deals.push(deal);
      }
    });
    
    // Calculate conversion rates
    const funnelData = [];
    let previousCount = 0;
    
    pipelineStages.slice(0, -1).forEach((stage, index) => { // Exclude Closed Lost
      const current = stageData[stage.name];
      const conversionRate = previousCount > 0 ? (current.count / previousCount * 100) : 100;
      
      funnelData.push({
        stage: stage.name,
        count: current.count,
        value: current.value,
        deals: current.deals,
        color: stage.color,
        conversionRate: index === 0 ? 100 : conversionRate,
        width: 100 - (index * 15) // Funnel width percentage
      });
      
      previousCount = current.count || previousCount;
    });
    
    return { funnelData, closedLost: stageData['Closed Lost'] };
  };

  const { funnelData, closedLost } = calculateFunnelData();

  const handleStageClick = (stageData) => {
    setSelectedStage(stageData);
    setDrillDownData(null);
    setIsPanelOpen(true);
  };
  
  const handleDrillDown = (title, dealList, color = '#3B82F6') => {
    setDrillDownData({ title, deals: dealList, color });
    setSelectedStage(null);
    setIsPanelOpen(true);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Sub-component: Funnel Chart
  const FunnelChart = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      {funnelData.map((stage, index) => (
        <div
          key={stage.stage}
          className="funnel-stage"
          style={{
            width: `${stage.width}%`,
            maxWidth: '600px',
            marginBottom: '4px',
            position: 'relative',
            cursor: 'pointer',
            opacity: 0,
            transform: 'translateY(20px)',
            animation: `fadeInUp 0.5s ${index * 0.1}s forwards`,
            transition: 'transform 0.2s ease'
          }}
          onClick={() => handleStageClick(stage)}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
        >
          <div
            style={{
              background: `linear-gradient(135deg, ${stage.color}dd, ${stage.color}99)`,
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              minHeight: '60px'
            }}
          >
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>{stage.stage}</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {viewMode === 'count' ? stage.count : formatCurrency(stage.value)}
              </div>
            </div>
            {index > 0 && (
              <div style={{ color: 'white', textAlign: 'right' }}>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Conversion</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  {stage.conversionRate.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      
      {/* Lost deals indicator */}
      {closedLost.count > 0 && (
        <div
          style={{
            marginTop: '20px',
            padding: '12px 20px',
            backgroundColor: '#FEE2E2',
            borderRadius: '8px',
            color: '#991B1B',
            opacity: 0,
            animation: 'fadeIn 0.5s 0.5s forwards'
          }}
        >
          <div style={{ fontSize: '14px' }}>Lost Deals</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {closedLost.count} deals ({formatCurrency(closedLost.value)})
          </div>
        </div>
      )}
    </div>
  );

  // Sub-component: Deal Card View
  const DealCard = ({ deals }) => (
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
                {formatCurrency(deal.Amount)}
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
            <span>{deal.Probability}% probability</span>
          </div>
        </div>
      ))}
    </div>
  );
  
  // Sub-component: Deal List View
  const DealList = ({ deals }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
          <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#6B7280' }}>Deal</th>
          <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#6B7280' }}>Amount</th>
          <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#6B7280' }}>Prob</th>
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
            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '500' }}>
              {formatCurrency(deal.Amount)}
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px' }}>
              {deal.Probability}%
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
  
  // Sub-component: Drill Down Details  
  const DrillDownDetails = ({ data }) => {
    const [localSortBy, setLocalSortBy] = useState('Amount');
    const [localFilterText, setLocalFilterText] = useState('');
    const [localDisplayMode, setLocalDisplayMode] = useState('cards');
    
    const filteredDeals = data.deals.filter(deal => 
      deal.DealName.toLowerCase().includes(localFilterText.toLowerCase())
    );
    
    const sortedDeals = [...filteredDeals].sort((a, b) => {
      switch (localSortBy) {
        case 'Amount':
          return b.Amount - a.Amount;
        case 'CloseDate':
          return new Date(b.CloseDate) - new Date(a.CloseDate);
        case 'Probability':
          return b.Probability - a.Probability;
        default:
          return 0;
      }
    });
    
    return (
      <>
        <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB' }}>
          <input
            type="text"
            placeholder="Filter deals..."
            value={localFilterText}
            onChange={(e) => setLocalFilterText(e.target.value)}
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
              onClick={() => setLocalDisplayMode('cards')}
              style={{
                padding: '6px 12px',
                backgroundColor: localDisplayMode === 'cards' ? '#3B82F6' : '#F3F4F6',
                color: localDisplayMode === 'cards' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Cards
            </button>
            <button
              onClick={() => setLocalDisplayMode('list')}
              style={{
                padding: '6px 12px',
                backgroundColor: localDisplayMode === 'list' ? '#3B82F6' : '#F3F4F6',
                color: localDisplayMode === 'list' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              List
            </button>
            <select
              value={localSortBy}
              onChange={(e) => setLocalSortBy(e.target.value)}
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
          {localDisplayMode === 'cards' ? (
            <DealCard deals={sortedDeals} />
          ) : (
            <DealList deals={sortedDeals} />
          )}
        </div>
      </>
    );
  };
  
  // Sub-component: Stage Details Panel
  const StageDetailsPanel = () => {
    if (!selectedStage && !drillDownData) return null;
    
    const currentData = drillDownData || selectedStage;
    const title = drillDownData ? drillDownData.title : `${selectedStage.stage} Stage`;
    const bgColor = drillDownData ? drillDownData.color : selectedStage.color;
    const dealsList = drillDownData ? drillDownData.deals : selectedStage.deals;
    
    return isPanelOpen && (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-500px',
          top: '75px',
          bottom: 0,
          width: '500px',
          backgroundColor: 'white',
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
          backgroundColor: bgColor,
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '20px' }}>{title}</h3>
            <button
              onClick={() => {
                setIsPanelOpen(false);
                setSelectedStage(null);
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
            {dealsList.length} deals • {formatCurrency(dealsList.reduce((sum, d) => sum + (d.Amount || 0), 0))}
          </div>
        </div>
        
        <DrillDownDetails data={{ deals: dealsList, title, color: bgColor }} />
              style={{
                padding: '6px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                flex: 1
              }}
            >
              <option value="Amount">Sort by Amount</option>
              <option value="CloseDate">Sort by Date</option>
              <option value="Probability">Sort by Probability</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Filter deals..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px'
            }}
          />
        </div>
        
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {displayMode === 'cards' ? (
            <div style={{ display: 'grid', gap: '12px' }}>
              {sortedDeals.map(deal => (
                <DealCard key={deal.ID} deal={deal} />
              ))}
            </div>
          ) : (
            <DealList deals={sortedDeals} />
          )}
        </div>
      </div>
    );
  };

  // Sub-component: Deal Card
  const DealCard = ({ deal }) => (
    <div
      style={{
        padding: '12px',
        backgroundColor: '#F9FAFB',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        cursor: 'pointer',
        transition: 'transform 0.2s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onClick={() => callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }])}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{deal.DealName}</div>
      <div style={{ fontSize: '14px', color: '#6B7280' }}>
        {formatCurrency(deal.Amount)} • {dayjs(deal.CloseDate).format('MMM D, YYYY')}
      </div>
      <div style={{ marginTop: '4px', fontSize: '12px' }}>
        <span style={{
          padding: '2px 6px',
          backgroundColor: deal.Probability >= 70 ? '#D1FAE5' : deal.Probability >= 40 ? '#FEF3C7' : '#FEE2E2',
          color: deal.Probability >= 70 ? '#065F46' : deal.Probability >= 40 ? '#92400E' : '#991B1B',
          borderRadius: '4px'
        }}>
          {deal.Probability}% likely
        </span>
      </div>
    </div>
  );

  // Sub-component: Deal List
  const DealList = ({ deals }) => (
    <table style={{ width: '100%', fontSize: '14px' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
          <th style={{ padding: '8px', textAlign: 'left' }}>Deal</th>
          <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
          <th style={{ padding: '8px', textAlign: 'center' }}>%</th>
        </tr>
      </thead>
      <tbody>
        {deals.map(deal => (
          <tr
            key={deal.ID}
            style={{ borderBottom: '1px solid #E5E7EB', cursor: 'pointer' }}
            onClick={() => callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }])}
          >
            <td style={{ padding: '8px' }}>{deal.DealName}</td>
            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
              {formatCurrency(deal.Amount)}
            </td>
            <td style={{ padding: '8px', textAlign: 'center' }}>{deal.Probability}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading sales funnel...</div>
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
      <div style={{ padding: '20px', borderBottom: '1px solid #E5E7EB' }}>
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
        </div>
        
        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div 
            style={{ 
              padding: '12px', 
              backgroundColor: '#F9FAFB', 
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onClick={() => {
              setDrillDownData({ 
                title: 'All Deals', 
                deals: deals,
                color: '#3B82F6'
              });
              setIsPanelOpen(true);
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
          >
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Total Deals</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{deals.length}</div>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Total Value</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {formatNumber(deals.reduce((sum, d) => sum + (d.Amount || 0), 0))}
            </div>
          </div>
          <div 
            style={{ 
              padding: '12px', 
              backgroundColor: '#F9FAFB', 
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            onClick={() => {
              const closedWonStage = funnelData.find(s => s.stage === 'Closed Won');
              if (closedWonStage) handleStageClick(closedWonStage);
            }}
          >
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Win Rate</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {deals.length > 0 ? ((funnelData.find(s => s.stage === 'Closed Won')?.count || 0) / deals.length * 100).toFixed(1) : 0}%
            </div>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Avg Deal Size</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {formatNumber(deals.reduce((sum, d) => sum + (d.Amount || 0), 0) / deals.length)}
            </div>
          </div>
        </div>
      </div>
      
      <FunnelChart />
      <StageDetailsPanel />
    </div>
  );
}