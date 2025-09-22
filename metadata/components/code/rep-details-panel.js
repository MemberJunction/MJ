// RepDetailsPanel Sub-component
function RepDetailsPanel({ rep, isOpen, onClose, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [activeTab, setActiveTab] = useState('details');

  // Load SingleRecordView from component registry
  const SingleRecordView = components?.SingleRecordView;

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
        <h3 style={{ margin: 0 }}>{rep?.name || rep?.Name || 'Rep Details'}</h3>
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
            onClick={() => setActiveTab('performance')}
            style={{
              padding: '8px 15px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: activeTab === 'performance' ? '#007bff' : '#fff',
              color: activeTab === 'performance' ? '#fff' : '#333',
              cursor: 'pointer'
            }}
          >
            Performance
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {activeTab === 'details' && (
          <div>
            {/* Use SingleRecordView for basic rep information */}
            {SingleRecordView && rep ? (
              <div style={{ marginBottom: '20px' }}>
                <SingleRecordView
                  entityName="Users"
                  record={rep}
                  fields={["Name", "Email", "Title"]}
                  layout="list"
                  showLabels={true}
                  showEmptyFields={false}
                  allowOpenRecord={true}
                  utilities={utilities}
                  styles={styles}
                  components={components}
                  callbacks={callbacks}
                  savedUserSettings={savedUserSettings}
                  onSaveUserSettings={onSaveUserSettings}
                />
              </div>
            ) : (
              // Fallback display if SingleRecordView is not available or no rep data
              <div style={{ marginBottom: '20px' }}>
                {rep ? Object.entries(rep).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: '15px' }}>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '3px' }}>{key}</div>
                    <div style={{ fontSize: '14px', color: '#333' }}>{String(value)}</div>
                  </div>
                )) : (
                  <p style={{ color: '#666', fontStyle: 'italic' }}>No rep data available</p>
                )}
              </div>
            )}
          </div>
        )}
        {activeTab === 'performance' && (
          <div>
            {rep?.metrics ? (
              <div>
                <div style={{ marginBottom: '15px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: '600' }}>Performance Metrics</h4>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div style={{ padding: '10px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Deals Closed</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#059669' }}>
                        {rep.metrics.dealsClosed || 0}
                      </div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Revenue</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#8b5cf6' }}>
                        ${(rep.metrics.revenue || 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Win Rate</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f59e0b' }}>
                        {rep.metrics.winRate || 0}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No performance metrics available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

return RepDetailsPanel;