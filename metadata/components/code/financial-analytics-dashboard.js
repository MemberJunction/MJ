function FinancialAnalyticsDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [invoices, setInvoices] = useState([]);
  const [deals, setDeals] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(savedUserSettings?.timeRange || 'quarter');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const chartRefs = useRef({});

  useEffect(() => {
    loadFinancialData();
  }, [timeRange]);

  const loadFinancialData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const dateFilter = getDateFilter();
      
      const [invoicesResult, dealsResult, productsResult] = await Promise.all([
        utilities.rv.RunView({
          EntityName: 'Invoices',
          ExtraFilter: dateFilter ? `InvoiceDate >= '${dateFilter}'` : '',
          OrderBy: 'InvoiceDate DESC',
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Deals',
          ExtraFilter: dateFilter ? `CloseDate >= '${dateFilter}'` : '',
          OrderBy: 'CloseDate DESC',
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Products',
          OrderBy: 'ProductName ASC',
          ResultType: 'entity_object'
        })
      ]);

      if (invoicesResult.Success) {
        setInvoices(invoicesResult.Results || []);
      }
      if (dealsResult.Success) {
        setDeals(dealsResult.Results || []);
      }
      if (productsResult.Success) {
        setProducts(productsResult.Results || []);
      }
      
      if (!invoicesResult.Success) {
        setError('Failed to load financial data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = () => {
    const now = new Date();
    let months = 3;
    
    switch (timeRange) {
      case 'month': months = 1; break;
      case 'quarter': months = 3; break;
      case 'year': months = 12; break;
      default: months = 3;
    }
    
    const startDate = new Date(now.setMonth(now.getMonth() - months));
    return startDate.toISOString().split('T')[0];
  };

  const calculateMetrics = () => {
    const actualRevenue = invoices
      .filter(inv => inv.Status === 'Paid')
      .reduce((sum, inv) => sum + (inv.TotalAmount || 0), 0);
    
    const projectedRevenue = deals
      .filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage))
      .reduce((sum, d) => sum + ((d.Amount || 0) * (d.Probability || 0) / 100), 0);
    
    const outstandingRevenue = invoices
      .filter(inv => inv.Status !== 'Paid' && inv.Status !== 'Cancelled')
      .reduce((sum, inv) => sum + (inv.TotalAmount || 0), 0);
    
    const avgDealSize = deals.length > 0 ? 
      deals.reduce((sum, d) => sum + (d.Amount || 0), 0) / deals.length : 0;
    
    const grossMargin = products.length > 0 ?
      products.reduce((sum, p) => {
        const margin = p.Price && p.Cost ? ((p.Price - p.Cost) / p.Price) * 100 : 0;
        return sum + margin;
      }, 0) / products.length : 0;
    
    return {
      actualRevenue,
      projectedRevenue,
      outstandingRevenue,
      avgDealSize,
      grossMargin,
      totalRevenue: actualRevenue + projectedRevenue,
      cashFlow: actualRevenue - outstandingRevenue
    };
  };

  const metrics = calculateMetrics();

  const prepareTrendData = () => {
    const monthlyData = {};
    
    invoices.forEach(inv => {
      const month = new Date(inv.InvoiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (!monthlyData[month]) {
        monthlyData[month] = { revenue: 0, invoices: 0, deals: 0 };
      }
      monthlyData[month].revenue += inv.TotalAmount || 0;
      monthlyData[month].invoices++;
    });
    
    deals.forEach(deal => {
      const month = new Date(deal.CloseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (!monthlyData[month]) {
        monthlyData[month] = { revenue: 0, invoices: 0, deals: 0 };
      }
      monthlyData[month].deals += deal.Amount || 0;
    });
    
    return Object.entries(monthlyData)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        deals: data.deals,
        total: data.revenue + data.deals
      }));
  };

  const formatCurrency = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount?.toFixed(0) || 0}`;
  };

  // Sub-component: KPI Gauges
  const KPIGauges = () => {
    useEffect(() => {
      if (!loading && chartRefs.current.gauges) {
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
    }, [loading]);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
        <div ref={el => chartRefs.current.marginGauge = el}></div>
        <div ref={el => chartRefs.current.utilizationGauge = el}></div>
      </div>
    );
  };

  // Sub-component: Revenue Trend Chart
  const RevenueTrendChart = () => {
    const trendData = prepareTrendData();
    
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
    }, [loading, trendData]);

    return <div ref={el => chartRefs.current.trendChart = el}></div>;
  };

  // Sub-component: Cash Flow Chart
  const CashFlowChart = () => {
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
    }, [loading]);

    return <div ref={el => chartRefs.current.cashFlowChart = el}></div>;
  };

  // Sub-component: Forecast Model
  const ForecastModel = () => {
    const generateForecast = () => {
      const historicalData = prepareTrendData();
      const lastValue = historicalData[historicalData.length - 1]?.total || 0;
      const growthRate = 1.05; // 5% growth
      
      return Array.from({ length: 6 }, (_, i) => ({
        month: `Month +${i + 1}`,
        forecast: lastValue * Math.pow(growthRate, i + 1),
        confidence: 90 - (i * 10)
      }));
    };

    const forecastData = generateForecast();

    useEffect(() => {
      if (!loading && chartRefs.current.forecastChart) {
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
            data: forecastData.map(d => d.forecast)
          }],
          xaxis: {
            categories: forecastData.map(d => d.month)
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
                const confidence = forecastData[opts.dataPointIndex]?.confidence || 0;
                return `${formatCurrency(val)} (${confidence}% confidence)`;
              }
            }
          }
        });
        chart.render();

        return () => chart.destroy();
      }
    }, [loading]);

    return <div ref={el => chartRefs.current.forecastChart = el}></div>;
  };

  // Sub-component: Details Panel
  const DetailsPanel = () => {
    if (!selectedMetric) return null;

    return (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-500px',
          top: 0,
          bottom: 0,
          width: '500px',
          backgroundColor: 'white',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
          zIndex: 1000,
          transition: 'right 0.3s ease',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0 }}>{selectedMetric.title}</h3>
          <button
            onClick={() => setIsPanelOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>
        
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h4>Analysis</h4>
            <p>{selectedMetric.analysis}</p>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <h4>Recommendations</h4>
            <ul>
              {selectedMetric.recommendations?.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => exportToPDF()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Export PDF
            </button>
            <button
              onClick={() => exportToExcel()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#10B981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Export Excel
            </button>
          </div>
        </div>
      </div>
    );
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Financial Analytics Report', 10, 10);
    doc.text(`Date Range: ${timeRange}`, 10, 20);
    doc.text(`Total Revenue: ${formatCurrency(metrics.totalRevenue)}`, 10, 30);
    doc.text(`Gross Margin: ${metrics.grossMargin.toFixed(1)}%`, 10, 40);
    doc.save('financial-report.pdf');
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet([
      { Metric: 'Total Revenue', Value: metrics.totalRevenue },
      { Metric: 'Actual Revenue', Value: metrics.actualRevenue },
      { Metric: 'Projected Revenue', Value: metrics.projectedRevenue },
      { Metric: 'Outstanding', Value: metrics.outstandingRevenue },
      { Metric: 'Gross Margin %', Value: metrics.grossMargin }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Financial Metrics');
    XLSX.writeFile(wb, 'financial-metrics.xlsx');
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading financial data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#FEE2E2', borderRadius: '8px', margin: '20px' }}>
        <div style={{ color: '#991B1B', fontWeight: 'bold' }}>Error loading data</div>
        <div style={{ color: '#DC2626', marginTop: '8px' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Financial Analytics</h2>
          <select
            value={timeRange}
            onChange={(e) => {
              setTimeRange(e.target.value);
              onSaveUserSettings({ ...savedUserSettings, timeRange: e.target.value });
            }}
            style={{
              padding: '8px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px'
            }}
          >
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="year">Last Year</option>
          </select>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
          <div 
            style={{ 
              padding: '16px', 
              backgroundColor: '#F9FAFB', 
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            onClick={() => {
              setSelectedMetric({
                title: 'Total Revenue',
                analysis: 'Combined actual and projected revenue for the period.',
                recommendations: [
                  'Focus on high-probability deals',
                  'Accelerate invoice collection',
                  'Expand product offerings'
                ]
              });
              setIsPanelOpen(true);
            }}
          >
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Total Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
              {formatCurrency(metrics.totalRevenue)}
            </div>
          </div>
          
          <div style={{ padding: '16px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Actual Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {formatCurrency(metrics.actualRevenue)}
            </div>
          </div>
          
          <div style={{ padding: '16px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Projected</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>
              {formatCurrency(metrics.projectedRevenue)}
            </div>
          </div>
          
          <div style={{ padding: '16px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Outstanding</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#EF4444' }}>
              {formatCurrency(metrics.outstandingRevenue)}
            </div>
          </div>
          
          <div style={{ padding: '16px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Avg Deal Size</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {formatCurrency(metrics.avgDealSize)}
            </div>
          </div>
        </div>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <h3 style={{ marginTop: 0 }}>Revenue Trend</h3>
            <RevenueTrendChart />
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <h3 style={{ marginTop: 0 }}>KPI Gauges</h3>
            <KPIGauges />
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <h3 style={{ marginTop: 0 }}>Cash Flow Analysis</h3>
            <CashFlowChart />
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <h3 style={{ marginTop: 0 }}>Revenue Forecast</h3>
            <ForecastModel />
          </div>
        </div>
      </div>
      
      <DetailsPanel />
    </div>
  );
}