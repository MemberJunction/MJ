// TeamLeaderboard Sub-component
function TeamLeaderboard ({ repData, onRepClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [sortBy, setSortBy] = useState('revenue');

  const sortedTeamData = useMemo(() => {
    if (!repData) return [];
    return [...repData].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'deals') return b.dealCount - a.dealCount;
      return b.revenue - a.revenue;
    });
  }, [repData, sortBy]);

  const maxRevenue = Math.max(...(repData || []).map(rep => rep.revenue || 0), 1);

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}>
      <div style={{ marginBottom: '15px' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Team Performance</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setSortBy('revenue')}
            style={{
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: sortBy === 'revenue' ? '#007bff' : '#fff',
              color: sortBy === 'revenue' ? '#fff' : '#333',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Revenue
          </button>
          <button
            onClick={() => setSortBy('deals')}
            style={{
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: sortBy === 'deals' ? '#007bff' : '#fff',
              color: sortBy === 'deals' ? '#fff' : '#333',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Deals
          </button>
          <button
            onClick={() => setSortBy('name')}
            style={{
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: sortBy === 'name' ? '#007bff' : '#fff',
              color: sortBy === 'name' ? '#fff' : '#333',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Name
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sortedTeamData.map((rep, index) => (
          <div
            key={rep.id || index}
            onClick={() => onRepClick && onRepClick(rep)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e9ecef';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f8f9fa';
            }}
          >
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#6c757d',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '12px',
              marginRight: '10px'
            }}>
              {index + 1}
            </div>
            
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '500', marginBottom: '2px' }}>{rep.name}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {rep.dealCount} deals • {rep.winRate}% win rate
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                ${(rep.revenue / 1000000).toFixed(2)}M
              </div>
              <div style={{
                width: '100px',
                height: '4px',
                backgroundColor: '#e9ecef',
                borderRadius: '2px',
                overflow: 'hidden',
                marginTop: '4px'
              }}>
                <div style={{
                  width: `${(rep.revenue / maxRevenue) * 100}%`,
                  height: '100%',
                  backgroundColor: '#28a745',
                  transition: 'width 0.3s'
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}