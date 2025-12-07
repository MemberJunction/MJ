function TopProductsRanking({
  utilities,
  styles,
  components,
  callbacks,
  topN = 10,
  category = null,
  startDate = null,
  endDate = null
}) {
  // State management
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Get DataGrid component from registry
  const { DataGrid } = components;

  // Load data on mount or when parameters change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      setSelectedProduct(null);
      setDetailData(null);

      try {
        // Execute the query with all supported parameters
        const result = await utilities.rq.RunQuery({
          QueryName: 'Top Products Ranking',
          CategoryPath: 'Demo',
          Parameters: {
            TopN: topN,
            Category: category,
            StartDate: startDate,
            EndDate: endDate
          }
        });

        if (result && result.Success && result.Results) {
          setData(result.Results);
        } else {
          setError(result?.ErrorMessage || 'Failed to load data');
        }
      } catch (err) {
        console.error('Error loading top products ranking:', err);
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [topN, category, startDate, endDate, utilities]);

  // Handle product click for drill-down
  const handleProductClick = async (product) => {
    if (!product || !product.ProductID) {
      console.warn('Invalid product data for drill-down:', product);
      return;
    }

    setSelectedProduct(product);
    setDetailLoading(true);
    setDetailError(null);

    try {
      // Load invoice line items for this product using RunView
      const detailResult = await utilities.rv.RunView({
        EntityName: 'Invoice Line Items',
        ExtraFilter: `ProductID='${product.ProductID}'`,
        OrderBy: 'InvoiceDate DESC',
        MaxRows: 100
      });

      if (detailResult && detailResult.Success) {
        setDetailData(detailResult.Results || []);
      } else {
        setDetailError(detailResult?.ErrorMessage || 'Failed to load product details');
      }
    } catch (err) {
      console.error('Error loading product details:', err);
      setDetailError(err.message || 'An unexpected error occurred');
    } finally {
      setDetailLoading(false);
    }
  };

  // Handle back to ranking view
  const handleBackToRanking = () => {
    setSelectedProduct(null);
    setDetailData(null);
    setDetailError(null);
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div>Loading product rankings...</div>
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
          No products found matching the specified criteria
        </div>
      </div>
    );
  }

  // Show detail view when product is selected
  if (selectedProduct) {
    return (
      <div style={{ padding: '16px' }}>
        {/* Header with back button */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid #e8e8e8'
        }}>
          <button
            onClick={handleBackToRanking}
            style={{
              padding: '8px 16px',
              marginRight: '16px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ← Back to Rankings
          </button>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {selectedProduct.ProductName}
            </div>
            <div style={{ fontSize: '14px', color: '#8c8c8c' }}>
              Category: {selectedProduct.Category || 'N/A'}
            </div>
          </div>
        </div>

        {/* Product summary metrics */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px'
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
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1890ff' }}>
              ${(selectedProduct.TotalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
              Total Quantity
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#52c41a' }}>
              {(selectedProduct.TotalQuantity || 0).toLocaleString()}
            </div>
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
              Invoice Count
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fa8c16' }}>
              {selectedProduct.InvoiceCount || 0}
            </div>
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
              Average Price
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#722ed1' }}>
              ${(selectedProduct.AvgPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Detail loading state */}
        {detailLoading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div>Loading invoice line items...</div>
          </div>
        )}

        {/* Detail error state */}
        {detailError && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Error Loading Details</div>
            <div style={{ marginTop: '8px' }}>{detailError}</div>
          </div>
        )}

        {/* Detail data grid */}
        {!detailLoading && !detailError && detailData && (
          <div>
            <div style={{
              fontSize: '16px',
              fontWeight: 'bold',
              marginBottom: '12px'
            }}>
              Invoice Line Items ({detailData.length} records)
            </div>
            <DataGrid
              data={detailData}
              columns={[
                { field: 'InvoiceDate', header: 'Invoice Date', sortable: true },
                { field: 'InvoiceName', header: 'Invoice Name', sortable: true },
                {
                  field: 'Quantity',
                  header: 'Quantity',
                  sortable: true,
                  render: (value) => {
                    return value != null ? Number(value).toLocaleString() : '0';
                  }
                },
                {
                  field: 'UnitPrice',
                  header: 'Unit Price',
                  sortable: true,
                  render: (value) => {
                    return value != null ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
                  }
                },
                {
                  field: 'Total',
                  header: 'Total',
                  sortable: true,
                  render: (value) => {
                    return value != null ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
                  }
                },
                { field: 'AccountName', header: 'Account Name', sortable: true }
              ]}
              sorting={true}
              paging={true}
              pageSize={20}
              utilities={utilities}
              styles={styles}
              components={components}
            />
          </div>
        )}
      </div>
    );
  }

  // Main ranking view
  return (
    <div style={{ padding: '16px', width: '100%', minWidth: '800px', boxSizing: 'border-box' }}>
      <div style={{
        fontSize: '18px',
        fontWeight: 'bold',
        marginBottom: '16px'
      }}>
        Top {topN} Products by Revenue
        {category && ` - ${category}`}
      </div>

      <DataGrid
        data={data}
        columns={[
          { field: 'ProductName', header: 'Product Name', sortable: true },
          { field: 'Category', header: 'Category', sortable: true },
          {
            field: 'TotalRevenue',
            header: 'Total Revenue',
            sortable: true,
            render: (value) => {
              return value != null ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
            }
          },
          {
            field: 'TotalQuantity',
            header: 'Total Quantity',
            sortable: true,
            render: (value) => {
              return value != null ? Number(value).toLocaleString() : '0';
            }
          },
          {
            field: 'InvoiceCount',
            header: 'Invoice Count',
            sortable: true,
            render: (value) => {
              return value != null ? Number(value).toLocaleString() : '0';
            }
          },
          {
            field: 'AvgPrice',
            header: 'Avg Price',
            sortable: true,
            render: (value) => {
              return value != null ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
            }
          }
        ]}
        onRowClick={handleProductClick}
        sorting={true}
        paging={true}
        pageSize={20}
        showPageSizeChanger={true}
        filtering={true}
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
            Total Units Sold
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
            {data.reduce((sum, row) => sum + (row.TotalQuantity || 0), 0).toLocaleString()}
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
            Average Price
          </div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#722ed1' }}>
            ${(data.reduce((sum, row) => sum + (row.AvgPrice || 0), 0) / data.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}
