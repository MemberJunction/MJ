function ForecastModel({ loading, forecastData, scenarios, chartRefs, formatCurrency, onScenarioChange }) {
  const [selectedScenario, setSelectedScenario] = React.useState(scenarios?.[0]?.id || 'default');

  const handleScenarioChange = (scenarioId) => {
    setSelectedScenario(scenarioId);
    if (onScenarioChange) {
      onScenarioChange(scenarioId);
    }
  };

  useEffect(() => {
    if (!loading && chartRefs.current.forecastChart && forecastData && forecastData.length > 0) {
      const chart = new ApexCharts(chartRefs.current.forecastChart, {
        chart: {
          type: 'line',
          height: 300,
          toolbar: {
            show: false
          }
        },
        series: [{
          name: 'Forecast',
          data: forecastData.map(d => d.value)
        }],
        xaxis: {
          categories: forecastData.map(d => d.period)
        },
        yaxis: {
          labels: {
            formatter: (val) => formatCurrency(val)
          }
        },
        colors: ['#F59E0B'],
        stroke: {
          curve: 'smooth',
          width: 3,
          dashArray: 5
        },
        markers: {
          size: 6
        },
        dataLabels: {
          enabled: false
        },
        tooltip: {
          y: {
            formatter: (val, opts) => {
              const dataPoint = forecastData[opts.dataPointIndex];
              if (dataPoint?.confidence) {
                return `${formatCurrency(val)} (${formatCurrency(dataPoint.confidence.low)} - ${formatCurrency(dataPoint.confidence.high)})`;
              }
              return formatCurrency(val);
            }
          }
        }
      });
      chart.render();

      return () => chart.destroy();
    }
  }, [loading, forecastData, selectedScenario, chartRefs, formatCurrency]);

  return (
    <div>
      {scenarios && scenarios.length > 1 && (
        <div style={{ marginBottom: '12px' }}>
          <select
            value={selectedScenario}
            onChange={(e) => handleScenarioChange(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #D1D5DB',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          >
            {scenarios.map(scenario => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div ref={el => chartRefs.current.forecastChart = el}></div>
    </div>
  );
}
