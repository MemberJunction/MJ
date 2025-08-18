function AIDistributionChart({ data, activeTab, groupBy, styles, utilities, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  console.log('[AIDistributionChart] Rendering with', data?.length || 0, 'items');
  
  const [chartType, setChartType] = useState(savedUserSettings?.chartType || 'pie');
  const [metric, setMetric] = useState(savedUserSettings?.metric || 'cost');
  
  // Aggregate data by agent or prompt
  const aggregatedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const grouped = {};
    const groupField = activeTab === 'agents' ? 'Agent' : 'Prompt';
    const idField = activeTab === 'agents' ? 'AgentID' : 'PromptID';
    
    data.forEach(item => {
      const key = item[groupField] || item[idField] || 'Unknown';
      if (!grouped[key]) {
        grouped[key] = {
          name: key,
          runs: 0,
          tokens: 0,
          cost: 0
        };
      }
      grouped[key].runs++;
      grouped[key].tokens += (item.TotalTokensUsed || item.TokensUsed || 0);
      grouped[key].cost += (item.TotalCost || 0);
    });
    
    // Sort by selected metric and take top 10
    const sorted = Object.values(grouped)
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 10);
    
    // Calculate total for percentages
    const total = sorted.reduce((sum, item) => sum + item[metric], 0);
    
    return sorted.map(item => ({
      ...item,
      percentage: total > 0 ? (item[metric] / total) * 100 : 0
    }));
  }, [data, activeTab, metric]);
  
  // Color palette
  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
  ];
  
  const handleChartTypeChange = (type) => {
    setChartType(type);
    onSaveUserSettings?.({
      ...savedUserSettings,
      chartType: type
    });
  };
  
  const handleMetricChange = (newMetric) => {
    setMetric(newMetric);
    onSaveUserSettings?.({
      ...savedUserSettings,
      metric: newMetric
    });
  };
  
  const formatValue = (value) => {
    if (metric === 'cost') {
      return `$${value.toFixed(2)}`;
    } else if (metric === 'tokens') {
      return value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toString();
    }
    return value.toString();
  };
  
  // Calculate pie chart segments
  const calculatePieSegments = () => {
    let startAngle = -90; // Start from top
    return aggregatedData.map((item, index) => {
      const angle = (item.percentage / 100) * 360;
      const segment = {
        ...item,
        startAngle,
        endAngle: startAngle + angle,
        color: colors[index % colors.length]
      };
      startAngle += angle;
      return segment;
    });
  };
  
  const pieSegments = chartType === 'pie' ? calculatePieSegments() : [];
  
  // Create pie slice path
  const createPieSlice = (startAngle, endAngle, outerRadius, innerRadius = 0) => {
    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;
    
    const x1 = Math.cos(startAngleRad) * outerRadius;
    const y1 = Math.sin(startAngleRad) * outerRadius;
    const x2 = Math.cos(endAngleRad) * outerRadius;
    const y2 = Math.sin(endAngleRad) * outerRadius;
    
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    if (innerRadius > 0) {
      const ix1 = Math.cos(startAngleRad) * innerRadius;
      const iy1 = Math.sin(startAngleRad) * innerRadius;
      const ix2 = Math.cos(endAngleRad) * innerRadius;
      const iy2 = Math.sin(endAngleRad) * innerRadius;
      
      return `M ${ix1} ${iy1} L ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`;
    }
    
    return `M 0 0 L ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: styles.colors.surface,
      borderRadius: styles.borders?.radius || '4px',
      padding: styles.spacing.md,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: styles.spacing.md
      }}>
        <h3 style={{
          margin: 0,
          color: styles.colors.text,
          fontSize: styles.typography.fontSize.lg
        }}>
          Distribution by {activeTab === 'agents' ? 'Agent' : 'Prompt'}
        </h3>
        
        {/* Controls */}
        <div style={{ display: 'flex', gap: styles.spacing.sm }}>
          {/* Metric Selector */}
          <select
            value={metric}
            onChange={(e) => handleMetricChange(e.target.value)}
            style={{
              padding: `${styles.spacing.xs} ${styles.spacing.sm}`,
              border: `1px solid ${styles.colors.border}`,
              borderRadius: styles.borders?.radius || '4px',
              backgroundColor: styles.colors.background,
              color: styles.colors.text,
              fontSize: styles.typography.fontSize.sm
            }}
          >
            <option value="cost">Cost</option>
            <option value="tokens">Tokens</option>
            <option value="runs">Runs</option>
          </select>
          
          {/* Chart Type Toggle */}
          <div style={{
            display: 'flex',
            backgroundColor: styles.colors.background,
            borderRadius: styles.borders?.radius || '4px',
            border: `1px solid ${styles.colors.border}`
          }}>
            <button
              onClick={() => handleChartTypeChange('pie')}
              style={{
                padding: `${styles.spacing.xs} ${styles.spacing.sm}`,
                backgroundColor: chartType === 'pie' ? styles.colors.primary : 'transparent',
                color: chartType === 'pie' ? 'white' : styles.colors.text,
                border: 'none',
                borderRadius: styles.borders?.radius || '4px',
                cursor: 'pointer'
              }}
            >
              Pie
            </button>
            <button
              onClick={() => handleChartTypeChange('bar')}
              style={{
                padding: `${styles.spacing.xs} ${styles.spacing.sm}`,
                backgroundColor: chartType === 'bar' ? styles.colors.primary : 'transparent',
                color: chartType === 'bar' ? 'white' : styles.colors.text,
                border: 'none',
                borderRadius: styles.borders?.radius || '4px',
                cursor: 'pointer'
              }}
            >
              Bar
            </button>
          </div>
        </div>
      </div>
      
      {/* Chart */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {aggregatedData.length === 0 ? (
          <div style={{ color: styles.colors.textSecondary }}>
            No data available
          </div>
        ) : chartType === 'pie' ? (
          /* Pie Chart */
          <svg viewBox="-150 -150 300 300" style={{ maxWidth: '300px', maxHeight: '300px' }}>
            {pieSegments.map((segment, index) => (
              <g key={index}>
                <path
                  d={createPieSlice(segment.startAngle, segment.endAngle, 100, 50)}
                  fill={segment.color}
                  stroke="white"
                  strokeWidth="2"
                  opacity="0.9"
                  style={{ cursor: 'pointer' }}
                >
                  <title>{segment.name}: {formatValue(segment[metric])} ({segment.percentage.toFixed(1)}%)</title>
                </path>
                {/* Label for large segments */}
                {segment.percentage > 5 && (
                  <text
                    x={Math.cos(((segment.startAngle + segment.endAngle) / 2) * Math.PI / 180) * 75}
                    y={Math.sin(((segment.startAngle + segment.endAngle) / 2) * Math.PI / 180) * 75}
                    textAnchor="middle"
                    fill="white"
                    fontSize="12"
                    fontWeight="bold"
                  >
                    {segment.percentage.toFixed(0)}%
                  </text>
                )}
              </g>
            ))}
          </svg>
        ) : (
          /* Bar Chart */
          <div style={{
            width: '100%',
            maxWidth: '400px',
            display: 'flex',
            flexDirection: 'column',
            gap: styles.spacing.xs
          }}>
            {aggregatedData.map((item, index) => {
              const maxValue = Math.max(...aggregatedData.map(d => d[metric]));
              const width = (item[metric] / maxValue) * 100;
              
              return (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: styles.spacing.sm }}>
                  <div style={{
                    width: '120px',
                    fontSize: styles.typography.fontSize.sm,
                    color: styles.colors.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {item.name}
                  </div>
                  <div style={{
                    flex: 1,
                    height: '24px',
                    backgroundColor: styles.colors.background,
                    borderRadius: styles.borders?.radius || '4px',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${width}%`,
                      height: '100%',
                      backgroundColor: colors[index % colors.length],
                      transition: 'width 0.3s ease'
                    }} />
                    <div style={{
                      position: 'absolute',
                      right: styles.spacing.sm,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: styles.typography.fontSize.xs,
                      color: width > 50 ? 'white' : styles.colors.text,
                      fontWeight: '500'
                    }}>
                      {formatValue(item[metric])}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Legend */}
      {chartType === 'pie' && aggregatedData.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: styles.spacing.sm,
          justifyContent: 'center',
          marginTop: styles.spacing.md
        }}>
          {aggregatedData.slice(0, 5).map((item, index) => (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'center',
              gap: styles.spacing.xs
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: colors[index % colors.length],
                borderRadius: '2px'
              }} />
              <span style={{
                fontSize: styles.typography.fontSize.xs,
                color: styles.colors.text,
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}