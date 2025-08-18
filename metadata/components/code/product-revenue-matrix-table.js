function ProductRevenueMatrixTable({ products, lineItems, invoices, sortBy, onSortChange, onProductClick }) {
  const matrixRef = useRef(null);
  const sparklineCharts = useRef({});
  
  useEffect(() => {
    if (products.length > 0) {
      renderMatrix();
    }
    
    return () => {
      // Clean up charts
      Object.values(sparklineCharts.current).forEach(chart => {
        if (chart) chart.destroy();
      });
    };
  }, [products, lineItems, invoices, sortBy]);
  
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
      
      // Generate trend data (simulated for demo)
      for (let i = 0; i < 12; i++) {
        metrics.trend.push(Math.random() * metrics.revenue * 0.3 + metrics.revenue * 0.7);
      }
    });
    
    return productMetrics;
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
    
    // Handle empty state
    if (sortedProducts.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.padding = '40px';
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.color = '#6B7280';
      emptyDiv.textContent = 'No product revenue data available for the selected period';
      matrixRef.current.appendChild(emptyDiv);
      return;
    }
    
    // Create matrix grid
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    
    // Header row with sort indicators
    const headerRow = document.createElement('tr');
    ['Product', 'Category', 'Revenue', 'Quantity', 'Margin', 'Customers', 'Trend'].forEach(header => {
      const th = document.createElement('th');
      th.style.padding = '12px';
      th.style.borderBottom = '2px solid #E5E7EB';
      th.style.textAlign = header === 'Product' ? 'left' : 'center';
      th.style.fontSize = '14px';
      th.style.fontWeight = 'bold';
      th.style.position = 'relative';
      
      // Create header content container
      const headerContent = document.createElement('div');
      headerContent.style.display = 'flex';
      headerContent.style.alignItems = 'center';
      headerContent.style.justifyContent = header === 'Product' ? 'flex-start' : 'center';
      headerContent.style.gap = '4px';
      
      // Add header text
      const headerText = document.createElement('span');
      headerText.textContent = header;
      headerContent.appendChild(headerText);
      
      // Add sort indicator for sortable columns
      const sortMap = {
        'Revenue': 'revenue',
        'Quantity': 'quantity',
        'Margin': 'margin',
        'Customers': 'customers'
      };
      
      if (sortMap[header]) {
        th.style.cursor = 'pointer';
        
        // Add sort indicator
        const sortIndicator = document.createElement('span');
        sortIndicator.style.fontSize = '10px';
        sortIndicator.style.color = sortBy === sortMap[header] ? '#8B5CF6' : '#D1D5DB';
        sortIndicator.style.transition = 'color 0.2s';
        
        // Show appropriate arrow based on current sort
        if (sortBy === sortMap[header]) {
          sortIndicator.innerHTML = '▼';
          sortIndicator.style.fontWeight = 'bold';
        } else {
          sortIndicator.innerHTML = '▼';
          sortIndicator.style.opacity = '0.4';
        }
        
        headerContent.appendChild(sortIndicator);
        
        // Add hover effect
        th.onmouseenter = () => {
          if (sortBy !== sortMap[header]) {
            sortIndicator.style.opacity = '0.7';
            sortIndicator.style.color = '#8B5CF6';
          }
        };
        
        th.onmouseleave = () => {
          if (sortBy !== sortMap[header]) {
            sortIndicator.style.opacity = '0.4';
            sortIndicator.style.color = '#D1D5DB';
          }
        };
        
        // Add sort functionality
        th.onclick = () => {
          if (onSortChange) {
            onSortChange(sortMap[header]);
          }
        };
      }
      
      th.appendChild(headerContent);
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    
    // Create color scale for revenue cells (green shades for positive values)
    const maxRevenue = Math.max(...sortedProducts.map(p => p.revenue), 1);
    const getRevenueColor = (revenue) => {
      const intensity = revenue / maxRevenue;
      // Green color scale: light green to dark green
      const r = Math.floor(220 - (intensity * 200));
      const g = Math.floor(240 - (intensity * 50));
      const b = Math.floor(220 - (intensity * 180));
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
      categoryCell.style.fontSize = '13px';
      categoryCell.style.color = '#6B7280';
      row.appendChild(categoryCell);
      
      // Revenue
      const revenueCell = document.createElement('td');
      revenueCell.textContent = `$${(product.revenue / 1000).toFixed(1)}K`;
      revenueCell.style.padding = '12px';
      revenueCell.style.textAlign = 'center';
      revenueCell.style.fontWeight = 'bold';
      revenueCell.style.backgroundColor = getRevenueColor(product.revenue);
      revenueCell.style.color = product.revenue > maxRevenue * 0.5 ? 'white' : '#374151';
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
      marginCell.style.fontWeight = 'bold';
      marginCell.style.color = product.margin > 30 ? '#10B981' : product.margin > 15 ? '#F59E0B' : '#EF4444';
      row.appendChild(marginCell);
      
      // Customers
      const customersCell = document.createElement('td');
      customersCell.textContent = product.customerCount;
      customersCell.style.padding = '12px';
      customersCell.style.textAlign = 'center';
      row.appendChild(customersCell);
      
      // Trend sparkline
      const trendCell = document.createElement('td');
      trendCell.style.padding = '12px';
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 30;
      trendCell.appendChild(canvas);
      row.appendChild(trendCell);
      
      // Create sparkline chart
      const ctx = canvas.getContext('2d');
      sparklineCharts.current[product.id] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: Array(12).fill(''),
          datasets: [{
            data: product.trend,
            borderColor: '#3B82F6',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            tension: 0.4
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
          }
        }
      });
      
      // Add click handler
      row.onclick = () => {
        if (onProductClick) {
          onProductClick(product);
        }
      };
      
      // Add hover effect
      row.onmouseenter = () => {
        row.style.backgroundColor = '#F9FAFB';
      };
      row.onmouseleave = () => {
        row.style.backgroundColor = '';
      };
      
      table.appendChild(row);
    });
    
    matrixRef.current.appendChild(table);
  };
  
  return (
    <div ref={matrixRef} style={{ width: '100%', overflow: 'auto' }} />
  );
}