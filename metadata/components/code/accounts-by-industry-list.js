function AccountsByIndustryList({
  accounts,
  selectedIndustry,
  onAccountClick,
  pageSize,
  onClearFilter,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Load DataGrid component from registry
  const DataGrid = components['DataGrid'];

  // Define columns to display in the DataGrid with custom formatting
  const columns = [
    { field: 'AccountName', header: 'Account Name' },
    {
      field: 'AnnualRevenue',
      header: 'Revenue',
      render: (value) => {
        if (!value) return '-';

        // Use Intl.NumberFormat for consistent formatting with compact notation
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 1
        }).format(value);

        return formatted;
      }
    },
    {
      field: 'AccountStatus',
      header: 'Status',
      render: (value) => {
        return (
          <span style={{
            padding: '2px 8px',
            fontSize: '12px',
            fontWeight: '500',
            borderRadius: '4px',
            backgroundColor: value === 'Active' ? '#D1FAE5' : '#FEE2E2',
            color: value === 'Active' ? '#065F46' : '#991B1B'
          }}>
            {value || 'Unknown'}
          </span>
        );
      }
    },
    {
      field: 'AccountType',
      header: 'Type',
      render: (value) => {
        const colorMap = {
          'Customer': { bg: '#DBEAFE', color: '#1E40AF' },
          'Prospect': { bg: '#FEF3C7', color: '#92400E' },
          'Partner': { bg: '#E9D5FF', color: '#6B21A8' },
          'Vendor': { bg: '#FED7AA', color: '#9A3412' }
        };
        const defaultColors = { bg: '#F3F4F6', color: '#374151' };
        const colors = value ? (colorMap[value] || defaultColors) : defaultColors;

        return (
          <span style={{
            padding: '2px 8px',
            fontSize: '12px',
            fontWeight: '500',
            borderRadius: '4px',
            backgroundColor: colors.bg,
            color: colors.color
          }}>
            {value || 'Unknown'}
          </span>
        );
      }
    }
  ];

  // Handle row click - DataGrid passes the clicked record directly
  const handleRowClick = React.useCallback((record) => {
    if (record) {
      onAccountClick?.(record);
    }
  }, [onAccountClick]);

  // Always render the container but control visibility to prevent mount/unmount
  return (
    <div style={{
      marginTop: selectedIndustry ? '32px' : '0',
      padding: selectedIndustry ? '20px' : '0',
      backgroundColor: selectedIndustry ? '#F9FAFB' : 'transparent',
      borderRadius: '8px',
      border: selectedIndustry ? '1px solid #E5E7EB' : 'none',
      display: selectedIndustry ? 'block' : 'none',
      transition: 'none'
    }}>
      {selectedIndustry && (
        <>
          <div style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>Selected: {selectedIndustry} ({accounts.length} accounts)</span>
            {onClearFilter && (
              <button
                onClick={onClearFilter}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  color: '#6B7280',
                  backgroundColor: '#fff',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* Account Table using DataGrid */}
          <div style={{ backgroundColor: '#fff', borderRadius: '6px', overflow: 'hidden' }}>
            {DataGrid ? (
              <DataGrid
                key="accounts-data-grid"  // Add stable key to prevent remounting
                entityName="Accounts"
                data={accounts}
                columns={columns}
                pageSize={pageSize || 10}
                filtering={false}
                selectionMode="none"
                onRowClick={handleRowClick}
                utilities={utilities}
                styles={styles}
                components={components}
                callbacks={callbacks}
                savedUserSettings={savedUserSettings}
                onSaveUserSettings={onSaveUserSettings}
              />
            ) : (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#6B7280'
              }}>
                DataGrid component not available
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}