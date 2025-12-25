function CashFlowChart({ loading, metrics, chartRefs, formatCurrency }) {
  useEffect(() => {
    if (!loading && chartRefs.current.cashFlowChart) {
      const categories = ['Revenue', 'Expenses', 'Outstanding', 'Net Cash'];
      const data = [
        metrics.actualRevenue,
        -metrics.outstandingRevenue * 0.6,
        -metrics.outstandingRevenue * 0.4,
        metrics.cashFlow
      ];

      const chart = new ApexCharts(chartRefs.current.cashFlowChart, {
        chart: {
          type: 'bar',
          height: 300
        },
        series: [{
          name: 'Cash Flow',
          data: data
        }],
        xaxis: {
          categories: categories
        },
        yaxis: {
          labels: {
            formatter: (val) => formatCurrency(Math.abs(val))
          }
        },
        colors: ['#10B981'],
        plotOptions: {
          bar: {
            colors: {
              ranges: [{
                from: -1000000000,
                to: 0,
                color: '#EF4444'
              }]
            }
          }
        },
        dataLabels: {
          enabled: true,
          formatter: (val) => formatCurrency(val)
        },
        tooltip: {
          y: {
            formatter: (val) => formatCurrency(val)
          }
        }
      });
      chart.render();

      return () => chart.destroy();
    }
  }, [loading, metrics.actualRevenue, metrics.outstandingRevenue, metrics.cashFlow, chartRefs, formatCurrency]);

  return <div ref={el => chartRefs.current.cashFlowChart = el}></div>;
}
