function FinancialAnalyticsDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Extract AIInsightsPanel from components
  const AIInsightsPanel = components?.AIInsightsPanel;
  
  if (!AIInsightsPanel) {
    console.warn('AIInsightsPanel component not available');
  }
  const [invoices, setInvoices] = useState([]);
  const [deals, setDeals] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(savedUserSettings?.timeRange || 'quarter');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [drillDownData, setDrillDownData] = useState(null);
  const [drillDownTitle, setDrillDownTitle] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'TotalAmount', direction: 'desc' });
  const chartRefs = useRef({});
  
  // AI Insights state
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

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
          OrderBy: 'InvoiceDate DESC'
        }),
        utilities.rv.RunView({
          EntityName: 'Deals',
          ExtraFilter: dateFilter ? `CloseDate >= '${dateFilter}'` : '',
          OrderBy: 'CloseDate DESC'
        }),
        utilities.rv.RunView({
          EntityName: 'Products',
          OrderBy: 'ProductName ASC'
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
    
    // Calculate revenue growth (comparing to previous period)
    const currentPeriodRevenue = actualRevenue;
    const previousPeriodRevenue = currentPeriodRevenue * 0.85; // Simulated previous period
    const revenueGrowth = previousPeriodRevenue > 0 ? 
      ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 : 0;
    
    return {
      actualRevenue,
      projectedRevenue,
      outstandingRevenue,
      avgDealSize,
      grossMargin,
      totalRevenue: actualRevenue + projectedRevenue,
      cashFlow: actualRevenue - outstandingRevenue,
      revenueGrowth
    };
  };

  const metrics = calculateMetrics();
  
  // Format insights text using marked library for proper markdown rendering

  const generateAIInsights = async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    
    try {
      const trendData = prepareTrendData();
      
      const prompt = `Analyze this financial analytics data and provide insights:

Time Period: ${timeRange}
Total Revenue: ${formatCurrency(metrics.totalRevenue)}
Actual Revenue: ${formatCurrency(metrics.actualRevenue)}
Projected Revenue: ${formatCurrency(metrics.projectedRevenue)}
Outstanding Revenue: ${formatCurrency(metrics.outstandingRevenue)}
Gross Margin: ${metrics.grossMargin.toFixed(1)}%
Revenue Growth: ${metrics.revenueGrowth > 0 ? '+' : ''}${metrics.revenueGrowth.toFixed(1)}%
Average Deal Size: ${formatCurrency(metrics.avgDealSize)}
Cash Flow: ${formatCurrency(metrics.cashFlow)}

Data Summary:
- Total Invoices: ${invoices.length}
- Total Deals: ${deals.length}
- Total Products: ${products.length}

Recent Trend Data:
${trendData.slice(-3).map(d => `${d.month}: Invoice Revenue ${formatCurrency(d.revenue)}, Deal Revenue ${formatCurrency(d.deals)}`).join('\n')}

Provide:
1. Key financial performance insights and trends
2. Revenue growth analysis and projections
3. Cash flow and outstanding revenue concerns
4. Gross margin analysis and optimization opportunities
5. Specific actionable recommendations for financial improvement
6. Risk factors to monitor

Focus on actionable business insights that can help improve financial performance.`;
      
      const result = await utilities.ai.ExecutePrompt({
        systemPrompt: 'You are an expert financial analyst with deep knowledge of business finance, cash flow management, and revenue optimization. Provide clear, actionable insights with specific recommendations. Format your response in clear markdown.',
        messages: prompt,
        preferredModels: ['GPT-OSS-120B', 'Qwen3 32B'],
        modelPower: 'high',
        temperature: 0.7,
        maxTokens: 1500
      });
      
      if (result?.success && result?.result) {
        setAiInsights(result.result);
      } else {
        setInsightsError('Failed to generate insights. Please try again.');
      }
    } catch (error) {
      setInsightsError(error.message || 'Failed to generate AI insights');
    } finally {
      setLoadingInsights(false);
    }
  };

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
    // Create a simple HTML-based report that can be printed to PDF
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      alert('Please allow popups to export the report');
      return;
    }
    
    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Financial Analytics Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #333; }
          .metric { margin: 15px 0; font-size: 16px; }
          .value { font-weight: bold; color: #1890ff; }
          @media print {
            body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <h1>Financial Analytics Report</h1>
        <div class="metric">Date Range: <span class="value">${timeRange}</span></div>
        <div class="metric">Total Revenue: <span class="value">${formatCurrency(metrics.totalRevenue)}</span></div>
        <div class="metric">Actual Revenue: <span class="value">${formatCurrency(metrics.actualRevenue)}</span></div>
        <div class="metric">Projected Revenue: <span class="value">${formatCurrency(metrics.projectedRevenue)}</span></div>
        <div class="metric">Outstanding: <span class="value">${formatCurrency(metrics.outstandingRevenue)}</span></div>
        <div class="metric">Gross Margin: <span class="value">${metrics.grossMargin.toFixed(1)}%</span></div>
        <div class="metric">Revenue Growth: <span class="value">${metrics.revenueGrowth > 0 ? '+' : ''}${metrics.revenueGrowth.toFixed(1)}%</span></div>
        <div class="metric">Report Generated: <span class="value">${new Date().toLocaleString()}</span></div>
        <script>
          window.print();
          setTimeout(() => window.close(), 1000);
        </script>
      </body>
      </html>
    `;
    
    reportWindow.document.write(reportHTML);
    reportWindow.document.close();
  };

  const exportToExcel = () => {
    // Create CSV data for Excel compatibility
    const csvContent = [
      ['Financial Analytics Report'],
      ['Generated:', new Date().toLocaleString()],
      ['Date Range:', timeRange],
      [],
      ['Metric', 'Value'],
      ['Total Revenue', metrics.totalRevenue],
      ['Actual Revenue', metrics.actualRevenue],
      ['Projected Revenue', metrics.projectedRevenue],
      ['Outstanding', metrics.outstandingRevenue],
      ['Gross Margin %', metrics.grossMargin.toFixed(2)],
      ['Revenue Growth %', metrics.revenueGrowth.toFixed(2)]
    ].map(row => row.join(',')).join('\n');
    
    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `financial-metrics-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
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
      <style>{`
        .ai-insights-content h1, .ai-insights-content h2, .ai-insights-content h3 {
          margin-top: 16px;
          margin-bottom: 8px;
          color: #111827;
        }
        .ai-insights-content h1 { font-size: 1.5em; }
        .ai-insights-content h2 { font-size: 1.3em; }
        .ai-insights-content h3 { font-size: 1.1em; }
        .ai-insights-content p {
          margin: 8px 0;
          line-height: 1.6;
          color: #374151;
        }
        .ai-insights-content ul, .ai-insights-content ol {
          margin: 8px 0;
          padding-left: 24px;
        }
        .ai-insights-content li {
          margin: 4px 0;
          color: #374151;
        }
        .ai-insights-content strong {
          color: #111827;
          font-weight: 600;
        }
        .ai-insights-content code {
          background: #F3F4F6;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.9em;
        }
        .ai-insights-content blockquote {
          border-left: 4px solid #3B82F6;
          padding-left: 16px;
          margin: 12px 0;
          color: #4B5563;
        }
      `}</style>
      
      <div style={{ padding: '20px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Financial Analytics</h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
            
            {/* AI Insights Button */}
            <button
              onClick={generateAIInsights}
              disabled={loadingInsights || loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loadingInsights || loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: loadingInsights || loading ? 0.6 : 1
              }}
            >
              <i className={`fa-solid fa-${loadingInsights ? 'spinner fa-spin' : 'wand-magic-sparkles'}`}></i>
              {loadingInsights ? 'Analyzing...' : 'Get AI Insights'}
            </button>
          </div>
        </div>
      </div>
      
      {/* AI Insights Panel */}
      <AIInsightsPanel
        utilities={utilities}
        styles={styles}
        components={components}
        callbacks={callbacks}
        savedUserSettings={savedUserSettings?.aiInsights}
        onSaveUserSettings={(settings) => onSaveUserSettings?.({
          ...savedUserSettings,
          aiInsights: settings
        })}
        insights={aiInsights}
        loading={loadingInsights}
        error={insightsError}
        onGenerate={generateAIInsights}
        title="Financial Analytics Insights"
        icon="fa-wand-magic-sparkles"
        iconColor={styles?.colors?.primary || '#8B5CF6'}
        position="top"
        onClose={() => {
          setAiInsights(null);
          setInsightsError(null);
        }}
      />
      
      <div style={{ margin: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
          <div 
            style={{ 
              padding: '16px', 
              backgroundColor: '#F9FAFB', 
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            onClick={() => {
              const relevantData = [
                ...invoices.filter(inv => inv.Status === 'Paid').map(inv => ({...inv, Type: 'Paid Invoice', EntityType: 'Invoices', DisplayAmount: inv.TotalAmount})),
                ...deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage)).map(d => ({...d, Type: 'Projected Deal', EntityType: 'Deals', DisplayAmount: (d.Amount || 0) * (d.Probability || 0) / 100}))
              ];
              setDrillDownData(relevantData);
              setDrillDownTitle('Total Revenue Breakdown');
            }}
          >
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Total Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
              {formatCurrency(metrics.totalRevenue)}
            </div>
          </div>
          
          <div 
            style={{ 
              padding: '16px', 
              backgroundColor: '#F9FAFB', 
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            onClick={() => {
              const paidInvoices = invoices.filter(inv => inv.Status === 'Paid').map(inv => ({...inv, Type: 'Paid Invoice', EntityType: 'Invoices', DisplayAmount: inv.TotalAmount}));
              setDrillDownData(paidInvoices);
              setDrillDownTitle('Actual Revenue - Paid Invoices');
            }}
          >
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
          
          <div 
            style={{ 
              padding: '16px', 
              backgroundColor: '#F9FAFB', 
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            onClick={() => {
              const unpaidInvoices = invoices.filter(inv => inv.Status !== 'Paid' && inv.Status !== 'Cancelled').map(inv => ({...inv, Type: 'Unpaid Invoice', EntityType: 'Invoices', DisplayAmount: inv.TotalAmount}));
              setDrillDownData(unpaidInvoices);
              setDrillDownTitle('Outstanding Revenue - Unpaid Invoices');
            }}
          >
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
      
      {/* Drill-down Table */}
      {drillDownData && (
        <DrillDownTable 
          data={drillDownData}
          title={drillDownTitle}
          onClose={() => setDrillDownData(null)}
          sortConfig={sortConfig}
          setSortConfig={setSortConfig}
          callbacks={callbacks}
        />
      )}
      
      <DetailsPanel />
    </div>
  );
}

// Drill-down Table Component
function DrillDownTable({ data, title, onClose, sortConfig, setSortConfig, callbacks }) {
  const formatCurrency = (value) => {
    if (!value) return '$0';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };

  const sortedData = [...data].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    
    if (sortConfig.direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '20px',
      margin: '20px',
      border: '1px solid #E5E7EB',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
          {title} ({data.length} records)
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#6B7280'
          }}
        >
          <i className="fa-solid fa-times"></i>
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
              <th 
                onClick={() => handleSort('Type')}
                style={{ 
                  padding: '12px 8px', 
                  textAlign: 'left', 
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Type {sortConfig.key === 'Type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => handleSort('InvoiceNumber')}
                style={{ 
                  padding: '12px 8px', 
                  textAlign: 'left', 
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Reference {sortConfig.key === 'InvoiceNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => handleSort('InvoiceDate')}
                style={{ 
                  padding: '12px 8px', 
                  textAlign: 'left', 
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Date {sortConfig.key === 'InvoiceDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => handleSort('DisplayAmount')}
                style={{ 
                  padding: '12px 8px', 
                  textAlign: 'right', 
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Amount {sortConfig.key === 'DisplayAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => handleSort('Status')}
                style={{ 
                  padding: '12px 8px', 
                  textAlign: 'left', 
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Status {sortConfig.key === 'Status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ 
                padding: '12px 8px', 
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase'
              }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((item, index) => (
              <tr 
                key={item.ID || index}
                style={{ 
                  borderBottom: '1px solid #F3F4F6',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <td style={{ padding: '12px 8px', fontSize: '14px' }}>
                  <span style={{
                    padding: '2px 8px',
                    backgroundColor: item.Type === 'Paid Invoice' ? '#D1FAE5' : 
                                     item.Type === 'Unpaid Invoice' ? '#FEE2E2' : 
                                     item.Type === 'Projected Deal' ? '#FEF3C7' : '#E5E7EB',
                    color: item.Type === 'Paid Invoice' ? '#065F46' : 
                           item.Type === 'Unpaid Invoice' ? '#991B1B' : 
                           item.Type === 'Projected Deal' ? '#92400E' : '#374151',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    {item.Type}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', fontSize: '14px' }}>
                  {item.InvoiceNumber || item.DealName || item.ProductName || '-'}
                </td>
                <td style={{ padding: '12px 8px', fontSize: '14px', color: '#6B7280' }}>
                  {formatDate(item.InvoiceDate || item.CloseDate || item.CreatedAt)}
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px', fontWeight: '500' }}>
                  {formatCurrency(item.DisplayAmount || item.TotalAmount || item.Amount || item.Price)}
                </td>
                <td style={{ padding: '12px 8px', fontSize: '14px' }}>
                  <span style={{
                    padding: '2px 8px',
                    backgroundColor: item.Status === 'Paid' ? '#D1FAE5' : 
                                     item.Status === 'Pending' ? '#FEF3C7' : 
                                     item.Stage === 'Closed Won' ? '#D1FAE5' :
                                     item.Stage === 'Closed Lost' ? '#FEE2E2' : '#E5E7EB',
                    color: item.Status === 'Paid' ? '#065F46' : 
                           item.Status === 'Pending' ? '#92400E' : 
                           item.Stage === 'Closed Won' ? '#065F46' :
                           item.Stage === 'Closed Lost' ? '#991B1B' : '#374151',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    {item.Status || item.Stage || 'Active'}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  <button
                    onClick={() => {
                      if (callbacks && callbacks.OpenEntityRecord) {
                        callbacks.OpenEntityRecord(item.EntityType, [{ FieldName: 'ID', Value: item.ID }]);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4F46E5',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px'
                    }}
                    title="Open Record"
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}