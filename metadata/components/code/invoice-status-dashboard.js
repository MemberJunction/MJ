function InvoiceStatusDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Extract AIInsightsPanel from components
  const AIInsightsPanel = components?.AIInsightsPanel;
  const DataExportPanel = components?.DataExportPanel;

  if (!AIInsightsPanel) {
    console.warn('AIInsightsPanel component not available');
  }

  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedData, setSelectedData] = useState(null);
  const [drillDownType, setDrillDownType] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [timePeriod, setTimePeriod] = useState(savedUserSettings?.timePeriod || 'all');
  const [startDate, setStartDate] = useState(savedUserSettings?.startDate || null);
  const [endDate, setEndDate] = useState(savedUserSettings?.endDate || null);
  
  const statusChartRef = useRef(null);
  const agingChartRef = useRef(null);
  const statusChartInstance = useRef(null);
  const agingChartInstance = useRef(null);
  
  // AI Insights state
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

  const getDateFilter = React.useCallback(() => {
    // If showing all data, return empty filter
    if (timePeriod === 'all') {
      return '';
    }

    // If custom dates are set, use them
    if (timePeriod === 'custom' && startDate && endDate) {
      return `InvoiceDate >= '${startDate}' AND InvoiceDate <= '${endDate}'`;
    }

    const now = new Date();
    let filterStart, filterEnd;

    switch (timePeriod) {
      case 'month':
        filterStart = new Date(now.getFullYear(), now.getMonth(), 1);
        filterEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        filterStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        filterEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        filterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
        filterEnd = new Date(now.getFullYear(), currentQuarter * 3 + 3, 0);
        break;
      case 'lastQuarter':
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const quarter = lastQuarter < 0 ? 3 : lastQuarter;
        filterStart = new Date(year, quarter * 3, 1);
        filterEnd = new Date(year, quarter * 3 + 3, 0);
        break;
      case 'year':
        filterStart = new Date(now.getFullYear(), 0, 1);
        filterEnd = new Date(now.getFullYear(), 11, 31);
        break;
      case 'lastYear':
        filterStart = new Date(now.getFullYear() - 1, 0, 1);
        filterEnd = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default:
        return '';
    }
    
    if (filterStart && filterEnd) {
      return `InvoiceDate >= '${filterStart.toISOString().split('T')[0]}' AND InvoiceDate <= '${filterEnd.toISOString().split('T')[0]}'`;
    }
    return '';
  }, [timePeriod, startDate, endDate]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const dateFilter = getDateFilter();

      // Check which API is available
      const runViewsMethod = utilities?.RunViews || utilities?.rv?.RunViews;

      if (!runViewsMethod) {
        setError('Data loading method not available');
        return;
      }

      // Use RunViews for batch loading
      const results = await runViewsMethod([
        {
          EntityName: 'Invoices',
          ExtraFilter: dateFilter,
          OrderBy: 'DueDate ASC'
        },
        {
          EntityName: 'Payments',
          OrderBy: 'PaymentDate DESC',
          MaxRows: 500
        },
        {
          EntityName: 'Accounts',
          OrderBy: 'AccountName ASC'
        }
      ]);

      if (results && results.length === 3) {
        const [invoicesResult, paymentsResult, accountsResult] = results;

        if (invoicesResult.Success) {
          setInvoices(invoicesResult.Results || []);
        }
        if (paymentsResult.Success) {
          setPayments(paymentsResult.Results || []);
        }
        if (accountsResult.Success) {
          setAccounts(accountsResult.Results || []);
        }

        if (!invoicesResult.Success) {
          setError('Failed to load invoice data: ' + (invoicesResult.ErrorMessage || 'Unknown error'));
        }
      } else {
        setError('Unexpected data format received');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDateFilter, utilities]);

  // Load data when component mounts or filters change
  useEffect(() => {
    loadData();
  }, [loadData, timePeriod, startDate, endDate]);

  const metrics = React.useMemo(() => {
    const result = {
      total: invoices.length,
      totalAmount: 0,
      paid: 0,
      paidAmount: 0,
      overdue: 0,
      overdueAmount: 0,
      pending: 0,
      pendingAmount: 0,
      partial: 0,
      partialAmount: 0
    };
    
    const today = new Date();
    
    // Calculate paid amounts from payments
    const paidByInvoice = {};
    payments.forEach(payment => {
      if (!paidByInvoice[payment.InvoiceID]) {
        paidByInvoice[payment.InvoiceID] = 0;
      }
      paidByInvoice[payment.InvoiceID] += payment.Amount || 0;
    });
    
    invoices.forEach(invoice => {
      const amount = invoice.TotalAmount || 0;
      const paidAmount = paidByInvoice[invoice.ID] || 0;
      const remainingAmount = amount - paidAmount;
      
      result.totalAmount += amount;

      if (invoice.Status === 'Paid' || remainingAmount <= 0) {
        result.paid++;
        result.paidAmount += amount;
      } else if (invoice.Status === 'Cancelled') {
        // Skip cancelled invoices
      } else if (invoice.Status === 'Partial' || (paidAmount > 0 && remainingAmount > 0)) {
        result.partial++;
        result.partialAmount += remainingAmount;
        if (new Date(invoice.DueDate) < today) {
          result.overdue++;
          result.overdueAmount += remainingAmount;
        }
      } else if (new Date(invoice.DueDate) < today) {
        result.overdue++;
        result.overdueAmount += remainingAmount;
      } else {
        result.pending++;
        result.pendingAmount += remainingAmount;
      }
    });

    return result;
  }, [invoices, payments]);

  const openDrillDown = React.useCallback((type, data) => {
    setDrillDownType(type);
    setSelectedData(data);
    setIsPanelOpen(true);
  }, []);
  
  // Generate AI Insights
  // Format insights text using marked library for proper markdown rendering

  const generateAIInsights = React.useCallback(async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    
    try {
      // metrics is already calculated via useMemo
      
      // Calculate aging breakdown
      const aging = { current: 0, '30days': 0, '60days': 0, '90days': 0, 'over90': 0 };
      const today = new Date();
      const paidByInvoice = {};
      payments.forEach(payment => {
        if (!paidByInvoice[payment.InvoiceID]) {
          paidByInvoice[payment.InvoiceID] = 0;
        }
        paidByInvoice[payment.InvoiceID] += payment.Amount || 0;
      });
      
      invoices.forEach(invoice => {
        if (invoice.Status !== 'Paid' && invoice.Status !== 'Cancelled') {
          const paidAmount = paidByInvoice[invoice.ID] || 0;
          const outstanding = (invoice.TotalAmount || 0) - paidAmount;
          
          if (outstanding > 0) {
            const dueDate = new Date(invoice.DueDate);
            const daysPastDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
            
            if (daysPastDue <= 0) aging.current += outstanding;
            else if (daysPastDue <= 30) aging['30days'] += outstanding;
            else if (daysPastDue <= 60) aging['60days'] += outstanding;
            else if (daysPastDue <= 90) aging['90days'] += outstanding;
            else aging.over90 += outstanding;
          }
        }
      });
      
      const formatCurrency = (amount) => {
        if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
        return `$${amount?.toFixed(0) || 0}`;
      };
      
      const prompt = `Analyze this invoice status and aging data and provide actionable insights:

## Invoice Overview
- **Time Period:** ${timePeriod === 'custom' ? `${startDate} to ${endDate}` : `Last ${timePeriod}`}
- **Total Invoices:** ${metrics.total}
- **Total Amount:** ${formatCurrency(metrics.totalAmount)}

## Status Breakdown
- **Paid:** ${metrics.paid} invoices (${formatCurrency(metrics.paidAmount)})
- **Pending:** ${metrics.pending} invoices (${formatCurrency(metrics.pendingAmount)})
- **Overdue:** ${metrics.overdue} invoices (${formatCurrency(metrics.overdueAmount)})
- **Partial:** ${metrics.partial} invoices (${formatCurrency(metrics.partialAmount)})

## Aging Analysis
- **Current (not overdue):** ${formatCurrency(aging.current)}
- **1-30 days overdue:** ${formatCurrency(aging['30days'])}
- **31-60 days overdue:** ${formatCurrency(aging['60days'])}
- **61-90 days overdue:** ${formatCurrency(aging['90days'])}
- **Over 90 days overdue:** ${formatCurrency(aging.over90)}

## Key Metrics
- **Total Payments Recorded:** ${payments.length}
- **Total Customer Accounts:** ${accounts.length}
- **Collection Rate:** ${metrics.paid > 0 ? ((metrics.paidAmount / metrics.totalAmount) * 100).toFixed(1) : 0}%
- **Average Days Overdue:** ${metrics.overdue > 0 ? Math.round(invoices.filter(i => i.Status === 'Overdue').reduce((sum, inv) => {
    const dueDate = new Date(inv.DueDate);
    const today = new Date();
    return sum + Math.max(0, Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)));
  }, 0) / metrics.overdue) : 0} days

Based on this specific data, please provide:
1. **Cash Flow Analysis** - What is the immediate cash flow situation?
2. **Risk Assessment** - Which invoices pose the highest collection risk?
3. **Customer Payment Patterns** - What behaviors are evident?
4. **Collection Strategy** - Specific recommendations to improve collections
5. **Action Items** - 3-4 immediate actions to reduce overdue amounts
6. **Early Warning Indicators** - What metrics should we monitor closely?

Use markdown formatting with headers (##), bullet points, and **bold** text. Reference the actual numbers in your analysis.`;
      
      const result = await utilities.ai.ExecutePrompt({
        systemPrompt: 'You are an expert accounts receivable and cash flow analyst with deep knowledge of invoice management, collections, and customer payment behavior. Provide clear, actionable insights with specific recommendations. Format your response in clear markdown.',
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
  }, [invoices, payments, metrics, utilities.ai]);

  const closeDrillDown = React.useCallback(() => {
    setIsPanelOpen(false);
    setTimeout(() => {
      setSelectedData(null);
      setDrillDownType(null);
    }, 300);
  }, []);

  // Prepare data for export - memoized to prevent re-computation
  const prepareExportData = React.useMemo(() => {
    // metrics is already calculated via useMemo
    const today = new Date();
    const paidByInvoice = {};
    payments.forEach(payment => {
      if (!paidByInvoice[payment.InvoiceID]) {
        paidByInvoice[payment.InvoiceID] = 0;
      }
      paidByInvoice[payment.InvoiceID] += payment.Amount || 0;
    });

    return invoices.map(invoice => {
      const paidAmount = paidByInvoice[invoice.ID] || 0;
      const outstanding = (invoice.TotalAmount || 0) - paidAmount;
      const dueDate = new Date(invoice.DueDate);
      const daysPastDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

      let agingBucket = 'Current';
      if (daysPastDue > 0) {
        if (daysPastDue <= 30) agingBucket = '1-30 Days';
        else if (daysPastDue <= 60) agingBucket = '31-60 Days';
        else if (daysPastDue <= 90) agingBucket = '61-90 Days';
        else agingBucket = 'Over 90 Days';
      }

      return {
        InvoiceNumber: invoice.InvoiceNumber || '',
        AccountName: invoice.AccountName || '',
        InvoiceDate: invoice.InvoiceDate ? new Date(invoice.InvoiceDate).toLocaleDateString() : '',
        DueDate: invoice.DueDate ? new Date(invoice.DueDate).toLocaleDateString() : '',
        TotalAmount: `$${(invoice.TotalAmount || 0).toFixed(2)}`,
        PaidAmount: `$${paidAmount.toFixed(2)}`,
        Outstanding: `$${outstanding.toFixed(2)}`,
        Status: invoice.Status || '',
        DaysPastDue: Math.max(0, daysPastDue),
        AgingBucket: agingBucket
      };
    });
  }, [invoices, payments, metrics]);

  // Define export columns - memoized to prevent re-creation
  const getExportColumns = React.useMemo(() => {
    return [
      { key: 'InvoiceNumber', label: 'Invoice Number' },
      { key: 'AccountName', label: 'Account Name' },
      { key: 'InvoiceDate', label: 'Invoice Date' },
      { key: 'DueDate', label: 'Due Date' },
      { key: 'TotalAmount', label: 'Total Amount' },
      { key: 'PaidAmount', label: 'Paid Amount' },
      { key: 'Outstanding', label: 'Outstanding' },
      { key: 'Status', label: 'Status' },
      { key: 'DaysPastDue', label: 'Days Past Due' },
      { key: 'AgingBucket', label: 'Aging Bucket' }
    ];
  }, []);

  // Status Distribution Chart with click handler
  useEffect(() => {
    if (!loading && statusChartRef.current && invoices.length > 0) {
      // metrics is already calculated via useMemo
      const ctx = statusChartRef.current.getContext('2d');
      
      // Destroy existing chart
      if (statusChartInstance.current) {
        statusChartInstance.current.destroy();
      }
      
      statusChartInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Paid', 'Pending', 'Overdue', 'Partial'],
          datasets: [{
            data: [metrics.paid, metrics.pending, metrics.overdue, metrics.partial],
            backgroundColor: ['#10B981', '#3B82F6', '#EF4444', '#F59E0B'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (event, activeElements) => {
            if (activeElements.length > 0) {
              const index = activeElements[0].index;
              const labels = ['Paid', 'Pending', 'Overdue', 'Partial'];
              openDrillDown('status', labels[index]);
            }
          },
          plugins: {
            legend: {
              position: 'right',
              labels: {
                padding: 20,
                font: { size: 12 }
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const value = context.raw;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${context.label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
    
    return () => {
      if (statusChartInstance.current) {
        statusChartInstance.current.destroy();
      }
    };
  }, [loading, invoices]);

  // Aging Chart with click handler
  useEffect(() => {
    if (!loading && agingChartRef.current && invoices.length > 0) {
      const aging = { current: 0, '30days': 0, '60days': 0, '90days': 0, 'over90': 0 };
      const agingInvoices = { current: [], '30days': [], '60days': [], '90days': [], 'over90': [] };
      const today = new Date();
      
      // Calculate paid amounts
      const paidByInvoice = {};
      payments.forEach(payment => {
        if (!paidByInvoice[payment.InvoiceID]) {
          paidByInvoice[payment.InvoiceID] = 0;
        }
        paidByInvoice[payment.InvoiceID] += payment.Amount || 0;
      });
      
      invoices.forEach(invoice => {
        if (invoice.Status !== 'Paid' && invoice.Status !== 'Cancelled') {
          const paidAmount = paidByInvoice[invoice.ID] || 0;
          const outstanding = (invoice.TotalAmount || 0) - paidAmount;
          
          if (outstanding > 0) {
            const dueDate = new Date(invoice.DueDate);
            const daysPastDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
            
            if (daysPastDue <= 0) {
              aging.current += outstanding;
              agingInvoices.current.push(invoice);
            } else if (daysPastDue <= 30) {
              aging['30days'] += outstanding;
              agingInvoices['30days'].push(invoice);
            } else if (daysPastDue <= 60) {
              aging['60days'] += outstanding;
              agingInvoices['60days'].push(invoice);
            } else if (daysPastDue <= 90) {
              aging['90days'] += outstanding;
              agingInvoices['90days'].push(invoice);
            } else {
              aging.over90 += outstanding;
              agingInvoices.over90.push(invoice);
            }
          }
        }
      });
      
      const ctx = agingChartRef.current.getContext('2d');
      
      if (agingChartInstance.current) {
        agingChartInstance.current.destroy();
      }
      
      agingChartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Current', '1-30 Days', '31-60 Days', '61-90 Days', 'Over 90'],
          datasets: [{
            label: 'Outstanding Amount',
            data: Object.values(aging),
            backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#FB923C', '#EF4444']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (event, activeElements) => {
            if (activeElements.length > 0) {
              const index = activeElements[0].index;
              const keys = ['current', '30days', '60days', '90days', 'over90'];
              const labels = ['Current', '1-30 Days Overdue', '31-60 Days Overdue', '61-90 Days Overdue', 'Over 90 Days Overdue'];
              openDrillDown('aging', { label: labels[index], invoices: agingInvoices[keys[index]] });
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `$${(context.raw / 1000).toFixed(1)}K`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => `$${(value / 1000).toFixed(0)}K`
              }
            }
          }
        }
      });
    }
    
    return () => {
      if (agingChartInstance.current) {
        agingChartInstance.current.destroy();
      }
    };
  }, [loading, invoices, payments]);

  const CustomerBalances = () => {
    const customerBalances = {};
    
    // Calculate paid amounts from payments
    const paidByInvoice = {};
    payments.forEach(payment => {
      if (!paidByInvoice[payment.InvoiceID]) {
        paidByInvoice[payment.InvoiceID] = 0;
      }
      paidByInvoice[payment.InvoiceID] += payment.Amount || 0;
    });
    
    // Create account lookup map
    const accountMap = {};
    accounts.forEach(account => {
      accountMap[account.ID] = account;
    });
    
    invoices.forEach(invoice => {
      if (invoice.Status !== 'Paid' && invoice.Status !== 'Cancelled') {
        const customerId = invoice.AccountID || 'Unknown';
        if (!customerBalances[customerId]) {
          const account = accountMap[customerId];
          customerBalances[customerId] = {
            id: customerId,
            name: account ? account.AccountName : `Account #${customerId}`,
            totalDue: 0,
            overdueAmount: 0,
            invoiceCount: 0,
            invoices: [],
            oldestDue: null
          };
        }
        
        const paidAmount = paidByInvoice[invoice.ID] || 0;
        const outstanding = (invoice.TotalAmount || 0) - paidAmount;
        
        if (outstanding > 0) {
          customerBalances[customerId].totalDue += outstanding;
          customerBalances[customerId].invoiceCount++;
          customerBalances[customerId].invoices.push({
            ...invoice,
            outstanding,
            paidAmount
          });
          
          const dueDate = new Date(invoice.DueDate);
          if (dueDate < new Date()) {
            customerBalances[customerId].overdueAmount += outstanding;
          }
          
          if (!customerBalances[customerId].oldestDue || dueDate < customerBalances[customerId].oldestDue) {
            customerBalances[customerId].oldestDue = dueDate;
          }
        }
      }
    });
    
    const topCustomers = Object.values(customerBalances)
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, 5);
    
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>Top Customer Balances</h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {topCustomers.map((customer, index) => (
            <div
              key={customer.id}
              style={{
                padding: '12px',
                backgroundColor: '#F9FAFB',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderLeft: `4px solid ${customer.overdueAmount > 0 ? '#EF4444' : '#3B82F6'}`
              }}
              onClick={() => openDrillDown('customer', customer)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateX(4px)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateX(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                    {customer.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    {customer.invoiceCount} invoice{customer.invoiceCount !== 1 ? 's' : ''} outstanding
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: customer.overdueAmount > 0 ? '#EF4444' : '#111827' }}>
                    ${(customer.totalDue / 1000).toFixed(1)}K
                  </div>
                  {customer.overdueAmount > 0 && (
                    <div style={{ fontSize: '11px', color: '#EF4444' }}>
                      ${(customer.overdueAmount / 1000).toFixed(1)}K overdue
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const DrillDownPanel = () => {
    if (!isPanelOpen || !selectedData) return null;
    
    const renderContent = () => {
      switch (drillDownType) {
        case 'status':
          const statusInvoices = invoices.filter(inv => {
            if (selectedData === 'Overdue') {
              return inv.Status !== 'Paid' && inv.Status !== 'Cancelled' && new Date(inv.DueDate) < new Date();
            }
            if (selectedData === 'Pending') {
              return inv.Status === 'Sent' || (inv.Status !== 'Paid' && inv.Status !== 'Cancelled' && new Date(inv.DueDate) >= new Date());
            }
            return inv.Status === selectedData;
          });
          
          return (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>{selectedData} Invoices</h3>
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {statusInvoices.map(invoice => (
                  <div key={invoice.ID} style={{ 
                    padding: '12px', 
                    marginBottom: '8px', 
                    backgroundColor: '#F9FAFB', 
                    borderRadius: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>#{invoice.InvoiceNumber}</div>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>
                        Due: {new Date(invoice.DueDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ fontWeight: 'bold' }}>
                        ${((invoice.TotalAmount || 0) / 1000).toFixed(1)}K
                      </div>
                      <button
                        onClick={() => callbacks.OpenEntityRecord('Invoices', [{ FieldName: 'ID', Value: invoice.ID }])}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#3B82F6',
                          cursor: 'pointer',
                          fontSize: '16px'
                        }}
                        title="Open Invoice"
                      >
                        <i className="fa-solid fa-up-right-from-square"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
          
        case 'aging':
          return (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>{selectedData.label}</h3>
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {selectedData.invoices.map(invoice => (
                  <div key={invoice.ID} style={{ 
                    padding: '12px', 
                    marginBottom: '8px', 
                    backgroundColor: '#F9FAFB', 
                    borderRadius: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>#{invoice.InvoiceNumber}</div>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>
                        Due: {new Date(invoice.DueDate).toLocaleDateString()}
                        {new Date(invoice.DueDate) < new Date() && (
                          <span style={{ color: '#EF4444', marginLeft: '8px' }}>
                            ({Math.floor((new Date() - new Date(invoice.DueDate)) / (1000 * 60 * 60 * 24))} days overdue)
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ fontWeight: 'bold' }}>
                        ${((invoice.TotalAmount || 0) / 1000).toFixed(1)}K
                      </div>
                      <button
                        onClick={() => callbacks.OpenEntityRecord('Invoices', [{ FieldName: 'ID', Value: invoice.ID }])}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#3B82F6',
                          cursor: 'pointer',
                          fontSize: '16px'
                        }}
                        title="Open Invoice"
                      >
                        <i className="fa-solid fa-up-right-from-square"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
          
        case 'customer':
          return (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>{selectedData.name}</h3>
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>Total Outstanding</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                      ${(selectedData.totalDue / 1000).toFixed(1)}K
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>Overdue Amount</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#EF4444' }}>
                      ${(selectedData.overdueAmount / 1000).toFixed(1)}K
                    </div>
                  </div>
                </div>
              </div>
              
              <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px' }}>Outstanding Invoices</h4>
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                {selectedData.invoices.map(invoice => (
                  <div key={invoice.ID} style={{ 
                    padding: '12px', 
                    marginBottom: '8px', 
                    backgroundColor: '#F9FAFB', 
                    borderRadius: '6px',
                    borderLeft: `3px solid ${new Date(invoice.DueDate) < new Date() ? '#EF4444' : '#3B82F6'}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>Invoice #{invoice.InvoiceNumber}</div>
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>
                          Due: {new Date(invoice.DueDate).toLocaleDateString()}
                          {new Date(invoice.DueDate) < new Date() && (
                            <span style={{ color: '#EF4444', marginLeft: '8px' }}>
                              ({Math.floor((new Date() - new Date(invoice.DueDate)) / (1000 * 60 * 60 * 24))} days overdue)
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#6B7280' }}>Outstanding</div>
                          <div style={{ fontWeight: 'bold' }}>
                            ${(invoice.outstanding / 1000).toFixed(1)}K
                          </div>
                        </div>
                        <button
                          onClick={() => callbacks.OpenEntityRecord('Invoices', [{ FieldName: 'ID', Value: invoice.ID }])}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#3B82F6',
                            cursor: 'pointer',
                            fontSize: '16px'
                          }}
                          title="Open Invoice"
                        >
                          <i className="fa-solid fa-up-right-from-square"></i>
                        </button>
                      </div>
                    </div>
                    {invoice.paidAmount > 0 && (
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#059669' }}>
                        Partial payment: ${(invoice.paidAmount / 1000).toFixed(1)}K paid
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
          
        default:
          return null;
      }
    };
    
    return (
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #E5E7EB',
          overflow: 'hidden',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}
      >
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #E5E7EB',
          background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            {drillDownType === 'status' ? `${selectedData} Invoices` : 
             drillDownType === 'aging' ? selectedData.label :
             'Customer Details'}
          </h3>
          <button
            onClick={closeDrillDown}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: '4px',
              transition: 'background 0.2s',
              lineHeight: '1'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            ×
          </button>
        </div>
        
        <div style={{ maxHeight: '400px', overflow: 'auto', padding: '16px' }}>
          {renderContent()}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading invoice data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#EF4444' }}>Error: {error}</div>
      </div>
    );
  }

  // metrics is already calculated via useMemo above

  return (
    <div style={{ padding: '20px', backgroundColor: '#F3F4F6', minHeight: '100%' }}>
      <style>{`
        @media (max-width: 1024px) {
          .invoice-charts {
            grid-template-columns: 1fr !important;
          }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 800px;
          }
        }
      `}</style>
      
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Invoice Status Dashboard</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={timePeriod}
            onChange={(e) => {
              const newPeriod = e.target.value;
              setTimePeriod(newPeriod);
              if (newPeriod !== 'custom') {
                setStartDate(null);
                setEndDate(null);
                onSaveUserSettings({ 
                  ...savedUserSettings, 
                  timePeriod: newPeriod,
                  startDate: null,
                  endDate: null
                });
              } else {
                onSaveUserSettings({ ...savedUserSettings, timePeriod: newPeriod });
              }
            }}
            style={{
              padding: '6px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Time</option>
            <option value="month">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="quarter">This Quarter</option>
            <option value="lastQuarter">Last Quarter</option>
            <option value="year">This Year</option>
            <option value="lastYear">Last Year</option>
            <option value="custom">Custom Range</option>
          </select>
          
          {timePeriod === 'custom' && (
            <>
              <input
                type="date"
                value={startDate || ''}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value && endDate) {
                    onSaveUserSettings({ 
                      ...savedUserSettings, 
                      startDate: e.target.value,
                      endDate,
                      timePeriod: 'custom'
                    });
                  }
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  backgroundColor: 'white'
                }}
              />
              <span style={{ color: '#6B7280', fontSize: '14px' }}>to</span>
              <input
                type="date"
                value={endDate || ''}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (startDate && e.target.value) {
                    onSaveUserSettings({ 
                      ...savedUserSettings, 
                      startDate,
                      endDate: e.target.value,
                      timePeriod: 'custom'
                    });
                  }
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  backgroundColor: 'white'
                }}
              />
            </>
          )}
          
          {/* Export Button */}
          {DataExportPanel && (
            <DataExportPanel
              key="export-panel"  // Add stable key
              data={prepareExportData}
              columns={getExportColumns}
              filename={`invoice-status-dashboard-${new Date().toISOString().split('T')[0]}`}
              formats={['csv', 'excel', 'pdf']}
              buttonStyle="dropdown"
              buttonText="Export"
              icon="fa-download"
              customStyles={{
                button: {
                  padding: '6px 12px',
                  backgroundColor: '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }
              }}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          )}

          {/* AI Insights Button */}
          <button
            onClick={generateAIInsights}
            disabled={loadingInsights || loading}
            style={{
              padding: '6px 12px',
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
        title="Invoice Analytics Insights"
        icon="fa-wand-magic-sparkles"
        iconColor={styles?.colors?.primary || '#8B5CF6'}
        position="top"
        onClose={() => {
          setAiInsights(null);
          setInsightsError(null);
        }}
      />
      
      {/* Top Metrics Cards - Side by Side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div 
          style={{ 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => openDrillDown('status', 'Overdue')}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Overdue</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#EF4444' }}>
                {metrics.overdue}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                ${(metrics.overdueAmount / 1000).toFixed(1)}K
              </div>
            </div>
            <div style={{ fontSize: '32px', color: '#FEE2E2' }}>
              <i className="fa-solid fa-exclamation-circle"></i>
            </div>
          </div>
        </div>
        
        <div 
          style={{ 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => openDrillDown('status', 'Pending')}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Pending</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3B82F6' }}>
                {metrics.pending}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                ${(metrics.pendingAmount / 1000).toFixed(1)}K
              </div>
            </div>
            <div style={{ fontSize: '32px', color: '#DBEAFE' }}>
              <i className="fa-solid fa-clock"></i>
            </div>
          </div>
        </div>
        
        <div 
          style={{ 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => openDrillDown('status', 'Partial')}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Partial</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>
                {metrics.partial}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                ${(metrics.partialAmount / 1000).toFixed(1)}K
              </div>
            </div>
            <div style={{ fontSize: '32px', color: '#FEF3C7' }}>
              <i className="fa-solid fa-chart-pie"></i>
            </div>
          </div>
        </div>
        
        <div 
          style={{ 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => openDrillDown('status', 'Paid')}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Paid</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
                {metrics.paid}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                ${(metrics.paidAmount / 1000).toFixed(1)}K
              </div>
            </div>
            <div style={{ fontSize: '32px', color: '#D1FAE5' }}>
              <i className="fa-solid fa-check-circle"></i>
            </div>
          </div>
        </div>
        
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Total</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6B7280' }}>
                {metrics.total}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                ${(metrics.totalAmount / 1000).toFixed(1)}K
              </div>
            </div>
            <div style={{ fontSize: '32px', color: '#E5E7EB' }}>
              <i className="fa-solid fa-file-invoice-dollar"></i>
            </div>
          </div>
        </div>
      </div>
      
      {/* Charts Row - Side by Side, wider overall */}
      <div className="invoice-charts" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '20px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Status Distribution</h3>
          <div style={{ height: '280px' }}>
            <canvas ref={statusChartRef} />
          </div>
        </div>
        
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Payment Due Timeline</h3>
          <div style={{ height: '280px' }}>
            <canvas ref={agingChartRef} />
          </div>
        </div>
      </div>
      
      {/* Customer Balances */}
      <CustomerBalances />
      
      {/* Drill-down Panel - below all content */}
      {isPanelOpen && (
        <div style={{ 
          marginTop: '20px',
          animation: 'slideDown 0.3s ease',
          overflow: 'hidden'
        }}>
          <DrillDownPanel />
        </div>
      )}
      
    </div>
  );
}