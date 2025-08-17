function PipelineKanban({ deals, stages, stageColors, onStageClick }) {
  const formatCurrency = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: `repeat(${stages.length}, 1fr)`,
      gap: '12px',
      marginBottom: '20px'
    }}>
      {stages.map(stage => {
        const stageDeals = deals.filter(d => d.Stage === stage);
        const stageValue = stageDeals.reduce((sum, d) => sum + (d.Amount || 0), 0);
        
        return (
          <div
            key={stage}
            onClick={() => onStageClick(`${stage} Deals`, stageDeals, 'stage', stage)}
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: '8px',
              padding: '12px',
              borderTop: `3px solid ${stageColors[stage]}`,
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
              {stage}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: stageColors[stage] }}>
              {stageDeals.length}
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>
              {formatCurrency(stageValue)}
            </div>
          </div>
        );
      })}
    </div>
  );
}