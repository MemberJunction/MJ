function Customer360View({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [account, setAccount] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(savedUserSettings?.activeTab || 'overview');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  
  // For demo, we'll use the first account
  const accountId = savedUserSettings?.accountId || null;

  useEffect(() => {
    loadCustomerData();
  }, [accountId]);

  const loadCustomerData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First get an account if no ID specified
      let targetAccountId = accountId;
      if (!targetAccountId) {
        const accountsResult = await utilities.rv.RunView({
          EntityName: 'Accounts',
          MaxRows: 1,
          OrderBy: 'AnnualRevenue DESC',
          ResultType: 'entity_object'
        });
        
        if (accountsResult.Success && accountsResult.Results?.length > 0) {
          targetAccountId = accountsResult.Results[0].ID;
          setAccount(accountsResult.Results[0]);
        }
      }
      
      if (!targetAccountId) {
        setError('No account found');
        setLoading(false);
        return;
      }
      
      // Load all related data
      const [contactsResult, dealsResult, activitiesResult] = await Promise.all([
        utilities.rv.RunView({
          EntityName: 'Contacts',
          ExtraFilter: `AccountID='${targetAccountId}'`,
          OrderBy: 'LastName ASC',
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Deals',
          ExtraFilter: `AccountID='${targetAccountId}'`,
          OrderBy: 'CloseDate DESC',
          ResultType: 'entity_object'
        }),
        utilities.rv.RunView({
          EntityName: 'Activities',
          ExtraFilter: `AccountID='${targetAccountId}'`,
          OrderBy: 'CreatedAt DESC',
          MaxRows: 100,
          ResultType: 'entity_object'
        })
      ]);

      if (contactsResult.Success) {
        setContacts(contactsResult.Results || []);
      }
      if (dealsResult.Success) {
        setDeals(dealsResult.Results || []);
      }
      if (activitiesResult.Success) {
        setActivities(activitiesResult.Results || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateEngagementScore = () => {
    let score = 50; // Base score
    
    // Recent activities boost
    const recentActivities = activities.filter(a => {
      const activityDate = new Date(a.CreatedAt);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return activityDate > thirtyDaysAgo;
    });
    score += Math.min(recentActivities.length * 2, 20);
    
    // Active deals boost
    const activeDeals = deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage));
    score += Math.min(activeDeals.length * 5, 20);
    
    // Revenue tier boost
    if (account?.AnnualRevenue > 1000000) score += 10;
    
    return Math.min(score, 100);
  };

  const getHealthStatus = (score) => {
    if (score >= 80) return { label: 'Excellent', color: '#10B981' };
    if (score >= 60) return { label: 'Good', color: '#3B82F6' };
    if (score >= 40) return { label: 'Fair', color: '#F59E0B' };
    return { label: 'At Risk', color: '#EF4444' };
  };

  const formatCurrency = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount?.toFixed(0) || 0}`;
  };

  // Sub-component: Customer Header
  const CustomerHeader = () => {
    if (!account) return null;
    
    const engagementScore = calculateEngagementScore();
    const healthStatus = getHealthStatus(engagementScore);
    const totalRevenue = deals
      .filter(d => d.Stage === 'Closed Won')
      .reduce((sum, d) => sum + (d.Amount || 0), 0);
    
    return (
      <div style={{
        background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold' }}>
              {account.AccountName}
            </h1>
            <div style={{ marginTop: '8px', opacity: 0.9 }}>
              {account.Industry || 'No Industry'} • Customer since {new Date(account.CreatedAt || account.__mj_CreatedAt).getFullYear()}
            </div>
          </div>
          <button
            onClick={() => callbacks.OpenEntityRecord('Accounts', [{ FieldName: 'ID', Value: account.ID }])}
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            View Full Profile ↗
          </button>
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px',
          marginTop: '24px'
        }}>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Lifetime Value</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{formatCurrency(totalRevenue)}</div>
          </div>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Active Deals</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage)).length}
            </div>
          </div>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Contacts</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{contacts.length}</div>
          </div>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Health Score</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              <span style={{ color: healthStatus.color }}>{engagementScore}</span>
              <span style={{ fontSize: '14px', marginLeft: '8px' }}>{healthStatus.label}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Sub-component: Tab Navigation
  const TabNavigation = () => {
    const tabs = [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'timeline', label: 'Timeline', icon: '📅' },
      { id: 'contacts', label: 'Contacts', icon: '👥' },
      { id: 'deals', label: 'Deals', icon: '💼' },
      { id: 'insights', label: 'Insights', icon: '💡' }
    ];
    
    return (
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        borderBottom: '2px solid #E5E7EB',
        backgroundColor: 'white',
        borderRadius: '8px 8px 0 0',
        padding: '4px 4px 0 4px'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              onSaveUserSettings({ ...savedUserSettings, activeTab: tab.id });
            }}
            style={{
              padding: '12px 20px',
              backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
              color: activeTab === tab.id ? '#4F46E5' : '#6B7280',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #4F46E5' : '2px solid transparent',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ marginRight: '8px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    );
  };

  // Sub-component: Overview Tab
  const OverviewTab = () => {
    const recentDeals = deals.slice(0, 5);
    const recentActivities = activities.slice(0, 10);
    
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Recent Deals</h3>
          <div style={{ display: 'grid', gap: '8px' }}>
            {recentDeals.map(deal => (
              <div
                key={deal.ID}
                style={{
                  padding: '12px',
                  backgroundColor: '#F9FAFB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  borderLeft: `4px solid ${deal.Stage === 'Closed Won' ? '#10B981' : '#3B82F6'}`
                }}
                onClick={() => callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }])}
              >
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{deal.DealName}</div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  {deal.Stage} • {formatCurrency(deal.Amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Activity Feed</h3>
          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            {recentActivities.map(activity => (
              <div
                key={activity.ID}
                style={{
                  padding: '8px',
                  borderBottom: '1px solid #E5E7EB',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold' }}>{activity.Type}</span>
                  <span style={{ color: '#6B7280' }}>
                    {new Date(activity.CreatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ color: '#4B5563' }}>{activity.Subject}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Sub-component: Timeline Tab
  const TimelineTab = () => {
    const allEvents = [
      ...deals.map(d => ({ ...d, type: 'deal', date: d.CloseDate || d.CreatedAt })),
      ...activities.map(a => ({ ...a, type: 'activity', date: a.CreatedAt }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return (
      <div style={{ position: 'relative', paddingLeft: '40px' }}>
        <div style={{
          position: 'absolute',
          left: '20px',
          top: 0,
          bottom: 0,
          width: '2px',
          backgroundColor: '#E5E7EB'
        }} />
        
        {allEvents.slice(0, 20).map((event, index) => (
          <div key={event.ID} style={{ position: 'relative', marginBottom: '24px' }}>
            <div style={{
              position: 'absolute',
              left: '-26px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: event.type === 'deal' ? '#8B5CF6' : '#3B82F6',
              border: '2px solid white'
            }} />
            
            <div style={{
              padding: '12px',
              backgroundColor: '#F9FAFB',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
            onClick={() => {
              if (event.type === 'deal') {
                callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: event.ID }]);
              }
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                  {event.type === 'deal' ? event.DealName : event.Type}
                </span>
                <span style={{ fontSize: '12px', color: '#6B7280' }}>
                  {new Date(event.date).toLocaleDateString()}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#4B5563' }}>
                {event.type === 'deal' ? `${event.Stage} - ${formatCurrency(event.Amount)}` : event.Subject}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Sub-component: Contacts Tab
  const ContactsTab = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
      {contacts.map(contact => (
        <div
          key={contact.ID}
          style={{
            padding: '16px',
            backgroundColor: '#F9FAFB',
            borderRadius: '8px',
            cursor: 'pointer',
            border: '1px solid #E5E7EB'
          }}
          onClick={() => callbacks.OpenEntityRecord('Contacts', [{ FieldName: 'ID', Value: contact.ID }])}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#8B5CF6',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px',
              fontWeight: 'bold'
            }}>
              {(contact.FirstName?.[0] || '') + (contact.LastName?.[0] || '')}
            </div>
            <div>
              <div style={{ fontWeight: 'bold' }}>
                {contact.FirstName} {contact.LastName}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                {contact.Title || 'No Title'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#4B5563' }}>
            {contact.Email && <div>📧 {contact.Email}</div>}
            {contact.Phone && <div>📞 {contact.Phone}</div>}
          </div>
        </div>
      ))}
    </div>
  );

  // Sub-component: Deals Tab
  const DealsTab = () => {
    const dealsByStage = {};
    deals.forEach(deal => {
      if (!dealsByStage[deal.Stage]) {
        dealsByStage[deal.Stage] = [];
      }
      dealsByStage[deal.Stage].push(deal);
    });
    
    return (
      <div>
        {Object.entries(dealsByStage).map(([stage, stageDeals]) => (
          <div key={stage} style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#374151' }}>
              {stage} ({stageDeals.length})
            </h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              {stageDeals.map(deal => (
                <div
                  key={deal.ID}
                  style={{
                    padding: '12px',
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onClick={() => callbacks.OpenEntityRecord('Deals', [{ FieldName: 'ID', Value: deal.ID }])}
                >
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{deal.DealName}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>
                      Close: {new Date(deal.CloseDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#059669' }}>
                      {formatCurrency(deal.Amount)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>
                      {deal.Probability}% likely
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Sub-component: Insights Tab
  const InsightsTab = () => {
    const engagementScore = calculateEngagementScore();
    const healthStatus = getHealthStatus(engagementScore);
    const avgDealSize = deals.length > 0 ? 
      deals.reduce((sum, d) => sum + (d.Amount || 0), 0) / deals.length : 0;
    const winRate = deals.length > 0 ?
      (deals.filter(d => d.Stage === 'Closed Won').length / deals.filter(d => ['Closed Won', 'Closed Lost'].includes(d.Stage)).length * 100) : 0;
    
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div style={{ padding: '20px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Key Metrics</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Average Deal Size</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{formatCurrency(avgDealSize)}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Win Rate</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{winRate.toFixed(0)}%</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Days Since Last Activity</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {activities.length > 0 ? 
                    Math.floor((Date.now() - new Date(activities[0].CreatedAt)) / (1000 * 60 * 60 * 24)) : 'N/A'}
                </div>
              </div>
            </div>
          </div>
          
          <div style={{ padding: '20px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Recommendations</h3>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {engagementScore < 60 && (
                <li style={{ marginBottom: '8px' }}>
                  Schedule a check-in call - engagement is declining
                </li>
              )}
              {deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage)).length === 0 && (
                <li style={{ marginBottom: '8px' }}>
                  No active opportunities - consider upsell/cross-sell
                </li>
              )}
              {contacts.length < 3 && (
                <li style={{ marginBottom: '8px' }}>
                  Limited contacts - identify additional stakeholders
                </li>
              )}
              {avgDealSize < 50000 && (
                <li style={{ marginBottom: '8px' }}>
                  Explore larger deal opportunities
                </li>
              )}
            </ul>
          </div>
        </div>
        
        <div style={{ padding: '20px', backgroundColor: healthStatus.color + '20', borderRadius: '8px', border: `2px solid ${healthStatus.color}` }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: healthStatus.color }}>
            Customer Health: {healthStatus.label}
          </h3>
          <div style={{ fontSize: '14px', color: '#4B5563' }}>
            Engagement Score: {engagementScore}/100
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading customer profile...</div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#FEE2E2', borderRadius: '8px', margin: '20px' }}>
        <div style={{ color: '#991B1B', fontWeight: 'bold' }}>Error loading customer data</div>
        <div style={{ color: '#DC2626', marginTop: '8px' }}>{error || 'No account found'}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#F3F4F6', minHeight: '100%' }}>
      <CustomerHeader />
      <TabNavigation />
      
      <div style={{ backgroundColor: 'white', borderRadius: '0 8px 8px 8px', padding: '20px', minHeight: '400px' }}>
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'timeline' && <TimelineTab />}
        {activeTab === 'contacts' && <ContactsTab />}
        {activeTab === 'deals' && <DealsTab />}
        {activeTab === 'insights' && <InsightsTab />}
      </div>
    </div>
  );
}