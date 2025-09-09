// ReasonBreakdown Sub-component
function ReasonBreakdown ({ data, onDataClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data || !window.ApexCharts) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const options = {
      chart: {
        type: 'line',
        height: 350,
        toolbar: { show: true }
      },
      series: data.series || [{
        name: 'Series 1',
        data: data.values || []
      }],
      xaxis: {
        categories: data.categories || [],
        title: { text: data.xAxisLabel || 'X Axis' }
      },
      yaxis: {
        title: { text: data.yAxisLabel || 'Y Axis' }
      },
      colors: ['#007bff', '#28a745', '#dc3545'],
      stroke: { curve: 'smooth', width: 2 },
      markers: { size: 4 },
      grid: { borderColor: '#e0e0e0' },
      tooltip: {
        shared: true,
        intersect: false
      }
    };

    chartInstance.current = new window.ApexCharts(chartRef.current, options);
    chartInstance.current.render();

    if (onDataClick) {
      chartInstance.current.addEventListener('dataPointSelection', function(event, chartContext, config) {
        onDataClick({
          seriesIndex: config.seriesIndex,
          dataPointIndex: config.dataPointIndex,
          value: config.w.globals.series[config.seriesIndex][config.dataPointIndex]
        });
      });
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [data, onDataClick]);

  return <div ref={chartRef} style={{ width: '100%', height: '350px' }} />;
}