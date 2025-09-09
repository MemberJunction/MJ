function DealCards({ deals, stageColors = {}, onDealClick, onOpenClick }) {
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {deals.map((deal, index) => (
        <div
          key={deal.ID || index}
          style={{
            padding: '16px',
            backgroundColor: '#F9FAFB',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => onDealClick && onDealClick(deal)}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F3F4F6';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#F9FAFB';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontWeight: 'bold', flex: 1 }}>{deal.DealName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontWeight: 'bold', color: '#059669' }}>
                ${((deal.Amount || 0) / 1000).toFixed(0)}K
              </div>
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
            </div>
          </div>
          <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '4px' }}>
            {deal.AccountName || 'No Account'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9CA3AF' }}>
            <span>Close: {deal.CloseDate ? new Date(deal.CloseDate).toLocaleDateString() : 'TBD'}</span>
            <span>{deal.Probability || 0}% probability</span>
          </div>
          {deal.Stage && stageColors[deal.Stage] && (
            <div style={{ 
              marginTop: '8px',
              padding: '4px 8px',
              backgroundColor: stageColors[deal.Stage] || '#6B7280',
              color: 'white',
              borderRadius: '4px',
              fontSize: '11px',
              display: 'inline-block'
            }}>
              {deal.Stage}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}