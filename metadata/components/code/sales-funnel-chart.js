function SalesFunnelChart({ funnelData, viewMode, onStageClick, closedLost, formatCurrency }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      {funnelData.map((stage, index) => (
        <div
          key={stage.stage}
          className="funnel-stage"
          style={{
            width: `${stage.width}%`,
            maxWidth: '600px',
            marginBottom: '4px',
            position: 'relative',
            cursor: 'pointer',
            opacity: 0,
            transform: 'translateY(20px)',
            animation: `fadeInUp 0.5s ${index * 0.1}s forwards`,
            transition: 'transform 0.2s ease'
          }}
          onClick={() => onStageClick(stage)}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
        >
          <div
            style={{
              background: `linear-gradient(135deg, ${stage.color}dd, ${stage.color}99)`,
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              minHeight: '60px'
            }}
          >
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>{stage.stage}</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {viewMode === 'count' ? stage.count : formatCurrency(stage.value)}
              </div>
            </div>
            {index > 0 && (
              <div style={{ color: 'white', textAlign: 'right' }}>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Conversion</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  {stage.conversionRate.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      
      {/* Lost deals indicator */}
      {closedLost.count > 0 && (
        <div
          style={{
            marginTop: '20px',
            padding: '12px 20px',
            backgroundColor: '#FEE2E2',
            borderRadius: '8px',
            color: '#991B1B',
            opacity: 0,
            animation: 'fadeIn 0.5s 0.5s forwards'
          }}
        >
          <div style={{ fontSize: '14px' }}>Lost Deals</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {closedLost.count} deals ({formatCurrency(closedLost.value)})
          </div>
        </div>
      )}
    </div>
  );
}