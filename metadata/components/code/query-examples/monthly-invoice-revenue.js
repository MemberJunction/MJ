function MonthlyInvoiceRevenue({
  utilities,
  styles,
  components,
  year = null,
  month = null,
  statusList = null,
  startDate = null,
  endDate = null,
  chartType = 'bar',
  title = 'Monthly Invoice Revenue'
}) {
  // State management
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get SimpleChart component from registry
  const { SimpleChart } = components;

  // Load data on mount or when parameters change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Execute the query with all supported parameters
        const result = await utilities.rq.RunQuery({
          QueryName: 'Monthly Invoice Revenue',
          CategoryPath: 'Demo',
          Parameters: {
            Year: year,
            Month: month,
            StatusList: statusList,
            StartDate: startDate,
            EndDate: endDate
          }
        });

        if (result && result.Success && result.Results) {
          // Transform data to add combined date label for x-axis
          const transformedData = result.Results.map(row => ({
            ...row,
            DateLabel: `${row.MonthName} ${row.Year}${row.Status ? ` (${row.Status})` : ''}`
          }));

          setData(transformedData);
        } else {
          setError(result?.ErrorMessage || 'Failed to load data');
        }
      } catch (err) {
        console.error('Error loading monthly invoice revenue:', err);
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [year, month, statusList, startDate, endDate, utilities]);

  // Loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div>Loading monthly revenue data...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Error Loading Data</div>
        <div style={{ marginTop: '8px' }}>{error}</div>
      </div>
    );
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
        <div style={{ fontSize: '16px' }}>No Data Available</div>
        <div style={{ marginTop: '8px' }}>
          No invoices found matching the specified criteria
        </div>
      </div>
    );
  }

  // Render chart
  return (
    <div style={{ padding: '16px' }}>
      <SimpleChart
        entityName="Invoices"
        data={data}
        chartType={chartType}
        groupBy="DateLabel"
        valueField="TotalRevenue"
        title={title}
        showLegend={false}
        utilities={utilities}
        styles={styles}
        components={components}
      />

      {/* Summary Statistics */}
      <div style={{
        marginTop: '24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
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
            Total Invoices
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
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
            Total Outstanding
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fa8c16' }}>
            ${data.reduce((sum, row) => sum + (row.TotalOutstanding || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
  );
}
