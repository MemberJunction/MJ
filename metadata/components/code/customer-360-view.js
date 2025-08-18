function Customer360View({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [account, setAccount] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(savedUserSettings?.activeTab || 'overview');
  
  // Load sub-components from registry
  const TabNavigation = components['Customer360TabNavigation'];
  const Overview = components['Customer360Overview'];
  const Timeline = components['Customer360Timeline'];
  
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
      
      // Load all related data in parallel
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
    if (account?.AnnualRevenue) {
      if (account.AnnualRevenue > 1000000) score += 10;
      else if (account.AnnualRevenue > 500000) score += 5;
    }
    
    return Math.min(Math.round(score), 100);
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    onSaveUserSettings({ ...savedUserSettings, activeTab: tabId });
  };

  const handleActivityClick = (activity) => {
    // Could open a detail panel or navigate to the activity
    console.log('Activity clicked:', activity);
  };

  const formatCurrency = (value) => {
    if (!value) return '$0';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  // Simple implementations for tabs not yet componentized
  const ContactsTab = () => (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Contacts ({contacts.length})</h3>
      <div style={{ display: 'grid', gap: '12px' }}>
        {contacts.map(contact => (
          <div key={contact.ID} style={{
            padding: '16px',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                {contact.FirstName} {contact.LastName}
              </div>
              <div style={{ fontSize: '14px', color: '#6B7280' }}>{contact.Email}</div>
              <div style={{ fontSize: '14px', color: '#6B7280' }}>{contact.Phone}</div>
            </div>
            <button
              onClick={() => callbacks.OpenEntityRecord('Contacts', [{FieldName: 'ID', Value: contact.ID}])}
              style={{
                padding: '8px 16px',
                backgroundColor: '#F3F4F6',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              View Details
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const DealsTab = () => {
    const getStageColor = (stage) => {
      const colors = {
        'Lead': '#9CA3AF',
        'Qualified': '#3B82F6',
        'Proposal': '#8B5CF6',
        'Negotiation': '#F59E0B',
        'Closed Won': '#10B981',
        'Closed Lost': '#EF4444'
      };
      return colors[stage] || '#6B7280';
    };

    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Deals ({deals.length})</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {deals.map(deal => (
            <div key={deal.ID} style={{
              padding: '16px',
              border: '1px solid #E5E7EB',
              borderRadius: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontWeight: 'bold' }}>{deal.DealName}</div>
                <div style={{ 
                  padding: '4px 12px',
                  backgroundColor: getStageColor(deal.Stage) + '20',
                  color: getStageColor(deal.Stage),
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  {deal.Stage}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px', color: '#6B7280' }}>
                <div>Amount: {formatCurrency(deal.Amount)}</div>
                <div>Close Date: {new Date(deal.CloseDate).toLocaleDateString()}</div>
                <div>Probability: {deal.Probability}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const InsightsTab = () => {
    const avgDealSize = deals.length > 0 
      ? deals.reduce((sum, d) => sum + (d.Amount || 0), 0) / deals.length
      : 0;
    
    const winRate = deals.length > 0
      ? (deals.filter(d => d.Stage === 'Closed Won').length / 
         deals.filter(d => ['Closed Won', 'Closed Lost'].includes(d.Stage)).length * 100) || 0
      : 0;

    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Customer Insights</h3>
        <div style={{ display: 'grid', gap: '20px' }}>
          <div>
            <h4 style={{ color: '#4F46E5', marginBottom: '12px' }}>Key Metrics</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '4px' }}>Average Deal Size</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{formatCurrency(avgDealSize)}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '4px' }}>Win Rate</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{winRate.toFixed(0)}%</div>
              </div>
            </div>
          </div>
          
          <div>
            <h4 style={{ color: '#4F46E5', marginBottom: '12px' }}>Recommendations</h4>
            <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
              {calculateEngagementScore() < 50 && 
                <li>Engagement is low - consider scheduling a check-in call</li>
              }
              {deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.Stage)).length > 0 &&
                <li>Active opportunities present - maintain regular contact</li>
              }
              {activities.length < 5 &&
                <li>Limited recent activity - increase touchpoints</li>
              }
            </ul>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading customer data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#EF4444' }}>Error: {error}</div>
      </div>
    );
  }

  if (!account) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>No customer data available</div>
      </div>
    );
  }

  const engagementScore = calculateEngagementScore();

  return (
    <div style={{ padding: '24px', backgroundColor: '#F9FAFB', minHeight: '100vh' }}>
      {/* Customer Header */}
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '8px', 
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 'bold' }}>
          {account.AccountName}
        </h1>
        <div style={{ display: 'flex', gap: '24px', color: '#6B7280', fontSize: '14px' }}>
          <span>Industry: {account.Industry || 'Not specified'}</span>
          <span>Annual Revenue: {formatCurrency(account.AnnualRevenue)}</span>
          <span>Created: {new Date(account.CreatedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      {TabNavigation && (
        <TabNavigation 
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      )}

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && Overview && (
          <Overview 
            account={account}
            contacts={contacts}
            deals={deals}
            engagementScore={engagementScore}
          />
        )}
        {activeTab === 'timeline' && Timeline && (
          <Timeline 
            activities={activities}
            onActivityClick={handleActivityClick}
          />
        )}
        {activeTab === 'contacts' && <ContactsTab />}
        {activeTab === 'deals' && <DealsTab />}
        {activeTab === 'insights' && <InsightsTab />}
      </div>
    </div>
  );
}