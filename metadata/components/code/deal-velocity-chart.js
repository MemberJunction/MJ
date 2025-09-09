function DealVelocityChart({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(savedUserSettings?.timeRange || '6months');
  const [metricType, setMetricType] = useState(savedUserSettings?.metricType || 'count');
  const [chartData, setChartData] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [periodDeals, setPeriodDeals] = useState([]);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [sortBy, setSortBy] = useState('CloseDate');
  const [sortDirection, setSortDirection] = useState('DESC');
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const bucketsRef = useRef([]);

  // Time range options
  const timeRanges = {
    '1month': { label: 'Last Month', days: 30, buckets: 'daily' },
    '3months': { label: 'Last 3 Months', days: 90, buckets: 'weekly' },
    '6months': { label: 'Last 6 Months', days: 180, buckets: 'weekly' },
    '1year': { label: 'Last Year', days: 365, buckets: 'monthly' },
    '2years': { label: 'Last 2 Years', days: 730, buckets: 'monthly' }
  };

  useEffect(() => {
    loadDeals();
  }, [timeRange]);

  useEffect(() => {
    if (deals.length > 0) {
      processChartData();
    }
  }, [deals, metricType]);

  useEffect(() => {
    if (chartData && chartRef.current) {
      renderChart();
    }
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [chartData]);

  const loadDeals = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRanges[timeRange].days);
      
      // Format dates for SQL
      const formatDate = (date) => date.toISOString().split('T')[0];
      
      // Load all deals within the time range (both created and closed)
      const result = await utilities.rv.RunView({
        EntityName: 'Deals',
        ExtraFilter: `__mj_CreatedAt >= '${formatDate(startDate)}' OR (CloseDate >= '${formatDate(startDate)}' AND CloseDate <= '${formatDate(endDate)}')`,
        OrderBy: '__mj_CreatedAt ASC'
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

  const processChartData = () => {
    // Store buckets for drill-down functionality
    bucketsRef.current = [];
    
    const range = timeRanges[timeRange];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - range.days);
    
    // Create time buckets based on range
    const buckets = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      let bucketEnd = new Date(currentDate);
      let label = '';
      
      if (range.buckets === 'daily') {
        bucketEnd.setDate(bucketEnd.getDate() + 1);
        label = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (range.buckets === 'weekly') {
        bucketEnd.setDate(bucketEnd.getDate() + 7);
        label = `Week of ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      } else if (range.buckets === 'monthly') {
        bucketEnd.setMonth(bucketEnd.getMonth() + 1);
        label = currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
      
      const bucket = {
        start: new Date(currentDate),
        end: new Date(bucketEnd),
        label: label,
        created: 0,
        closed: 0,
        won: 0,
        lost: 0,
        value: 0,
        wonValue: 0,
        avgCycleTime: 0,
        cycleTimeCount: 0,
        cycleTimeSum: 0,
        dealIds: [] // Track deal IDs for drill-down
      };
      
      buckets.push(bucket);
      bucketsRef.current.push(bucket);
      
      currentDate.setTime(bucketEnd.getTime());
    }
    
    // Process deals into buckets
    deals.forEach(deal => {
      // Find bucket for creation date
      const createdDate = new Date(deal.__mj_CreatedAt);
      const createdBucket = buckets.find(b => createdDate >= b.start && createdDate < b.end);
      if (createdBucket) {
        createdBucket.created++;
        createdBucket.value += deal.Amount || 0;
        if (!createdBucket.dealIds.includes(deal.ID)) {
          createdBucket.dealIds.push(deal.ID);
        }
      }
      
      // Find bucket for close date if closed
      if (deal.CloseDate && (deal.Stage === 'Closed Won' || deal.Stage === 'Closed Lost')) {
        const closeDate = new Date(deal.CloseDate);
        const closeBucket = buckets.find(b => closeDate >= b.start && closeDate < b.end);
        if (closeBucket) {
          closeBucket.closed++;
          
          if (deal.Stage === 'Closed Won') {
            closeBucket.won++;
            closeBucket.wonValue += deal.Amount || 0;
          } else {
            closeBucket.lost++;
          }
          
          if (!closeBucket.dealIds.includes(deal.ID)) {
            closeBucket.dealIds.push(deal.ID);
          }
          
          // Calculate cycle time (days from creation to close)
          const cycleTime = Math.floor((closeDate - createdDate) / (1000 * 60 * 60 * 24));
          if (cycleTime >= 0) {
            closeBucket.cycleTimeSum += cycleTime;
            closeBucket.cycleTimeCount++;
          }
        }
      }
    });
    
    // Calculate average cycle times
    buckets.forEach(bucket => {
      if (bucket.cycleTimeCount > 0) {
        bucket.avgCycleTime = Math.round(bucket.cycleTimeSum / bucket.cycleTimeCount);
      }
    });
    
    // Prepare chart data based on metric type
    let datasets = [];
    
    if (metricType === 'count') {
      datasets = [
        {
          label: 'New Deals',
          data: buckets.map(b => b.created),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.1
        },
        {
          label: 'Closed Won',
          data: buckets.map(b => b.won),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.1
        },
        {
          label: 'Closed Lost',
          data: buckets.map(b => b.lost),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.1
        }
      ];
    } else if (metricType === 'value') {
      datasets = [
        {
          label: 'Pipeline Value',
          data: buckets.map(b => b.value),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.1,
          yAxisID: 'y'
        },
        {
          label: 'Won Value',
          data: buckets.map(b => b.wonValue),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.1,
          yAxisID: 'y'
        }
      ];
    } else if (metricType === 'velocity') {
      datasets = [
        {
          label: 'Avg Days to Close',
          data: buckets.map(b => b.avgCycleTime || null),
          borderColor: 'rgb(168, 85, 247)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          tension: 0.1,
          spanGaps: true
        },
        {
          label: 'Win Rate %',
          data: buckets.map(b => b.closed > 0 ? Math.round((b.won / b.closed) * 100) : null),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.1,
          spanGaps: true,
          yAxisID: 'y1'
        }
      ];
    } else if (metricType === 'conversion') {
      // Calculate cumulative conversion funnel
      let cumulativeCreated = 0;
      let cumulativeWon = 0;
      
      datasets = [
        {
          label: 'Conversion Rate %',
          data: buckets.map(b => {
            cumulativeCreated += b.created;
            cumulativeWon += b.won;
            return cumulativeCreated > 0 ? Math.round((cumulativeWon / cumulativeCreated) * 100) : 0;
          }),
          borderColor: 'rgb(251, 146, 60)',
          backgroundColor: 'rgba(251, 146, 60, 0.1)',
          tension: 0.1
        }
      ];
    }
    
    setChartData({
      labels: buckets.map(b => b.label),
      datasets: datasets
    });
  };

  const renderChart = () => {
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    
    const ctx = chartRef.current.getContext('2d');
    
    // Configure options based on metric type
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: getChartTitle()
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              
              if (metricType === 'value') {
                label += new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 0
                }).format(context.parsed.y);
              } else if (metricType === 'velocity' && context.dataset.label === 'Avg Days to Close') {
                label += context.parsed.y + ' days';
              } else if (context.dataset.label && context.dataset.label.includes('%')) {
                label += context.parsed.y + '%';
              } else {
                label += context.parsed.y;
              }
              
              return label;
            }
          }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          handleChartClick(index);
        }
      },
      onHover: (event, elements) => {
        if (chartRef.current) {
          chartRef.current.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: metricType === 'value' ? {
            callback: function(value) {
              return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              }).format(value);
            }
          } : {}
        }
      }
    };
    
    // Add second y-axis for velocity metric
    if (metricType === 'velocity') {
      options.scales.y1 = {
        type: 'linear',
        display: true,
        position: 'right',
        beginAtZero: true,
        max: 100,
        grid: {
          drawOnChartArea: false
        },
        ticks: {
          callback: function(value) {
            return value + '%';
          }
        }
      };
    }
    
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: options
    });
  };

  const getChartTitle = () => {
    switch (metricType) {
      case 'count':
        return 'Deal Flow Over Time';
      case 'value':
        return 'Deal Value Over Time';
      case 'velocity':
        return 'Deal Velocity & Win Rate';
      case 'conversion':
        return 'Cumulative Conversion Rate';
      default:
        return 'Deal Metrics';
    }
  };

  const handleTimeRangeChange = (range) => {
    setTimeRange(range);
    onSaveUserSettings({ ...savedUserSettings, timeRange: range });
  };

  const handleMetricChange = (metric) => {
    setMetricType(metric);
    onSaveUserSettings({ ...savedUserSettings, metricType: metric });
  };

  const handleChartClick = (index) => {
    const bucket = bucketsRef.current[index];
    if (bucket && bucket.dealIds.length > 0) {
      setSelectedPeriod(bucket);
      
      // Filter deals for this period
      const bucketDeals = deals.filter(deal => bucket.dealIds.includes(deal.ID));
      setPeriodDeals(bucketDeals);
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortDirection(field === 'Amount' ? 'DESC' : 'ASC');
    }
  };

  const getSortedDeals = () => {
    const sorted = [...periodDeals].sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (sortBy === 'CloseDate' || sortBy === '__mj_CreatedAt') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      }
      
      if (sortDirection === 'ASC') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return sorted;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading deal velocity data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#FEE2E2', borderRadius: '8px', margin: '20px' }}>
        <div style={{ color: '#991B1B', fontWeight: 'bold' }}>Error loading data</div>
        <div style={{ color: '#DC2626', marginTop: '8px' }}>{error}</div>
        <button 
          onClick={loadDeals}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: '#EF4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Internal component for summary stats
  const renderSummaryStats = () => {
    const totalDeals = deals.length;
    const closedDeals = deals.filter(d => d.Stage === 'Closed Won' || d.Stage === 'Closed Lost').length;
    const wonDeals = deals.filter(d => d.Stage === 'Closed Won').length;
    const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
    const totalValue = deals.reduce((sum, d) => sum + (d.Amount || 0), 0);
    const wonValue = deals.filter(d => d.Stage === 'Closed Won').reduce((sum, d) => sum + (d.Amount || 0), 0);
    
    const metrics = [
      { label: 'Total Deals', value: totalDeals, color: '#3B82F6', format: 'number' },
      { label: 'Won Deals', value: wonDeals, color: '#10B981', format: 'number' },
      { label: 'Win Rate', value: winRate, color: '#F59E0B', format: 'percent' },
      { label: 'Total Value', value: totalValue, color: '#8B5CF6', format: 'currency' },
      { label: 'Won Value', value: wonValue, color: '#EC4899', format: 'currency' }
    ];
    
    const formatValue = (value, format) => {
      switch (format) {
        case 'currency':
          return formatCurrency(value);
        case 'percent':
          return `${value}%`;
        default:
          return value.toLocaleString();
      }
    };
    
    return (
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        {metrics.map((metric, index) => (
          <div 
            key={index}
            style={{ 
              padding: '12px', 
              backgroundColor: '#F9FAFB', 
              borderRadius: '8px',
              borderLeft: `4px solid ${metric.color}`
            }}
          >
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
              {metric.label}
            </div>
            <div style={{ 
              fontSize: metric.format === 'currency' ? '20px' : '24px', 
              fontWeight: 'bold', 
              color: '#111827' 
            }}>
              {formatValue(metric.value, metric.format)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Deal Velocity Analysis</h2>
          <button
            onClick={loadDeals}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Refresh
          </button>
        </div>
        
        {/* Controls */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {Object.entries(timeRanges).map(([key, value]) => (
              <button
                key={key}
                onClick={() => handleTimeRangeChange(key)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: timeRange === key ? '#3B82F6' : '#F3F4F6',
                  color: timeRange === key ? 'white' : '#374151',
                  border: '1px solid',
                  borderColor: timeRange === key ? '#3B82F6' : '#D1D5DB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                {value.label}
              </button>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button
              onClick={() => handleMetricChange('count')}
              style={{
                padding: '6px 12px',
                backgroundColor: metricType === 'count' ? '#3B82F6' : '#F3F4F6',
                color: metricType === 'count' ? 'white' : '#374151',
                border: '1px solid',
                borderColor: metricType === 'count' ? '#3B82F6' : '#D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              📊 Deal Count
            </button>
            <button
              onClick={() => handleMetricChange('value')}
              style={{
                padding: '6px 12px',
                backgroundColor: metricType === 'value' ? '#3B82F6' : '#F3F4F6',
                color: metricType === 'value' ? 'white' : '#374151',
                border: '1px solid',
                borderColor: metricType === 'value' ? '#3B82F6' : '#D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              💰 Deal Value
            </button>
            <button
              onClick={() => handleMetricChange('velocity')}
              style={{
                padding: '6px 12px',
                backgroundColor: metricType === 'velocity' ? '#3B82F6' : '#F3F4F6',
                color: metricType === 'velocity' ? 'white' : '#374151',
                border: '1px solid',
                borderColor: metricType === 'velocity' ? '#3B82F6' : '#D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ⚡ Velocity
            </button>
            <button
              onClick={() => handleMetricChange('conversion')}
              style={{
                padding: '6px 12px',
                backgroundColor: metricType === 'conversion' ? '#3B82F6' : '#F3F4F6',
                color: metricType === 'conversion' ? 'white' : '#374151',
                border: '1px solid',
                borderColor: metricType === 'conversion' ? '#3B82F6' : '#D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🎯 Conversion
            </button>
          </div>
        </div>
        
        {/* Summary Stats */}
        {renderSummaryStats()}
        
      </div>
      
      {/* Chart Container */}
      <div style={{ 
        flex: 1, 
        backgroundColor: 'white', 
        borderRadius: '8px', 
        padding: '20px',
        border: '1px solid #E5E7EB',
        position: 'relative',
        minHeight: '400px'
      }}>
        <canvas ref={chartRef}></canvas>
      </div>
      
      {deals.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
          No deals found in the selected time range
        </div>
      )}

      {/* Period Details Modal */}
      {selectedPeriod && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => {
          setSelectedPeriod(null);
          setSelectedDeal(null);
        }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '1200px',
              height: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                Deals for {selectedPeriod.label}
                <span style={{ marginLeft: '12px', fontSize: '16px', color: '#6B7280' }}>
                  ({periodDeals.length} deals)
                </span>
              </h3>
              <button
                onClick={() => {
                  setSelectedPeriod(null);
                  setSelectedDeal(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6B7280',
                  padding: '0',
                  width: '30px',
                  height: '30px'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              {periodDeals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                  No deals found for this period
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                      <th 
                        onClick={() => handleSort('DealName')}
                        style={{ 
                          padding: '12px', 
                          textAlign: 'left', 
                          fontWeight: '600',
                          cursor: 'pointer',
                          color: sortBy === 'DealName' ? '#3B82F6' : '#374151'
                        }}
                      >
                        Deal Name
                        {sortBy === 'DealName' && (
                          <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '\u2191' : '\u2193'}</span>
                        )}
                      </th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Stage</th>
                      <th 
                        onClick={() => handleSort('Amount')}
                        style={{ 
                          padding: '12px', 
                          textAlign: 'right', 
                          fontWeight: '600',
                          cursor: 'pointer',
                          color: sortBy === 'Amount' ? '#3B82F6' : '#374151'
                        }}
                      >
                        Amount
                        {sortBy === 'Amount' && (
                          <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '\u2191' : '\u2193'}</span>
                        )}
                      </th>
                      <th 
                        onClick={() => handleSort('CloseDate')}
                        style={{ 
                          padding: '12px', 
                          textAlign: 'left', 
                          fontWeight: '600',
                          cursor: 'pointer',
                          color: sortBy === 'CloseDate' ? '#3B82F6' : '#374151'
                        }}
                      >
                        Close Date
                        {sortBy === 'CloseDate' && (
                          <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '\u2191' : '\u2193'}</span>
                        )}
                      </th>
                      <th 
                        onClick={() => handleSort('__mj_CreatedAt')}
                        style={{ 
                          padding: '12px', 
                          textAlign: 'left', 
                          fontWeight: '600',
                          cursor: 'pointer',
                          color: sortBy === '__mj_CreatedAt' ? '#3B82F6' : '#374151'
                        }}
                      >
                        Created
                        {sortBy === '__mj_CreatedAt' && (
                          <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '\u2191' : '\u2193'}</span>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedDeals().map((deal, index) => {
                      const stageColors = {
                        'Prospecting': { bg: '#F3F4F6', text: '#6B7280' },
                        'Qualification': { bg: '#DBEAFE', text: '#1E40AF' },
                        'Proposal': { bg: '#FEF3C7', text: '#92400E' },
                        'Negotiation': { bg: '#FED7AA', text: '#9A3412' },
                        'Closed Won': { bg: '#D1FAE5', text: '#065F46' },
                        'Closed Lost': { bg: '#FEE2E2', text: '#991B1B' }
                      };
                      const stageStyle = stageColors[deal.Stage] || stageColors['Prospecting'];
                      
                      return (
                        <tr 
                          key={deal.ID}
                          style={{ 
                            borderBottom: '1px solid #E5E7EB',
                            cursor: 'pointer',
                            backgroundColor: index % 2 === 0 ? 'white' : '#F9FAFB'
                          }}
                          onClick={() => setSelectedDeal(deal)}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#F9FAFB'}
                        >
                          <td style={{ padding: '12px', fontWeight: '500' }}>{deal.DealName}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor: stageStyle.bg,
                              color: stageStyle.text
                            }}>
                              {deal.Stage}
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                            {formatCurrency(deal.Amount)}
                          </td>
                          <td style={{ padding: '12px' }}>
                            {deal.CloseDate ? new Date(deal.CloseDate).toLocaleDateString() : '-'}
                          </td>
                          <td style={{ padding: '12px' }}>
                            {new Date(deal.__mj_CreatedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deal Detail Modal */}
      {selectedDeal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001
        }}
        onClick={() => setSelectedDeal(null)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{selectedDeal.DealName}</h3>
              <button
                onClick={() => setSelectedDeal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6B7280',
                  padding: '0',
                  width: '30px',
                  height: '30px'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Amount</label>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
                    {formatCurrency(selectedDeal.Amount)}
                  </div>
                </div>
                
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Stage</label>
                  <div style={{ fontSize: '16px', fontWeight: '600' }}>
                    {selectedDeal.Stage}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Close Date</label>
                  <div style={{ fontSize: '14px', color: '#111827' }}>
                    {selectedDeal.CloseDate ? new Date(selectedDeal.CloseDate).toLocaleDateString() : 'Not set'}
                  </div>
                </div>
                
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Probability</label>
                  <div style={{ fontSize: '14px', color: '#111827' }}>
                    {selectedDeal.Probability || 0}%
                  </div>
                </div>
              </div>
              
              {selectedDeal.DealSource && (
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Source</label>
                  <div style={{ fontSize: '14px', color: '#111827' }}>
                    {selectedDeal.DealSource}
                  </div>
                </div>
              )}
              
              {selectedDeal.NextStep && (
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Next Step</label>
                  <div style={{ fontSize: '14px', color: '#111827' }}>
                    {selectedDeal.NextStep}
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ 
              marginTop: '20px', 
              paddingTop: '20px', 
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  // callbacks.OpenEntityRecord expects:
                  // 1. Entity name as string
                  // 2. Array of key-value pairs: [{FieldName: 'fieldname', Value: value}]
                  if (callbacks.OpenEntityRecord) {
                    callbacks.OpenEntityRecord('Deals', [
                      { FieldName: 'ID', Value: selectedDeal.ID }
                    ]);
                    setSelectedDeal(null);
                    setSelectedPeriod(null);
                  } else {
                    console.warn('OpenEntityRecord callback not available');
                  }
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '16px' }}>📂</span>
                Open
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}