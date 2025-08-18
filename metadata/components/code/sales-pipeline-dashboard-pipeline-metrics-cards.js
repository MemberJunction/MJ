function PipelineMetricsCards({ metrics, deals, onCardClick }) {
  const formatCurrency = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
      <div 
        style={{ 
          padding: '16px', 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          border: '1px solid #E5E7EB',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onClick={() => onCardClick('All Pipeline Deals', deals, 'all', null)}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Pipeline Value</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
          {formatCurrency(metrics.totalValue)}
        </div>
      </div>
      
      <div 
        style={{ 
          padding: '16px', 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          border: '1px solid #E5E7EB',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onClick={() => {
          const activeDeals = deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage));
          onCardClick('Active Deals', activeDeals, 'active', null);
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Active Deals</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
          {metrics.activeCount}
        </div>
      </div>
      
      <div 
        style={{ 
          padding: '16px', 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          border: '1px solid #E5E7EB',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onClick={() => {
          const wonDeals = deals.filter(d => d.Stage === 'Closed Won');
          onCardClick('Won Deals', wonDeals, 'won', null);
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Win Rate</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
          {metrics.winRate.toFixed(0)}%
        </div>
      </div>
      
      <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Avg Deal Size</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
          {formatCurrency(metrics.avgDealSize)}
        </div>
      </div>
      
      <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Avg Cycle</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
          {metrics.avgCycleTime.toFixed(0)} days
        </div>
      </div>
    </div>
  );
}