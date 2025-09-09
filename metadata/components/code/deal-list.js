// DealList Sub-component
function DealList ({ deals, sortConfig, onSort, onOpenDeal, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const handleSort = (field) => {
    const newOrder = sortConfig?.field === field && sortConfig?.order === 'asc' ? 'desc' : 'asc';
    if (onSort) {
      onSort({ field, order: newOrder });
    }
  };

  const getSortIcon = (field) => {
    if (sortConfig?.field !== field) return '↕';
    return sortConfig.order === 'asc' ? '↑' : '↓';
  };

  const handleOpen = (dealId) => {
    if (onOpenDeal) {
      onOpenDeal(dealId);
    } else if (callbacks?.OpenEntityRecord) {
      callbacks.OpenEntityRecord('Deals', dealId);
    }
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse',
        backgroundColor: '#fff'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
            <th 
              onClick={() => handleSort('name')}
              style={{
                padding: '12px',
                textAlign: 'left',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Deal Name {getSortIcon('name')}
            </th>
            <th 
              onClick={() => handleSort('accountName')}
              style={{
                padding: '12px',
                textAlign: 'left',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Account {getSortIcon('accountName')}
            </th>
            <th 
              onClick={() => handleSort('stage')}
              style={{
                padding: '12px',
                textAlign: 'left',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Stage {getSortIcon('stage')}
            </th>
            <th 
              onClick={() => handleSort('value')}
              style={{
                padding: '12px',
                textAlign: 'right',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Value {getSortIcon('value')}
            </th>
            <th 
              onClick={() => handleSort('probability')}
              style={{
                padding: '12px',
                textAlign: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Prob. {getSortIcon('probability')}
            </th>
            <th 
              onClick={() => handleSort('closeDate')}
              style={{
                padding: '12px',
                textAlign: 'left',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Close Date {getSortIcon('closeDate')}
            </th>
            <th style={{ 
              padding: '12px', 
              textAlign: 'center',
              width: '50px'
            }}>
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {deals && deals.map((deal, index) => (
            <tr 
              key={deal.id || index}
              style={{ 
                borderBottom: '1px solid #dee2e6',
                transition: 'background-color 0.1s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8f9fa';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <td style={{ padding: '12px' }}>
                <div style={{ fontWeight: '500' }}>{deal.name}</div>
                <div style={{ fontSize: '12px', color: '#6c757d' }}>{deal.ownerName}</div>
              </td>
              <td style={{ padding: '12px' }}>{deal.accountName}</td>
              <td style={{ padding: '12px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: deal.stage === 'Closed Won' ? '#d4edda' : 
                                   deal.stage === 'Closed Lost' ? '#f8d7da' : '#e7f3ff',
                  color: deal.stage === 'Closed Won' ? '#155724' : 
                         deal.stage === 'Closed Lost' ? '#721c24' : '#004085'
                }}>
                  {deal.stage}
                </span>
              </td>
              <td style={{ padding: '12px', textAlign: 'right', fontWeight: '500' }}>
                ${(deal.value || 0).toLocaleString()}
              </td>
              <td style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{
                  display: 'inline-block',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: `conic-gradient(#28a745 0deg ${deal.probability * 3.6}deg, #e9ecef ${deal.probability * 3.6}deg)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}>
                  {deal.probability}%
                </div>
              </td>
              <td style={{ padding: '12px' }}>
                {deal.closeDate ? new Date(deal.closeDate).toLocaleDateString() : '-'}
              </td>
              <td style={{ padding: '12px', textAlign: 'center' }}>
                <button
                  onClick={() => handleOpen(deal.id)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '14px',
                    border: '1px solid #007bff',
                    borderRadius: '4px',
                    background: '#fff',
                    color: '#007bff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#007bff';
                    e.target.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#fff';
                    e.target.style.color = '#007bff';
                  }}
                  title="Open in Explorer"
                >
                  ↗
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!deals || deals.length === 0) && (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center',
          color: '#6c757d'
        }}>
          No deals found
        </div>
      )}
    </div>
  );
}