function ProductRevenueMatrix({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [products, setProducts] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'treemap');
  const [timePeriod, setTimePeriod] = useState(savedUserSettings?.timePeriod || 'month');
  const [sortBy, setSortBy] = useState('revenue');
  const [startDate, setStartDate] = useState(savedUserSettings?.startDate || null);
  const [endDate, setEndDate] = useState(savedUserSettings?.endDate || null);
  
  // Load sub-components from registry
  const Treemap = components['ProductRevenueTreemap'];
  const MatrixTable = components['ProductRevenueMatrixTable'];
  const DetailPanel = components['ProductRevenueDetailPanel'];

  useEffect(() => {
    loadData();
  }, [timePeriod, startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const dateFilter = getDateFilter();
      
      // Use RunViews for batch loading - single server call
      const results = await utilities.rv.RunViews([
        {
          EntityName: 'Products',
          OrderBy: 'ProductName ASC'
        },
        {
          EntityName: 'Invoice Line Items',
          OrderBy: 'TotalPrice DESC',
          MaxRows: 1000
        },
        {
          EntityName: 'Invoices',
          ExtraFilter: dateFilter,
          OrderBy: 'InvoiceDate DESC',
          MaxRows: 500
        }
      ]);

      // Process results
      if (results && results.length === 3) {
        const [productsResult, lineItemsResult, invoicesResult] = results;
        
        if (productsResult.Success) {
          setProducts(productsResult.Results || []);
        } else {
          console.error('Failed to load products:', productsResult.ErrorMessage);
        }
        
        if (lineItemsResult.Success) {
          setLineItems(lineItemsResult.Results || []);
        } else {
          console.error('Failed to load line items:', lineItemsResult.ErrorMessage);
        }
        
        if (invoicesResult.Success) {
          setInvoices(invoicesResult.Results || []);
        } else {
          console.error('Failed to load invoices:', invoicesResult.ErrorMessage);
        }
        
        if (!productsResult.Success || !lineItemsResult.Success || !invoicesResult.Success) {
          setError('Failed to load some data. Please try again.');
        }
      } else {
        setError('Failed to load data');
      }
    } catch (err) {
      setError(err.message);
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = () => {
    // If custom dates are set, use them
    if (timePeriod === 'custom' && startDate && endDate) {
      return `InvoiceDate >= '${startDate}' AND InvoiceDate <= '${endDate}'`;
    }
    
    const now = new Date();
    let filterStart;
    
    switch (timePeriod) {
      case 'month':
        filterStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        filterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        filterStart = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
        return '';
      default:
        return '';
    }
    
    return filterStart ? `InvoiceDate >= '${filterStart.toISOString().split('T')[0]}'` : '';
  };

  const calculateProductMetrics = () => {
    const productMetrics = {};
    
    // Initialize metrics for each product
    products.forEach(product => {
      productMetrics[product.ID] = {
        id: product.ID,
        name: product.ProductName,
        category: product.Category || 'Uncategorized',
        price: product.UnitPrice || 0,
        cost: product.Cost || 0,
        revenue: 0,
        quantity: 0,
        margin: 0,
        customers: new Set(),
        transactions: 0,
        trend: []
      };
    });
    
    // Calculate revenue from line items
    const invoiceIds = new Set(invoices.map(inv => inv.ID));
    
    lineItems.forEach(item => {
      if (invoiceIds.has(item.InvoiceID) && productMetrics[item.ProductID]) {
        const metrics = productMetrics[item.ProductID];
        // Use TotalPrice if available, otherwise calculate
        const lineTotal = item.TotalPrice || (item.Quantity * item.UnitPrice * (1 - (item.Discount || 0) / 100));
        metrics.revenue += lineTotal;
        metrics.quantity += item.Quantity || 0;
        metrics.transactions++;
        
        // Find invoice to get customer
        const invoice = invoices.find(inv => inv.ID === item.InvoiceID);
        if (invoice && invoice.AccountID) {
          metrics.customers.add(invoice.AccountID);
        }
      }
    });
    
    // Calculate margins and generate trend data
    Object.values(productMetrics).forEach(metrics => {
      if (metrics.price > 0 && metrics.cost > 0) {
        metrics.margin = ((metrics.price - metrics.cost) / metrics.price * 100);
      }
      metrics.customerCount = metrics.customers.size;
      
      // Generate trend data (simulated for demo - in real app, calculate from historical data)
      for (let i = 0; i < 12; i++) {
        metrics.trend.push(Math.random() * metrics.revenue * 0.3 + metrics.revenue * 0.7);
      }
    });
    
    return productMetrics;
  };

  const handleProductClick = (product) => {
    setSelectedProduct(product);
    setIsPanelOpen(true);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading product revenue data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#EF4444' }}>Error: {error}</div>
        <button 
          onClick={loadData}
          style={{
            marginTop: '16px',
            padding: '8px 16px',
            backgroundColor: '#3B82F6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const productMetrics = calculateProductMetrics();
  const topProducts = Object.values(productMetrics)
    .filter(p => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return (
    <div style={{ padding: '20px', backgroundColor: '#F3F4F6', minHeight: '100%' }}>
      <style>{`
        @media (max-width: 1024px) {
          .product-revenue-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Product Revenue Matrix</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
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
                borderRadius: '6px'
              }}
            >
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
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
                    borderRadius: '6px'
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
                    borderRadius: '6px'
                  }}
                />
              </>
            )}
            <button
              onClick={() => {
                const newMode = viewMode === 'treemap' ? 'matrix' : 'treemap';
                setViewMode(newMode);
                onSaveUserSettings({ ...savedUserSettings, viewMode: newMode });
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#8B5CF6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <i className={`fa-solid fa-${viewMode === 'treemap' ? 'table' : 'chart-treemap'}`}></i>
              {viewMode === 'treemap' ? ' Matrix View' : ' Treemap View'}
            </button>
          </div>
        </div>
        
        {/* Top Products Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {topProducts.map((product, index) => (
            <div
              key={product.id}
              style={{
                padding: '12px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => handleProductClick(product)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
                    #{index + 1} {product.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    {product.category}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#8B5CF6' }}>
                    ${(product.revenue / 1000).toFixed(1)}K
                  </div>
                  <div style={{ fontSize: '11px', color: product.margin > 30 ? '#10B981' : '#F59E0B' }}>
                    {product.margin.toFixed(0)}% margin
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Main Content Grid - responsive layout */}
      <div 
        className="product-revenue-grid"
        style={{ 
          display: 'grid', 
          gridTemplateColumns: isPanelOpen ? '1fr 400px' : '1fr',
          gap: '20px',
          transition: 'grid-template-columns 0.3s ease'
        }}
      >
        {/* Main Visualization Area */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', minWidth: 0 }}>
          {viewMode === 'treemap' && Treemap && (
            <Treemap 
              products={products}
              lineItems={lineItems}
              invoices={invoices}
              onProductClick={handleProductClick}
            />
          )}
          
          {viewMode === 'matrix' && MatrixTable && (
            <MatrixTable
              products={products}
              lineItems={lineItems}
              invoices={invoices}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onProductClick={handleProductClick}
            />
          )}
        </div>
        
        {/* Product Detail Panel - inline responsive */}
        {isPanelOpen && DetailPanel && (
          <div style={{ minWidth: 0 }}>
            <DetailPanel
              product={selectedProduct}
              isOpen={isPanelOpen}
              onClose={() => {
                setIsPanelOpen(false);
                setSelectedProduct(null);
              }}
              callbacks={callbacks}
            />
          </div>
        )}
      </div>
    </div>
  );
}