function AccountsByIndustryDetails ({ account, isOpen, onClose, onOpenRecord }) {
  if (!isOpen || !account) {
    return null;
  }
  
  // Format currency
  const formatCurrency = (value) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  };
   
  return (
    <>
      {/* Overlay */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 999,
          animation: 'fadeIn 0.3s ease'
        }}
      />
      
      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: '75px',
        right: 0,
        bottom: 0,
        width: '400px',
        backgroundColor: '#fff',
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
        transform: 'translateX(0)',
        transition: 'transform 0.3s ease',
        overflowY: 'auto',
        borderTopLeftRadius: '8px'
      }}>
        {/* Panel Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            Account Details
          </h3>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F3F4F6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#6B7280'
            }}
          >
            ×
          </button>
        </div>
        
        {/* Panel Content */}
        <div style={{ padding: '20px' }}>
          {/* Account Name and Open Button */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '12px'
            }}>
              <h4 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                color: '#111827',
                marginBottom: '4px'
              }}>
                {account.AccountName}
              </h4>
              <button
                onClick={onOpenRecord}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#fff',
                  backgroundColor: '#3B82F6',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                Open Record ↗
              </button>
            </div>
            <div style={{ fontSize: '14px', color: '#6B7280' }}>
              {account.Industry || 'No industry'}
            </div>
          </div>
          
          {/* Key Information */}
          <div style={{ marginBottom: '24px' }}>
            <h5 style={{ 
              fontSize: '12px', 
              fontWeight: '600', 
              color: '#6B7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px'
            }}>
              Key Information
            </h5>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '2px' }}>Annual Revenue</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                  {formatCurrency(account.AnnualRevenue)}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '2px' }}>Status</div>
                  <span style={{
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '4px',
                    backgroundColor: account.AccountStatus === 'Active' ? '#D1FAE5' : '#FEE2E2',
                    color: account.AccountStatus === 'Active' ? '#065F46' : '#991B1B'
                  }}>
                    {account.AccountStatus}
                  </span>
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '2px' }}>Type</div>
                  <span style={{
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '4px',
                    backgroundColor: 
                      account.AccountType === 'Customer' ? '#DBEAFE' :
                      account.AccountType === 'Prospect' ? '#FEF3C7' :
                      account.AccountType === 'Partner' ? '#E9D5FF' :
                      account.AccountType === 'Vendor' ? '#FED7AA' :
                      '#F3F4F6',
                    color: 
                      account.AccountType === 'Customer' ? '#1E40AF' :
                      account.AccountType === 'Prospect' ? '#92400E' :
                      account.AccountType === 'Partner' ? '#6B21A8' :
                      account.AccountType === 'Vendor' ? '#9A3412' :
                      '#374151'
                  }}>
                    {account.AccountType}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Contact Information */}
          <div style={{ marginBottom: '24px' }}>
            <h5 style={{ 
              fontSize: '12px', 
              fontWeight: '600', 
              color: '#6B7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px'
            }}>
              Contact Information
            </h5>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {account.Phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>📞</span>
                  <span style={{ fontSize: '14px', color: '#111827' }}>{account.Phone}</span>
                </div>
              )}
              
              {account.Website && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>🌐</span>
                  <a 
                    href={account.Website.startsWith('http') ? account.Website : `https://${account.Website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '14px', color: '#3B82F6', textDecoration: 'none' }}
                  >
                    {account.Website}
                  </a>
                </div>
              )}
            </div>
          </div>
          
          {/* Address */}
          {(account.BillingCity || account.BillingState || account.BillingCountry) && (
            <div>
              <h5 style={{ 
                fontSize: '12px', 
                fontWeight: '600', 
                color: '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '12px'
              }}>
                Location
              </h5>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>📍</span>
                <span style={{ fontSize: '14px', color: '#111827' }}>
                  {[account.BillingCity, account.BillingState, account.BillingCountry]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Animation styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}