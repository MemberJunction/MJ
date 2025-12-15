function AITimeSeriesChart({ data, groupBy, activeTab, selectedPoint, onPointClick, styles, utilities, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  console.log('[AITimeSeriesChart] Rendering with', data.length, 'data points');
  
  // Format large numbers
  const formatNumber = (value) => {
    if (!Number.isFinite(value) || value === 0) return '0';
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(0);
  };

  // Format currency
  const formatCurrency = (value) => {
    if (!Number.isFinite(value) || value === 0) return '$0.00';
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
  };
  
  // Format date based on grouping
  const formatDate = (date) => {
    const d = new Date(date);
    switch(groupBy) {
      case 'day':
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'week':
        return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      case 'month':
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      case 'quarter':
        return date; // Already formatted as YYYY-Q#
      default:
        return date;
    }
  };
  
  // Prepare chart data
  const chartData = useMemo(() => {
    return data.map(point => ({
      ...point,
      displayDate: formatDate(point.date),
      isSelected: selectedPoint?.date === point.date
    }));
  }, [data, selectedPoint, groupBy]);
  
  // Calculate max values for axis domains
  const maxTokens = useMemo(() => Math.max(...data.map(d => d.tokens || 0)), [data]);
  const maxRuns = useMemo(() => Math.max(...data.map(d => d.runs || 0)), [data]);
  const maxCost = useMemo(() => Math.max(...data.map(d => d.cost || 0)), [data]);
  
  // Use a simple SVG chart since we can't use external libraries
  const width = 800;
  const height = 400;
  const margin = { top: 20, right: 80, bottom: 60, left: 80 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  
  // Create scales - handle single data point case
  const xScale = (index) => {
    if (chartData.length <= 1) return innerWidth / 2; // Center single point
    return (index / (chartData.length - 1)) * innerWidth;
  };
  const yScaleTokens = (value) => {
    if (!maxTokens || maxTokens === 0) return innerHeight / 2;
    return innerHeight - (value / maxTokens) * innerHeight;
  };
  const yScaleRight = (value, max) => {
    if (!max || max === 0) return innerHeight / 2;
    return innerHeight - (value / max) * innerHeight;
  };
  
  // Create path data for lines
  const createPath = (data, valueKey, scale, max) => {
    return data.map((d, i) => {
      const x = xScale(i);
      const y = scale(d[valueKey] || 0, max);
      // Safety check: ensure both x and y are finite numbers
      const safeX = Number.isFinite(x) ? x : 0;
      const safeY = Number.isFinite(y) ? y : innerHeight / 2;
      return `${i === 0 ? 'M' : 'L'} ${safeX} ${safeY}`;
    }).join(' ');
  };
  
  const handlePointClick = (point) => {
    console.log('[AITimeSeriesChart] Point clicked:', point);
    onPointClick(point);
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
      <h3 style={{
        margin: `0 0 ${styles.spacing.md} 0`,
        color: styles.colors.text,
        fontSize: styles.typography.fontSize.lg
      }}>
        Performance Trends - {activeTab === 'agents' ? 'Agent Runs' : 'Prompt Runs'}
      </h3>
      
      {/* Chart Container */}
      <div style={{ flex: 1, position: 'relative', minHeight: '300px' }}>
        {chartData.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: styles.colors.textSecondary
          }}>
            No data available for the selected period
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: '100%' }}
            preserveAspectRatio="xMidYMid meet"
          >
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(tick => (
                <line
                  key={tick}
                  x1={0}
                  x2={innerWidth}
                  y1={innerHeight * (1 - tick)}
                  y2={innerHeight * (1 - tick)}
                  stroke={styles.colors.border}
                  strokeOpacity={0.3}
                  strokeDasharray="2,2"
                />
              ))}
              
              {/* X-axis labels */}
              {chartData.map((point, i) => {
                if (chartData.length > 20 && i % Math.ceil(chartData.length / 10) !== 0) {
                  return null;
                }
                return (
                  <text
                    key={i}
                    x={xScale(i)}
                    y={innerHeight + 20}
                    textAnchor="middle"
                    fill={styles.colors.textSecondary}
                    fontSize="12"
                  >
                    {point.displayDate}
                  </text>
                );
              })}
              
              {/* Y-axis labels (left - tokens) */}
              {[0, 0.25, 0.5, 0.75, 1].map(tick => (
                <text
                  key={tick}
                  x={-10}
                  y={innerHeight * (1 - tick) + 5}
                  textAnchor="end"
                  fill={styles.colors.textSecondary}
                  fontSize="12"
                >
                  {formatNumber(maxTokens * tick)}
                </text>
              ))}
              
              {/* Y-axis labels (right - cost) */}
              {[0, 0.25, 0.5, 0.75, 1].map(tick => (
                <text
                  key={tick}
                  x={innerWidth + 10}
                  y={innerHeight * (1 - tick) + 5}
                  textAnchor="start"
                  fill={styles.colors.textSecondary}
                  fontSize="12"
                >
                  {formatCurrency(maxCost * tick)}
                </text>
              ))}
              
              {/* Lines */}
              <path
                d={createPath(chartData, 'tokens', yScaleTokens, maxTokens)}
                fill="none"
                stroke={styles.colors.success || '#10b981'}
                strokeWidth="2"
              />
              <path
                d={createPath(chartData, 'runs', yScaleRight, maxRuns)}
                fill="none"
                stroke={styles.colors.primary || '#3b82f6'}
                strokeWidth="2"
              />
              <path
                d={createPath(chartData, 'cost', yScaleRight, maxCost)}
                fill="none"
                stroke={styles.colors.warning || '#f59e0b'}
                strokeWidth="2"
              />
              
              {/* Data points */}
              {chartData.map((point, i) => {
                const x = xScale(i);
                const safeX = Number.isFinite(x) ? x : innerWidth / 2;
                const yTokens = yScaleTokens(point.tokens || 0);
                const yRuns = yScaleRight(point.runs || 0, maxRuns);
                const yCost = yScaleRight(point.cost || 0, maxCost);
                const safeYTokens = Number.isFinite(yTokens) ? yTokens : innerHeight / 2;
                const safeYRuns = Number.isFinite(yRuns) ? yRuns : innerHeight / 2;
                const safeYCost = Number.isFinite(yCost) ? yCost : innerHeight / 2;

                return (
                  <g key={i}>
                    {/* Tokens */}
                    <circle
                      cx={safeX}
                      cy={safeYTokens}
                      r={point.isSelected ? 6 : 4}
                      fill={styles.colors.success || '#10b981'}
                      stroke="white"
                      strokeWidth="2"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handlePointClick(point)}
                    />
                    {/* Runs */}
                    <circle
                      cx={safeX}
                      cy={safeYRuns}
                      r={point.isSelected ? 6 : 4}
                      fill={styles.colors.primary || '#3b82f6'}
                      stroke="white"
                      strokeWidth="2"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handlePointClick(point)}
                    />
                    {/* Cost */}
                    <circle
                      cx={safeX}
                      cy={safeYCost}
                      r={point.isSelected ? 6 : 4}
                      fill={styles.colors.warning || '#f59e0b'}
                      stroke="white"
                      strokeWidth="2"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handlePointClick(point)}
                    />
                  </g>
                );
              })}
            </g>
            
            {/* Axis labels */}
            <text
              x={margin.left - 40}
              y={height / 2}
              transform={`rotate(-90, ${margin.left - 40}, ${height / 2})`}
              textAnchor="middle"
              fill={styles.colors.textSecondary}
              fontSize="14"
            >
              Tokens
            </text>
            <text
              x={width - margin.right + 40}
              y={height / 2}
              transform={`rotate(90, ${width - margin.right + 40}, ${height / 2})`}
              textAnchor="middle"
              fill={styles.colors.textSecondary}
              fontSize="14"
            >
              Runs / Cost ($)
            </text>
          </svg>
        )}
      </div>
      
      {/* Legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: styles.spacing.lg,
        marginTop: styles.spacing.md
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: styles.spacing.xs }}>
          <div style={{
            width: '12px',
            height: '12px',
            backgroundColor: styles.colors.primary || '#3b82f6',
            borderRadius: '2px'
          }} />
          <span style={{ fontSize: styles.typography.fontSize.sm, color: styles.colors.text }}>Runs</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: styles.spacing.xs }}>
          <div style={{
            width: '12px',
            height: '12px',
            backgroundColor: styles.colors.success || '#10b981',
            borderRadius: '2px'
          }} />
          <span style={{ fontSize: styles.typography.fontSize.sm, color: styles.colors.text }}>Tokens</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: styles.spacing.xs }}>
          <div style={{
            width: '12px',
            height: '12px',
            backgroundColor: styles.colors.warning || '#f59e0b',
            borderRadius: '2px'
          }} />
          <span style={{ fontSize: styles.typography.fontSize.sm, color: styles.colors.text }}>Cost</span>
        </div>
      </div>
    </div>
  );
}