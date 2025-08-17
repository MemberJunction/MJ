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
  
  // Handle sort column click
  const handleSort = useCallback((field) => {
    if (sortBy === field) {
      onSortChange?.(field, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange?.(field, 'asc');
    }
  }, [sortBy, sortDirection, onSortChange]);
  
  // Render sort indicator
  const renderSortIndicator = (field) => {
    if (sortBy !== field) return null;
    
    return (
      <span style={{
        marginLeft: styles.spacing.xs,
        fontSize: styles.typography.fontSize.sm
      }}>
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    );
  };
  
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
    <div style={{
      backgroundColor: styles.colors.surface,
      borderRadius: getBorderRadius('md'),
      overflow: 'hidden'
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse'
      }}>
        <thead>
          <tr style={{
            borderBottom: `2px solid ${styles.colors.border}`
          }}>
            <th
              onClick={() => handleSort('Name')}
              style={{
                padding: styles.spacing.md,
                textAlign: 'left',
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                color: styles.colors.textSecondary,
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              Model Name
              {renderSortIndicator('Name')}
            </th>
            <th
              onClick={() => handleSort('Status')}
              style={{
                padding: styles.spacing.md,
                textAlign: 'left',
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                color: styles.colors.textSecondary,
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              Status
              {renderSortIndicator('Status')}
            </th>
            <th
              style={{
                padding: styles.spacing.md,
                textAlign: 'left',
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                color: styles.colors.textSecondary
              }}
            >
              Developer
            </th>
            <th
              style={{
                padding: styles.spacing.md,
                textAlign: 'left',
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                color: styles.colors.textSecondary
              }}
            >
              Providers
            </th>
            <th
              onClick={() => handleSort('InputTokenLimit')}
              style={{
                padding: styles.spacing.md,
                textAlign: 'right',
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                color: styles.colors.textSecondary,
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              Input Limit
              {renderSortIndicator('InputTokenLimit')}
            </th>
            <th
              onClick={() => handleSort('CostRank')}
              style={{
                padding: styles.spacing.md,
                textAlign: 'center',
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                color: styles.colors.textSecondary,
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              Cost
              {renderSortIndicator('CostRank')}
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model, index) => {
            const vendorInfo = getModelVendorInfo(model.ID);
            const isSelected = model.ID === selectedModelId;
            
            return (
              <tr
                key={model.ID}
                onClick={() => onSelectModel?.(model.ID)}
                style={{
                  borderBottom: index < models.length - 1 
                    ? `1px solid ${styles.colors.borderLight || styles.colors.border}` 
                    : 'none',
                  backgroundColor: isSelected 
                    ? styles.colors.primaryLight || styles.colors.primary + '10'
                    : 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.md
                }}>
                  <div>
                    <div style={{
                      fontWeight: isSelected 
                        ? (styles.typography.fontWeight?.semibold || '600')
                        : (styles.typography.fontWeight?.regular || '400'),
                      color: styles.colors.text
                    }}>
                      {model.Name}
                    </div>
                    {model.APIName && (
                      <div style={{
                        fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                        color: styles.colors.textSecondary,
                        fontFamily: 'monospace'
                      }}>
                        {model.APIName}
                      </div>
                    )}
                  </div>
                </td>
                <td style={{
                  padding: styles.spacing.md
                }}>
                  {renderStatusBadge(model.IsActive ? 'Active' : 'Inactive')}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.text
                }}>
                  {vendorInfo.modelDeveloper?.Vendor || '-'}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.md
                }}>
                  {vendorInfo.inferenceProviders.length > 0 ? (
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
                  ) : (
                    <span style={{ color: styles.colors.textSecondary }}>-</span>
                  )}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  textAlign: 'right',
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.text
                }}>
                  {formatTokens(model.InputTokenLimit)}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  textAlign: 'center'
                }}>
                  {renderCostRank(model.CostRank)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  
  return viewMode === 'grid' ? renderGridView() : renderListView();
}