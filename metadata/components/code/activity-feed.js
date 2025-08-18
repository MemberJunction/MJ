// ActivityFeed Sub-component
const ActivityFeed = ({ items, onItemClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '15px',
      maxHeight: '400px',
      overflowY: 'auto'
    }}>
      <h4 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>Recent Activity</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items && items.map((item, index) => (
          <div
            key={item.id || index}
            onClick={() => onItemClick && onItemClick(item)}
            style={{
              padding: '10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              borderLeft: `3px solid ${item.color || '#007bff'}`,
              cursor: onItemClick ? 'pointer' : 'default',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (onItemClick) e.currentTarget.style.backgroundColor = '#e9ecef';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f8f9fa';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '500', fontSize: '14px', marginBottom: '3px' }}>{item.title}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>{item.description}</div>
              </div>
              <div style={{ fontSize: '11px', color: '#999', whiteSpace: 'nowrap' }}>{item.time}</div>
            </div>
          </div>
        ))}
      </div>
      {(!items || items.length === 0) && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
          No recent activity
        </div>
      )}
    </div>
  );
};

return ActivityFeed;