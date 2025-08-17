function DealVelocityDealDetail({ deal, onClose, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
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
      zIndex: 1001
    }}
    onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{deal.DealName}</h3>
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
        
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Amount</label>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
                {formatCurrency(deal.Amount)}
              </div>
            </div>
            
            <div>
              <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Stage</label>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>
                {deal.Stage}
              </div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Close Date</label>
              <div style={{ fontSize: '14px', color: '#111827' }}>
                {deal.CloseDate ? new Date(deal.CloseDate).toLocaleDateString() : 'Not set'}
              </div>
            </div>
            
            <div>
              <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Probability</label>
              <div style={{ fontSize: '14px', color: '#111827' }}>
                {deal.Probability || 0}%
              </div>
            </div>
          </div>
          
          {deal.DealSource && (
            <div>
              <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Source</label>
              <div style={{ fontSize: '14px', color: '#111827' }}>
                {deal.DealSource}
              </div>
            </div>
          )}
          
          {deal.NextStep && (
            <div>
              <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Next Step</label>
              <div style={{ fontSize: '14px', color: '#111827' }}>
                {deal.NextStep}
              </div>
            </div>
          )}
        </div>
        
        <div style={{ 
          marginTop: '20px', 
          paddingTop: '20px', 
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => {
              if (callbacks.OpenEntityRecord) {
                callbacks.OpenEntityRecord('Deals', [
                  { FieldName: 'ID', Value: deal.ID }
                ]);
                onClose();
              } else {
                console.warn('OpenEntityRecord callback not available');
              }
            }}
            style={{
              padding: '8px 12px',
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px'
            }}
            title="Open record"
          >
            ↗
          </button>
        </div>
      </div>
    </div>
  );
}