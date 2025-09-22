// DealCard Sub-component
function DealCard ({ deal, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Load OpenRecordButton component
  const OpenRecordButton = components['OpenRecordButton'];
  const getStageColor = (stage) => {
    const colors = {
      'Prospecting': '#17a2b8',
      'Qualification': '#007bff',
      'Proposal': '#28a745',
      'Negotiation': '#ffc107',
      'Closed Won': '#28a745',
      'Closed Lost': '#dc3545'
    };
    return colors[stage] || '#6c757d';
  };


  const cardStyle = {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '10px',
    backgroundColor: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    transition: 'box-shadow 0.2s'
  };

  return (
    <div
      style={cardStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#333' }}>{deal.name}</h4>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
            {deal.accountName}
          </div>
          <div style={{ fontSize: '13px', color: '#888' }}>
            Owner: {deal.ownerName}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
            ${(deal.value || 0).toLocaleString()}
          </div>
          <div style={{
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: getStageColor(deal.stage)
          }}>
            {deal.stage}
          </div>
        </div>
      </div>
      
      <div style={{
        marginTop: '10px',
        paddingTop: '10px',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '12px',
        color: '#999'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>Close Date: {deal.closeDate ? new Date(deal.closeDate).toLocaleDateString() : 'TBD'}</span>
          <span>Probability: {deal.probability || 0}%</span>
        </div>
        {OpenRecordButton && (
          <OpenRecordButton
            entityName="Deals"
            record={deal}
            text="Open"
            variant="text"
            size="small"
            icon="↗"
            showIcon={true}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings}
            onSaveUserSettings={onSaveUserSettings}
          />
        )}
      </div>
    </div>
  );
};