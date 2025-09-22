function AIDetailTable({ data, activeTab, styles, utilities, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  console.log('[AIDetailTable] Rendering with', data?.length || 0, 'items');

  // Load DataGrid and DataExportPanel components
  const DataGrid = components['DataGrid'];
  const DataExportPanel = components['DataExportPanel'];

  const [sortField, setSortField] = useState(savedUserSettings?.sortField || 'timestamp');
  const [sortDirection, setSortDirection] = useState(savedUserSettings?.sortDirection || 'desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState(new Set());

  const rowsPerPage = 25;
  
  // Get the correct timestamp field
  const timestampField = activeTab === 'agents' ? 'StartedAt' : 'RunAt';
  const nameField = activeTab === 'agents' ? 'Agent' : 'Prompt';
  const idField = activeTab === 'agents' ? 'AgentID' : 'PromptID';
  
  // Sort data
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const sorted = [...data].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      // Handle null/undefined
      if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
      if (bVal == null) return sortDirection === 'asc' ? -1 : 1;
      
      // Compare values
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [data, sortField, sortDirection]);
  
  // Paginate data
  const paginatedData = useMemo(() => {
    const start = currentPage * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedData.slice(start, end);
  }, [sortedData, currentPage, rowsPerPage]);
  
  const totalPages = Math.ceil(sortedData.length / rowsPerPage);
  
  const handleSort = (field) => {
    if (sortField === field) {
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
      onSaveUserSettings?.({
        ...savedUserSettings,
        sortField: field,
        sortDirection: newDirection
      });
    } else {
      setSortField(field);
      setSortDirection('asc');
      onSaveUserSettings?.({
        ...savedUserSettings,
        sortField: field,
        sortDirection: 'asc'
      });
    }
    setCurrentPage(0);
  };
  
  const toggleRowExpansion = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };
  
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const formatDuration = (ms) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };
  
  // Prepare data for export
  const prepareExportData = () => {
    return sortedData.map(item => {
      const exportRow = {
        Timestamp: item[timestampField],
        Name: item[nameField] || item[idField],
        Success: item.Success ? 'Yes' : 'No',
        Tokens: (item.TotalTokensUsed || item.TokensUsed) || 0,
        Cost: item.TotalCost || 0,
        Model: item.Model || 'Unknown',
        Status: item.Status || 'Unknown'
      };
      
      // Add Duration for prompts
      if (activeTab === 'prompts') {
        exportRow.Duration = item.ExecutionTimeMS || 0;
      }
      
      return exportRow;
    });
  };

  // Define export columns with correct key/label format
  const getExportColumns = () => {
    const columns = [
      { key: 'Timestamp', label: 'Timestamp' },
      { key: 'Name', label: activeTab === 'agents' ? 'Agent' : 'Prompt' },
      { key: 'Success', label: 'Status' },
      { key: 'Tokens', label: 'Tokens' },
      { key: 'Cost', label: 'Cost' },
      { key: 'Model', label: 'Model' },
      { key: 'Status', label: 'Status' }
    ];
    
    if (activeTab === 'prompts') {
      columns.push({ key: 'Duration', label: 'Duration (ms)' });
    }
    
    return columns;
  };
  
  // Define columns for DataGrid
  const gridColumns = [
    {
      field: timestampField,
      header: 'Timestamp',
      sortable: true,
      width: '150px',
      render: (value) => formatTimestamp(value)
    },
    {
      field: nameField,
      header: activeTab === 'agents' ? 'Agent' : 'Prompt',
      sortable: true,
      width: 'auto',
      render: (value, row) => value || row[idField] || '-'
    },
    {
      field: 'Success',
      header: 'Status',
      sortable: true,
      width: '80px',
      render: (value) => (
        <span style={{
          display: 'inline-block',
          padding: `2px 8px`,
          borderRadius: '12px',
          backgroundColor: value ? styles.colors.success + '20' : styles.colors.error + '20',
          color: value ? styles.colors.success : styles.colors.error,
          fontSize: '11px',
          fontWeight: '600'
        }}>
          {value ? 'Success' : 'Failed'}
        </span>
      )
    },
    {
      field: 'TotalTokensUsed',
      header: 'Tokens',
      sortable: true,
      width: '100px',
      render: (value, row) => {
        const tokens = value || row.TokensUsed;
        return tokens ? tokens.toLocaleString() : '-';
      }
    },
    {
      field: 'TotalCost',
      header: 'Cost',
      sortable: true,
      width: '100px',
      render: (value) => value ? `$${value.toFixed(4)}` : '-'
    }
  ];

  // Add Duration column only for Prompt Runs (Agent Runs don't have ExecutionTimeMS)
  if (activeTab === 'prompts') {
    gridColumns.push({
      field: 'ExecutionTimeMS',
      header: 'Duration',
      sortable: true,
      width: '100px',
      render: (value) => formatDuration(value)
    });
  }

  // Handle sort change for DataGrid
  const handleSortChange = useCallback((field, direction) => {
    setSortField(field);
    setSortDirection(direction);
    onSaveUserSettings?.({
      ...savedUserSettings,
      sortField: field,
      sortDirection: direction
    });
    setCurrentPage(0);
  }, [savedUserSettings, onSaveUserSettings]);

  // Handle row selection to show details (could expand row or show modal)
  const handleRowSelect = useCallback((selectedRows) => {
    if (selectedRows && selectedRows.length > 0) {
      const row = selectedRows[0];
      toggleRowExpansion(row.ID);
    }
  }, []);

  const columns = [
    { field: timestampField, label: 'Timestamp', width: '150px' },
    { field: nameField, label: activeTab === 'agents' ? 'Agent' : 'Prompt', width: 'auto' },
    { field: 'Success', label: 'Status', width: '80px' },
    { field: 'TotalTokens', label: 'Tokens', width: '100px' },
    { field: 'TotalCost', label: 'Cost', width: '100px' }
  ];

  // Add Duration column only for Prompt Runs (Agent Runs don't have ExecutionTimeMS)
  if (activeTab === 'prompts') {
    columns.push({ field: 'ExecutionTimeMS', label: 'Duration', width: '100px' });
  }
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: styles.colors.surface,
      borderRadius: styles.borders?.radius || '4px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: styles.spacing.md,
        borderBottom: `1px solid ${styles.colors.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{
          margin: 0,
          color: styles.colors.text,
          fontSize: styles.typography.fontSize.lg
        }}>
          Detailed Records ({sortedData.length})
        </h3>
        
        {DataExportPanel && (
          <DataExportPanel
            data={prepareExportData()}
            columns={getExportColumns()}
            filename={`ai-${activeTab}-details-${new Date().toISOString().split('T')[0]}`}
            formats={['csv', 'excel']}
            buttonStyle="dropdown"
            buttonText="Export"
            icon="fa-download"
            customStyles={{
              button: {
                padding: `${styles.spacing.sm} ${styles.spacing.md}`,
                backgroundColor: styles.colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: styles.borders?.radius || '4px',
                cursor: 'pointer',
                fontSize: styles.typography.fontSize.sm
              }
            }}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
          />
        )}
      </div>
      
      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sortedData.length === 0 ? (
          <div style={{
            padding: styles.spacing.xl,
            textAlign: 'center',
            color: styles.colors.textSecondary
          }}>
            No records to display
          </div>
        ) : (
          DataGrid ? (
            <DataGrid
              data={sortedData}
              columns={gridColumns}
              pageSize={rowsPerPage}
              showFilters={true}
              showExport={false}
              selectionMode="single"
              onRowSelect={handleRowSelect}
              sortBy={sortField}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
              savedUserSettings={savedUserSettings}
              onSaveUserSettings={onSaveUserSettings}
            />
          ) : (
            <div style={{
              padding: styles.spacing.xl,
              textAlign: 'center',
              color: styles.colors.textSecondary
            }}>
              DataGrid component not available
            </div>
          )
        )}

        {/* Expanded row details - show below DataGrid if expanded */}
        {expandedRows.size > 0 && (
          <div style={{
            marginTop: styles.spacing.md,
            padding: styles.spacing.md,
            backgroundColor: styles.colors.background,
            borderRadius: styles.borders?.radius || '4px',
            border: `1px solid ${styles.colors.border}`
          }}>
            {Array.from(expandedRows).map(expandedId => {
              const row = sortedData.find(r => r.ID === expandedId);
              if (!row) return null;

              return (
                <div key={expandedId} style={{
                  marginBottom: styles.spacing.md
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: styles.spacing.sm
                  }}>
                    <h4 style={{
                      margin: 0,
                      color: styles.colors.text,
                      fontSize: styles.typography.fontSize.md
                    }}>
                      Record Details: {row[nameField] || row[idField]}
                    </h4>
                    <button
                      onClick={() => toggleRowExpansion(row.ID)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: styles.colors.textSecondary,
                        fontSize: styles.typography.fontSize.lg
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: styles.spacing.md,
                    fontSize: styles.typography.fontSize.sm
                  }}>
                    <div>
                      <strong style={{ color: styles.colors.textSecondary }}>ID:</strong>
                      <div style={{ color: styles.colors.text, fontFamily: 'monospace' }}>
                        {row.ID}
                      </div>
                    </div>
                    {row.ErrorMessage && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <strong style={{ color: styles.colors.textSecondary }}>Error:</strong>
                        <div style={{ color: styles.colors.error }}>
                          {row.ErrorMessage}
                        </div>
                      </div>
                    )}
                    {row.Model && (
                      <div>
                        <strong style={{ color: styles.colors.textSecondary }}>Model:</strong>
                        <div style={{ color: styles.colors.text }}>
                          {row.Model}
                        </div>
                      </div>
                    )}
                    {row.CompletedAt && (
                      <div>
                        <strong style={{ color: styles.colors.textSecondary }}>Completed:</strong>
                        <div style={{ color: styles.colors.text }}>
                          {formatTimestamp(row.CompletedAt)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
    </div>
  );
}