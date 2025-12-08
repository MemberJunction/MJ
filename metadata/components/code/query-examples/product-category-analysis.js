function ProductCategoryAnalysis({
  utilities,
  styles,
  components,
  callbacks,
  category = null,
  startDate = null,
  endDate = null,
  topN = 5,
  title = 'Product Category Analysis',
  onCategoryClick = null,
  onProductClick = null,
  onRecordClick = null
}) {
  // State management
  const [categoryData, setCategoryData] = useState(null);
  const [productData, setProductData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

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

  // Load category data on mount or when parameters change
  useEffect(() => {
    const loadCategoryData = async () => {
      setLoading(true);
      setError(null);
      setSelectedSegment(null);
      setProductData(null);

      try {
        // Execute the category totals query (using effective dates)
        const result = await utilities.rq.RunQuery({
          QueryName: 'Category Totals',
          CategoryPath: 'Demo',
          Parameters: {
            Category: category,
            StartDate: effectiveStartDate,
            EndDate: effectiveEndDate
          }
        });

        if (result && result.Success && result.Results) {
          setCategoryData(result.Results);
        } else {
          setError(result?.ErrorMessage || 'Failed to load category data');
        }
      } catch (err) {
        console.error('Error loading category data:', err);
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    loadCategoryData();
  }, [category, effectiveStartDate, effectiveEndDate, utilities]);

  // Load top products when category is selected
  const handleCategoryClick = async (clickData) => {
    console.log('Category clicked:', clickData);

    // Set selected segment (using the full clickData structure from SimpleChart)
    setSelectedSegment(clickData);
    setSelectedProduct(null);
    setLoadingProducts(true);

    try {
      // Execute the category top products query (conditional) - using effective dates
      const result = await utilities.rq.RunQuery({
        QueryName: 'Category Top Products',
        CategoryPath: 'Demo',
        Parameters: {
          TopN: topN,
          Category: clickData.label,
          StartDate: effectiveStartDate,
          EndDate: effectiveEndDate
        }
      });

      if (result && result.Success && result.Results) {
        setProductData(result.Results);
      } else {
        console.error('Failed to load product data:', result?.ErrorMessage);
        setProductData([]);
      }
    } catch (err) {
      console.error('Error loading product data:', err);
      setProductData([]);
    } finally {
      setLoadingProducts(false);
    }

    // Fire external event if provided
    if (onCategoryClick) {
      onCategoryClick({
        category: clickData.label,
        value: clickData.value,
        recordCount: clickData.records?.length || 0
      });
    }
  };

  // Handle product selection for secondary drill-down
  const handleProductClick = (product) => {
    setSelectedProduct(product.ProductName);

    // Fire external event if provided
    if (onProductClick) {
      onProductClick({
        productName: product.ProductName,
        category: selectedSegment?.label,
        totalRevenue: product.TotalRevenue,
        totalQuantity: product.TotalQuantity
      });
    }
  };

  // Handle EntityDataGrid row click
  const handleRecordClick = (event) => {
    if (onRecordClick) {
      onRecordClick({
        lineItemId: event.record?.ID,
        product: event.record?.Product,
        quantity: event.record?.Quantity,
        unitPrice: event.record?.UnitPrice,
        totalPrice: event.record?.TotalPrice,
        description: event.record?.Description
      });
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedSegment(null);
    setSelectedProduct(null);
    setProductData(null);
  };

  // Build EntityDataGrid extraFilter with date filters
  const buildEntityFilter = () => {
    const filters = [];

    // Filter by selected category or product
    if (selectedProduct) {
      filters.push(`ProductID IN (SELECT ID FROM CRM.vwProducts WHERE Name='${selectedProduct}')`);
    } else if (selectedSegment) {
      filters.push(`ProductID IN (SELECT ID FROM CRM.vwProducts WHERE Category='${selectedSegment.label}')`);
    }

    // Note: InvoiceDate doesn't exist in vwInvoiceLineItems
    // Date filtering would require joining to vwInvoices, which EntityDataGrid doesn't support
    // The line items are already filtered by product selection

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
          <div>Loading category data...</div>
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
      {!loading && !error && (!categoryData || categoryData.length === 0) && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
          <div style={{ fontSize: '16px' }}>No Data Available</div>
          <div style={{ marginTop: '8px' }}>
            No category data found matching the specified criteria
          </div>
        </div>
      )}

      {/* Category overview - always show when data is loaded */}
      {!loading && !error && categoryData && categoryData.length > 0 && (
        <div>
          <SimpleChart
            entityName="Products"
            data={categoryData}
            chartType="bar"
            groupBy="Category"
            valueField="TotalRevenue"
            aggregateMethod="sum"
            title={title}
            showLegend={false}
            onDataPointClick={handleCategoryClick}
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
                ${categoryData.reduce((sum, row) => sum + (row.TotalRevenue || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Total Products
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                {categoryData.reduce((sum, row) => sum + (row.ProductCount || 0), 0).toLocaleString()}
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
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fa8c16' }}>
                {categoryData.reduce((sum, row) => sum + (row.TotalQuantity || 0), 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down section when category is selected - renders BELOW chart */}
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
              {selectedProduct ? `Line Items for ${selectedProduct}` : `Products in ${selectedSegment.label}`}
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

          {/* Two-column layout: Top products + Line items */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: '16px'
          }}>
            {/* Top products panel */}
            <div style={{
              padding: '16px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px'
            }}>
              <h3 style={{ margin: '0 0 16px 0' }}>Top {topN} Products</h3>
              {loadingProducts ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>Loading products...</div>
              ) : productData && productData.length > 0 ? (
                <div>
                  {productData.map((product, index) => (
                    <div
                      key={index}
                      onClick={() => handleProductClick(product)}
                      style={{
                        padding: '12px',
                        marginBottom: '8px',
                        backgroundColor: selectedProduct === product.ProductName ? '#e6f7ff' : 'white',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: selectedProduct === product.ProductName ? '2px solid #1890ff' : '1px solid #d9d9d9'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{product.ProductName}</div>
                      <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                        Revenue: ${(product.TotalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} •
                        Quantity: {(product.TotalQuantity || 0).toLocaleString()} •
                        Avg Price: ${(product.AvgPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#8c8c8c' }}>
                  No products found
                </div>
              )}
            </div>

            {/* Line items panel */}
            <div style={{
              padding: '16px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px'
            }}>
              <h3 style={{ margin: '0 0 16px 0' }}>Line Item Details</h3>
              <EntityDataGrid
                entityName="Invoice Line Items"
                extraFilter={buildEntityFilter()}
                fields={['Product', 'Quantity', 'UnitPrice', 'TotalPrice', 'Description']}
                orderBy="ID DESC"
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
          </div>
        </div>
      )}
    </div>
  );
}
