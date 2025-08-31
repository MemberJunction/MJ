// WinLossChart Sub-component
function WinLossChart ({ winLossData, period, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !winLossData || !window.ApexCharts) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const options = {
      chart: {
        type: 'bar',
        height: 350,
        stacked: true,
        stackType: '100%',
        toolbar: {
          show: true
        }
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%',
          endingShape: 'rounded'
        }
      },
      series: [
        {
          name: 'Wins',
          data: winLossData.map(d => d.wins)
        },
        {
          name: 'Losses',
          data: winLossData.map(d => d.losses)
        }
      ],
      xaxis: {
        categories: winLossData.map(d => d.period),
        title: {
          text: period || 'Time Period'
        }
      },
      yaxis: {
        title: {
          text: 'Percentage'
        }
      },
      colors: ['#28a745', '#dc3545'],
      legend: {
        position: 'top',
        horizontalAlign: 'right'
      },
      fill: {
        opacity: 1
      },
      tooltip: {
        y: {
          formatter: function(val, opts) {
            const total = opts.w.globals.stackedSeriesTotals[opts.dataPointIndex];
            const percentage = ((val / total) * 100).toFixed(1);
            return `${val} deals (${percentage}%)`;
          }
        }
      },
      dataLabels: {
        enabled: true,
        formatter: function(val, opts) {
          return Math.round(val) + '%';
        }
      }
    };

    chartInstance.current = new window.ApexCharts(chartRef.current, options);
    chartInstance.current.render();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [winLossData, period]);

  return (
    <div>
      <div ref={chartRef} />
      <div style={{
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '6px'
      }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Key Metrics</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#28a745' }}>
              {winLossData.reduce((sum, d) => sum + d.wins, 0)}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total Wins</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc3545' }}>
              {winLossData.reduce((sum, d) => sum + d.losses, 0)}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total Losses</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#007bff' }}>
              {(
                (winLossData.reduce((sum, d) => sum + d.wins, 0) /
                 (winLossData.reduce((sum, d) => sum + d.wins + d.losses, 0) || 1)) * 100
              ).toFixed(1)}%
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Win Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
}