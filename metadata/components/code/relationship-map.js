// RelationshipMap Sub-component
function RelationshipMap ({ relationships, selectedNode, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !relationships || !ApexCharts) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const options = {
      chart: {
        type: 'line',
        height: 350,
        toolbar: { show: true }
      },
      series: relationships.series || [{
        name: 'Series 1',
        data: relationships.values || []
      }],
      xaxis: {
        categories: relationships.categories || [],
        title: { text: relationships.xAxisLabel || 'X Axis' }
      },
      yaxis: {
        title: { text: relationships.yAxisLabel || 'Y Axis' }
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

    chartInstance.current = new ApexCharts(chartRef.current, options);
    chartInstance.current.render();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [relationships, selectedNode]);

  return <div ref={chartRef} style={{ width: '100%', height: '350px' }} />;
}