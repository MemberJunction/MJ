function SalesFunnelStagePanel({ isOpen, stageData, onClose, components, callbacks, formatCurrency }) {
  const [localSortBy, setLocalSortBy] = useState('Amount');
  const [localFilterText, setLocalFilterText] = useState('');
  const [localDisplayMode, setLocalDisplayMode] = useState('cards');
  
  if (!isOpen || !stageData) return null;
  
  const DealCard = components['SalesFunnelDealCard'];
  const DealList = components['SalesFunnelDealList'];
  
  const filteredDeals = stageData.deals.filter(deal => 
    !localFilterText || deal.DealName?.toLowerCase().includes(localFilterText.toLowerCase())
  );
  
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    switch (localSortBy) {
      case 'Amount':
        return (b.Amount || 0) - (a.Amount || 0);
      case 'CloseDate':
        return new Date(b.CloseDate || 0) - new Date(a.CloseDate || 0);
      case 'Probability':
        return (b.Probability || 0) - (a.Probability || 0);
      default:
        return 0;
    }
  });
  
  return (
    <div
      style={{
        position: 'fixed',
        right: isOpen ? 0 : '-500px',
        top: '75px',
        bottom: 0,
        width: '500px',
        backgroundColor: 'white',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        transition: 'right 0.3s ease'
      }}
    >
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: stageData.color || '#3B82F6',
        color: 'white'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '20px' }}>{stageData.title || stageData.stage}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '24px',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: '8px', fontSize: '14px', opacity: 0.9 }}>
          {stageData.deals.length} deals • {formatCurrency(stageData.deals.reduce((sum, d) => sum + (d.Amount || 0), 0))}
        </div>
      </div>
      
      <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB' }}>
        <input
          type="text"
          placeholder="Filter deals..."
          value={localFilterText}
          onChange={(e) => setLocalFilterText(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            marginBottom: '12px'
          }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setLocalDisplayMode('cards')}
            style={{
              padding: '6px 12px',
              backgroundColor: localDisplayMode === 'cards' ? '#3B82F6' : '#F3F4F6',
              color: localDisplayMode === 'cards' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Cards
          </button>
          <button
            onClick={() => setLocalDisplayMode('list')}
            style={{
              padding: '6px 12px',
              backgroundColor: localDisplayMode === 'list' ? '#3B82F6' : '#F3F4F6',
              color: localDisplayMode === 'list' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            List
          </button>
          <select
            value={localSortBy}
            onChange={(e) => setLocalSortBy(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              flex: 1
            }}
          >
            <option value="Amount">Sort by Amount</option>
            <option value="CloseDate">Sort by Close Date</option>
            <option value="Probability">Sort by Probability</option>
          </select>
        </div>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {localDisplayMode === 'cards' ? (
          <div style={{ display: 'grid', gap: '12px' }}>
            {sortedDeals.map(deal => (
              <DealCard 
                key={deal.ID} 
                deal={deal} 
                callbacks={callbacks}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        ) : (
          <DealList 
            deals={sortedDeals} 
            callbacks={callbacks}
            formatCurrency={formatCurrency}
          />
        )}
      </div>
    </div>
  );
}