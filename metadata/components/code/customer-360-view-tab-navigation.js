function Customer360TabNavigation({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'timeline', label: 'Timeline', icon: '📅' },
    { id: 'contacts', label: 'Contacts', icon: '👥' },
    { id: 'deals', label: 'Deals', icon: '💼' },
    { id: 'insights', label: 'Insights', icon: '💡' }
  ];

  return (
    <div style={{
      borderBottom: '1px solid #E5E7EB',
      marginBottom: '24px',
      display: 'flex',
      gap: '8px'
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            padding: '12px 24px',
            border: 'none',
            backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
            color: activeTab === tab.id ? '#4F46E5' : '#6B7280',
            cursor: 'pointer',
            borderBottom: activeTab === tab.id ? '2px solid #4F46E5' : '2px solid transparent',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
            transition: 'all 0.2s'
          }}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}