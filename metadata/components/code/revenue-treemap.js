// RevenueTreemap Sub-component
const RevenueTreemap = ({ data, onProductClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data || !window.Highcharts) return;

    window.Highcharts.chart(chartRef.current, {
      chart: {
        type: 'treemap'
      },
      title: {
        text: null
      },
      colorAxis: {
        minColor: '#e6f3ff',
        maxColor: '#0056b3'
      },
      series: [{
        type: 'treemap',
        layoutAlgorithm: 'squarified',
        data: data.map(item => ({
          name: item.name,
          value: item.revenue,
          colorValue: item.growth || 0
        })),
        dataLabels: {
          enabled: true,
          format: '{point.name}<br/>${point.value:,.0f}'
        },
        levels: [{
          level: 1,
          dataLabels: {
            enabled: true,
            align: 'left',
            verticalAlign: 'top',
            style: {
              fontSize: '14px',
              fontWeight: 'bold'
            }
          },
          borderWidth: 3
        }],
        cursor: 'pointer',
        point: {
          events: {
            click: function() {
              if (onProductClick) {
                onProductClick(this.options);
              }
            }
          }
        }
      }],
      tooltip: {
        formatter: function() {
          return `<b>${this.point.name}</b><br/>
                  Revenue: $${this.point.value.toLocaleString()}<br/>
                  Growth: ${this.point.colorValue}%`;
        }
      },
      credits: {
        enabled: false
      }
    });

    return () => {
      if (window.Highcharts && window.Highcharts.charts) {
        const chart = window.Highcharts.charts.find(c => c && c.renderTo === chartRef.current);
        if (chart) chart.destroy();
      }
    };
  }, [data, onProductClick]);

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