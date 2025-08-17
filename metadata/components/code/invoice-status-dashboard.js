function InvoiceStatusDashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'cards');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const statusChartRef = useRef(null);
  const agingChartRef = useRef(null);
  const calendarRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [invoicesResult, paymentsResult] = await Promise.all([
        utilities.rv.RunView({
          EntityName: 'Invoices',
          OrderBy: 'DueDate ASC',
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Payments',
          OrderBy: 'PaymentDate DESC',
          MaxRows: 500,
          ResultType: 'entity_object'
        })
      ]);

      if (invoicesResult.Success) {
        setInvoices(invoicesResult.Results || []);
      }
      if (paymentsResult.Success) {
        setPayments(paymentsResult.Results || []);
      }
      
      if (!invoicesResult.Success) {
        setError('Failed to load invoice data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && invoices.length > 0) {
      renderStatusChart();
      renderAgingChart();
      renderPaymentCalendar();
    }
  }, [invoices, payments, loading]);

  const calculateMetrics = () => {
    const now = new Date();
    const metrics = {
      total: invoices.length,
      totalAmount: 0,
      paidAmount: 0,
      overdueAmount: 0,
      statuses: {
        'Draft': 0,
        'Sent': 0,
        'Paid': 0,
        'Overdue': 0,
        'Cancelled': 0
      },
      aging: {
        'Current': { count: 0, amount: 0 },
        '1-30 days': { count: 0, amount: 0 },
        '31-60 days': { count: 0, amount: 0 },
        '61-90 days': { count: 0, amount: 0 },
        '90+ days': { count: 0, amount: 0 }
      }
    };
    
    invoices.forEach(invoice => {
      const amount = invoice.TotalAmount || 0;
      const paidAmount = invoice.PaidAmount || 0;
      const outstanding = amount - paidAmount;
      
      metrics.totalAmount += amount;
      metrics.paidAmount += paidAmount;
      
      // Status counting
      const status = invoice.Status || 'Draft';
      if (metrics.statuses[status] !== undefined) {
        metrics.statuses[status]++;
      }
      
      // Aging analysis for unpaid invoices
      if (status !== 'Paid' && status !== 'Cancelled' && outstanding > 0) {
        const dueDate = new Date(invoice.DueDate);
        const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
        
        if (daysOverdue < 0) {
          metrics.aging['Current'].count++;
          metrics.aging['Current'].amount += outstanding;
        } else if (daysOverdue <= 30) {
          metrics.aging['1-30 days'].count++;
          metrics.aging['1-30 days'].amount += outstanding;
          metrics.overdueAmount += outstanding;
        } else if (daysOverdue <= 60) {
          metrics.aging['31-60 days'].count++;
          metrics.aging['31-60 days'].amount += outstanding;
          metrics.overdueAmount += outstanding;
        } else if (daysOverdue <= 90) {
          metrics.aging['61-90 days'].count++;
          metrics.aging['61-90 days'].amount += outstanding;
          metrics.overdueAmount += outstanding;
        } else {
          metrics.aging['90+ days'].count++;
          metrics.aging['90+ days'].amount += outstanding;
          metrics.overdueAmount += outstanding;
        }
      }
    });
    
    // Calculate DSO (Days Sales Outstanding)
    const avgDailySales = metrics.totalAmount / 30;
    metrics.dso = avgDailySales > 0 ? (metrics.totalAmount - metrics.paidAmount) / avgDailySales : 0;
    
    return metrics;
  };

  const renderStatusChart = () => {
    if (!statusChartRef.current) return;
    
    const metrics = calculateMetrics();
    const statusData = Object.entries(metrics.statuses).filter(([_, count]) => count > 0);
    
    const data = [{
      values: statusData.map(([_, count]) => count),
      labels: statusData.map(([status, _]) => status),
      type: 'pie',
      hole: 0.4,
      marker: {
        colors: {
          'Draft': '#9CA3AF',
          'Sent': '#3B82F6',
          'Paid': '#10B981',
          'Overdue': '#EF4444',
          'Cancelled': '#6B7280'
        }[statusData.map(([status, _]) => status)]
      },
      textinfo: 'label+percent',
      hovertemplate: '%{label}: %{value}<br>%{percent}<extra></extra>'
    }];
    
    const layout = {
      title: 'Invoice Status Distribution',
      height: 300,
      margin: { t: 40, b: 40, l: 40, r: 40 },
      showlegend: true,
      legend: {
        orientation: 'v',
        y: 0.5,
        x: 1.1
      }
    };
    
    Plotly.newPlot(statusChartRef.current, data, layout, { responsive: true });
  };

  const renderAgingChart = () => {
    if (!agingChartRef.current) return;
    
    const metrics = calculateMetrics();
    const agingData = Object.entries(metrics.aging);
    
    const data = [{
      x: agingData.map(([bucket, _]) => bucket),
      y: agingData.map(([_, data]) => data.amount),
      type: 'bar',
      marker: {
        color: agingData.map(([bucket, _]) => {
          if (bucket === 'Current') return '#10B981';
          if (bucket === '1-30 days') return '#F59E0B';
          if (bucket === '31-60 days') return '#FB923C';
          if (bucket === '61-90 days') return '#F87171';
          return '#DC2626';
        })
      },
      text: agingData.map(([_, data]) => `${data.count} invoices<br>${accounting.formatMoney(data.amount)}`),
      textposition: 'outside',
      hovertemplate: '%{text}<extra></extra>'
    }];
    
    const layout = {
      title: 'Accounts Receivable Aging',
      height: 300,
      xaxis: { title: 'Age Bucket' },
      yaxis: { 
        title: 'Outstanding Amount',
        tickformat: '$,.0f'
      },
      margin: { t: 60, b: 60 }
    };
    
    Plotly.newPlot(agingChartRef.current, data, layout, { responsive: true });
  };

  const renderPaymentCalendar = () => {
    if (!calendarRef.current) return;
    
    // Create calendar heatmap data
    const calendarData = {};
    const now = new Date();
    
    invoices.forEach(invoice => {
      if (invoice.DueDate && invoice.Status !== 'Paid' && invoice.Status !== 'Cancelled') {
        const dueDate = new Date(invoice.DueDate).toISOString().split('T')[0];
        if (!calendarData[dueDate]) {
          calendarData[dueDate] = {
            count: 0,
            amount: 0,
            invoices: []
          };
        }
        calendarData[dueDate].count++;
        calendarData[dueDate].amount += (invoice.TotalAmount - (invoice.PaidAmount || 0));
        calendarData[dueDate].invoices.push(invoice);
      }
    });
    
    // Generate calendar grid
    const dates = [];
    const values = [];
    const texts = [];
    
    for (let i = -30; i <= 60; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      dates.push(dateStr);
      
      if (calendarData[dateStr]) {
        values.push(calendarData[dateStr].amount);
        texts.push(`${dateStr}<br>${calendarData[dateStr].count} invoices<br>${accounting.formatMoney(calendarData[dateStr].amount)}`);
      } else {
        values.push(0);
        texts.push(`${dateStr}<br>No invoices due`);
      }
    }
    
    const data = [{
      x: dates,
      y: values,
      type: 'scatter',
      mode: 'markers',
      marker: {
        size: values.map(v => Math.sqrt(v / 1000) + 5),
        color: values,
        colorscale: [
          [0, '#10B981'],
          [0.5, '#F59E0B'],
          [1, '#EF4444']
        ],
        showscale: true,
        colorbar: {
          title: 'Amount Due',
          tickformat: '$,.0f'
        }
      },
      text: texts,
      hovertemplate: '%{text}<extra></extra>'
    }];
    
    const layout = {
      title: 'Payment Due Date Timeline',
      height: 250,
      xaxis: {
        title: 'Due Date',
        type: 'date'
      },
      yaxis: {
        title: 'Amount Due',
        tickformat: '$,.0f'
      },
      margin: { t: 60, b: 60 }
    };
    
    Plotly.newPlot(calendarRef.current, data, layout, { responsive: true });
  };

  // Sub-component: Customer Balances
  const CustomerBalances = () => {
    const customerBalances = {};
    
    invoices.forEach(invoice => {
      if (invoice.Status !== 'Paid' && invoice.Status !== 'Cancelled') {
        const customerId = invoice.AccountID || 'Unknown';
        if (!customerBalances[customerId]) {
          customerBalances[customerId] = {
            id: customerId,
            totalDue: 0,
            overdueAmount: 0,
            invoiceCount: 0,
            oldestDue: null
          };
        }
        
        const outstanding = (invoice.TotalAmount || 0) - (invoice.PaidAmount || 0);
        customerBalances[customerId].totalDue += outstanding;
        customerBalances[customerId].invoiceCount++;
        
        const dueDate = new Date(invoice.DueDate);
        if (dueDate < new Date()) {
          customerBalances[customerId].overdueAmount += outstanding;
        }
        
        if (!customerBalances[customerId].oldestDue || dueDate < customerBalances[customerId].oldestDue) {
          customerBalances[customerId].oldestDue = dueDate;
        }
      }
    });
    
    const topDebtors = Object.values(customerBalances)
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, 10);
    
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Top Customer Balances</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={() => setViewMode('cards')}
            style={{
              padding: '4px 8px',
              backgroundColor: viewMode === 'cards' ? '#3B82F6' : '#F3F4F6',
              color: viewMode === 'cards' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '4px 8px',
              backgroundColor: viewMode === 'list' ? '#3B82F6' : '#F3F4F6',
              color: viewMode === 'list' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            List
          </button>
        </div>
        
        {viewMode === 'cards' ? (
          <div style={{ display: 'grid', gap: '8px', maxHeight: '400px', overflow: 'auto' }}>
            {topDebtors.map(customer => (
              <div
                key={customer.id}
                style={{
                  padding: '12px',
                  backgroundColor: customer.overdueAmount > 0 ? '#FEE2E2' : '#F9FAFB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  borderLeft: `4px solid ${customer.overdueAmount > 0 ? '#EF4444' : '#3B82F6'}`
                }}
                onClick={() => {
                  const customerInvoices = invoices.filter(inv => 
                    inv.AccountID === customer.id && 
                    inv.Status !== 'Paid' && 
                    inv.Status !== 'Cancelled'
                  );
                  setSelectedInvoice({ customer, invoices: customerInvoices });
                  setIsPanelOpen(true);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                      Customer #{customer.id.substring(0, 8)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>
                      {customer.invoiceCount} invoices
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                      {accounting.formatMoney(customer.totalDue)}
                    </div>
                    {customer.overdueAmount > 0 && (
                      <div style={{ fontSize: '11px', color: '#DC2626' }}>
                        {accounting.formatMoney(customer.overdueAmount)} overdue
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                <th style={{ padding: '4px', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '4px', textAlign: 'center' }}>Invoices</th>
                <th style={{ padding: '4px', textAlign: 'right' }}>Total Due</th>
                <th style={{ padding: '4px', textAlign: 'right' }}>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {topDebtors.map(customer => (
                <tr
                  key={customer.id}
                  style={{ borderBottom: '1px solid #E5E7EB', cursor: 'pointer' }}
                  onClick={() => {
                    const customerInvoices = invoices.filter(inv => 
                      inv.AccountID === customer.id && 
                      inv.Status !== 'Paid' && 
                      inv.Status !== 'Cancelled'
                    );
                    setSelectedInvoice({ customer, invoices: customerInvoices });
                    setIsPanelOpen(true);
                  }}
                >
                  <td style={{ padding: '4px' }}>#{customer.id.substring(0, 8)}</td>
                  <td style={{ padding: '4px', textAlign: 'center' }}>{customer.invoiceCount}</td>
                  <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                    {accounting.formatMoney(customer.totalDue)}
                  </td>
                  <td style={{ padding: '4px', textAlign: 'right', color: customer.overdueAmount > 0 ? '#DC2626' : '#10B981' }}>
                    {accounting.formatMoney(customer.overdueAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  // Sub-component: Action Panel
  const ActionPanel = () => {
    if (!selectedInvoice) return null;
    
    return isPanelOpen && (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-400px',
          top: 0,
          bottom: 0,
          width: '400px',
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
          backgroundColor: selectedInvoice.customer.overdueAmount > 0 ? '#EF4444' : '#3B82F6',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>Customer Details</h3>
              <div style={{ marginTop: '4px', opacity: 0.9, fontSize: '14px' }}>
                {selectedInvoice.invoices.length} outstanding invoices
              </div>
            </div>
            <button
              onClick={() => setIsPanelOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Summary</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Total Due</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {accounting.formatMoney(selectedInvoice.customer.totalDue)}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#FEE2E2', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Overdue</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#DC2626' }}>
                  {accounting.formatMoney(selectedInvoice.customer.overdueAmount)}
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <h4 style={{ margin: '0 0 12px 0' }}>Outstanding Invoices</h4>
            {selectedInvoice.invoices.map(invoice => (
              <div
                key={invoice.ID}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: '#F9FAFB',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onClick={() => callbacks.OpenEntityRecord('Invoices', [{ FieldName: 'ID', Value: invoice.ID }])}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                    {invoice.InvoiceNumber}
                  </span>
                  <span style={{ fontWeight: 'bold' }}>
                    {accounting.formatMoney(invoice.TotalAmount - (invoice.PaidAmount || 0))}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  Due: {new Date(invoice.DueDate).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ marginTop: '20px', display: 'grid', gap: '8px' }}>
            <button
              style={{
                padding: '10px',
                backgroundColor: '#10B981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Send Reminder
            </button>
            <button
              style={{
                padding: '10px',
                backgroundColor: '#F59E0B',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Schedule Call
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading invoice dashboard...</div>
      </div>
    );
  }

  const metrics = calculateMetrics();

  return (
    <div style={{ padding: '20px', backgroundColor: '#F3F4F6', minHeight: '100%' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>
          Invoice Status Dashboard
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Total Outstanding</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {accounting.formatMoney(metrics.totalAmount - metrics.paidAmount)}
            </div>
          </div>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Overdue Amount</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#EF4444' }}>
              {accounting.formatMoney(metrics.overdueAmount)}
            </div>
          </div>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Collection Rate</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
              {((metrics.paidAmount / metrics.totalAmount) * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>DSO</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {metrics.dso.toFixed(0)} days
            </div>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
            <div ref={statusChartRef} />
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
            <div ref={agingChartRef} />
          </div>
        </div>
        
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', marginBottom: '20px', border: '1px solid #E5E7EB' }}>
          <div ref={calendarRef} />
        </div>
        
        <CustomerBalances />
      </div>
      
      <ActionPanel />
    </div>
  );
}