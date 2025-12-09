function InvoiceAgingAnalysis({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
  onBucketClick = null,
  onAccountClick = null,
  onInvoiceClick = null
}) {
  // Pending filter state (user input)
  const [pendingMinOutstanding, setPendingMinOutstanding] = useState(0);
  const [pendingAccountType, setPendingAccountType] = useState(null);
  const [pendingMonthsBack, setPendingMonthsBack] = useState(12);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState(null);
  const [pendingTopN, setPendingTopN] = useState(10);

  // Applied filter state (active filters)
  const [appliedMinOutstanding, setAppliedMinOutstanding] = useState(0);
  const [appliedAccountType, setAppliedAccountType] = useState(null);
  const [appliedMonthsBack, setAppliedMonthsBack] = useState(12);
  const [appliedPaymentMethod, setAppliedPaymentMethod] = useState(null);
  const [appliedTopN, setAppliedTopN] = useState(10);

  // Data state
  const [rawInvoices, setRawInvoices] = useState([]);
  const [agingData, setAgingData] = useState([]);
  const [paymentTrendsData, setPaymentTrendsData] = useState([]);
  const [topAccountsData, setTopAccountsData] = useState([]);

  // Selection state
  const [selectedSegment, setSelectedSegment] = useState(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  // Get components from registry
  const { SimpleChart, EntityDataGrid } = components;

  /**
   * Fill in missing months with zero values and format labels with month + year
   * Ensures chart always shows all months in the requested range, even if no data exists
   */
  const fillMissingMonths = (data, monthsBack) => {
    const result = [];
    const today = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Create map of existing data by year-month
    const dataMap = new Map();
    data.forEach(item => {
      // Query returns Year and Month fields (e.g., Year=2025, Month=1)
      const key = `${item.Year}-${item.Month}`;
      dataMap.set(key, item);
    });

    // Generate all months in range
    for (let i = monthsBack - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // JavaScript months are 0-indexed, query returns 1-indexed
      const key = `${year}-${month}`;
      const monthLabel = `${monthNames[date.getMonth()]} ${year}`;

      if (dataMap.has(key)) {
        // Use existing data but update label to include year
        const existing = dataMap.get(key);
        result.push({
          ...existing,
          MonthName: monthLabel
        });
      } else {
        // Fill missing month with zeros
        result.push({
          Year: year,
          Month: month,
          MonthName: monthLabel,
          PaymentCount: 0,
          TotalPaid: 0,
          AvgPayment: 0,
          AvgDaysToPayment: 0,
          UniqueAccounts: 0
        });
      }
    }

    return result;
  };

  /**
   * ARCHITECTURAL DECISION: Client-Side Aggregation
   *
   * This component follows MemberJunction's best practice pattern:
   * - SQL returns raw data (invoices with DaysOverdue calculated)
   * - JavaScript aggregates into aging buckets
   *
   * Benefits:
   * - Simpler SQL queries that are easier to maintain
   * - Flexible bucket definitions that can change without SQL updates
   * - Raw data available for multiple visualizations
   * - Better performance through in-memory aggregation
   * - Business logic stays in JavaScript where it's more testable
   */
  const aggregateIntoAgingBuckets = (invoices) => {
    const buckets = {};

    // Group invoices by aging period
    invoices.forEach(inv => {
      const bucket =
        inv.DaysOverdue < 0 ? 'Not Yet Due' :
        inv.DaysOverdue < 30 ? '0-30 days' :
        inv.DaysOverdue < 60 ? '30-60 days' :
        inv.DaysOverdue < 90 ? '60-90 days' : '90+ days';

      if (!buckets[bucket]) {
        buckets[bucket] = { invoices: [], totalOutstanding: 0, totalDaysOverdue: 0 };
      }
      buckets[bucket].invoices.push(inv);
      buckets[bucket].totalOutstanding += inv.BalanceDue;
      buckets[bucket].totalDaysOverdue += inv.DaysOverdue;
    });

    // Convert to array format for chart
    return Object.entries(buckets).map(([bucket, data]) => ({
      AgeBucket: bucket,
      InvoiceCount: data.invoices.length,
      TotalOutstanding: data.totalOutstanding,
      AvgDaysOverdue: Math.round(data.totalDaysOverdue / data.invoices.length),
      AvgOutstanding: data.totalOutstanding / data.invoices.length
    })).sort((a, b) => {
      // Sort by aging progression (Not Yet Due → 0-30 → 30-60 → 60-90 → 90+)
      const order = {'Not Yet Due': 0, '0-30 days': 1, '30-60 days': 2, '60-90 days': 3, '90+ days': 4};
      return order[a.AgeBucket] - order[b.AgeBucket];
    });
  };

  // Load initial 3 queries when applied filters change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setErrors({});

      // Clear selections when filters change
      setSelectedSegment(null);

      try {
        // Execute first 3 queries in parallel
        const [invoicesResult, trendsResult, topAccountsResult] = await Promise.all([
          utilities.rq.RunQuery({
            QueryName: 'Outstanding Invoices',
            CategoryPath: 'Demo',
            Parameters: {
              MinOutstanding: appliedMinOutstanding,
              AccountType: appliedAccountType
            }
          }),
          utilities.rq.RunQuery({
            QueryName: 'Payment Trends',
            CategoryPath: 'Demo',
            Parameters: {
              MonthsBack: appliedMonthsBack,
              PaymentMethod: appliedPaymentMethod,
              AccountType: appliedAccountType
            }
          }),
          utilities.rq.RunQuery({
            QueryName: 'Top Accounts by Outstanding',
            CategoryPath: 'Demo',
            Parameters: {
              TopN: appliedTopN,
              MinOutstanding: appliedMinOutstanding,
              AccountType: appliedAccountType
            }
          })
        ]);

        // Process outstanding invoices result and aggregate into aging buckets
        if (invoicesResult && invoicesResult.Success && invoicesResult.Results) {
          const rawData = invoicesResult.Results;
          setRawInvoices(rawData);

          // Aggregate raw invoices into aging buckets client-side
          const aggregatedData = aggregateIntoAgingBuckets(rawData);
          setAgingData(aggregatedData);
        } else {
          setErrors(prev => ({ ...prev, aging: invoicesResult?.ErrorMessage || 'Failed to load invoice data' }));
        }

        // Process payment trends result
        if (trendsResult && trendsResult.Success && trendsResult.Results) {
          // Fill in missing months and add year to labels
          const filledData = fillMissingMonths(trendsResult.Results, appliedMonthsBack);
          setPaymentTrendsData(filledData);
        } else {
          setErrors(prev => ({ ...prev, trends: trendsResult?.ErrorMessage || 'Failed to load payment trends' }));
        }

        // Process top accounts result
        if (topAccountsResult && topAccountsResult.Success && topAccountsResult.Results) {
          setTopAccountsData(topAccountsResult.Results);
        } else {
          setErrors(prev => ({ ...prev, topAccounts: topAccountsResult?.ErrorMessage || 'Failed to load top accounts' }));
        }
      } catch (err) {
        console.error('Error loading invoice aging data:', err);
        setErrors({ general: err.message || 'An unexpected error occurred' });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [appliedMinOutstanding, appliedAccountType, appliedMonthsBack, appliedPaymentMethod, appliedTopN, utilities]);

  // Apply filters
  const handleApplyFilters = () => {
    setAppliedMinOutstanding(pendingMinOutstanding);
    setAppliedAccountType(pendingAccountType);
    setAppliedMonthsBack(pendingMonthsBack);
    setAppliedPaymentMethod(pendingPaymentMethod);
    setAppliedTopN(pendingTopN);
  };

  // Clear filters
  const handleClearFilters = () => {
    setPendingMinOutstanding(0);
    setPendingAccountType(null);
    setPendingMonthsBack(12);
    setPendingPaymentMethod(null);
    setPendingTopN(10);
    setAppliedMinOutstanding(0);
    setAppliedAccountType(null);
    setAppliedMonthsBack(12);
    setAppliedPaymentMethod(null);
    setAppliedTopN(10);
  };

  // Handle aging bucket click
  const handleBucketClick = (clickData) => {
    console.log('Bucket clicked:', clickData);

    // Set selected segment
    setSelectedSegment(clickData);

    // Fire external event if provided
    if (onBucketClick) {
      onBucketClick({
        bucket: clickData.label,
        invoiceCount: clickData.records?.length || 0,
        totalOutstanding: clickData.value
      });
    }
  };

  // Account row click removed - EntityDataGrid default behavior opens account detail page

  // Handle invoice row click in payment history grid
  const handleInvoiceClick = (event) => {
    if (onInvoiceClick) {
      onInvoiceClick({
        invoiceId: event.record?.ID,
        invoiceNumber: event.record?.InvoiceNumber,
        totalAmount: event.record?.TotalAmount,
        balanceDue: event.record?.BalanceDue,
        status: event.record?.Status
      });
    }
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedSegment(null);
  };

  // Build filter for invoices in selected bucket
  // NOTE: DaysOverdue is calculated in the query but not stored in the view
  // So we convert aging bucket ranges to date-based filters using DueDate
  const buildInvoiceFilter = () => {
    const filters = [];

    // Add aging bucket filter based on selected segment
    if (selectedSegment) {
      const bucket = selectedSegment.label;
      // Map bucket name to date-based filters (DaysOverdue = DATEDIFF(day, DueDate, GETDATE()))
      if (bucket === 'Not Yet Due') {
        filters.push(`DueDate > GETDATE()`);
      } else if (bucket === '0-30 days') {
        filters.push(`DueDate BETWEEN DATEADD(day, -30, GETDATE()) AND GETDATE()`);
      } else if (bucket === '30-60 days') {
        filters.push(`DueDate BETWEEN DATEADD(day, -60, GETDATE()) AND DATEADD(day, -30, GETDATE())`);
      } else if (bucket === '60-90 days') {
        filters.push(`DueDate BETWEEN DATEADD(day, -90, GETDATE()) AND DATEADD(day, -60, GETDATE())`);
      } else if (bucket === '90+ days') {
        filters.push(`DueDate < DATEADD(day, -90, GETDATE())`);
      }
    }

    // Add outstanding invoice base filter
    filters.push(`Status NOT IN ('Paid', 'Cancelled')`);
    filters.push(`BalanceDue > 0`);

    // Add account type filter for consistency
    if (appliedAccountType) {
      filters.push(`AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType='${appliedAccountType}')`);
    }

    // Add minimum outstanding filter
    if (appliedMinOutstanding > 0) {
      filters.push(`BalanceDue >= ${appliedMinOutstanding}`);
    }

    return filters.length > 0 ? filters.join(' AND ') : undefined;
  };

  // Payment history filter removed - no longer using account drill-down

  // Loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div>Loading invoice aging data...</div>
      </div>
    );
  }

  // General error state
  if (errors.general) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Error Loading Data</div>
        <div style={{ marginTop: '8px' }}>{errors.general}</div>
      </div>
    );
  }

  // Check if all queries failed
  const allFailed = errors.aging && errors.trends && errors.topAccounts;
  if (allFailed) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Error Loading Data</div>
        <div style={{ marginTop: '8px' }}>All data queries failed to load</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', width: '100%', minWidth: '800px', boxSizing: 'border-box' }}>
      <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: 'bold' }}>
        Invoice Aging Analysis
      </h2>

      {/* Filter Panel - ALWAYS VISIBLE */}
      <div style={{
        marginBottom: '16px',
        padding: '16px',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>Filters:</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Min Outstanding
            </label>
            <input
              type="number"
              value={pendingMinOutstanding}
              onChange={(e) => setPendingMinOutstanding(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Account Type
            </label>
            <select
              value={pendingAccountType || ''}
              onChange={(e) => setPendingAccountType(e.target.value || null)}
              style={{
                width: '100%',
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="">All Types</option>
              <option value="Customer">Customer</option>
              <option value="Prospect">Prospect</option>
              <option value="Partner">Partner</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Months Back (Trends)
            </label>
            <input
              type="number"
              value={pendingMonthsBack}
              onChange={(e) => setPendingMonthsBack(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Payment Method
            </label>
            <select
              value={pendingPaymentMethod || ''}
              onChange={(e) => setPendingPaymentMethod(e.target.value || null)}
              style={{
                width: '100%',
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="">All Methods</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Check">Check</option>
              <option value="Wire Transfer">Wire Transfer</option>
              <option value="ACH">ACH</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              Top N Accounts
            </label>
            <input
              type="number"
              value={pendingTopN}
              onChange={(e) => setPendingTopN(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleApplyFilters}
            style={{
              padding: '6px 16px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Apply Filters
          </button>
          {(appliedMinOutstanding > 0 || appliedAccountType || appliedMonthsBack !== 12 || appliedPaymentMethod || appliedTopN !== 10) && (
            <button
              onClick={handleClearFilters}
              style={{
                padding: '6px 12px',
                backgroundColor: '#ff4d4f',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Aging Buckets Chart */}
      {!errors.aging && agingData.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
            Invoice Aging by Period
          </h3>
          <SimpleChart
            entityName="Invoices"
            data={agingData}
            chartType="bar"
            groupBy="AgeBucket"
            valueField="TotalOutstanding"
            aggregateMethod="sum"
            onDataPointClick={handleBucketClick}
            title=""
            showLegend={false}
            height="300px"
            utilities={utilities}
            styles={styles}
            components={components}
          />
        </div>
      )}
      {errors.aging && (
        <div style={{
          marginBottom: '32px',
          padding: '16px',
          backgroundColor: '#fff2e8',
          border: '1px solid #ffbb96',
          borderRadius: '4px',
          color: '#d4380d'
        }}>
          Aging Analysis Error: {errors.aging}
        </div>
      )}

      {/* Payment Trends Chart */}
      {!errors.trends && paymentTrendsData.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
            Payment Trends (Last {appliedMonthsBack} Months)
          </h3>
          <SimpleChart
            entityName="Payments"
            data={paymentTrendsData}
            chartType="line"
            groupBy="MonthName"
            valueField="TotalPaid"
            aggregateMethod="sum"
            sortBy={undefined}
            title=""
            showLegend={false}
            height="300px"
            utilities={utilities}
            styles={styles}
            components={components}
          />
        </div>
      )}
      {errors.trends && (
        <div style={{
          marginBottom: '32px',
          padding: '16px',
          backgroundColor: '#fff2e8',
          border: '1px solid #ffbb96',
          borderRadius: '4px',
          color: '#d4380d'
        }}>
          Payment Trends Error: {errors.trends}
        </div>
      )}

      {/* Top Accounts Grid */}
      {!errors.topAccounts && topAccountsData.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
            Top {appliedTopN} Accounts by Outstanding Balance
          </h3>
          <EntityDataGrid
            entityName="Accounts"
            extraFilter={appliedAccountType ? `AccountType='${appliedAccountType}'` : undefined}
            fields={['Name', 'AccountType', 'Status']}
            orderBy="Name ASC"
            pageSize={appliedTopN}
            maxCachedRows={appliedTopN * 2}
            enablePageCache={true}
            showPageSizeChanger={true}
            enableSorting={true}
            enableFiltering={true}
            showRefreshButton={true}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
          />
        </div>
      )}
      {errors.topAccounts && (
        <div style={{
          marginBottom: '32px',
          padding: '16px',
          backgroundColor: '#fff2e8',
          border: '1px solid #ffbb96',
          borderRadius: '4px',
          color: '#d4380d'
        }}>
          Top Accounts Error: {errors.topAccounts}
        </div>
      )}

      {/* Invoice Drill-Down Section - Shows invoices in selected aging bucket */}
      {selectedSegment && (
        <div style={{ marginTop: '32px' }}>
          {/* Header with clear selection button */}
          <div style={{
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#e6f7ff',
            borderRadius: '4px',
            border: '1px solid #91d5ff'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0050b3' }}>
              Invoices in {selectedSegment.label} Bucket
            </div>
            <button
              onClick={handleClearSelection}
              style={{
                padding: '6px 16px',
                backgroundColor: '#1890ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Clear Selection
            </button>
          </div>

          {/* EntityDataGrid for invoices */}
          <EntityDataGrid
            entityName="Invoices"
            extraFilter={buildInvoiceFilter()}
            fields={['InvoiceNumber', 'InvoiceDate', 'DueDate', 'Account', 'TotalAmount', 'AmountPaid', 'BalanceDue', 'Status']}
            orderBy="DueDate ASC"
            pageSize={20}
            maxCachedRows={100}
            enablePageCache={true}
            showPageSizeChanger={true}
            enableSorting={true}
            enableFiltering={true}
            showRefreshButton={true}
            onRowClick={handleInvoiceClick}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
          />
        </div>
      )}

      {/* NOTE: Payment History drill-down removed because EntityDataGrid's default row click
          behavior opens the entity record detail page, causing navigation conflicts.
          Users can click accounts in the Top Accounts grid to view account details directly. */}
    </div>
  );
}
