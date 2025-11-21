function MonthlyInvoiceRevenueChart({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
  year
}) {
  const { SimpleDrilldownChart } = components;
  const [invoiceData, setInvoiceData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const selectedYear = year || new Date().getFullYear();

  React.useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await utilities.rv.RunView({
          EntityName: 'Invoices',
          ExtraFilter: `YEAR(InvoiceDate) = ${selectedYear}`
        });

        if (!result.Success) {
          setError(result.ErrorMessage || 'Failed to load invoices');
          setInvoiceData([]);
          return;
        }

        // Add computed Month fields to each invoice for grouping
        const invoicesWithMonth = (result.Results || []).map(invoice => {
          const invoiceDate = new Date(invoice.InvoiceDate);
          return {
            ...invoice,
            Month: invoiceDate.getMonth() + 1, // 1-12
            MonthName: invoiceDate.toLocaleString('default', { month: 'short' }),
            MonthYear: `${invoiceDate.toLocaleString('default', { month: 'short' })} ${invoiceDate.getFullYear()}`
          };
        });

        setInvoiceData(invoicesWithMonth);
      } catch (err) {
        console.error('Error loading invoices:', err);
        setError(err.message || 'Unknown error occurred');
        setInvoiceData([]);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [selectedYear, utilities?.refresh]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        Loading invoice data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#fff2f0',
        border: '1px solid #ffccc7',
        borderRadius: '4px',
        color: '#cf1322'
      }}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (invoiceData.length === 0) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        backgroundColor: '#fafafa',
        border: '1px solid #d9d9d9',
        borderRadius: '4px',
        color: '#666'
      }}>
        No invoices found for {selectedYear}
      </div>
    );
  }

  return (
    <SimpleDrilldownChart
      entityName="Invoices"
      data={invoiceData}
      groupBy="Month"
      valueField="TotalAmount"
      aggregateMethod="sum"
      chartType="bar"
      title={`Monthly Invoice Revenue - ${selectedYear}`}
      gridFields={[
        'InvoiceNumber',
        'InvoiceDate',
        'Account',
        'Status',
        'TotalAmount',
        'BalanceDue'
      ]}
      entityPrimaryKeys={['ID']}
      showDrilldown={true}
      drilldownHeight={400}
      showSingleRecordView={false}
      utilities={utilities}
      styles={styles}
      components={components}
      callbacks={callbacks}
      savedUserSettings={savedUserSettings}
      onSaveUserSettings={onSaveUserSettings}
    />
  );
}
