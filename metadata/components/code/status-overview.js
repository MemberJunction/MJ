// StatusOverview Sub-component
const StatusOverview = ({ statusData, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const getStatusColor = (status) => {
    const colors = {
      'Paid': '#28a745',
      'Pending': '#ffc107',
      'Overdue': '#dc3545',
      'Draft': '#6c757d',
      'Sent': '#17a2b8',
      'Partial': '#fd7e14'
    };
    return colors[status] || '#6c757d';
  };

  const getStatusIcon = (status) => {
    const icons = {
      'Paid': '✓',
      'Pending': '⏰',
      'Overdue': '⚠',
      'Draft': '✎',
      'Sent': '✉',
      'Partial': '½'
    };
    return icons[status] || '•';
  };

  const totalAmount = Object.values(statusData || {}).reduce((sum, status) => 
    sum + (status.amount || 0), 0
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '15px',
      padding: '20px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px'
    }}>
      {statusData && Object.entries(statusData).map(([status, data]) => (
        <div
          key={status}
          style={{
            backgroundColor: '#fff',
            borderRadius: '6px',
            padding: '15px',
            borderLeft: `4px solid ${getStatusColor(status)}`,
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
          }}
        >
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '10px' 
          }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: getStatusColor(status) + '20',
              color: getStatusColor(status),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: 'bold',
              marginRight: '10px'
            }}>
              {getStatusIcon(status)}
            </div>
            <div>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: '500',
                color: '#333'
              }}>
                {status}
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: '#999' 
              }}>
                {data.count} invoices
              </div>
            </div>
          </div>
          
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>
            ${(data.amount / 1000).toFixed(1)}K
          </div>
          
          <div style={{ 
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid #f0f0f0'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#666'
            }}>
              <span>{((data.amount / totalAmount) * 100).toFixed(1)}% of total</span>
              <span>{data.avgDays || 0} days avg</span>
            </div>
            <div style={{
              marginTop: '5px',
              height: '4px',
              backgroundColor: '#e9ecef',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${(data.amount / totalAmount) * 100}%`,
                height: '100%',
                backgroundColor: getStatusColor(status),
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

return StatusOverview;