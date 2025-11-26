function ProductRevenueByCategory({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
  year,
  onCategorySelected
}) {
  const { SimpleDrilldownChart } = components;
  const [lineItemData, setLineItemData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selectedProduct, setSelectedProduct] = React.useState(null);

  const selectedYear = year || new Date().getFullYear();

  React.useEffect(() => {
    const loadLineItems = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load invoice line items - group by Product since Category isn't in the view
        const result = await utilities.rv.RunView({
          EntityName: 'Invoice Line Items',
          ExtraFilter: ''
        });

        if (!result.Success) {
          setError(result.ErrorMessage || 'Failed to load line items');
          setLineItemData([]);
          return;
        }

        // Process line items - use Product field (denormalized product name)
        const processedItems = (result.Results || []).map(item => ({
          ...item,
          // Ensure we have product name, default if missing
          ProductName: item.Product || 'Unknown Product',
          // Add computed fields for display
          QuantityFormatted: item.Quantity ? item.Quantity.toFixed(2) : '0',
          UnitPriceFormatted: item.UnitPrice != null
            ? `$${item.UnitPrice.toFixed(2)}`
            : 'N/A',
          TotalPriceFormatted: item.TotalPrice != null
            ? `$${item.TotalPrice.toFixed(2)}`
            : 'N/A',
          DiscountFormatted: item.Discount != null
            ? `${item.Discount.toFixed(1)}%`
            : '0%'
        }));

        setLineItemData(processedItems);
      } catch (err) {
        console.error('Error loading line items:', err);
        setError(err.message || 'Unknown error occurred');
        setLineItemData([]);
      } finally {
        setLoading(false);
      }
    };

    loadLineItems();
  }, [selectedYear, utilities?.refresh]);

  // Handle product segment click
  const handleDataPointClick = (clickData) => {
    const productName = clickData.label;
    const productRevenue = clickData.value;
    const productItems = clickData.records || [];

    setSelectedProduct({
      product: productName,
      revenue: productRevenue,
      itemCount: productItems.length
    });

    // Fire external callback if provided
    if (onCategorySelected) {
      onCategorySelected({
        category: productName,
        revenue: productRevenue,
        itemCount: productItems.length
      });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>
          Loading product revenue data...
        </div>
        <div style={{ fontSize: '14px', color: '#999' }}>
          Analyzing sales by product
        </div>
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
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
          Error Loading Data
        </div>
        <div>{error}</div>
      </div>
    );
  }

  if (lineItemData.length === 0) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        backgroundColor: '#fafafa',
        border: '1px solid #d9d9d9',
        borderRadius: '4px',
        color: '#666'
      }}>
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>
          No sales data found
        </div>
        <div style={{ fontSize: '14px', color: '#999' }}>
          No invoice line items in the system
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Show selected product info */}
      {selectedProduct && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '16px',
          backgroundColor: '#e6f7ff',
          border: '1px solid #91d5ff',
          borderRadius: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong style={{ color: '#0050b3' }}>
              {selectedProduct.product}
            </strong>
            <span style={{ marginLeft: '16px', color: '#666' }}>
              {selectedProduct.itemCount} items • ${selectedProduct.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} revenue
            </span>
          </div>
          <button
            onClick={() => setSelectedProduct(null)}
            style={{
              padding: '4px 12px',
              backgroundColor: 'white',
              border: '1px solid #91d5ff',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#0050b3'
            }}
          >
            Clear
          </button>
        </div>
      )}

      <SimpleDrilldownChart
        entityName="Invoice Line Items"
        data={lineItemData}
        groupBy="ProductName"
        valueField="TotalPrice"
        aggregateMethod="sum"
        chartType="pie"
        title="Product Revenue by Product"
        gridFields={[
          'Product',
          'Description',
          'QuantityFormatted',
          'UnitPriceFormatted',
          'DiscountFormatted',
          'TotalPriceFormatted'
        ]}
        entityPrimaryKeys={['ID']}
        showDrilldown={true}
        drilldownHeight={450}
        showSingleRecordView={false}
        onDataPointClick={handleDataPointClick}
        utilities={utilities}
        styles={styles}
        components={components}
        callbacks={callbacks}
        savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
      />
    </div>
  );
}
