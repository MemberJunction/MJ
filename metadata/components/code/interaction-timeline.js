function InteractionTimeline ({ interactions, dateRange, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const filteredInteractions = useMemo(() => {
    if (!interactions) return [];
    if (!dateRange) return interactions;
    
    return interactions.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= new Date(dateRange.start) && itemDate <= new Date(dateRange.end);
    });
  }, [interactions, dateRange]);

  const getEventIcon = (type) => {
    const icons = {
      'call': '📞',
      'email': '✉',
      'meeting': '🤝',
      'note': '✏',
      'task': '✓'
    };
    return icons[type] || '•';
  };

  const getEventColor = (type) => {
    const colors = {
      'call': '#17a2b8',
      'email': '#007bff',
      'meeting': '#28a745',
      'note': '#ffc107',
      'task': '#6f42c1'
    };
    return colors[type] || '#6c757d';
  };

  return (
    <div style={{ position: 'relative', padding: '20px' }}>
      <div style={{
        position: 'absolute',
        left: '39px',
        top: '20px',
        bottom: '20px',
        width: '2px',
        backgroundColor: '#e0e0e0'
      }} />
      
      {filteredInteractions.map((item, index) => (
        <div
          key={item.id || index}
          style={{
            display: 'flex',
            marginBottom: '20px',
            position: 'relative'
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: getEventColor(item.type),
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: 0,
            zIndex: 1,
            border: '3px solid #fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            {getEventIcon(item.type)}
          </div>
          
          <div style={{
            marginLeft: '15px',
            flex: 1,
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            padding: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <div style={{ fontWeight: '500', fontSize: '14px' }}>{item.title}</div>
              <div style={{ fontSize: '11px', color: '#999' }}>
                {new Date(item.date).toLocaleDateString()}
              </div>
            </div>
            <div style={{ fontSize: '13px', color: '#666' }}>{item.description}</div>
            {item.user && (
              <div style={{ fontSize: '11px', color: '#999', marginTop: '5px' }}>
                by {item.user}
              </div>
            )}
          </div>
        </div>
      ))}
      
      {(!filteredInteractions || filteredInteractions.length === 0) && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
          No interactions found
        </div>
      )}
    </div>
  );
};