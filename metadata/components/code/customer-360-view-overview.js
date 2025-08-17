function Customer360Overview({ account, contacts, deals, engagementScore }) {
  const formatCurrency = (value) => {
    if (!value) return '$0';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const getEngagementColor = (score) => {
    if (score >= 70) return '#10B981';
    if (score >= 40) return '#F59E0B';
    return '#EF4444';
  };

  const totalRevenue = deals
    .filter(d => d.Stage === 'Closed Won')
    .reduce((sum, d) => sum + (d.Amount || 0), 0);
  
  const activeDeals = deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
      <div style={{
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6B7280' }}>Engagement Score</h3>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: getEngagementColor(engagementScore) }}>
          {engagementScore}%
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#9CA3AF' }}>
          {engagementScore >= 70 ? 'Highly Engaged' : engagementScore >= 40 ? 'Moderately Engaged' : 'Low Engagement'}
        </div>
      </div>

      <div style={{
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6B7280' }}>Lifetime Value</h3>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
          {formatCurrency(totalRevenue)}
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#9CA3AF' }}>
          {deals.filter(d => d.Stage === 'Closed Won').length} closed deals
        </div>
      </div>

      <div style={{
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6B7280' }}>Active Opportunities</h3>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4F46E5' }}>
          {activeDeals.length}
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#9CA3AF' }}>
          Worth {formatCurrency(activeDeals.reduce((sum, d) => sum + (d.Amount || 0), 0))}
        </div>
      </div>

      <div style={{
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6B7280' }}>Contacts</h3>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
          {contacts.length}
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#9CA3AF' }}>
          Key relationships
        </div>
      </div>
    </div>
  );
}