function AIModelAnalytics({ 
  model,
  promptRuns,
  view,
  onViewChange,
  utilities, 
  styles, 
  components, 
  callbacks, 
  savedUserSettings, 
  onSaveUserSettings 
}) {
  // Helper function to get border radius value
  const getBorderRadius = (size) => {
    return typeof styles.borders?.radius === 'object' ? styles.borders.radius[size] : styles.borders?.radius || '4px';
  };
  
  // Calculate prompt usage statistics
  const promptStats = useMemo(() => {
    if (!promptRuns || promptRuns.length === 0) return [];
    
    const stats = {};
    promptRuns.forEach(run => {
      const promptName = run.PromptName || 'Unknown';
      if (!stats[promptName]) {
        stats[promptName] = {
          name: promptName,
          runs: 0,
          successfulRuns: 0,
          failedRuns: 0,
          totalTokens: 0,
          avgExecutionTime: 0,
          executionTimes: []
        };
      }
      
      stats[promptName].runs++;
      if (run.Status === 'Success' || run.Status === 'Completed') {
        stats[promptName].successfulRuns++;
      } else if (run.Status === 'Failed' || run.Status === 'Error') {
        stats[promptName].failedRuns++;
      }
      
      stats[promptName].totalTokens += run.TotalTokens || 0;
      if (run.TotalExecutionTime) {
        stats[promptName].executionTimes.push(run.TotalExecutionTime);
      }
    });
    
    // Calculate averages
    Object.values(stats).forEach(stat => {
      if (stat.executionTimes.length > 0) {
        stat.avgExecutionTime = stat.executionTimes.reduce((a, b) => a + b, 0) / stat.executionTimes.length;
      }
    });
    
    return Object.values(stats).sort((a, b) => b.runs - a.runs);
  }, [promptRuns]);
  
  // Calculate time series data
  const timeSeriesData = useMemo(() => {
    if (!promptRuns || promptRuns.length === 0) return [];
    
    // Group by day
    const dailyStats = {};
    promptRuns.forEach(run => {
      if (run.StartTime) {
        const date = new Date(run.StartTime).toLocaleDateString();
        if (!dailyStats[date]) {
          dailyStats[date] = {
            date,
            runs: 0,
            tokens: 0,
            errors: 0
          };
        }
        dailyStats[date].runs++;
        dailyStats[date].tokens += run.TotalTokens || 0;
        if (run.Status === 'Failed' || run.Status === 'Error') {
          dailyStats[date].errors++;
        }
      }
    });
    
    return Object.values(dailyStats).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [promptRuns]);
  
  // Render pie chart
  const renderPieChart = () => {
    if (promptStats.length === 0) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: styles.colors.textSecondary,
          fontSize: styles.typography.fontSize.sm
        }}>
          No prompt data available
        </div>
      );
    }
    
    const total = promptStats.reduce((sum, stat) => sum + stat.runs, 0);
    const colors = [
      styles.colors.primary,
      styles.colors.success || '#4CAF50',
      styles.colors.warning || '#FF9800',
      styles.colors.error || '#F44336',
      styles.colors.info || '#2196F3',
      '#9C27B0', '#00BCD4', '#8BC34A', '#FFC107', '#795548'
    ];
    
    // Create simple pie chart using SVG
    let currentAngle = 0;
    const segments = promptStats.slice(0, 5).map((stat, index) => {
      const percentage = stat.runs / total;
      const angle = percentage * 360;
      const largeArcFlag = angle > 180 ? 1 : 0;
      
      const startX = 100 + 80 * Math.cos((currentAngle - 90) * Math.PI / 180);
      const startY = 100 + 80 * Math.sin((currentAngle - 90) * Math.PI / 180);
      
      currentAngle += angle;
      
      const endX = 100 + 80 * Math.cos((currentAngle - 90) * Math.PI / 180);
      const endY = 100 + 80 * Math.sin((currentAngle - 90) * Math.PI / 180);
      
      const pathData = [
        `M 100 100`,
        `L ${startX} ${startY}`,
        `A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY}`,
        'Z'
      ].join(' ');
      
      return {
        path: pathData,
        color: colors[index % colors.length],
        percentage,
        stat
      };
    });
    
    return (
      <div>
        <svg viewBox="0 0 200 200" style={{ width: '200px', height: '200px', margin: '0 auto', display: 'block' }}>
          {segments.map((segment, index) => (
            <g key={index}>
              <path
                d={segment.path}
                fill={segment.color}
                stroke={styles.colors.background}
                strokeWidth="2"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              />
            </g>
          ))}
        </svg>
        
        {/* Legend */}
        <div style={{
          marginTop: styles.spacing.md,
          display: 'flex',
          flexDirection: 'column',
          gap: styles.spacing.xs
        }}>
          {segments.map((segment, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: styles.spacing.sm,
                fontSize: styles.typography.fontSize.sm
              }}
            >
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: segment.color,
                borderRadius: '2px'
              }} />
              <div style={{
                flex: 1,
                color: styles.colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {segment.stat.name}
              </div>
              <div style={{
                color: styles.colors.textSecondary,
                fontWeight: styles.typography.fontWeight?.medium || '500'
              }}>
                {(segment.percentage * 100).toFixed(1)}%
              </div>
            </div>
          ))}
          {promptStats.length > 5 && (
            <div style={{
              fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
              color: styles.colors.textSecondary,
              fontStyle: 'italic'
            }}>
              +{promptStats.length - 5} more prompts
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // Render bar chart for performance
  const renderPerformanceChart = () => {
    if (promptStats.length === 0) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: styles.colors.textSecondary,
          fontSize: styles.typography.fontSize.sm
        }}>
          No performance data available
        </div>
      );
    }
    
    const maxTime = Math.max(...promptStats.map(s => s.avgExecutionTime || 0));
    const displayStats = promptStats.slice(0, 10);
    
    return (
      <div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: styles.spacing.sm
        }}>
          {displayStats.map((stat, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: styles.spacing.sm }}>
              <div style={{
                width: '100px',
                fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                color: styles.colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {stat.name}
              </div>
              <div style={{
                flex: 1,
                height: '20px',
                backgroundColor: styles.colors.background,
                borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: maxTime > 0 ? `${(stat.avgExecutionTime / maxTime) * 100}%` : '0%',
                  height: '100%',
                  backgroundColor: styles.colors.primary,
                  transition: 'width 0.3s'
                }} />
                <div style={{
                  position: 'absolute',
                  right: styles.spacing.xs,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                  color: styles.colors.textSecondary
                }}>
                  {stat.avgExecutionTime ? `${(stat.avgExecutionTime / 1000).toFixed(2)}s` : '-'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // Render time series chart
  const renderTimeSeriesChart = () => {
    if (timeSeriesData.length === 0) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: styles.colors.textSecondary,
          fontSize: styles.typography.fontSize.sm
        }}>
          No time series data available
        </div>
      );
    }
    
    const maxRuns = Math.max(...timeSeriesData.map(d => d.runs));
    const recentData = timeSeriesData.slice(-7);
    
    return (
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          height: '150px',
          gap: styles.spacing.xs,
          marginBottom: styles.spacing.sm
        }}>
          {recentData.map((data, index) => (
            <div
              key={index}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: styles.spacing.xs
              }}
            >
              <div style={{
                width: '100%',
                backgroundColor: styles.colors.background,
                borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                position: 'relative',
                flex: 1,
                display: 'flex',
                alignItems: 'flex-end'
              }}>
                <div style={{
                  width: '100%',
                  height: maxRuns > 0 ? `${(data.runs / maxRuns) * 100}%` : '0%',
                  backgroundColor: data.errors > 0 
                    ? styles.colors.error 
                    : styles.colors.primary,
                  borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                  transition: 'height 0.3s'
                }} />
              </div>
              <div style={{
                fontSize: '10px',
                color: styles.colors.textSecondary,
                textAlign: 'center'
              }}>
                {new Date(data.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
          color: styles.colors.textSecondary
        }}>
          <span>Runs per day (last 7 days)</span>
          <span>Max: {maxRuns}</span>
        </div>
      </div>
    );
  };
  
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: styles.colors.surface
    }}>
      {/* Header with View Selector */}
      <div style={{
        padding: styles.spacing.lg,
        borderBottom: `1px solid ${styles.colors.border}`
      }}>
        <h3 style={{
          margin: 0,
          marginBottom: styles.spacing.md,
          fontSize: styles.typography.fontSize.lg,
          fontWeight: styles.typography.fontWeight?.semibold || '600',
          color: styles.colors.text
        }}>
          Analytics
        </h3>
        
        {/* View Tabs */}
        <div style={{
          display: 'flex',
          gap: styles.spacing.xs,
          borderBottom: `1px solid ${styles.colors.border}`
        }}>
          <button
            onClick={() => onViewChange?.('prompts')}
            style={{
              padding: `${styles.spacing.sm} ${styles.spacing.md}`,
              backgroundColor: 'transparent',
              color: view === 'prompts' ? styles.colors.primary : styles.colors.textSecondary,
              border: 'none',
              borderBottom: view === 'prompts' ? `2px solid ${styles.colors.primary}` : 'none',
              fontSize: styles.typography.fontSize.sm,
              fontWeight: styles.typography.fontWeight?.medium || '500',
              cursor: 'pointer',
              transition: 'color 0.2s'
            }}
          >
            Prompt Usage
          </button>
          <button
            onClick={() => onViewChange?.('performance')}
            style={{
              padding: `${styles.spacing.sm} ${styles.spacing.md}`,
              backgroundColor: 'transparent',
              color: view === 'performance' ? styles.colors.primary : styles.colors.textSecondary,
              border: 'none',
              borderBottom: view === 'performance' ? `2px solid ${styles.colors.primary}` : 'none',
              fontSize: styles.typography.fontSize.sm,
              fontWeight: styles.typography.fontWeight?.medium || '500',
              cursor: 'pointer',
              transition: 'color 0.2s'
            }}
          >
            Performance
          </button>
          <button
            onClick={() => onViewChange?.('timeline')}
            style={{
              padding: `${styles.spacing.sm} ${styles.spacing.md}`,
              backgroundColor: 'transparent',
              color: view === 'timeline' ? styles.colors.primary : styles.colors.textSecondary,
              border: 'none',
              borderBottom: view === 'timeline' ? `2px solid ${styles.colors.primary}` : 'none',
              fontSize: styles.typography.fontSize.sm,
              fontWeight: styles.typography.fontWeight?.medium || '500',
              cursor: 'pointer',
              transition: 'color 0.2s'
            }}
          >
            Timeline
          </button>
        </div>
      </div>
      
      {/* Content Area */}
      <div style={{
        flex: 1,
        padding: styles.spacing.lg,
        overflow: 'auto'
      }}>
        {!model ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: styles.colors.textSecondary,
            fontSize: styles.typography.fontSize.sm
          }}>
            Select a model to view analytics
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: styles.spacing.sm,
              marginBottom: styles.spacing.lg
            }}>
              <div style={{
                padding: styles.spacing.sm,
                backgroundColor: styles.colors.background,
                borderRadius: getBorderRadius('sm')
              }}>
                <div style={{
                  fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                  color: styles.colors.textSecondary,
                  marginBottom: styles.spacing.xs
                }}>
                  Total Runs
                </div>
                <div style={{
                  fontSize: styles.typography.fontSize.lg,
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  color: styles.colors.text
                }}>
                  {promptRuns.length}
                </div>
              </div>
              <div style={{
                padding: styles.spacing.sm,
                backgroundColor: styles.colors.background,
                borderRadius: getBorderRadius('sm')
              }}>
                <div style={{
                  fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                  color: styles.colors.textSecondary,
                  marginBottom: styles.spacing.xs
                }}>
                  Unique Prompts
                </div>
                <div style={{
                  fontSize: styles.typography.fontSize.lg,
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  color: styles.colors.text
                }}>
                  {promptStats.length}
                </div>
              </div>
            </div>
            
            {/* Chart Area */}
            <div>
              {view === 'prompts' && renderPieChart()}
              {view === 'performance' && renderPerformanceChart()}
              {view === 'timeline' && renderTimeSeriesChart()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}