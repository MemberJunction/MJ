function DealList({ deals, stageColors = {}, onDealClick, onOpenClick }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
          <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#6B7280' }}>Deal</th>
          <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#6B7280' }}>Stage</th>
          <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#6B7280' }}>Amount</th>
          <th style={{ padding: '8px', width: '30px' }}></th>
        </tr>
      </thead>
      <tbody>
        {deals.map((deal, index) => (
          <tr
            key={deal.ID || index}
            style={{
              borderBottom: '1px solid #F3F4F6',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onClick={() => onDealClick && onDealClick(deal)}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <td style={{ padding: '12px 8px' }}>
              <div style={{ fontWeight: '500' }}>{deal.DealName}</div>
              <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{deal.AccountName}</div>
            </td>
            <td style={{ padding: '12px 8px' }}>
              {deal.Stage && (
                <span style={{
                  padding: '2px 6px',
                  backgroundColor: stageColors[deal.Stage] || '#6B7280',
                  color: 'white',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}>
                  {deal.Stage}
                </span>
              )}
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '500' }}>
              ${((deal.Amount || 0) / 1000).toFixed(0)}K
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
              {onOpenClick && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenClick('Deals', [{ FieldName: 'ID', Value: deal.ID }]);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6B7280',
                    cursor: 'pointer',
                    padding: '2px',
                    fontSize: '14px'
                  }}
                  title="Open in Explorer"
                >
                  <i className="fa-solid fa-up-right-from-square"></i>
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}