function DealVelocitySummary({ deals, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };
  
  // Calculate summary metrics
  const totalDeals = deals.length;
  const closedDeals = deals.filter(d => d.Stage === 'Closed Won' || d.Stage === 'Closed Lost').length;
  const wonDeals = deals.filter(d => d.Stage === 'Closed Won').length;
  const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
  const totalValue = deals.reduce((sum, d) => sum + (d.Amount || 0), 0);
  const wonValue = deals.filter(d => d.Stage === 'Closed Won').reduce((sum, d) => sum + (d.Amount || 0), 0);
  
  const metrics = [
    {
      label: 'Total Deals',
      value: totalDeals,
      color: '#3B82F6',
      format: 'number'
    },
    {
      label: 'Won Deals',
      value: wonDeals,
      color: '#10B981',
      format: 'number'
    },
    {
      label: 'Win Rate',
      value: winRate,
      color: '#F59E0B',
      format: 'percent'
    },
    {
      label: 'Total Value',
      value: totalValue,
      color: '#8B5CF6',
      format: 'currency'
    },
    {
      label: 'Won Value',
      value: wonValue,
      color: '#EC4899',
      format: 'currency'
    }
  ];
  
  const formatValue = (value, format) => {
    switch (format) {
      case 'currency':
        return formatCurrency(value);
      case 'percent':
        return `${value}%`;
      default:
        return value.toLocaleString();
    }
  };
  
  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '12px',
      marginBottom: '20px'
    }}>
      {metrics.map((metric, index) => (
        <div 
          key={index}
          style={{ 
            padding: '12px', 
            backgroundColor: '#F9FAFB', 
            borderRadius: '8px',
            borderLeft: `4px solid ${metric.color}`
          }}
        >
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
            {metric.label}
          </div>
          <div style={{ 
            fontSize: metric.format === 'currency' ? '20px' : '24px', 
            fontWeight: 'bold', 
            color: '#111827' 
          }}>
            {formatValue(metric.value, metric.format)}
          </div>
        </div>
      ))}
    </div>
  );
}