// PipelineKanban Sub-component
const PipelineKanban = ({ stages, deals, onDealClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const getStageColor = (stageName) => {
    const colors = {
      'Prospecting': '#6f42c1',
      'Qualification': '#007bff',
      'Proposal': '#17a2b8',
      'Negotiation': '#ffc107',
      'Closed Won': '#28a745',
      'Closed Lost': '#dc3545'
    };
    return colors[stageName] || '#6c757d';
  };

  const handleDealClick = (deal) => {
    if (onDealClick) {
      onDealClick(deal);
    } else if (callbacks?.OpenEntityRecord) {
      callbacks.OpenEntityRecord('Deals', deal.id);
    }
  };

  return (
    <div style={{
      display: 'flex',
      gap: '15px',
      overflowX: 'auto',
      padding: '10px',
      minHeight: '400px'
    }}>
      {stages.map((stage, stageIndex) => (
        <div 
          key={stage.name || stageIndex}
          style={{
            minWidth: '280px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{
            padding: '10px',
            marginBottom: '10px',
            borderBottom: `3px solid ${getStageColor(stage.name)}`,
            backgroundColor: '#fff',
            borderRadius: '4px'
          }}>
            <h4 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>{stage.name}</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666' }}>
              <span>{stage.count} deals</span>
              <span>${(stage.totalValue / 1000000).toFixed(1)}M</span>
            </div>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {deals
              .filter(deal => deal.stage === stage.name)
              .map((deal, dealIndex) => (
                <div
                  key={deal.id || dealIndex}
                  onClick={() => handleDealClick(deal)}
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    padding: '10px',
                    cursor: 'pointer',
                    transition: 'transform 0.1s, box-shadow 0.1s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ fontWeight: '500', fontSize: '14px', marginBottom: '4px' }}>
                    {deal.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                    {deal.accountName}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
                      ${(deal.value / 1000).toFixed(0)}K
                    </span>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      backgroundColor: deal.probability >= 70 ? '#d4edda' : 
                                       deal.probability >= 40 ? '#fff3cd' : '#f8d7da',
                      color: deal.probability >= 70 ? '#155724' : 
                             deal.probability >= 40 ? '#856404' : '#721c24'
                    }}>
                      {deal.probability}%
                    </span>
                  </div>
                  {deal.daysInStage > 30 && (
                    <div style={{
                      marginTop: '6px',
                      fontSize: '11px',
                      color: '#dc3545',
                      fontStyle: 'italic'
                    }}>
                      ⚠ {deal.daysInStage} days in stage
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        </div>
      ))}
    </div>
  );
};

return PipelineKanban;