// StageDetailsPanel Sub-component
const StageDetailsPanel = ({ stage, deals, isOpen, onClose, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const [sortBy, setSortBy] = useState('value');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterText, setFilterText] = useState('');

  const sortedAndFilteredDeals = useMemo(() => {
    if (!deals) return [];
    
    let filtered = deals;
    if (filterText) {
      filtered = deals.filter(deal => 
        deal.name?.toLowerCase().includes(filterText.toLowerCase()) ||
        deal.accountName?.toLowerCase().includes(filterText.toLowerCase())
      );
    }

    return [...filtered].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const modifier = sortOrder === 'asc' ? 1 : -1;
      
      if (typeof aVal === 'string') {
        return aVal.localeCompare(bVal) * modifier;
      }
      return (aVal - bVal) * modifier;
    });
  }, [deals, sortBy, sortOrder, filterText]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleOpenDeal = (dealId) => {
    if (callbacks?.OpenEntityRecord) {
      callbacks.OpenEntityRecord('Deals', dealId);
    }
  };

  return (
    <div className={`stage-details-panel ${isOpen ? 'open' : ''}`} style={{
      position: 'fixed',
      top: 0,
      right: isOpen ? 0 : '-400px',
      width: '400px',
      height: '100%',
      backgroundColor: '#fff',
      boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
      transition: 'right 0.3s ease',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{stage?.name || 'Stage Details'}</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px'
            }}
          >×</button>
        </div>
        {stage && (
          <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
            <div>{stage.count} deals</div>
            <div>Total Value: ${(stage.value || 0).toLocaleString()}</div>
            <div>Avg Days: {stage.avgDays || 0}</div>
          </div>
        )}
      </div>

      <div style={{ padding: '15px', borderBottom: '1px solid #e0e0e0' }}>
        <input
          type="text"
          placeholder="Filter deals..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        />
      </div>

      <div style={{ 
        flex: 1, 
        overflowY: 'auto',
        padding: '15px'
      }}>
        <div style={{ marginBottom: '10px' }}>
          <button 
            onClick={() => handleSort('name')}
            style={{
              marginRight: '10px',
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: sortBy === 'name' ? '#007bff' : '#fff',
              color: sortBy === 'name' ? '#fff' : '#333',
              cursor: 'pointer'
            }}
          >
            Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            onClick={() => handleSort('value')}
            style={{
              marginRight: '10px',
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: sortBy === 'value' ? '#007bff' : '#fff',
              color: sortBy === 'value' ? '#fff' : '#333',
              cursor: 'pointer'
            }}
          >
            Value {sortBy === 'value' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            onClick={() => handleSort('daysInStage')}
            style={{
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: sortBy === 'daysInStage' ? '#007bff' : '#fff',
              color: sortBy === 'daysInStage' ? '#fff' : '#333',
              cursor: 'pointer'
            }}
          >
            Days {sortBy === 'daysInStage' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>

        <div>
          {sortedAndFilteredDeals.map((deal, index) => (
            <div 
              key={deal.id || index}
              style={{
                padding: '10px',
                marginBottom: '10px',
                border: '1px solid #e0e0e0',
                borderRadius: '5px',
                backgroundColor: '#fafafa'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                {deal.name}
              </div>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                {deal.accountName}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 'bold' }}>${(deal.value || 0).toLocaleString()}</span>
                  <span style={{ marginLeft: '10px', color: '#888' }}>{deal.daysInStage} days</span>
                </div>
                <button
                  onClick={() => handleOpenDeal(deal.id)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    border: '1px solid #007bff',
                    borderRadius: '3px',
                    background: '#fff',
                    color: '#007bff',
                    cursor: 'pointer'
                  }}
                  title="Open in Explorer"
                >
                  ↗
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

return StageDetailsPanel;