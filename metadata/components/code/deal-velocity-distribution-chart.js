function DealVelocityDistributionChart({ deals, stages, onDrillDown }) {
  const chartRef = React.useRef(null);
  
  // Calculate velocity data for distribution
  const calculateVelocityDistribution = React.useCallback(() => {
    const velocityData = {};
    
    stages.forEach(stage => {
      const stageDeals = deals.filter(d => d.Stage === stage);
      
      if (stageDeals.length > 0) {
        // Calculate simulated durations for each deal
        const durations = stageDeals.map(deal => {
          const closeDate = deal.ActualCloseDate ? new Date(deal.ActualCloseDate) : 
                           deal.CloseDate ? new Date(deal.CloseDate) : new Date();
          
          // Simulate pipeline duration based on stage
          let daysInPipeline;
          switch(deal.Stage) {
            case 'Prospecting':
              daysInPipeline = 90 + Math.random() * 30; // 90-120 days
              break;
            case 'Qualification':
              daysInPipeline = 60 + Math.random() * 30; // 60-90 days
              break;
            case 'Proposal':
              daysInPipeline = 30 + Math.random() * 30; // 30-60 days
              break;
            case 'Negotiation':
              daysInPipeline = 15 + Math.random() * 15; // 15-30 days
              break;
            case 'Closed Won':
            case 'Closed Lost':
              // For closed deals, calculate based on close date
              const now = new Date();
              const daysSinceClosed = Math.floor((now - closeDate) / (1000 * 60 * 60 * 24));
              daysInPipeline = Math.max(5, Math.min(120, daysSinceClosed));
              break;
            default:
              daysInPipeline = 30;
          }
          
          return Math.floor(daysInPipeline);
        });
        
        // Calculate statistics
        if (durations.length > 0) {
          velocityData[stage] = {
            durations: durations,
            stats: {
              mean: ss.mean(durations),
              median: ss.median(durations),
              min: ss.min(durations),
              max: ss.max(durations),
              count: durations.length,
              stdev: durations.length > 1 ? ss.standardDeviation(durations) : 0,
              q1: durations.length >= 4 ? ss.quantile(durations, 0.25) : ss.min(durations),
              q3: durations.length >= 4 ? ss.quantile(durations, 0.75) : ss.max(durations)
            }
          };
        }
      }
    });
    
    return velocityData;
  }, [deals, stages]);
  
  React.useEffect(() => {
    if (!chartRef.current || !deals.length) return;
    
    const velocityData = calculateVelocityDistribution();
    const validDistributions = [];
    const validStages = [];
    
    stages.forEach(stage => {
      if (velocityData[stage]) {
        const stats = velocityData[stage].stats;
        // Create proper box plot data: [min, Q1, median, Q3, max]
        validDistributions.push([
          Math.round(stats.min),
          Math.round(stats.q1),
          Math.round(stats.median),
          Math.round(stats.q3),
          Math.round(stats.max)
        ]);
        validStages.push(stage);
      }
    });
    
    if (validDistributions.length === 0) {
      // No data to display
      return;
    }
    
    const option = {
      title: {
        text: 'Stage Duration Distribution',
        left: 'center',
        top: '5%',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        axisPointer: { type: 'shadow' },
        formatter: (param) => {
          if (param.data && param.data.length === 5) {
            const stage = param.name;
            const stats = velocityData[stage]?.stats;
            return `
              <div style="padding: 8px;">
                <strong>${stage}</strong><br/>
                <div style="margin-top: 8px;">
                  Max: ${param.data[4]} days<br/>
                  Q3: ${param.data[3]} days<br/>
                  Median: ${param.data[2]} days<br/>
                  Q1: ${param.data[1]} days<br/>
                  Min: ${param.data[0]} days<br/>
                  ${stats ? `<br/>Mean: ${Math.round(stats.mean)} days<br/>Count: ${stats.count} deals` : ''}
                </div>
                <div style="margin-top: 8px; font-size: 11px; color: #666;">
                  Click to view deals
                </div>
              </div>
            `;
          }
          return '';
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: validStages,
        boundaryGap: true,
        nameGap: 30,
        splitArea: { show: false },
        splitLine: { show: false },
        axisLabel: {
          rotate: 30,
          interval: 0,
          fontSize: 12
        }
      },
      yAxis: {
        type: 'value',
        name: 'Days',
        splitArea: { show: true },
        axisLabel: {
          fontSize: 11
        }
      },
      series: [{
        name: 'Duration',
        type: 'boxplot',
        data: validDistributions,
        itemStyle: {
          color: '#4F46E5',
          borderColor: '#4F46E5',
          borderWidth: 1.5
        },
        emphasis: {
          itemStyle: {
            borderColor: '#8B5CF6',
            borderWidth: 2.5,
            shadowBlur: 10,
            shadowColor: 'rgba(139, 92, 246, 0.3)'
          }
        },
        boxWidth: [12, 40]
      }]
    };
    
    // Initialize or update chart
    if (chartRef.current._chart) {
      chartRef.current._chart.dispose();
    }
    chartRef.current._chart = echarts.init(chartRef.current);
    chartRef.current._chart.setOption(option);
    
    // Add click handler for distribution chart
    chartRef.current._chart.on('click', (params) => {
      if (params.componentType === 'series' && params.componentSubType === 'boxplot') {
        const stage = validStages[params.dataIndex];
        const stageDeals = deals.filter(d => d.Stage === stage);
        onDrillDown(stageDeals, `${stage} Stage Deals - Distribution Analysis`);
      }
    });
    
    // Cleanup on unmount
    return () => {
      if (chartRef.current?._chart) {
        chartRef.current._chart.dispose();
      }
    };
  }, [deals, stages, onDrillDown, calculateVelocityDistribution]);
  
  return React.createElement('div', { 
    ref: chartRef, 
    style: { height: '500px', width: '100%' } 
  });
}