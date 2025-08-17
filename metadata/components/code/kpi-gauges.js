// KPIGauges Sub-component
const KPIGauges = ({ kpis, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const gaugeRefs = useRef([]);
  const chartInstances = useRef([]);

  useEffect(() => {
    if (!kpis || kpis.length === 0 || !window.ApexCharts) return;

    // Clear existing charts
    chartInstances.current.forEach(chart => {
      if (chart) chart.destroy();
    });
    chartInstances.current = [];

    kpis.forEach((kpi, index) => {
      if (!gaugeRefs.current[index]) return;

      const percentage = (kpi.actual / kpi.target) * 100;
      const color = percentage >= 100 ? '#28a745' : 
                    percentage >= 75 ? '#ffc107' : '#dc3545';

      const options = {
        chart: {
          type: 'radialBar',
          height: 200,
          sparkline: {
            enabled: true
          }
        },
        series: [Math.min(percentage, 150)],
        plotOptions: {
          radialBar: {
            startAngle: -90,
            endAngle: 90,
            track: {
              background: '#e7e7e7',
              strokeWidth: '97%',
              margin: 5
            },
            dataLabels: {
              name: {
                show: true,
                fontSize: '12px',
                fontWeight: 400,
                offsetY: -10
              },
              value: {
                show: true,
                fontSize: '20px',
                fontWeight: 'bold',
                offsetY: 5,
                formatter: function() {
                  return `${percentage.toFixed(0)}%`;
                }
              }
            },
            hollow: {
              margin: 0,
              size: '60%'
            }
          }
        },
        colors: [color],
        labels: [kpi.name]
      };

      const chart = new window.ApexCharts(gaugeRefs.current[index], options);
      chart.render();
      chartInstances.current.push(chart);
    });

    return () => {
      chartInstances.current.forEach(chart => {
        if (chart) chart.destroy();
      });
      chartInstances.current = [];
    };
  }, [kpis]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '20px',
      padding: '20px',
      backgroundColor: '#fff',
      borderRadius: '8px'
    }}>
      {kpis && kpis.map((kpi, index) => (
        <div key={kpi.id || index} style={{ textAlign: 'center' }}>
          <div 
            ref={el => gaugeRefs.current[index] = el}
            style={{ height: '200px' }}
          />
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              ${(kpi.actual / 1000).toFixed(0)}K
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Target: ${(kpi.target / 1000).toFixed(0)}K
            </div>
            {kpi.trend && (
              <div style={{
                fontSize: '11px',
                color: kpi.trend > 0 ? '#28a745' : '#dc3545',
                marginTop: '5px'
              }}>
                {kpi.trend > 0 ? '↑' : '↓'} {Math.abs(kpi.trend)}% vs last period
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

return KPIGauges;