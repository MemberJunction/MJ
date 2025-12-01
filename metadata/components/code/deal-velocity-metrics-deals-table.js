function DealsTable({ deals, title, onClose, sortConfig, setSortConfig, callbacks }) {
  const formatCurrency = (value) => {
    if (!value) return '$0';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date).format('MMM D, YYYY');
  };

  const getStageColor = (stage) => {
    const colors = {
      'Prospecting': '#9CA3AF',
      'Qualification': '#3B82F6',
      'Proposal': '#8B5CF6',
      'Negotiation': '#F59E0B',
      'Closed Won': '#10B981',
      'Closed Lost': '#EF4444'
    };
    return colors[stage] || '#6B7280';
  };

  // Sort deals
  const sortedDeals = [...deals].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    if (sortConfig.direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '20px',
      marginTop: '20px',
      border: '1px solid #E5E7EB'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
          {title} ({deals.length})
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#6B7280'
          }}
        >
          ×
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
              <th
                onClick={() => handleSort('DealName')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Deal Name {sortConfig.key === 'DealName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('Stage')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Stage {sortConfig.key === 'Stage' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('Amount')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'right',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Amount {sortConfig.key === 'Amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('Probability')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Prob % {sortConfig.key === 'Probability' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('CloseDate')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Close Date {sortConfig.key === 'CloseDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{
                padding: '12px 8px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase'
              }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedDeals.map((deal, index) => (
              <tr
                key={deal.ID || index}
                style={{
                  borderBottom: '1px solid #F3F4F6',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <td style={{ padding: '12px 8px', fontSize: '14px', fontWeight: '500' }}>
                  {deal.DealName}
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <span style={{
                    padding: '4px 8px',
                    backgroundColor: getStageColor(deal.Stage) + '20',
                    color: getStageColor(deal.Stage),
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {deal.Stage}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px' }}>
                  {formatCurrency(deal.Amount)}
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '14px' }}>
                  {deal.Probability || 0}%
                </td>
                <td style={{ padding: '12px 8px', fontSize: '14px', color: '#6B7280' }}>
                  {formatDate(deal.CloseDate)}
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  <button
                    onClick={() => callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }])}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4F46E5',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px'
                    }}
                    title="Open Deal"
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
