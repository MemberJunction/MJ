function SalesFunnelDealList({ deals, callbacks, formatCurrency }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
          <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#6B7280' }}>Deal</th>
          <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#6B7280' }}>Amount</th>
          <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#6B7280' }}>Prob</th>
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
            onClick={() => {
              if (callbacks?.OpenEntityRecord) {
                callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }]);
              }
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <td style={{ padding: '12px 8px' }}>
              <div style={{ fontWeight: '500' }}>{deal.DealName}</div>
              <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{deal.AccountName}</div>
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '500' }}>
              {formatCurrency(deal.Amount)}
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px' }}>
              {deal.Probability}%
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (callbacks?.OpenEntityRecord) {
                    callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }]);
                  }
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
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}