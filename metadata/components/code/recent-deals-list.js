function RecentDealsList({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState(savedUserSettings?.sortBy || 'CloseDate');
  const [sortDirection, setSortDirection] = useState(savedUserSettings?.sortDirection || 'ASC');
  const [maxRows] = useState(savedUserSettings?.maxRows || 15);
  const [dateFrom, setDateFrom] = useState(savedUserSettings?.dateFrom || '');
  const [dateTo, setDateTo] = useState(savedUserSettings?.dateTo || '');
  const [selectedDeal, setSelectedDeal] = useState(null);

  // Stage colors mapping
  const stageColors = {
    'Prospecting': { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' },
    'Qualification': { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
    'Proposal': { bg: '#FEF3C7', text: '#92400E', border: '#FDE047' },
    'Negotiation': { bg: '#FED7AA', text: '#9A3412', border: '#FB923C' },
    'Closed Won': { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
    'Closed Lost': { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' }
  };

  useEffect(() => {
    loadDeals();
  }, [sortBy, sortDirection, maxRows, dateFrom, dateTo]);

  const loadDeals = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Build filter based on date range
      let filters = [];
      if (dateFrom) {
        filters.push(`CloseDate >= '${dateFrom}'`);
      }
      if (dateTo) {
        filters.push(`CloseDate <= '${dateTo}'`);
      }
      const extraFilter = filters.length > 0 ? filters.join(' AND ') : '';
      
      const result = await utilities.rv.RunView({
        EntityName: 'Deals',
        OrderBy: `${sortBy} ${sortDirection}`,
        MaxRows: maxRows,
        ExtraFilter: extraFilter
      });

      if (result.Success) {
        setDeals(result.Results || []);
      } else {
        setError(result.ErrorMessage || 'Failed to load deals');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getDaysToClose = (closeDate) => {
    if (!closeDate) return null;
    const close = new Date(closeDate);
    const today = new Date();
    const days = Math.ceil((close - today) / (1000 * 60 * 60 * 24));
    return days;
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      // Toggle direction if same field
      const newDirection = sortDirection === 'ASC' ? 'DESC' : 'ASC';
      setSortDirection(newDirection);
      onSaveUserSettings({ ...savedUserSettings, sortBy: field, sortDirection: newDirection });
    } else {
      // New field, default to ASC except for Amount
      const newDirection = field === 'Amount' ? 'DESC' : 'ASC';
      setSortBy(field);
      setSortDirection(newDirection);
      onSaveUserSettings({ ...savedUserSettings, sortBy: field, sortDirection: newDirection });
    }
  };

  const handleDateChange = (field, value) => {
    if (field === 'from') {
      setDateFrom(value);
      onSaveUserSettings({ ...savedUserSettings, dateFrom: value });
    } else {
      setDateTo(value);
      onSaveUserSettings({ ...savedUserSettings, dateTo: value });
    }
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    onSaveUserSettings({ ...savedUserSettings, dateFrom: '', dateTo: '' });
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading deals...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#FEE2E2', borderRadius: '8px', margin: '20px' }}>
        <div style={{ color: '#991B1B', fontWeight: 'bold' }}>Error loading deals</div>
        <div style={{ color: '#DC2626', marginTop: '8px' }}>{error}</div>
        <button 
          onClick={loadDeals}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: '#EF4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Recent Deals</h2>
          <button
            onClick={loadDeals}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Refresh
          </button>
        </div>
        
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          alignItems: 'center',
          padding: '12px',
          backgroundColor: '#F9FAFB',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <label style={{ fontSize: '14px', color: '#374151' }}>Close Date:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateChange('from', e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px'
            }}
            placeholder="From"
          />
          <span style={{ color: '#6B7280' }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateChange('to', e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px'
            }}
            placeholder="To"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={clearFilters}
              style={{
                padding: '6px 12px',
                backgroundColor: '#EF4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
              <th 
                onClick={() => handleSort('DealName')}
                style={{ 
                  padding: '12px', 
                  textAlign: 'left', 
                  fontWeight: '600',
                  cursor: 'pointer',
                  color: sortBy === 'DealName' ? '#3B82F6' : '#374151',
                  position: 'relative'
                }}
              >
                Deal Name
                {sortBy === 'DealName' && (
                  <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '↑' : '↓'}</span>
                )}
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Stage</th>
              <th 
                onClick={() => handleSort('Amount')}
                style={{ 
                  padding: '12px', 
                  textAlign: 'right', 
                  fontWeight: '600',
                  cursor: 'pointer',
                  color: sortBy === 'Amount' ? '#3B82F6' : '#374151'
                }}
              >
                Amount
                {sortBy === 'Amount' && (
                  <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '↑' : '↓'}</span>
                )}
              </th>
              <th 
                onClick={() => handleSort('Probability')}
                style={{ 
                  padding: '12px', 
                  textAlign: 'center', 
                  fontWeight: '600',
                  cursor: 'pointer',
                  color: sortBy === 'Probability' ? '#3B82F6' : '#374151'
                }}
              >
                Probability
                {sortBy === 'Probability' && (
                  <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '↑' : '↓'}</span>
                )}
              </th>
              <th 
                onClick={() => handleSort('CloseDate')}
                style={{ 
                  padding: '12px', 
                  textAlign: 'left', 
                  fontWeight: '600',
                  cursor: 'pointer',
                  color: sortBy === 'CloseDate' ? '#3B82F6' : '#374151'
                }}
              >
                Close Date
                {sortBy === 'CloseDate' && (
                  <span style={{ marginLeft: '4px' }}>{sortDirection === 'ASC' ? '↑' : '↓'}</span>
                )}
              </th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>Days to Close</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal, index) => {
              const daysToClose = getDaysToClose(deal.CloseDate);
              const stageStyle = stageColors[deal.Stage] || stageColors['Prospecting'];
              
              return (
                <tr 
                  key={deal.ID}
                  style={{ 
                    borderBottom: '1px solid #E5E7EB',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    backgroundColor: index % 2 === 0 ? 'white' : '#F9FAFB'
                  }}
                  onClick={() => setSelectedDeal(deal)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#F9FAFB'}
                >
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '500', color: '#111827' }}>{deal.DealName}</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: stageStyle.bg,
                      color: stageStyle.text,
                      border: `1px solid ${stageStyle.border}`
                    }}>
                      {deal.Stage}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                    {formatCurrency(deal.Amount)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ 
                        width: '100px', 
                        height: '8px', 
                        backgroundColor: '#E5E7EB', 
                        borderRadius: '4px',
                        margin: '0 auto'
                      }}>
                        <div style={{ 
                          width: `${deal.Probability}%`, 
                          height: '100%', 
                          backgroundColor: deal.Probability > 75 ? '#10B981' : deal.Probability > 50 ? '#F59E0B' : '#6B7280',
                          borderRadius: '4px',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <div style={{ fontSize: '12px', marginTop: '2px', color: '#6B7280' }}>
                        {deal.Probability}%
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {formatDate(deal.CloseDate)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {daysToClose !== null && (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: daysToClose < 0 ? '#FEE2E2' : daysToClose < 7 ? '#FEF3C7' : daysToClose < 30 ? '#DBEAFE' : '#F3F4F6',
                        color: daysToClose < 0 ? '#991B1B' : daysToClose < 7 ? '#92400E' : daysToClose < 30 ? '#1E40AF' : '#6B7280'
                      }}>
                        {daysToClose < 0 ? `${Math.abs(daysToClose)} overdue` : `${daysToClose} days`}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#6B7280' }}>
                    {deal.DealSource || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {deals.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
          No deals found
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#6B7280', textAlign: 'right' }}>
        Showing {deals.length} of {maxRows} max deals
      </div>

      {/* Deal Detail Modal */}
      {selectedDeal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => setSelectedDeal(null)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{selectedDeal.DealName}</h3>
              <button
                onClick={() => setSelectedDeal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6B7280',
                  padding: '0',
                  width: '30px',
                  height: '30px'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Stage</label>
                <span style={{
                  padding: '6px 16px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  backgroundColor: stageColors[selectedDeal.Stage]?.bg || '#F3F4F6',
                  color: stageColors[selectedDeal.Stage]?.text || '#6B7280',
                  border: `1px solid ${stageColors[selectedDeal.Stage]?.border || '#D1D5DB'}`,
                  display: 'inline-block'
                }}>
                  {selectedDeal.Stage}
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Amount</label>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
                    {formatCurrency(selectedDeal.Amount)}
                  </div>
                </div>
                
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Probability</label>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#374151' }}>
                    {selectedDeal.Probability}%
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Close Date</label>
                  <div style={{ fontSize: '16px', color: '#111827' }}>
                    {formatDate(selectedDeal.CloseDate)}
                  </div>
                </div>
                
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Days to Close</label>
                  <div style={{ fontSize: '16px', color: '#111827' }}>
                    {(() => {
                      const days = getDaysToClose(selectedDeal.CloseDate);
                      if (days === null) return '-';
                      return days < 0 ? `${Math.abs(days)} days overdue` : `${days} days`;
                    })()}
                  </div>
                </div>
              </div>
              
              {selectedDeal.DealSource && (
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Source</label>
                  <div style={{ fontSize: '16px', color: '#111827' }}>
                    {selectedDeal.DealSource}
                  </div>
                </div>
              )}
              
              {selectedDeal.NextStep && (
                <div>
                  <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Next Step</label>
                  <div style={{ fontSize: '16px', color: '#111827' }}>
                    {selectedDeal.NextStep}
                  </div>
                </div>
              )}
              
              <div>
                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Expected Revenue</label>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563EB' }}>
                  {formatCurrency((selectedDeal.Amount || 0) * (selectedDeal.Probability || 0) / 100)}
                </div>
              </div>
            </div>
            
            <div style={{ 
              marginTop: '20px', 
              paddingTop: '20px', 
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  if (callbacks.OpenEntityRecord) {
                    callbacks.OpenEntityRecord('Deals', [
                      { FieldName: 'ID', Value: selectedDeal.ID }
                    ]);
                    setSelectedDeal(null);
                  } else {
                    console.warn('OpenEntityRecord callback not available');
                  }
                }}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px'
                }}
                title="Open record"
              >
                ↗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}