function ProductRevenueDetailPanel({ product, isOpen, onClose, callbacks }) {
  const trendChartRef = useRef(null);
  const productTrendChart = useRef(null);
  
  useEffect(() => {
    if (product && isOpen && trendChartRef.current) {
      // Clean up existing chart
      if (productTrendChart.current) {
        productTrendChart.current.destroy();
      }
      
      // Create revenue trend chart
      const ctx = trendChartRef.current.getContext('2d');
      productTrendChart.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [{
            label: 'Revenue',
            data: product.trend || [],
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 2,
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
    }
    
    return () => {
      if (productTrendChart.current) {
        productTrendChart.current.destroy();
      }
    };
  }, [product, isOpen]);
  
  if (!product || !isOpen) return null;
  
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        overflow: 'hidden',
        animation: 'slideIn 0.3s ease',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
      
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #E5E7EB',
        background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
        color: 'white'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>Product Details</h3>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            ×
          </button>
        </div>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 'bold' }}>
            {product.name}
          </h4>
          <div style={{ fontSize: '13px', color: '#6B7280' }}>
            {product.category}
          </div>
        </div>
        
        <div style={{ marginBottom: '24px' }}>
          <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Performance Metrics</h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ padding: '10px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#6B7280' }}>Total Revenue</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#8B5CF6' }}>
                ${(product.revenue / 1000).toFixed(1)}K
              </div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#6B7280' }}>Units Sold</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                {product.quantity}
              </div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#6B7280' }}>Margin</div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 'bold',
                color: product.margin > 30 ? '#10B981' : product.margin > 15 ? '#F59E0B' : '#EF4444'
              }}>
                {product.margin.toFixed(1)}%
              </div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#F9FAFB', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#6B7280' }}>Customers</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                {product.customerCount}
              </div>
            </div>
          </div>
        </div>
        
        <div style={{ marginBottom: '24px' }}>
          <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Pricing Details</h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', color: '#6B7280' }}>List Price</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                ${product.price.toFixed(2)}
              </div>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', color: '#6B7280' }}>Cost</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                ${product.cost.toFixed(2)}
              </div>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', color: '#6B7280' }}>Avg Selling</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                ${product.quantity > 0 ? (product.revenue / product.quantity).toFixed(2) : '0.00'}
              </div>
            </div>
          </div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Revenue Trend</h5>
          <div style={{ height: '140px', backgroundColor: '#F9FAFB', borderRadius: '6px', padding: '8px' }}>
            <canvas ref={trendChartRef} />
          </div>
        </div>
        
        <div>
          <button
            onClick={() => callbacks.OpenEntityRecord('Products', [{ FieldName: 'ID', Value: product.id }])}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563EB'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3B82F6'}
          >
            View Full Product Details ↗
          </button>
        </div>
      </div>
    </div>
  );
}