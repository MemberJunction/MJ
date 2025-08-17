function DrillDownPanel({ isOpen, drillDownData, stageColors = {}, onClose, onOpenDeal, DealCards, DealList }) {
  const [localFilter, setLocalFilter] = useState('');
  const [localSort, setLocalSort] = useState('Amount');
  const [displayMode, setDisplayMode] = useState('cards');
  
  if (!drillDownData) return null;
  
  const filteredDeals = drillDownData.deals.filter(deal => 
    deal.DealName?.toLowerCase().includes(localFilter.toLowerCase()) ||
    deal.AccountName?.toLowerCase().includes(localFilter.toLowerCase())
  );
  
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    switch (localSort) {
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
  
  const formatCurrency = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };
  
  return (
    <div
      style={{
        position: 'fixed',
        right: isOpen ? 0 : '-500px',
        top: '75px',
        bottom: 0,
        width: '500px',
        backgroundColor: '#fff',
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
        backgroundColor: drillDownData.type === 'stage' ? stageColors[drillDownData.metadata] : '#3B82F6',
        color: 'white'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{drillDownData.title}</h3>
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
          {sortedDeals.length} deals • {formatCurrency(sortedDeals.reduce((sum, d) => sum + (d.Amount || 0), 0))}
        </div>
      </div>
      
      <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB' }}>
        <input
          type="text"
          placeholder="Filter deals..."
          value={localFilter}
          onChange={(e) => setLocalFilter(e.target.value)}
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
            onClick={() => setDisplayMode('cards')}
            style={{
              padding: '6px 12px',
              backgroundColor: displayMode === 'cards' ? '#3B82F6' : '#F3F4F6',
              color: displayMode === 'cards' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Cards
          </button>
          <button
            onClick={() => setDisplayMode('list')}
            style={{
              padding: '6px 12px',
              backgroundColor: displayMode === 'list' ? '#3B82F6' : '#F3F4F6',
              color: displayMode === 'list' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            List
          </button>
          <select
            value={localSort}
            onChange={(e) => setLocalSort(e.target.value)}
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
        {displayMode === 'cards' ? (
          <DealCards 
            deals={sortedDeals} 
            stageColors={stageColors}
            onOpenClick={onOpenDeal}
          />
        ) : (
          <DealList 
            deals={sortedDeals}
            stageColors={stageColors}
            onOpenClick={onOpenDeal}
          />
        )}
      </div>
    </div>
  );
}