function DealVelocityPeriodDetails({ periodData, deals, onClose, onDealSelect, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [sortBy, setSortBy] = useState('CloseDate');
  const [sortDirection, setSortDirection] = useState('DESC');
  
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortDirection(field === 'Amount' ? 'DESC' : 'ASC');
    }
  };
  
  const getSortedDeals = () => {
    const sorted = [...deals].sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (sortBy === 'CloseDate' || sortBy === '__mj_CreatedAt') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      }
      
      if (sortDirection === 'ASC') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return sorted;
  };
  
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };
  
  const stageColors = {
    'Prospecting': { bg: '#F3F4F6', text: '#6B7280' },
    'Qualification': { bg: '#DBEAFE', text: '#1E40AF' },
    'Proposal': { bg: '#FEF3C7', text: '#92400E' },
    'Negotiation': { bg: '#FED7AA', text: '#9A3412' },
    'Closed Won': { bg: '#D1FAE5', text: '#065F46' },
    'Closed Lost': { bg: '#FEE2E2', text: '#991B1B' }
  };
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}
    onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '1200px',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
            Deals for {periodData.label}
            <span style={{ marginLeft: '12px', fontSize: '16px', color: '#6B7280' }}>
              ({deals.length} deals)
            </span>
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6B7280',
              padding: '0',
              width: '30px',
              height: '30px'
            }}
          >
            ×
          </button>
        </div>
        
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {deals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
              No deals found for this period
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                  <th 
                    onClick={() => handleSort('DealName')}
                    style={{ 
                      padding: '12px', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      cursor: 'pointer',
                      color: sortBy === 'DealName' ? '#3B82F6' : '#374151'
                    }}
                  >
                    Deal Name
                    {sortBy === 'DealName' && (
                      <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Stage</th>
                  <th 
                    onClick={() => handleSort('Amount')}
                    style={{ 
                      padding: '12px', 
                      textAlign: 'right', 
                      fontWeight: '600',
                      cursor: 'pointer',
                      color: sortBy === 'Amount' ? '#3B82F6' : '#374151'
                    }}
                  >
                    Amount
                    {sortBy === 'Amount' && (
                      <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th 
                    onClick={() => handleSort('CloseDate')}
                    style={{ 
                      padding: '12px', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      cursor: 'pointer',
                      color: sortBy === 'CloseDate' ? '#3B82F6' : '#374151'
                    }}
                  >
                    Close Date
                    {sortBy === 'CloseDate' && (
                      <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th 
                    onClick={() => handleSort('__mj_CreatedAt')}
                    style={{ 
                      padding: '12px', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      cursor: 'pointer',
                      color: sortBy === '__mj_CreatedAt' ? '#3B82F6' : '#374151'
                    }}
                  >
                    Created
                    {sortBy === '__mj_CreatedAt' && (
                      <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '↑' : '↓'}</span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {getSortedDeals().map((deal, index) => {
                  const stageStyle = stageColors[deal.Stage] || stageColors['Prospecting'];
                  
                  return (
                    <tr 
                      key={deal.ID}
                      style={{ 
                        borderBottom: '1px solid #E5E7EB',
                        cursor: 'pointer',
                        backgroundColor: index % 2 === 0 ? 'white' : '#F9FAFB'
                      }}
                      onClick={() => onDealSelect(deal)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#F9FAFB'}
                    >
                      <td style={{ padding: '12px', fontWeight: '500' }}>{deal.DealName}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          backgroundColor: stageStyle.bg,
                          color: stageStyle.text
                        }}>
                          {deal.Stage}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                        {formatCurrency(deal.Amount)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {deal.CloseDate ? new Date(deal.CloseDate).toLocaleDateString() : '-'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {new Date(deal.__mj_CreatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}