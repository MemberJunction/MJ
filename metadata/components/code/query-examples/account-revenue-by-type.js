function AccountRevenueByType({
  utilities,
  styles,
  components,
  callbacks,
  accountType = null,
  startDate = null,
  endDate = null,
  chartType = 'bar',
  title = 'Account Revenue by Type',
  onSegmentClick = null,
  onRecordClick = null
}) {
  // State management
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);

  // Internal filter state (only used when external props are null)
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [pendingEndDate, setPendingEndDate] = useState(null);
  const [appliedStartDate, setAppliedStartDate] = useState(null);
  const [appliedEndDate, setAppliedEndDate] = useState(null);

  // Determine effective filter values
  const effectiveStartDate = startDate || appliedStartDate;
  const effectiveEndDate = endDate || appliedEndDate;
  const showDateFilters = startDate === null && endDate === null;

  // Get components from registry
  const { SimpleChart, EntityDataGrid } = components;

  // Load data on mount or when parameters change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Execute the query with all supported parameters (using effective dates)
        const result = await utilities.rq.RunQuery({
          QueryName: 'Account Revenue by Type',
          CategoryPath: 'Demo',
          Parameters: {
            AccountType: accountType,
            StartDate: effectiveStartDate,
            EndDate: effectiveEndDate
          }
        });

        if (result && result.Success && result.Results) {
          setData(result.Results);
        } else {
          setError(result?.ErrorMessage || 'Failed to load data');
        }
      } catch (err) {
        console.error('Error loading account revenue by type:', err);
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [accountType, effectiveStartDate, effectiveEndDate, utilities]);

  // Apply date filters
  const handleApplyFilters = () => {
    setAppliedStartDate(pendingStartDate);
    setAppliedEndDate(pendingEndDate);
  };

  // Clear date filters
  const handleClearDates = () => {
    setPendingStartDate(null);
    setPendingEndDate(null);
    setAppliedStartDate(null);
    setAppliedEndDate(null);
  };

  // Handle chart segment click - SimpleChart passes clickData with label, value, records array
  const handleChartClick = (clickData) => {
    console.log('Chart clicked:', clickData);

    // Set selected segment (using the full clickData structure from SimpleChart)
    setSelectedSegment(clickData);

    // Fire external event if provided
    if (onSegmentClick) {
      onSegmentClick({
        accountType: clickData.label,
        value: clickData.value,
        recordCount: clickData.records?.length || 0
      });
    }
  };

  // Handle EntityDataGrid row click
  const handleRecordClick = (event) => {
    if (onRecordClick) {
      onRecordClick({
        invoiceId: event.record?.ID,
        invoiceNumber: event.record?.InvoiceNumber,
        accountName: event.record?.AccountName,
        totalAmount: event.record?.TotalAmount,
        status: event.record?.Status
      });
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedSegment(null);
  };

  // Build EntityDataGrid extraFilter with correct column name and date filters
  const buildEntityFilter = () => {
    const filters = [];

    // Filter by selected account type (using correct column name: AccountType)
    if (selectedSegment) {
      filters.push(`AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType='${selectedSegment.label}')`);
    }

    // Add date filters for consistency with chart
    if (effectiveStartDate) {
      filters.push(`InvoiceDate >= '${effectiveStartDate}'`);
    }
    if (effectiveEndDate) {
      filters.push(`InvoiceDate <= '${effectiveEndDate}'`);
    }

    return filters.length > 0 ? filters.join(' AND ') : undefined;
  };

  // Render component - keep filters visible at all times
  return (
    <div style={{ padding: '16px', width: '100%', minWidth: '800px', boxSizing: 'border-box' }}>
      {/* Date filter controls (only shown when dates not provided externally) - ALWAYS VISIBLE */}
      {showDateFilters && (
        <div style={{
          marginBottom: '16px',
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ fontWeight: 'bold' }}>Date Filters:</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '14px' }}>Start Date:</label>
            <input
              type="date"
              value={pendingStartDate || ''}
              onChange={(e) => setPendingStartDate(e.target.value || null)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '14px' }}>End Date:</label>
            <input
              type="date"
              value={pendingEndDate || ''}
              onChange={(e) => setPendingEndDate(e.target.value || null)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <button
            onClick={handleApplyFilters}
            disabled={!pendingStartDate || !pendingEndDate}
            style={{
              padding: '6px 16px',
              backgroundColor: (!pendingStartDate || !pendingEndDate) ? '#d9d9d9' : '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!pendingStartDate || !pendingEndDate) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Apply Filters
          </button>
          {(appliedStartDate || appliedEndDate) && (
            <button
              onClick={handleClearDates}
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
              Clear Dates
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading account revenue data...</div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Error Loading Data</div>
          <div style={{ marginTop: '8px' }}>{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && (!data || data.length === 0) && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
          <div style={{ fontSize: '16px' }}>No Data Available</div>
          <div style={{ marginTop: '8px' }}>
            No revenue data found matching the specified criteria
          </div>
        </div>
      )}

      {/* Revenue chart - always show when data is loaded */}
      {!loading && !error && data && data.length > 0 && (
        <div>
          <SimpleChart
            entityName="Accounts"
            data={data}
            chartType={chartType}
            groupBy="AccountType"
            valueField="TotalRevenue"
            aggregateMethod="sum"
            title={title}
            showLegend={true}
            onDataPointClick={handleChartClick}
            utilities={utilities}
            styles={styles}
            components={components}
          />

          {/* Summary Statistics */}
          <div style={{
            marginTop: '24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Total Revenue
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                ${data.reduce((sum, row) => sum + (row.TotalRevenue || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Total Accounts
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                {data.reduce((sum, row) => sum + (row.AccountCount || 0), 0).toLocaleString()}
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Total Invoices
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fa8c16' }}>
                {data.reduce((sum, row) => sum + (row.InvoiceCount || 0), 0).toLocaleString()}
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Average Invoice
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#722ed1' }}>
                ${(data.reduce((sum, row) => sum + (row.AvgInvoice || 0), 0) / data.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down section when segment is selected - renders BELOW chart */}
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
              Invoices for {selectedSegment.label} Accounts
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

          {/* EntityDataGrid */}
          <EntityDataGrid
            entityName="Invoices"
            extraFilter={buildEntityFilter()}
            fields={['InvoiceNumber', 'InvoiceDate', 'AccountName', 'TotalAmount', 'Status', 'AmountPaid', 'BalanceDue']}
            orderBy="InvoiceDate DESC"
            pageSize={20}
            maxCachedRows={100}
            enablePageCache={true}
            showPageSizeChanger={true}
            enableSorting={true}
            enableFiltering={true}
            showRefreshButton={true}
            onRowClick={handleRecordClick}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
          />
        </div>
      )}
    </div>
  );
}
