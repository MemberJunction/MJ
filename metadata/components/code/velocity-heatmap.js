// VelocityHeatmap Sub-component  
const VelocityHeatmap = ({ data, onCellClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data || !window.echarts) return;

    const chart = window.echarts.init(chartRef.current);

    const option = {
      tooltip: {
        position: 'top',
        formatter: function(params) {
          return `${params.name}<br/>
                  ${params.value[2]} deals<br/>
                  Avg: ${params.value[3]} days`;
        }
      },
      grid: {
        height: '70%',
        top: '10%',
        left: '15%',
        right: '5%'
      },
      xAxis: {
        type: 'category',
        data: data.stages,
        splitArea: { show: true },
        axisLabel: { rotate: 45 }
      },
      yAxis: {
        type: 'category',
        data: data.months,
        splitArea: { show: true }
      },
      visualMap: {
        min: 0,
        max: data.maxDays || 60,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: ['#28a745', '#ffc107', '#dc3545']
        }
      },
      series: [{
        name: 'Deal Velocity',
        type: 'heatmap',
        data: data.values,
        label: {
          show: true,
          formatter: function(params) {
            return params.value[3] || '';
          }
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    };

    chart.setOption(option);

    if (onCellClick) {
      chart.on('click', function(params) {
        onCellClick({
          stage: data.stages[params.value[0]],
          month: data.months[params.value[1]],
          dealCount: params.value[2],
          avgDays: params.value[3]
        });
      });
    }

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, onCellClick]);

  return (
    <div 
      ref={chartRef} 
      style={{ 
        width: '100%', 
        height: '400px',
        minHeight: '300px'
      }}
    />
  );
}