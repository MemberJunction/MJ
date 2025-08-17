const AccountsByIndustry = (props) => {
  const { utilities, styles, callbacks, savedUserSettings, onSaveUserSettings, components } = props;
  
  // Get child components from registry
  const AccountsByIndustryChart = components?.AccountsByIndustryChart;
  const AccountsByIndustryList = components?.AccountsByIndustryList;
  const AccountsByIndustryDetails = components?.AccountsByIndustryDetails;
   
  // Optional custom props with defaults
  const maxIndustries = props.maxIndustries || 10;
  const showOthers = props.showOthers !== false;
  const pageSize = props.pageSize || 10;
  const colorScheme = props.colorScheme || 'default';
  
  // State management
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndustry, setSelectedIndustry] = useState(
    savedUserSettings?.selectedIndustry || null
  );
  const [sortConfig, setSortConfig] = useState(
    savedUserSettings?.sortConfig || { field: 'AccountName', direction: 'asc' }
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  
  // Load accounts data
  useEffect(() => {
    loadAccounts();
  }, []);
  
  const loadAccounts = async () => {
    setLoading(true);
    try {
      console.log('[AccountsByIndustry] Loading accounts...');
      const result = await utilities.rv.RunView({
        EntityName: 'Accounts',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'AccountName',
        ResultType: 'entity_object'
      });
      
      if (result.Success && result.Results) {
        console.log('[AccountsByIndustry] Loaded', result.Results.length, 'accounts');
        setAccounts(result.Results);
      } else {
        console.error('[AccountsByIndustry] Failed to load accounts:', result.ErrorMessage);
      }
    } catch (error) {
      console.error('[AccountsByIndustry] Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Group accounts by industry and track which ones are in "Others"
  const industryData = useMemo(() => {
    const grouped = {};
    accounts.forEach(account => {
      const industry = account.Industry || 'Unknown';
      grouped[industry] = (grouped[industry] || 0) + 1;
    });
    
    // Sort by count and apply max industries limit
    const sorted = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1]);
    
    let industries = sorted;
    let othersCount = 0;
    let othersIndustries = []; // Track which industries are grouped into Others
    
    if (showOthers && sorted.length > maxIndustries) {
      industries = sorted.slice(0, maxIndustries - 1);
      const othersItems = sorted.slice(maxIndustries - 1);
      othersCount = othersItems.reduce((sum, [_, count]) => sum + count, 0);
      othersIndustries = othersItems.map(([industry]) => industry);
      if (othersCount > 0) {
        industries.push(['Others', othersCount]);
      }
    }
    
    return {
      labels: industries.map(([industry]) => industry),
      data: industries.map(([_, count]) => count),
      percentages: industries.map(([_, count]) => 
        ((count / accounts.length) * 100).toFixed(1)
      ),
      total: accounts.length,
      othersIndustries // Include this for filtering
    };
  }, [accounts, maxIndustries, showOthers]);
  
  // Handle pie slice click
  const handleSliceClick = (industry) => {
    const newSelection = selectedIndustry === industry ? null : industry;
    setSelectedIndustry(newSelection);
    setCurrentPage(1);
    
    if (onSaveUserSettings) {
      onSaveUserSettings({ 
        ...savedUserSettings, 
        selectedIndustry: newSelection 
      });
    }
  };
  
  // Filter and sort accounts
  const displayAccounts = useMemo(() => {
    let filtered = [];
    
    if (selectedIndustry) {
      if (selectedIndustry === 'Others') {
        // For "Others", show accounts from industries grouped into Others
        filtered = accounts.filter(a => {
          const industry = a.Industry || 'Unknown';
          return industryData.othersIndustries.includes(industry);
        });
      } else {
        // Normal filtering for specific industry
        filtered = accounts.filter(a => (a.Industry || 'Unknown') === selectedIndustry);
      }
    }
    
    // Apply sorting
    if (filtered.length > 0 && sortConfig.field) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.field];
        const bVal = b[sortConfig.field];
        
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }
    
    return filtered;
  }, [accounts, selectedIndustry, sortConfig, industryData.othersIndustries]);
  
  // Handle sort
  const handleSort = (field) => {
    const newDirection = 
      sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    const newConfig = { field, direction: newDirection };
    setSortConfig(newConfig);
    
    if (onSaveUserSettings) {
      onSaveUserSettings({ 
        ...savedUserSettings, 
        sortConfig: newConfig 
      });
    }
  };
  
  // Handle account selection
  const handleAccountClick = (account) => {
    setSelectedAccount(account);
    setShowDetails(true);
  };
  
  // Handle open record
  const handleOpenRecord = () => {
    if (callbacks?.OpenEntityRecord && selectedAccount) {
      // Pass entity name and key-value pair for the primary key
      callbacks.OpenEntityRecord('Accounts', [
        { FieldName: 'ID', Value: selectedAccount.ID }
      ]);
    }
  };
  
  // Handle clear filter
  const handleClearFilter = () => {
    handleSliceClick(selectedIndustry);
  };
  
  // Render loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '400px',
        gap: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #E5E7EB',
          borderTop: '4px solid #3B82F6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          fontSize: '16px',
          color: '#6B7280',
          fontWeight: '500'
        }}>
          Loading accounts data...
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
  
  // Render empty state
  if (accounts.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#6B7280'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
        <div style={{ fontSize: '18px', fontWeight: '600' }}>No Accounts Found</div>
        <div style={{ fontSize: '14px', marginTop: '8px' }}>No active accounts available to display</div>
      </div>
    );
  }
  
  return (
    <div style={{ padding: '24px', backgroundColor: '#fff', borderRadius: '8px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
          📊 Accounts by Industry
        </h2>
        <div style={{ fontSize: '14px', color: '#6B7280' }}>
          Total: {accounts.length} accounts across {industryData.labels.length} industries
        </div>
      </div>
      
      {/* Chart Container */}
      <div style={{ height: '400px', marginBottom: '32px', position: 'relative' }}>
        {AccountsByIndustryChart && (
          <AccountsByIndustryChart
            industryData={industryData}
            selectedIndustry={selectedIndustry}
            onSliceClick={handleSliceClick}
            colorScheme={colorScheme}
          />
        )}
      </div>
      
      {/* Account List */}
      {AccountsByIndustryList && (
        <AccountsByIndustryList
          accounts={displayAccounts}
          selectedIndustry={selectedIndustry}
          sortConfig={sortConfig}
          onSort={handleSort}
          onAccountClick={handleAccountClick}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onClearFilter={handleClearFilter}
        />
      )}
      
      {/* Detail Panel */}
      {AccountsByIndustryDetails && (
        <AccountsByIndustryDetails
          account={selectedAccount}
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
          onOpenRecord={handleOpenRecord}
        />
      )}
    </div>
  );
};