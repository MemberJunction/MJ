function AIModelList({
  models,
  modelVendors,
  viewMode,
  selectedModelId,
  onSelectModel,
  sortBy,
  sortDirection,
  onSortChange,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Load DataGrid component from registry
  const DataGrid = components['DataGrid'];

  // Helper function to get border radius value
  const getBorderRadius = (size) => {
    return typeof styles.borders?.radius === 'object' ? styles.borders.radius[size] : styles.borders?.radius || '4px';
  };

  // Get vendor info for a model
  const getModelVendorInfo = useCallback((modelId) => {
    const vendors = modelVendors.filter(v => v.ModelID === modelId);
    const inferenceProviders = vendors.filter(v => v.Type === 'Inference Provider');
    const modelDeveloper = vendors.find(v => v.Type === 'Model Developer');

    return {
      inferenceProviders,
      modelDeveloper,
      vendorCount: vendors.length
    };
  }, [modelVendors]);

  // Render status badge
  const renderStatusBadge = (status) => {
    const statusColors = {
      'Active': styles.colors.success || styles.colors.primary,
      'Inactive': styles.colors.warning || styles.colors.secondary,
      'Deprecated': styles.colors.error || styles.colors.secondary,
      'Preview': styles.colors.info || styles.colors.primary
    };

    const color = statusColors[status] || styles.colors.textSecondary;

    return (
      <span style={{
        display: 'inline-block',
        padding: `${styles.spacing.xs} ${styles.spacing.sm}`,
        backgroundColor: color + '15',
        color: color,
        borderRadius: getBorderRadius('sm'),
        fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
        fontWeight: styles.typography.fontWeight?.medium || '500'
      }}>
        {status}
      </span>
    );
  };

  // Render cost rank
  const renderCostRank = (rank) => {
    if (rank == null) return '-';

    const maxStars = 5;
    const filledStars = Math.min(rank, maxStars);

    return (
      <span style={{
        color: styles.colors.warning || styles.colors.secondary,
        fontSize: styles.typography.fontSize.sm
      }}>
        {'$'.repeat(filledStars)}
        <span style={{ opacity: 0.3 }}>
          {'$'.repeat(maxStars - filledStars)}
        </span>
      </span>
    );
  };

  // Format token limit
  const formatTokens = (tokens) => {
    if (!tokens) return '-';
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
    return tokens.toString();
  };

  // Define columns for DataGrid
  const gridColumns = [
    {
      field: 'Name',
      header: 'Model Name',
      sortable: true,
      width: '200px'
    },
    {
      field: 'APIName',
      header: 'API Name',
      sortable: false,
      width: '150px',
      render: (value) => value ? (
        <span style={{ fontFamily: 'monospace', fontSize: styles.typography.fontSize.sm }}>
          {value}
        </span>
      ) : '-'
    },
    {
      field: 'IsActive',
      header: 'Status',
      sortable: true,
      width: '100px',
      render: (value) => renderStatusBadge(value ? 'Active' : 'Inactive')
    },
    {
      field: 'ModelDeveloper',
      header: 'Developer',
      sortable: false,
      width: '120px',
      render: (value, row) => {
        const vendorInfo = getModelVendorInfo(row.ID);
        return vendorInfo.modelDeveloper?.Vendor || '-';
      }
    },
    {
      field: 'InferenceProviders',
      header: 'Providers',
      sortable: false,
      width: '150px',
      render: (value, row) => {
        const vendorInfo = getModelVendorInfo(row.ID);
        if (vendorInfo.inferenceProviders.length === 0) {
          return <span style={{ color: styles.colors.textSecondary }}>-</span>;
        }

        return (
          <div style={{
            display: 'flex',
            gap: styles.spacing.xs,
            flexWrap: 'wrap'
          }}>
            {vendorInfo.inferenceProviders.slice(0, 3).map((provider, idx) => (
              <span
                key={idx}
                style={{
                  padding: `2px ${styles.spacing.xs}`,
                  backgroundColor: styles.colors.primary + '15',
                  color: styles.colors.primary,
                  borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                  fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm
                }}
              >
                {provider.Vendor}
              </span>
            ))}
            {vendorInfo.inferenceProviders.length > 3 && (
              <span style={{
                color: styles.colors.textSecondary,
                fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm
              }}>
                +{vendorInfo.inferenceProviders.length - 3}
              </span>
            )}
          </div>
        );
      }
    },
    {
      field: 'InputTokenLimit',
      header: 'Input Limit',
      sortable: true,
      width: '100px',
      render: (value) => formatTokens(value)
    },
    {
      field: 'CostRank',
      header: 'Cost',
      sortable: true,
      width: '80px',
      render: (value) => renderCostRank(value)
    }
  ];

  // Handle row selection
  const handleRowSelect = useCallback((selectedRows) => {
    if (selectedRows && selectedRows.length > 0) {
      onSelectModel?.(selectedRows[0].ID);
    }
  }, [onSelectModel]);
  
  // Grid view rendering
  const renderGridView = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: styles.spacing.lg
    }}>
      {models.map((model) => {
        const vendorInfo = getModelVendorInfo(model.ID);
        const isSelected = model.ID === selectedModelId;

        return (
          <div
            key={model.ID}
            onClick={() => onSelectModel?.(model.ID)}
            style={{
              backgroundColor: styles.colors.surface,
              borderRadius: getBorderRadius('md'),
              padding: styles.spacing.lg,
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: isSelected
                ? `2px solid ${styles.colors.primary}`
                : `1px solid ${styles.colors.border}`,
              boxShadow: isSelected
                ? `0 4px 12px ${styles.colors.shadow || 'rgba(0, 0, 0, 0.1)'}`
                : 'none'
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = styles.colors.primary;
                e.currentTarget.style.boxShadow = `0 2px 8px ${styles.colors.shadow || 'rgba(0, 0, 0, 0.05)'}`;
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = styles.colors.border;
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            {/* Model Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: styles.spacing.md
            }}>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  margin: 0,
                  fontSize: styles.typography.fontSize.lg,
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  color: styles.colors.text,
                  marginBottom: styles.spacing.xs
                }}>
                  {model.Name}
                </h3>
                {model.APIName && (
                  <div style={{
                    fontSize: styles.typography.fontSize.sm,
                    color: styles.colors.textSecondary,
                    fontFamily: 'monospace'
                  }}>
                    {model.APIName}
                  </div>
                )}
              </div>
              {renderStatusBadge(model.IsActive ? 'Active' : 'Inactive')}
            </div>

            {/* Model Description */}
            {model.Description && (
              <div style={{
                fontSize: styles.typography.fontSize.sm,
                color: styles.colors.textSecondary,
                marginBottom: styles.spacing.md,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical'
              }}>
                {model.Description}
              </div>
            )}

            {/* Model Specs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: styles.spacing.sm,
              marginBottom: styles.spacing.md
            }}>
              <div style={{
                padding: styles.spacing.sm,
                backgroundColor: styles.colors.background,
                borderRadius: getBorderRadius('sm')
              }}>
                <div style={{
                  fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                  color: styles.colors.textSecondary,
                  marginBottom: styles.spacing.xs
                }}>
                  Input Token Limit
                </div>
                <div style={{
                  fontSize: styles.typography.fontSize.sm,
                  fontWeight: styles.typography.fontWeight?.medium || '500',
                  color: styles.colors.text
                }}>
                  {formatTokens(model.InputTokenLimit)}
                </div>
              </div>
              <div style={{
                padding: styles.spacing.sm,
                backgroundColor: styles.colors.background,
                borderRadius: getBorderRadius('sm')
              }}>
                <div style={{
                  fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                  color: styles.colors.textSecondary,
                  marginBottom: styles.spacing.xs
                }}>
                  Cost Rank
                </div>
                <div style={{
                  fontSize: styles.typography.fontSize.sm,
                  fontWeight: styles.typography.fontWeight?.medium || '500'
                }}>
                  {renderCostRank(model.CostRank)}
                </div>
              </div>
            </div>

            {/* Vendor Info */}
            <div style={{
              paddingTop: styles.spacing.md,
              borderTop: `1px solid ${styles.colors.border}`,
              display: 'flex',
              gap: styles.spacing.md,
              fontSize: styles.typography.fontSize.sm
            }}>
              {vendorInfo.modelDeveloper && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: styles.spacing.xs
                }}>
                  <span style={{ color: styles.colors.textSecondary }}>Dev:</span>
                  <span style={{
                    color: styles.colors.text,
                    fontWeight: styles.typography.fontWeight?.medium || '500'
                  }}>
                    {vendorInfo.modelDeveloper.Vendor}
                  </span>
                </div>
              )}
              {vendorInfo.inferenceProviders.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: styles.spacing.xs
                }}>
                  <span style={{ color: styles.colors.textSecondary }}>Providers:</span>
                  <span style={{
                    color: styles.colors.primary,
                    fontWeight: styles.typography.fontWeight?.medium || '500'
                  }}>
                    {vendorInfo.inferenceProviders.length}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // List view rendering
  const renderListView = () => (
    <div style={{ width: '100%' }}>
      {DataGrid ? (
        <DataGrid
          data={models}
          columns={gridColumns}
          pageSize={25}
          showFilters={true}
          showExport={false}
          selectionMode="single"
          selectedRows={selectedModelId ? models.filter(m => m.ID === selectedModelId) : []}
          onRowSelect={handleRowSelect}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
          savedUserSettings={savedUserSettings}
          onSaveUserSettings={onSaveUserSettings}
        />
      ) : (
        <div style={{
          padding: styles.spacing.lg,
          textAlign: 'center',
          color: styles.colors.textSecondary
        }}>
          DataGrid component not available
        </div>
      )}
    </div>
  );

  return viewMode === 'grid' ? renderGridView() : renderListView();
}