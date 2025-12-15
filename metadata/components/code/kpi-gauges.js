function KPIGauges({ loading, metrics, chartRefs }) {
  useEffect(() => {
    if (!loading && chartRefs.current.marginGauge && chartRefs.current.utilizationGauge) {
      const gaugeOptions = {
        chart: {
          type: 'radialBar',
          height: 200
        },
        plotOptions: {
          radialBar: {
            startAngle: -90,
            endAngle: 90,
            hollow: {
              margin: 15,
              size: '70%',
              background: '#fff'
            },
            dataLabels: {
              name: {
                show: true,
                offsetY: -10
              },
              value: {
                show: true,
                fontSize: '20px',
                fontWeight: 'bold',
                formatter: (val) => `${val.toFixed(0)}%`
              }
            }
          }
        },
        fill: {
          type: 'gradient',
          gradient: {
            shade: 'dark',
            shadeIntensity: 0.15,
            stops: [0, 100]
          }
        },
        stroke: {
          dashArray: 4
        }
      };

      const marginGauge = new ApexCharts(chartRefs.current.marginGauge, {
        ...gaugeOptions,
        series: [metrics.grossMargin],
        labels: ['Gross Margin'],
        colors: ['#10B981']
      });
      marginGauge.render();

      const utilizationGauge = new ApexCharts(chartRefs.current.utilizationGauge, {
        ...gaugeOptions,
        series: [75],
        labels: ['Utilization'],
        colors: ['#3B82F6']
      });
      utilizationGauge.render();

      return () => {
        marginGauge.destroy();
        utilizationGauge.destroy();
      };
    }
  }, [loading, metrics.grossMargin, chartRefs]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
      <div ref={el => chartRefs.current.marginGauge = el}></div>
      <div ref={el => chartRefs.current.utilizationGauge = el}></div>
    </div>
  );
}
