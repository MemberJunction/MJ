// RepDetailsPanel Sub-component
const RepDetailsPanel = ({ data, isOpen, onClose, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const [activeTab, setActiveTab] = useState('details');

  return (
    <div 
      className="repdetailspanel-panel"
      style={{
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
      }}
    >
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0 }}>{data?.title || 'RepDetailsPanel'}</h3>
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

      <div style={{ padding: '15px', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setActiveTab('details')}
            style={{
              padding: '8px 15px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: activeTab === 'details' ? '#007bff' : '#fff',
              color: activeTab === 'details' ? '#fff' : '#333',
              cursor: 'pointer'
            }}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '8px 15px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: activeTab === 'history' ? '#007bff' : '#fff',
              color: activeTab === 'history' ? '#fff' : '#333',
              cursor: 'pointer'
            }}
          >
            History
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {activeTab === 'details' && (
          <div>
            {data && Object.entries(data).map(([key, value]) => (
              <div key={key} style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '3px' }}>{key}</div>
                <div style={{ fontSize: '14px', color: '#333' }}>{String(value)}</div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'history' && (
          <div>
            <p style={{ color: '#666' }}>History information would be displayed here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

return RepDetailsPanel;