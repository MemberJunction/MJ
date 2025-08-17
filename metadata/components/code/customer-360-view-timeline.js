function Customer360Timeline({ activities, onActivityClick }) {
  const getActivityIcon = (type) => {
    const icons = {
      'Call': '📞',
      'Email': '✉️',
      'Meeting': '🤝',
      'Task': '✅',
      'Note': '📝'
    };
    return icons[type] || '📌';
  };

  const getActivityColor = (type) => {
    const colors = {
      'Call': '#3B82F6',
      'Email': '#8B5CF6',
      'Meeting': '#10B981',
      'Task': '#F59E0B',
      'Note': '#6B7280'
    };
    return colors[type] || '#9CA3AF';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!activities || activities.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
        No activities found for this customer
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '40px' }}>
      {/* Timeline line */}
      <div style={{
        position: 'absolute',
        left: '20px',
        top: '0',
        bottom: '0',
        width: '2px',
        backgroundColor: '#E5E7EB'
      }} />

      {activities.map((activity, index) => (
        <div
          key={activity.ID || index}
          onClick={() => onActivityClick && onActivityClick(activity)}
          style={{
            position: 'relative',
            marginBottom: '24px',
            cursor: onActivityClick ? 'pointer' : 'default'
          }}
        >
          {/* Timeline dot */}
          <div style={{
            position: 'absolute',
            left: '-26px',
            top: '8px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: getActivityColor(activity.Type),
            border: '2px solid white',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }} />

          {/* Activity card */}
          <div style={{
            padding: '16px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            ':hover': {
              transform: 'translateX(4px)',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }
          }}
          onMouseEnter={(e) => {
            if (onActivityClick) {
              e.currentTarget.style.transform = 'translateX(4px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>{getActivityIcon(activity.Type)}</span>
              <span style={{ 
                fontWeight: 'bold', 
                color: '#111827',
                flex: 1
              }}>
                {activity.Subject || `${activity.Type} Activity`}
              </span>
              <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                {formatDate(activity.CreatedAt)}
              </span>
            </div>
            <div style={{ 
              display: 'inline-block',
              padding: '4px 8px',
              backgroundColor: getActivityColor(activity.Type) + '20',
              color: getActivityColor(activity.Type),
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '500'
            }}>
              {activity.Type}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}