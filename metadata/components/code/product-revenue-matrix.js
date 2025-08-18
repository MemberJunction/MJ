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
  
  const treemapRef = useRef(null);
  const matrixRef = useRef(null);
  const sparklineCharts = useRef({});

  useEffect(() => {
    loadData();
  }, [timePeriod]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const dateFilter = getDateFilter();
      
      const [productsResult, lineItemsResult, invoicesResult] = await Promise.all([
        utilities.rv.RunView({
          EntityName: 'Products',
          OrderBy: 'ProductName ASC',
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Invoice Line Items',
          OrderBy: 'Amount DESC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Invoices',
          ExtraFilter: dateFilter,
          OrderBy: 'InvoiceDate DESC',
          MaxRows: 500,
          ResultType: 'entity_object'
        })
      ]);

      if (productsResult.Success) {
        setProducts(productsResult.Results || []);
      }
      if (lineItemsResult.Success) {
        setLineItems(lineItemsResult.Results || []);
      }
      if (invoicesResult.Success) {
        setInvoices(invoicesResult.Results || []);
      }
      
      if (!productsResult.Success) {
        setError('Failed to load product data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = () => {
    const now = new Date();
    let startDate;
    
    switch (timePeriod) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        return '';
    }
    
    return `InvoiceDate >= '${startDate.toISOString().split('T')[0]}'`;
  };

  useEffect(() => {
    if (!loading && products.length > 0) {
      if (viewMode === 'treemap') {
        renderTreemap();
      } else {
        renderMatrix();
      }
    }
  }, [products, lineItems, invoices, loading, viewMode]);

  const calculateProductMetrics = () => {
    const productMetrics = {};
    
    // Initialize metrics for each product
    products.forEach(product => {
      productMetrics[product.ID] = {
        id: product.ID,
        name: product.ProductName,
        category: product.Category || 'Uncategorized',
        price: product.Price || 0,
        cost: product.Cost || 0,
        revenue: 0,
        quantity: 0,
        margin: 0,
        customers: new Set(),
        transactions: 0,
        trend: []
      };
    });
    
    // Calculate revenue and quantities from line items
    const invoiceIds = new Set(invoices.map(inv => inv.ID));
    
    lineItems.forEach(item => {
      if (invoiceIds.has(item.InvoiceID) && productMetrics[item.ProductID]) {
        const metrics = productMetrics[item.ProductID];
        metrics.revenue += item.Amount || 0;
        metrics.quantity += item.Quantity || 0;
        metrics.transactions++;
        
        // Find invoice to get customer
        const invoice = invoices.find(inv => inv.ID === item.InvoiceID);
        if (invoice && invoice.AccountID) {
          metrics.customers.add(invoice.AccountID);
        }
      }
    });
    
    // Calculate margins and finalize metrics
    Object.values(productMetrics).forEach(metrics => {
      if (metrics.revenue > 0 && metrics.cost > 0) {
        metrics.margin = ((metrics.price - metrics.cost) / metrics.price * 100);
      }
      metrics.customerCount = metrics.customers.size;
      
      // Generate trend data (simulated)
      for (let i = 0; i < 12; i++) {
        metrics.trend.push(Math.random() * metrics.revenue * 0.3 + metrics.revenue * 0.7);
      }
    });
    
    return productMetrics;
  };

  const renderTreemap = () => {
    if (!treemapRef.current) return;
    
    const productMetrics = calculateProductMetrics();
    
    // Group products by category for hierarchical display
    const categories = {};
    Object.values(productMetrics).forEach(product => {
      if (!categories[product.category]) {
        categories[product.category] = {
          name: product.category,
          children: []
        };
      }
      
      if (product.revenue > 0) {
        categories[product.category].children.push({
          name: product.name,
          value: product.revenue,
          margin: product.margin,
          product: product
        });
      }
    });
    
    const treemapData = {
      name: 'Products',
      children: Object.values(categories).filter(cat => cat.children.length > 0)
    };
    
    // Clear previous visualization
    d3.select(treemapRef.current).selectAll('*').remove();
    
    // Set dimensions
    const width = treemapRef.current.clientWidth || 800;
    const height = 500;
    
    // Create color scale based on margin
    const colorScale = d3.scaleLinear()
      .domain([0, 25, 50])
      .range(['#EF4444', '#F59E0B', '#10B981']);
    
    // Create treemap layout
    const treemap = d3.treemap()
      .size([width, height])
      .padding(2);
    
    // Create hierarchy and compute layout
    const root = d3.hierarchy(treemapData)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);
    
    treemap(root);
    
    // Create SVG
    const svg = d3.select(treemapRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    // Create tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '9999');
    
    // Create groups for categories
    const categories_g = svg.selectAll('.category')
      .data(root.children)
      .enter().append('g')
      .attr('class', 'category')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);
    
    // Add category rectangles
    categories_g.append('rect')
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .style('fill', 'none')
      .style('stroke', '#fff')
      .style('stroke-width', 2);
    
    // Add category labels
    categories_g.append('text')
      .attr('x', 4)
      .attr('y', 16)
      .style('font-weight', 'bold')
      .style('font-size', '14px')
      .style('fill', '#374151')
      .text(d => d.data.name);
    
    // Create product rectangles
    const products_g = svg.selectAll('.product')
      .data(root.leaves())
      .enter().append('g')
      .attr('class', 'product')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);
    
    products_g.append('rect')
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .style('fill', d => colorScale(d.data.margin))
      .style('stroke', '#fff')
      .style('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        tooltip.style('visibility', 'visible')
          .html(`
            <strong>${d.data.name}</strong><br/>
            Revenue: $${(d.data.product.revenue / 1000).toFixed(1)}K<br/>
            Quantity: ${d.data.product.quantity}<br/>
            Margin: ${d.data.margin.toFixed(1)}%<br/>
            Customers: ${d.data.product.customerCount}
          `);
      })
      .on('mousemove', function(event) {
        tooltip.style('top', (event.pageY - 10) + 'px')
          .style('left', (event.pageX + 10) + 'px');
      })
      .on('mouseout', function() {
        tooltip.style('visibility', 'hidden');
      })
      .on('click', function(event, d) {
        setSelectedProduct(d.data.product);
        setIsPanelOpen(true);
      });
    
    // Add product labels
    products_g.append('text')
      .attr('x', 4)
      .attr('y', 20)
      .style('font-size', '11px')
      .style('fill', d => {
        // Ensure text is readable on background
        const margin = d.data.margin;
        return margin > 30 ? 'white' : '#374151';
      })
      .each(function(d) {
        const text = d3.select(this);
        const width = d.x1 - d.x0;
        const name = d.data.name;
        
        // Truncate text if too long
        if (width > 60) {
          text.text(name.length > 15 ? name.substring(0, 15) + '...' : name);
        }
      });
    
    // Add revenue labels for larger boxes
    products_g.append('text')
      .attr('x', 4)
      .attr('y', 36)
      .style('font-size', '10px')
      .style('font-weight', 'bold')
      .style('fill', d => d.data.margin > 30 ? 'white' : '#374151')
      .each(function(d) {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        
        // Only show revenue if box is large enough
        if (width > 80 && height > 50) {
          d3.select(this).text(`$${(d.data.product.revenue / 1000).toFixed(0)}K`);
        }
      });
    
    // Clean up tooltip on component unmount
    return () => {
      d3.select('.tooltip').remove();
    };
  };

  const renderMatrix = () => {
    if (!matrixRef.current) return;
    
    const productMetrics = calculateProductMetrics();
    const sortedProducts = Object.values(productMetrics)
      .filter(p => p.revenue > 0)
      .sort((a, b) => {
        switch (sortBy) {
          case 'revenue':
            return b.revenue - a.revenue;
          case 'quantity':
            return b.quantity - a.quantity;
          case 'margin':
            return b.margin - a.margin;
          case 'customers':
            return b.customerCount - a.customerCount;
          default:
            return 0;
        }
      });
    
    // Clear previous content and charts
    matrixRef.current.innerHTML = '';
    Object.values(sparklineCharts.current).forEach(chart => {
      if (chart) chart.destroy();
    });
    sparklineCharts.current = {};
    
    // Create matrix grid
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    
    // Header row
    const headerRow = document.createElement('tr');
    ['Product', 'Category', 'Revenue', 'Quantity', 'Margin', 'Customers', 'Trend'].forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      th.style.padding = '12px';
      th.style.borderBottom = '2px solid #E5E7EB';
      th.style.textAlign = header === 'Product' ? 'left' : 'center';
      th.style.fontSize = '14px';
      th.style.fontWeight = 'bold';
      th.style.cursor = 'pointer';
      
      // Add sort functionality
      th.onclick = () => {
        const sortMap = {
          'Revenue': 'revenue',
          'Quantity': 'quantity',
          'Margin': 'margin',
          'Customers': 'customers'
        };
        if (sortMap[header]) {
          setSortBy(sortMap[header]);
        }
      };
      
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    
    // Create color scale for revenue cells
    const maxRevenue = Math.max(...sortedProducts.map(p => p.revenue));
    const getRevenueColor = (revenue) => {
      const intensity = revenue / maxRevenue;
      const r = Math.floor(220 + (intensity * 35));
      const g = Math.floor(38 + (intensity * -38));
      const b = Math.floor(38 + (intensity * -38));
      return `rgb(${r}, ${g}, ${b})`;
    };
    
    // Data rows
    sortedProducts.slice(0, 20).forEach(product => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #E5E7EB';
      row.style.cursor = 'pointer';
      
      // Product name
      const nameCell = document.createElement('td');
      nameCell.textContent = product.name;
      nameCell.style.padding = '12px';
      nameCell.style.fontWeight = '500';
      row.appendChild(nameCell);
      
      // Category
      const categoryCell = document.createElement('td');
      categoryCell.textContent = product.category;
      categoryCell.style.padding = '12px';
      categoryCell.style.textAlign = 'center';
      categoryCell.style.fontSize = '14px';
      categoryCell.style.color = '#6B7280';
      row.appendChild(categoryCell);
      
      // Revenue
      const revenueCell = document.createElement('td');
      revenueCell.textContent = `$${(product.revenue / 1000).toFixed(1)}K`;
      revenueCell.style.padding = '12px';
      revenueCell.style.textAlign = 'center';
      revenueCell.style.fontWeight = 'bold';
      revenueCell.style.backgroundColor = getRevenueColor(product.revenue);
      revenueCell.style.color = product.revenue > maxRevenue * 0.6 ? 'white' : '#111827';
      row.appendChild(revenueCell);
      
      // Quantity
      const quantityCell = document.createElement('td');
      quantityCell.textContent = product.quantity;
      quantityCell.style.padding = '12px';
      quantityCell.style.textAlign = 'center';
      row.appendChild(quantityCell);
      
      // Margin
      const marginCell = document.createElement('td');
      marginCell.textContent = `${product.margin.toFixed(1)}%`;
      marginCell.style.padding = '12px';
      marginCell.style.textAlign = 'center';
      marginCell.style.color = product.margin > 30 ? '#10B981' : product.margin > 15 ? '#F59E0B' : '#EF4444';
      marginCell.style.fontWeight = 'bold';
      row.appendChild(marginCell);
      
      // Customers
      const customersCell = document.createElement('td');
      customersCell.textContent = product.customerCount;
      customersCell.style.padding = '12px';
      customersCell.style.textAlign = 'center';
      row.appendChild(customersCell);
      
      // Trend sparkline
      const trendCell = document.createElement('td');
      trendCell.style.padding = '8px';
      const canvas = document.createElement('canvas');
      canvas.id = `sparkline-${product.id}`;
      canvas.width = 100;
      canvas.height = 30;
      canvas.style.width = '100px';
      canvas.style.height = '30px';
      trendCell.appendChild(canvas);
      row.appendChild(trendCell);
      
      // Row click handler
      row.onclick = () => {
        setSelectedProduct(product);
        setIsPanelOpen(true);
      };
      
      table.appendChild(row);
      
      // Render sparkline after adding to DOM
      setTimeout(() => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          sparklineCharts.current[product.id] = new Chart(ctx, {
            type: 'line',
            data: {
              labels: Array(6).fill(''),
              datasets: [{
                data: product.trend.slice(-6),
                borderColor: '#8B5CF6',
                borderWidth: 1,
                fill: {
                  target: 'origin',
                  above: 'rgba(139, 92, 246, 0.2)'
                },
                tension: 0.4,
                pointRadius: 0
              }]
            },
            options: {
              responsive: false,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
              },
              scales: {
                x: { display: false },
                y: { display: false }
              },
              elements: {
                line: { borderWidth: 1 }
              }
            }
          });
        }
      }, 0);
    });
    
    matrixRef.current.appendChild(table);
  };

  // Sub-component: Product Details Panel
  const ProductDetailsPanel = () => {
    const trendChartRef = useRef(null);
    const productTrendChart = useRef(null);
    
    useEffect(() => {
      if (selectedProduct && isPanelOpen && trendChartRef.current) {
        // Destroy previous chart if exists
        if (productTrendChart.current) {
          productTrendChart.current.destroy();
        }
        
        // Create new trend chart
        const ctx = trendChartRef.current.getContext('2d');
        productTrendChart.current = new Chart(ctx, {
          type: 'line',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
              label: 'Revenue',
              data: selectedProduct.trend.slice(-6),
              borderColor: '#8B5CF6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => `Revenue: $${(context.raw / 1000).toFixed(1)}K`
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
        
        // Cleanup on unmount
        return () => {
          if (productTrendChart.current) {
            productTrendChart.current.destroy();
          }
        };
      }
    }, [selectedProduct, isPanelOpen]);
    
    if (!selectedProduct) return null;
    
    return isPanelOpen && (
      <div
        style={{
          position: 'fixed',
          right: isPanelOpen ? 0 : '-500px',
          top: 0,
          bottom: 0,
          width: '500px',
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
          background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '20px' }}>{selectedProduct.name}</h3>
              <div style={{ marginTop: '4px', opacity: 0.9, fontSize: '14px' }}>
                {selectedProduct.category}
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
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Performance Metrics</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Revenue</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#059669' }}>
                  ${(selectedProduct.revenue / 1000).toFixed(1)}K
                </div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Units Sold</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                  {selectedProduct.quantity}
                </div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Margin</div>
                <div style={{ 
                  fontSize: '20px', 
                  fontWeight: 'bold',
                  color: selectedProduct.margin > 30 ? '#10B981' : selectedProduct.margin > 15 ? '#F59E0B' : '#EF4444'
                }}>
                  {selectedProduct.margin.toFixed(1)}%
                </div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Customers</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                  {selectedProduct.customerCount}
                </div>
              </div>
            </div>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Pricing Details</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>List Price</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  ${selectedProduct.price.toFixed(2)}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Cost</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  ${selectedProduct.cost.toFixed(2)}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Avg Selling Price</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  ${selectedProduct.quantity > 0 ? (selectedProduct.revenue / selectedProduct.quantity).toFixed(2) : '0.00'}
                </div>
              </div>
            </div>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Revenue Trend</h4>
            <div style={{ height: '150px', backgroundColor: '#F9FAFB', borderRadius: '6px', padding: '8px' }}>
              <canvas ref={trendChartRef} />
            </div>
          </div>
          
          <div>
            <button
              onClick={() => callbacks.OpenEntityRecord('Products', [{ FieldName: 'ID', Value: selectedProduct.id }])}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              View Full Product Details ↗
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading product revenue data...</div>
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
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Product Revenue Matrix</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={timePeriod}
              onChange={(e) => {
                setTimePeriod(e.target.value);
                onSaveUserSettings({ ...savedUserSettings, timePeriod: e.target.value });
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
            </select>
            <button
              onClick={() => {
                setViewMode(viewMode === 'treemap' ? 'matrix' : 'treemap');
                onSaveUserSettings({ ...savedUserSettings, viewMode: viewMode === 'treemap' ? 'matrix' : 'treemap' });
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
              {viewMode === 'treemap' ? 'Matrix View' : 'Treemap View'}
            </button>
          </div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#374151' }}>Top Performers</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {topProducts.map((product, index) => (
              <div
                key={product.id}
                style={{
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #E5E7EB',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onClick={() => {
                  setSelectedProduct(product);
                  setIsPanelOpen(true);
                }}
              >
                {index === 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    fontSize: '16px'
                  }}>
                    🏆
                  </span>
                )}
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
                  {product.name}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#059669' }}>
                  ${(product.revenue / 1000).toFixed(1)}K
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  {product.quantity} units • {product.margin.toFixed(0)}% margin
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #E5E7EB' }}>
          <div 
            ref={viewMode === 'treemap' ? treemapRef : matrixRef}
            style={{ minHeight: '500px' }}
          />
        </div>
      </div>
      
      <ProductDetailsPanel />
    </div>
  );
}