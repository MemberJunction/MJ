// CustomerHeader Sub-component
const CustomerHeader = ({ customer, metrics, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const handleOpenCustomer = () => {
    if (callbacks?.OpenEntityRecord && customer?.id) {
      callbacks.OpenEntityRecord('Accounts', customer.id);
    }
  };

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      marginBottom: '20px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {customer?.logo ? (
            <img 
              src={customer.logo} 
              alt={customer.name}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '8px',
                objectFit: 'contain',
                backgroundColor: '#f8f9fa',
                padding: '5px'
              }}
            />
          ) : (
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '8px',
              backgroundColor: '#007bff',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 'bold'
            }}>
              {customer?.name?.charAt(0) || '?'}
            </div>
          )}
          
          <div>
            <h2 style={{ margin: '0 0 5px 0' }}>
              {customer?.name || 'Customer'}
              <button
                onClick={handleOpenCustomer}
                style={{
                  marginLeft: '10px',
                  padding: '2px 6px',
                  fontSize: '12px',
                  border: '1px solid #007bff',
                  borderRadius: '3px',
                  background: '#fff',
                  color: '#007bff',
                  cursor: 'pointer'
                }}
                title="Open in Explorer"
              >
                ↗
              </button>
            </h2>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {customer?.industry} • {customer?.type} • {customer?.status}
            </div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '5px' }}>
              {customer?.website && (
                <a href={customer.website} target="_blank" rel="noopener noreferrer" 
                   style={{ color: '#007bff', textDecoration: 'none' }}>
                  {customer.website}
                </a>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '30px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
              ${(metrics?.totalRevenue / 1000000).toFixed(1)}M
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total Revenue</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
              {metrics?.dealCount || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Active Deals</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' }}>
              {metrics?.healthScore || 0}%
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Health Score</div>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: '15px',
        paddingTop: '15px',
        borderTop: '1px solid #e9ecef',
        display: 'flex',
        gap: '20px',
        fontSize: '13px'
      }}>
        <div><strong>Account Manager:</strong> {customer?.accountManager || 'Unassigned'}</div>
        <div><strong>Created:</strong> {customer?.createdDate ? new Date(customer.createdDate).toLocaleDateString() : 'N/A'}</div>
        <div><strong>Last Activity:</strong> {customer?.lastActivity ? new Date(customer.lastActivity).toLocaleDateString() : 'N/A'}</div>
      </div>
    </div>
  );
};

return CustomerHeader;