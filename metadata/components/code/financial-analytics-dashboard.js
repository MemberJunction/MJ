function FinancialAnalyticsDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Load registry components
  const { AIInsightsPanel, DataExportPanel, DrillDownTable, KPIGauges, RevenueTrendChart, CashFlowChart, ForecastModel } = components;
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
  const dashboardRef = useRef(null);
  const aiInsightsRef = useRef(null);
  
  // Debug ref initialization
  useEffect(() => {
    console.log('Dashboard refs after mount:', {
      dashboardRef: dashboardRef.current,
      aiInsightsRef: aiInsightsRef.current
    });
  }, []);
  
  // AI Insights state
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

  const getDateFilter = React.useCallback(() => {
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
  }, [timeRange]);

  const loadFinancialData = React.useCallback(async () => {
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
          OrderBy: 'Name ASC'
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
  }, [timeRange, getDateFilter, utilities.rv]);

  useEffect(() => {
    loadFinancialData();
  }, [timeRange]);

  const metrics = React.useMemo(() => {
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
  }, [invoices, deals, products]);

  // Format insights text using marked library for proper markdown rendering

  const generateAIInsights = React.useCallback(async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    
    try {
      // trendData is already calculated via useMemo
      
      const prompt = `Analyze this financial analytics data and provide insights:

Time Period: ${timeRange}
Total Revenue: ${formatCurrency(metrics.totalRevenue)}
Actual Revenue: ${formatCurrency(metrics.actualRevenue)}
Projected Revenue: ${formatCurrency(metrics.projectedRevenue)}
Outstanding Revenue: ${formatCurrency(metrics.outstandingRevenue)}
Gross Margin: ${metrics.grossMargin?.toFixed(1) || '0'}%
Revenue Growth: ${metrics.revenueGrowth > 0 ? '+' : ''}${metrics.revenueGrowth?.toFixed(1) || '0'}%
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
  }, [invoices, deals, metrics, utilities.ai]);

  const trendData = React.useMemo(() => {
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
  }, [invoices, deals]);

  const formatCurrency = React.useCallback((amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount?.toFixed(0) || 0}`;
  }, []);

  // Forecast scenarios configuration
  const forecastScenarios = React.useMemo(() => [
    {
      id: 'conservative',
      name: 'Conservative (3% growth)',
      parameters: { growth: 1.03, seasonality: false }
    },
    {
      id: 'moderate',
      name: 'Moderate (5% growth)',
      parameters: { growth: 1.05, seasonality: false }
    },
    {
      id: 'aggressive',
      name: 'Aggressive (8% growth)',
      parameters: { growth: 1.08, seasonality: false }
    }
  ], []);

  // Generate forecast data based on trend data
  const generateForecastData = React.useCallback(() => {
    const historicalData = trendData;
    if (!historicalData || historicalData.length === 0) {
      return [];
    }

    const lastValue = historicalData[historicalData.length - 1]?.total || 0;
    const growthRate = 1.05; // Default 5% growth (moderate scenario)

    return Array.from({ length: 6 }, (_, i) => {
      const forecastValue = lastValue * Math.pow(growthRate, i + 1);
      const confidenceLow = forecastValue * 0.85; // 15% lower bound
      const confidenceHigh = forecastValue * 1.15; // 15% upper bound

      return {
        period: `Month +${i + 1}`,
        value: forecastValue,
        confidence: {
          low: confidenceLow,
          high: confidenceHigh
        }
      };
    });
  }, [trendData]);


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
            {DataExportPanel ? (
              <DataExportPanel
                data={exportData}
                columns={exportColumns}
                getHtmlElement={() => dashboardRef.current}
                filename={`financial-report-${new Date().toISOString().split('T')[0]}`}
                formats={['csv', 'excel', 'pdf']}
                buttonStyle="menu"
                pdfOptions={{
                  orientation: 'landscape',
                  pageSize: 'a4',
                  margins: { top: 40, bottom: 40, left: 40, right: 40 },
                  title: 'Financial Analytics Report',
                  includeDataTable: true,
                  multiPage: true  // Enable multi-page support for tall dashboards
                }}
                excelOptions={{
                  sheetName: 'Financial Data',
                  includeFilters: true,
                  autoWidth: true
                }}
                utilities={utilities}
                styles={styles}
                components={components}
                callbacks={callbacks}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  // Prepare data for export
  const exportData = React.useMemo(() => {
    // Return empty array if data is not loaded
    if (!invoices || invoices.length === 0) {
      return [];
    }

    // metrics is already calculated via useMemo
    const monthlyTrends = trendData;

    // Combine all financial data into a flat structure for export
    const exportData = [];

    // Add monthly revenue data
    monthlyTrends.forEach(month => {
      exportData.push({
        category: 'Monthly Revenue',
        date: month.month,
        metric: 'Invoice Revenue',
        value: month.revenue,
        type: 'Actual'
      });
      exportData.push({
        category: 'Monthly Revenue',
        date: month.month,
        metric: 'Deal Revenue',
        value: month.deals,
        type: 'Projected'
      });
    });

    // Add summary metrics
    const currentDate = new Date().toISOString().split('T')[0];
    exportData.push(
      {
        category: 'Summary',
        date: currentDate,
        metric: 'Total Revenue',
        value: metrics.totalRevenue,
        type: 'Combined'
      },
      {
        category: 'Summary',
        date: currentDate,
        metric: 'Actual Revenue',
        value: metrics.actualRevenue,
        type: 'Actual'
      },
      {
        category: 'Summary',
        date: currentDate,
        metric: 'Projected Revenue',
        value: metrics.projectedRevenue,
        type: 'Projected'
      },
      {
        category: 'Summary',
        date: currentDate,
        metric: 'Outstanding Revenue',
        value: metrics.outstandingRevenue,
        type: 'Outstanding'
      },
      {
        category: 'Summary',
        date: currentDate,
        metric: 'Average Deal Size',
        value: metrics.avgDealSize,
        type: 'Calculated'
      },
      {
        category: 'Summary',
        date: currentDate,
        metric: 'Gross Margin',
        value: metrics.grossMargin,
        type: 'Percentage'
      },
      {
        category: 'Summary',
        date: currentDate,
        metric: 'Revenue Growth',
        value: metrics.revenueGrowth,
        type: 'Percentage'
      }
    );

    // Add top invoices
    const topInvoices = invoices
      .filter(inv => inv.Status === 'Paid')
      .sort((a, b) => (b.TotalAmount || 0) - (a.TotalAmount || 0))
      .slice(0, 5);

    topInvoices.forEach(invoice => {
      exportData.push({
        category: 'Top Invoices',
        date: invoice.InvoiceDate,
        metric: `Invoice #${invoice.ID}`,
        value: invoice.TotalAmount,
        type: 'Invoice'
      });
    });

    return exportData;
  }, [invoices, deals, metrics]);

  // Export columns configuration - memoized value
  const exportColumns = React.useMemo(() => {
    return [
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'metric', label: 'Metric', type: 'string' },
      { key: 'value', label: 'Value', type: 'currency' },
      { key: 'type', label: 'Type', type: 'string' }
    ];
  }, []);


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
    <div ref={(el) => {
      dashboardRef.current = el;
      console.log('Dashboard ref callback:', el);
    }} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
            
            {/* Export Button - hidden during PDF capture */}
            <div className="no-print">
              {DataExportPanel ? (
                console.log('Rendering DataExportPanel with:', {
                  dashboardRef: dashboardRef,
                  dashboardRefCurrent: dashboardRef.current,
                  dashboardRefExists: !!dashboardRef.current,
                  aiInsights: !!aiInsights,
                  aiInsightsRef: aiInsightsRef,
                  aiInsightsRefCurrent: aiInsightsRef.current
                }) ||
                <DataExportPanel
                  data={exportData}
                  columns={exportColumns}
                  getHtmlElement={() => dashboardRef.current}
                  aiInsightsText={aiInsights}  // Pass raw markdown text only
                  filename={`financial-report-${new Date().toISOString().split('T')[0]}`}
                  formats={['csv', 'excel', 'pdf']}
                  buttonStyle="dropdown"
                  buttonText="Export"
                  icon="fa-download"
                  pdfOptions={{
                    orientation: 'landscape',
                    pageSize: 'a4',
                    margins: { top: 40, bottom: 40, left: 40, right: 40 },
                    title: 'Financial Analytics Report',
                    includeDataTable: true,
                    multiPage: true  // Enable multi-page support for tall dashboards
                  }}
                  excelOptions={{
                    sheetName: 'Financial Data',
                    includeFilters: true,
                    autoWidth: true
                  }}
                  utilities={utilities}
                  styles={styles}
                  components={components}
                  callbacks={callbacks}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
      
      {/* AI Insights Panel */}
      <div ref={(el) => {
        aiInsightsRef.current = el;
        console.log('AI Insights ref callback:', el);
      }}>
      {AIInsightsPanel ? (
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
      ) : null}
      </div>
      
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
            <RevenueTrendChart
              loading={loading}
              trendData={trendData}
              chartRefs={chartRefs}
              formatCurrency={formatCurrency}
              styles={styles}
              utilities={utilities}
              components={components}
              callbacks={callbacks}
            />
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <h3 style={{ marginTop: 0 }}>KPI Gauges</h3>
            <KPIGauges
              loading={loading}
              metrics={metrics}
              chartRefs={chartRefs}
              styles={styles}
              utilities={utilities}
              components={components}
              callbacks={callbacks}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <h3 style={{ marginTop: 0 }}>Cash Flow Analysis</h3>
            <CashFlowChart
              loading={loading}
              metrics={metrics}
              chartRefs={chartRefs}
              formatCurrency={formatCurrency}
              styles={styles}
              utilities={utilities}
              components={components}
              callbacks={callbacks}
            />
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <h3 style={{ marginTop: 0 }}>Revenue Forecast</h3>
            <ForecastModel
              loading={loading}
              forecastData={generateForecastData()}
              scenarios={forecastScenarios}
              chartRefs={chartRefs}
              formatCurrency={formatCurrency}
              onScenarioChange={(scenarioId) => {
                console.log('Scenario changed to:', scenarioId);
              }}
              styles={styles}
              utilities={utilities}
              components={components}
              callbacks={callbacks}
            />
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
          styles={styles}
          utilities={utilities}
          components={components}
        />
      )}
      
      <DetailsPanel />
    </div>
  );
}