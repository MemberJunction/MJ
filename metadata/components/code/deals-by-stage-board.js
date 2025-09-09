function DealsByStageBoard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showClosedDeals, setShowClosedDeals] = useState(savedUserSettings?.showClosedDeals || false);
  const [dealsByStage, setDealsByStage] = useState({});
  const [dateFrom, setDateFrom] = useState(savedUserSettings?.dateFrom || '');
  const [dateTo, setDateTo] = useState(savedUserSettings?.dateTo || '');
  const [selectedDeal, setSelectedDeal] = useState(null);

  // Define stage order and colors
  const stages = [
    { name: 'Prospecting', color: '#6B7280', bgColor: '#F3F4F6' },
    { name: 'Qualification', color: '#2563EB', bgColor: '#DBEAFE' },
    { name: 'Proposal', color: '#D97706', bgColor: '#FEF3C7' },
    { name: 'Negotiation', color: '#EA580C', bgColor: '#FED7AA' },
    { name: 'Closed Won', color: '#059669', bgColor: '#D1FAE5' },
    { name: 'Closed Lost', color: '#DC2626', bgColor: '#FEE2E2' }
  ];

  useEffect(() => {
    loadDeals();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    groupDealsByStage();
  }, [deals, showClosedDeals]);

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
        OrderBy: 'CloseDate ASC',
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

  const groupDealsByStage = () => {
    const grouped = {};
    stages.forEach(stage => {
      grouped[stage.name] = [];
    });

    deals.forEach(deal => {
      if (grouped[deal.Stage]) {
        grouped[deal.Stage].push(deal);
      }
    });

    setDealsByStage(grouped);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const getDaysToClose = (closeDate) => {
    if (!closeDate) return null;
    const close = new Date(closeDate);
    const today = new Date();
    const days = Math.ceil((close - today) / (1000 * 60 * 60 * 24));
    return days;
  };

  const calculateStageTotal = (stageName) => {
    const stageDeals = dealsByStage[stageName] || [];
    return stageDeals.reduce((sum, deal) => sum + (deal.Amount || 0), 0);
  };

  const toggleClosedDeals = () => {
    const newValue = !showClosedDeals;
    setShowClosedDeals(newValue);
    onSaveUserSettings({ ...savedUserSettings, showClosedDeals: newValue });
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
      </div>
    );
  }

  const visibleStages = showClosedDeals ? stages : stages.filter(s => !s.name.includes('Closed'));

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Deal Pipeline</h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showClosedDeals}
                onChange={toggleClosedDeals}
                style={{ marginRight: '8px' }}
              />
              <span style={{ fontSize: '14px' }}>Show Closed Deals</span>
            </label>
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
        </div>
        
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          alignItems: 'center',
          padding: '12px',
          backgroundColor: '#F9FAFB',
          borderRadius: '8px'
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

      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        overflowX: 'auto', 
        flex: 1,
        paddingBottom: '20px'
      }}>
        {visibleStages.map(stage => {
          const stageDeals = dealsByStage[stage.name] || [];
          const stageTotal = calculateStageTotal(stage.name);
          
          return (
            <div
              key={stage.name}
              style={{
                minWidth: '300px',
                maxWidth: '300px',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#F9FAFB',
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <div style={{
                padding: '16px',
                backgroundColor: stage.bgColor,
                borderBottom: `3px solid ${stage.color}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ 
                    fontSize: '16px', 
                    fontWeight: '600', 
                    color: stage.color,
                    margin: 0 
                  }}>
                    {stage.name}
                  </h3>
                  <span style={{
                    backgroundColor: 'white',
                    color: stage.color,
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {stageDeals.length}
                  </span>
                </div>
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '18px', 
                  fontWeight: 'bold',
                  color: '#111827'
                }}>
                  {formatCurrency(stageTotal)}
                </div>
              </div>

              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px'
              }}>
                {stageDeals.map(deal => {
                  const daysToClose = getDaysToClose(deal.CloseDate);
                  
                  return (
                    <div
                      key={deal.ID}
                      style={{
                        backgroundColor: 'white',
                        borderRadius: '6px',
                        padding: '12px',
                        marginBottom: '8px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        border: '1px solid #E5E7EB'
                      }}
                      onClick={() => setSelectedDeal(deal)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                      }}
                    >
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: '600', 
                        color: '#111827',
                        marginBottom: '8px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {deal.DealName}
                      </div>
                      
                      <div style={{ 
                        fontSize: '18px', 
                        fontWeight: 'bold', 
                        color: '#059669',
                        marginBottom: '8px'
                      }}>
                        {formatCurrency(deal.Amount)}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '12px', color: '#6B7280' }}>Probability:</span>
                          <div style={{ 
                            width: '60px', 
                            height: '4px', 
                            backgroundColor: '#E5E7EB', 
                            borderRadius: '2px',
                            position: 'relative'
                          }}>
                            <div style={{ 
                              width: `${deal.Probability}%`, 
                              height: '100%', 
                              backgroundColor: deal.Probability > 75 ? '#10B981' : deal.Probability > 50 ? '#F59E0B' : '#6B7280',
                              borderRadius: '2px'
                            }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                            {deal.Probability}%
                          </span>
                        </div>
                      </div>

                      {daysToClose !== null && (
                        <div style={{
                          fontSize: '11px',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          backgroundColor: daysToClose < 0 ? '#FEE2E2' : daysToClose < 7 ? '#FEF3C7' : daysToClose < 30 ? '#DBEAFE' : '#F3F4F6',
                          color: daysToClose < 0 ? '#991B1B' : daysToClose < 7 ? '#92400E' : daysToClose < 30 ? '#1E40AF' : '#6B7280'
                        }}>
                          {daysToClose < 0 ? `${Math.abs(daysToClose)} days overdue` : `${daysToClose} days to close`}
                        </div>
                      )}

                      {deal.NextStep && (
                        <div style={{
                          marginTop: '8px',
                          fontSize: '11px',
                          color: '#6B7280',
                          fontStyle: 'italic',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          Next: {deal.NextStep}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {stageDeals.length === 0 && (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#9CA3AF',
                    fontSize: '14px'
                  }}>
                    No deals in this stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ 
        marginTop: '20px', 
        padding: '16px', 
        backgroundColor: '#F9FAFB', 
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-around'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Total Deals</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>{deals.length}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Pipeline Value</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
            {formatCurrency(deals.reduce((sum, deal) => sum + (deal.Amount || 0), 0))}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Expected Revenue</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563EB' }}>
            {formatCurrency(deals.reduce((sum, deal) => sum + ((deal.Amount || 0) * (deal.Probability || 0) / 100), 0))}
          </div>
        </div>
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
                  backgroundColor: stages.find(s => s.name === selectedDeal.Stage)?.bgColor || '#F3F4F6',
                  color: stages.find(s => s.name === selectedDeal.Stage)?.color || '#6B7280',
                  border: `2px solid ${stages.find(s => s.name === selectedDeal.Stage)?.color || '#D1D5DB'}`,
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
                    {new Date(selectedDeal.CloseDate).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
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
              
              <div style={{ 
                marginTop: '16px', 
                padding: '16px', 
                backgroundColor: '#F9FAFB', 
                borderRadius: '8px' 
              }}>
                <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '8px' }}>Win Probability Indicator</div>
                <div style={{ 
                  width: '100%', 
                  height: '20px', 
                  backgroundColor: '#E5E7EB', 
                  borderRadius: '10px',
                  position: 'relative'
                }}>
                  <div style={{ 
                    width: `${selectedDeal.Probability}%`, 
                    height: '100%', 
                    backgroundColor: selectedDeal.Probability > 75 ? '#10B981' : selectedDeal.Probability > 50 ? '#F59E0B' : '#6B7280',
                    borderRadius: '10px',
                    transition: 'width 0.3s'
                  }} />
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}>
                    {selectedDeal.Probability}%
                  </div>
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