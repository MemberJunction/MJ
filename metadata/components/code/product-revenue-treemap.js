function ProductRevenueTreemap({ products, lineItems, invoices, onProductClick }) {
  const treemapRef = useRef(null);
  
  useEffect(() => {
    if (products.length > 0) {
      renderTreemap();
    }
    
    return () => {
      // Clean up tooltip on unmount
      d3.select('.product-revenue-tooltip').remove();
    };
  }, [products, lineItems, invoices]);
  
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
        transactions: 0
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
      
      // Generate trend data (simulated for demo - in real app, calculate from historical data)
      metrics.trend = [];
      for (let i = 0; i < 12; i++) {
        metrics.trend.push(Math.random() * metrics.revenue * 0.3 + metrics.revenue * 0.7);
      }
    });
    
    return productMetrics;
  };
  
  const renderTreemap = () => {
    if (!treemapRef.current) return;
    
    const productMetrics = calculateProductMetrics();
    
    // Group products by category
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
    
    const categoriesWithData = Object.values(categories).filter(cat => cat.children.length > 0);
    
    // Handle empty state
    if (categoriesWithData.length === 0) {
      d3.select(treemapRef.current).selectAll('*').remove();
      d3.select(treemapRef.current)
        .append('div')
        .style('padding', '40px')
        .style('text-align', 'center')
        .style('color', '#6B7280')
        .text('No revenue data available for the selected period');
      return;
    }
    
    const treemapData = {
      name: 'Products',
      children: categoriesWithData
    };
    
    // Clear previous visualization
    d3.select(treemapRef.current).selectAll('*').remove();
    
    // Set dimensions
    const width = treemapRef.current.clientWidth || 800;
    const height = 500;
    
    // Create varied pastel colors for better accessibility
    // Using a categorical color scheme with good contrast
    const pastelColors = [
      '#FFB3BA', // Light pink
      '#FFDFBA', // Light peach
      '#FFFFBA', // Light yellow
      '#BAFFC9', // Light mint green
      '#BAE1FF', // Light sky blue
      '#E0BBE4', // Light lavender
      '#C7CEEA', // Light periwinkle
      '#FFDAC1', // Light apricot
      '#B5EAD7', // Light seafoam
      '#FF9AA2', // Light coral
      '#C1E1C1', // Light sage
      '#BEDADC', // Light teal
      '#C4A1C2', // Light mauve
      '#FCBAD3', // Light rose
      '#FFFFD8'  // Light cream
    ];
    
    // Create color scale that maps products to colors
    // Use modulo to cycle through colors if more products than colors
    const getProductColor = (index, margin) => {
      // Use margin to slightly adjust the brightness
      // Higher margin = slightly more saturated color
      const baseColor = pastelColors[index % pastelColors.length];
      
      // If margin is very high (>40%), make it slightly more vibrant
      if (margin > 40) {
        return d3.color(baseColor).darker(0.2).toString();
      } else if (margin < 10) {
        // If margin is low, make it slightly lighter
        return d3.color(baseColor).brighter(0.2).toString();
      }
      return baseColor;
    };
    
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
      .attr('class', 'product-revenue-tooltip')
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
      .data(root.children || [])
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
    const leaves = root.leaves() || [];
    
    // Sort leaves by value to ensure consistent color assignment
    leaves.sort((a, b) => b.value - a.value);
    
    const products_g = svg.selectAll('.product')
      .data(leaves)
      .enter().append('g')
      .attr('class', 'product')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);
    
    products_g.append('rect')
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .style('fill', (d, i) => getProductColor(i, d.data.margin))
      .style('stroke', '#fff')
      .style('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('opacity', 0.9)
      .on('mouseover', function(_, d) {
        // Add hover effect
        d3.select(this)
          .style('opacity', 1)
          .style('stroke-width', 3)
          .style('filter', 'brightness(1.1)');
        
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
        // Remove hover effect
        d3.select(this)
          .style('opacity', 0.9)
          .style('stroke-width', 2)
          .style('filter', 'none');
        
        tooltip.style('visibility', 'hidden');
      })
      .on('click', function(_, d) {
        if (onProductClick) {
          onProductClick(d.data.product);
        }
      });
    
    // Add product labels
    products_g.append('text')
      .attr('x', 4)
      .attr('y', 20)
      .style('font-size', '11px')
      .style('fill', '#2D3748')
      .style('font-weight', '500')
      .each(function(d) {
        const text = d3.select(this);
        const width = d.x1 - d.x0;
        const name = d.data.name;
        
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
      .style('fill', '#2D3748')
      .each(function(d) {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        
        if (width > 80 && height > 50) {
          d3.select(this).text(`$${(d.data.product.revenue / 1000).toFixed(0)}K`);
        }
      });
  };
  
  return (
    <div ref={treemapRef} style={{ width: '100%', height: '500px' }} />
  );
}