function AIModelFilter({ 
  filters, 
  onFilterChange, 
  modelTypes,
  vendors,
  isCollapsed, 
  onToggleCollapse,
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
  
  // Calculate active filter count
  const activeFilterCount = Object.values(filters || {}).filter(Boolean).length;
  
  // Handle model type filter change
  const handleModelTypeChange = useCallback((e) => {
    const newFilters = {
      ...filters,
      modelType: e.target.value || undefined
    };
    onFilterChange?.(newFilters);
  }, [filters, onFilterChange]);
  
  // Handle developer filter change
  const handleDeveloperChange = useCallback((e) => {
    const newFilters = {
      ...filters,
      developer: e.target.value || undefined
    };
    onFilterChange?.(newFilters);
  }, [filters, onFilterChange]);
  
  // Handle inference provider filter change
  const handleProviderChange = useCallback((e) => {
    const newFilters = {
      ...filters,
      provider: e.target.value || undefined
    };
    onFilterChange?.(newFilters);
  }, [filters, onFilterChange]);
  
  // Handle status filter change
  const handleStatusChange = useCallback((e) => {
    const newFilters = {
      ...filters,
      isActive: e.target.value === '' ? undefined : e.target.value === 'true'
    };
    onFilterChange?.(newFilters);
  }, [filters, onFilterChange]);
  
  // Handle clear all filters
  const handleClearFilters = useCallback(() => {
    onFilterChange?.({});
  }, [onFilterChange]);
  
  // Handle toggle collapse
  const handleToggle = useCallback(() => {
    onToggleCollapse?.();
  }, [onToggleCollapse]);
  
  // Get unique developers and providers
  const developers = useMemo(() => {
    // Use all vendors for now since we'll filter properly in the parent
    return vendors.map(v => v.Name).filter(Boolean);
  }, [vendors]);
  
  const providers = useMemo(() => {
    // Use all vendors for now since we'll filter properly in the parent  
    return vendors.map(v => v.Name).filter(Boolean);
  }, [vendors]);
  
  return (
    <div style={{
      width: isCollapsed ? '48px' : '280px',
      minWidth: isCollapsed ? '48px' : '280px',
      backgroundColor: styles.colors.surface,
      borderRight: `1px solid ${styles.colors.border}`,
      transition: 'width 0.3s ease-out',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Toggle Button */}
      <button
        onClick={handleToggle}
        style={{
          position: 'absolute',
          top: styles.spacing.md,
          right: styles.spacing.md,
          width: '32px',
          height: '32px',
          borderRadius: getBorderRadius('sm'),
          border: `1px solid ${styles.colors.border}`,
          backgroundColor: styles.colors.background,
          color: styles.colors.text,
          fontSize: styles.typography.fontSize.md,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = styles.colors.background;
        }}
      >
        {isCollapsed ? '→' : '←'}
      </button>
      
      {/* Filter Icon when collapsed */}
      {isCollapsed && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          opacity: 1,
          transition: 'opacity 0.3s'
        }}>
          <div style={{
            fontSize: styles.typography.fontSize.xl,
            color: styles.colors.textSecondary,
            marginBottom: styles.spacing.sm
          }}>
            🔍
          </div>
          {activeFilterCount > 0 && (
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: styles.colors.primary,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: styles.typography.fontSize.xs,
              fontWeight: styles.typography.fontWeight?.bold || '700'
            }}>
              {activeFilterCount}
            </div>
          )}
        </div>
      )}
      
      {/* Filter Content */}
      <div style={{
        padding: styles.spacing.lg,
        opacity: isCollapsed ? 0 : 1,
        transition: 'opacity 0.3s',
        pointerEvents: isCollapsed ? 'none' : 'auto',
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: styles.spacing.xl,
          paddingRight: '40px'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: styles.typography.fontSize.lg,
            fontWeight: styles.typography.fontWeight?.semibold || '600',
            color: styles.colors.text,
            marginBottom: styles.spacing.xs
          }}>
            Filters
          </h2>
          {activeFilterCount > 0 && (
            <div style={{
              fontSize: styles.typography.fontSize.sm,
              color: styles.colors.textSecondary
            }}>
              {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        
        {/* Filter Controls */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: styles.spacing.lg
        }}>
          {/* Model Type Filter */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: styles.spacing.sm,
              fontSize: styles.typography.fontSize.sm,
              fontWeight: styles.typography.fontWeight?.medium || '500',
              color: styles.colors.textSecondary
            }}>
              Model Type
            </label>
            <select
              value={filters?.modelType || ''}
              onChange={handleModelTypeChange}
              style={{
                width: '100%',
                padding: styles.spacing.sm,
                fontSize: styles.typography.fontSize.md,
                border: `1px solid ${styles.colors.border}`,
                borderRadius: getBorderRadius('sm'),
                backgroundColor: styles.colors.background,
                color: styles.colors.text,
                cursor: 'pointer'
              }}
            >
              <option value="">All Types</option>
              {modelTypes.map((type) => (
                <option key={type.ID} value={type.ID}>
                  {type.Name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Status Filter */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: styles.spacing.sm,
              fontSize: styles.typography.fontSize.sm,
              fontWeight: styles.typography.fontWeight?.medium || '500',
              color: styles.colors.textSecondary
            }}>
              Status
            </label>
            <select
              value={filters?.isActive === undefined ? '' : filters.isActive.toString()}
              onChange={handleStatusChange}
              style={{
                width: '100%',
                padding: styles.spacing.sm,
                fontSize: styles.typography.fontSize.md,
                border: `1px solid ${styles.colors.border}`,
                borderRadius: getBorderRadius('sm'),
                backgroundColor: styles.colors.background,
                color: styles.colors.text,
                cursor: 'pointer'
              }}
            >
              <option value="">All Statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          
          {/* Model Developer Filter */}
          {developers.length > 0 && (
            <div>
              <label style={{
                display: 'block',
                marginBottom: styles.spacing.sm,
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.medium || '500',
                color: styles.colors.textSecondary
              }}>
                Model Developer
              </label>
              <select
                value={filters?.developer || ''}
                onChange={handleDeveloperChange}
                style={{
                  width: '100%',
                  padding: styles.spacing.sm,
                  fontSize: styles.typography.fontSize.md,
                  border: `1px solid ${styles.colors.border}`,
                  borderRadius: getBorderRadius('sm'),
                  backgroundColor: styles.colors.background,
                  color: styles.colors.text,
                  cursor: 'pointer'
                }}
              >
                <option value="">All Developers</option>
                {developers.map((dev) => (
                  <option key={dev} value={dev}>
                    {dev}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Inference Provider Filter */}
          {providers.length > 0 && (
            <div>
              <label style={{
                display: 'block',
                marginBottom: styles.spacing.sm,
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.medium || '500',
                color: styles.colors.textSecondary
              }}>
                Inference Provider
              </label>
              <select
                value={filters?.provider || ''}
                onChange={handleProviderChange}
                style={{
                  width: '100%',
                  padding: styles.spacing.sm,
                  fontSize: styles.typography.fontSize.md,
                  border: `1px solid ${styles.colors.border}`,
                  borderRadius: getBorderRadius('sm'),
                  backgroundColor: styles.colors.background,
                  color: styles.colors.text,
                  cursor: 'pointer'
                }}
              >
                <option value="">All Providers</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Active Filters Display */}
          {activeFilterCount > 0 && (
            <div>
              <div style={{
                marginBottom: styles.spacing.sm,
                fontSize: styles.typography.fontSize.sm,
                fontWeight: styles.typography.fontWeight?.medium || '500',
                color: styles.colors.textSecondary
              }}>
                Active Filters
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: styles.spacing.xs
              }}>
                {filters?.modelType && (
                  <div style={{
                    padding: styles.spacing.sm,
                    backgroundColor: styles.colors.primary + '15',
                    borderRadius: getBorderRadius('sm'),
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.sm,
                      color: styles.colors.text
                    }}>
                      <span style={{
                        color: styles.colors.textSecondary,
                        marginRight: styles.spacing.xs
                      }}>
                        Type:
                      </span>
                      <strong>{modelTypes.find(t => t.ID === filters.modelType)?.Name || filters.modelType}</strong>
                    </div>
                    <button
                      onClick={() => handleModelTypeChange({ target: { value: '' } })}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: styles.colors.textSecondary,
                        fontSize: styles.typography.fontSize.sm,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {filters?.isActive !== undefined && (
                  <div style={{
                    padding: styles.spacing.sm,
                    backgroundColor: styles.colors.primary + '15',
                    borderRadius: getBorderRadius('sm'),
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.sm,
                      color: styles.colors.text
                    }}>
                      <span style={{
                        color: styles.colors.textSecondary,
                        marginRight: styles.spacing.xs
                      }}>
                        Status:
                      </span>
                      <strong>{filters.isActive ? 'Active' : 'Inactive'}</strong>
                    </div>
                    <button
                      onClick={() => handleStatusChange({ target: { value: '' } })}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: styles.colors.textSecondary,
                        fontSize: styles.typography.fontSize.sm,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {filters?.developer && (
                  <div style={{
                    padding: styles.spacing.sm,
                    backgroundColor: styles.colors.primary + '15',
                    borderRadius: getBorderRadius('sm'),
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.sm,
                      color: styles.colors.text
                    }}>
                      <span style={{
                        color: styles.colors.textSecondary,
                        marginRight: styles.spacing.xs
                      }}>
                        Developer:
                      </span>
                      <strong>{filters.developer}</strong>
                    </div>
                    <button
                      onClick={() => handleDeveloperChange({ target: { value: '' } })}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: styles.colors.textSecondary,
                        fontSize: styles.typography.fontSize.sm,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {filters?.provider && (
                  <div style={{
                    padding: styles.spacing.sm,
                    backgroundColor: styles.colors.primary + '15',
                    borderRadius: getBorderRadius('sm'),
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.sm,
                      color: styles.colors.text
                    }}>
                      <span style={{
                        color: styles.colors.textSecondary,
                        marginRight: styles.spacing.xs
                      }}>
                        Provider:
                      </span>
                      <strong>{filters.provider}</strong>
                    </div>
                    <button
                      onClick={() => handleProviderChange({ target: { value: '' } })}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: styles.colors.textSecondary,
                        fontSize: styles.typography.fontSize.sm,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Clear All Button */}
        {activeFilterCount > 0 && (
          <div style={{
            marginTop: styles.spacing.xl,
            paddingTop: styles.spacing.lg,
            borderTop: `1px solid ${styles.colors.borderLight || styles.colors.border}`
          }}>
            <button
              onClick={handleClearFilters}
              style={{
                width: '100%',
                padding: styles.spacing.md,
                backgroundColor: styles.colors.surface,
                color: styles.colors.text,
                border: `1px solid ${styles.colors.border}`,
                borderRadius: getBorderRadius('md'),
                fontSize: styles.typography.fontSize.md,
                fontWeight: styles.typography.fontWeight?.medium || '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = styles.colors.error + '15';
                e.currentTarget.style.color = styles.colors.error;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = styles.colors.surface;
                e.currentTarget.style.color = styles.colors.text;
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}