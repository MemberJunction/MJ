function RevenueTrendChart({ loading, trendData, chartRefs, formatCurrency }) {
  useEffect(() => {
    if (!loading && chartRefs.current.trendChart && trendData.length > 0) {
      const chart = new ApexCharts(chartRefs.current.trendChart, {
        chart: {
          type: 'area',
          height: 350,
          toolbar: {
            show: false
          }
        },
        series: [
          {
            name: 'Invoice Revenue',
            data: trendData.map(d => d.revenue)
          },
          {
            name: 'Deal Revenue',
            data: trendData.map(d => d.deals)
          }
        ],
        xaxis: {
          categories: trendData.map(d => d.month)
        },
        yaxis: {
          labels: {
            formatter: (val) => formatCurrency(val)
          }
        },
        colors: ['#3B82F6', '#8B5CF6'],
        fill: {
          type: 'gradient',
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.7,
            opacityTo: 0.2
          }
        },
        dataLabels: {
          enabled: false
        },
        stroke: {
          curve: 'smooth',
          width: 2
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
  }, [loading, trendData, chartRefs, formatCurrency]);

  return <div ref={el => chartRefs.current.trendChart = el}></div>;
}
