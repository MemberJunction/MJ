function DealVelocityTrendChart({ deals, stages, onDrillDown, timeRange }) {
  const chartRef = React.useRef(null);
  
  React.useEffect(() => {
    if (!chartRef.current || !deals.length) return;
    
    // Generate trend data based on timeRange
    const dates = [];
    const trendData = {};
    
    const daysToShow = Math.min(timeRange || 30, 30); // Cap at 30 days for trend
    
    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day');
      dates.push(date.format('YYYY-MM-DD'));
    }
    
    // Calculate trend data for each stage
    stages.forEach(stage => {
      trendData[stage] = dates.map((date, index) => {
        // Count deals in this stage around this date
        const dayDeals = deals.filter(deal => {
          if (deal.Stage !== stage) return false;
          
          // Check if deal was active around this date
          const dealDate = deal.ActualCloseDate || deal.CloseDate;
          if (!dealDate) return true; // Open deals count for all dates
          
          const dealDayjs = dayjs(dealDate);
          const dateDayjs = dayjs(date);
          
          // Deal counts if it was created before or on this date
          return dealDayjs.isAfter(dateDayjs) || dealDayjs.isSame(dateDayjs, 'day');
        });
        
        // Simulate velocity metric (days in stage)
        // This could be replaced with actual velocity calculation
        const baseVelocity = {
          'Prospecting': 90,
          'Qualification': 60,
          'Proposal': 40,
          'Negotiation': 20,
          'Closed Won': 10,
          'Closed Lost': 15
        }[stage] || 30;
        
        // Add some variation
        const variation = Math.sin(index * 0.5) * 10 + Math.random() * 5;
        return Math.max(5, Math.round(baseVelocity + variation));
      });
    });
    
    const option = {
      title: {
        text: 'Deal Velocity Trend',
        left: 'center',
        top: '5%',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          let result = params[0].axisValue + '<br/>';
          params.forEach(param => {
            result += `${param.marker} ${param.seriesName}: <strong>${Math.round(param.value)} days</strong><br/>`;
          });
          result += '<div style="margin-top: 8px; font-size: 11px; color: #666;">Click to view deals</div>';
          return result;
        }
      },
      legend: {
        data: stages,
        top: '12%',
        type: 'scroll',
        textStyle: {
          fontSize: 12
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '22%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates.map(d => dayjs(d).format('MM/DD')),
        axisLabel: {
          fontSize: 11,
          rotate: 45
        }
      },
      yAxis: {
        type: 'value',
        name: 'Days',
        axisLabel: {
          formatter: '{value}d',
          fontSize: 11
        }
      },
      series: stages.map((stage, index) => ({
        name: stage,
        type: 'line',
        smooth: true,
        data: trendData[stage],
        emphasis: { 
          focus: 'series',
          blurScope: 'coordinateSystem'
        },
        lineStyle: {
          width: 2
        },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: [
            '#9CA3AF',  // Prospecting
            '#3B82F6',  // Qualification  
            '#8B5CF6',  // Proposal
            '#F59E0B',  // Negotiation
            '#10B981',  // Closed Won
            '#EF4444'   // Closed Lost
          ][index] || '#6B7280'
        }
      }))
    };
    
    // Initialize or update chart
    if (chartRef.current._chart) {
      chartRef.current._chart.dispose();
    }
    chartRef.current._chart = echarts.init(chartRef.current);
    chartRef.current._chart.setOption(option);
    
    // Add click handler
    chartRef.current._chart.on('click', (params) => {
      if (params.componentType === 'series') {
        const stage = params.seriesName;
        const dateIndex = params.dataIndex;
        const date = dates[dateIndex];
        
        // Filter deals for this stage around this date
        const stageDeals = deals.filter(d => d.Stage === stage);
        onDrillDown(stageDeals, `${stage} Stage Deals - ${dayjs(date).format('MMM D, YYYY')}`);
      }
    });
    
    // Cleanup on unmount
    return () => {
      if (chartRef.current?._chart) {
        chartRef.current._chart.dispose();
      }
    };
  }, [deals, stages, onDrillDown, timeRange]);
  
  return React.createElement('div', { 
    ref: chartRef, 
    style: { height: '500px', width: '100%' } 
  });
}