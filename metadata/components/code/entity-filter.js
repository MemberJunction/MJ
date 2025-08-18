function EntityFilter({ 
  filters, 
  onFilterChange, 
  schemas, 
  tables, 
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
    return typeof styles.borders.radius === 'object' ? styles.borders.radius[size] : styles.borders.radius;
  };
  
  // Calculate active filter count
  const activeFilterCount = Object.values(filters || {}).filter(Boolean).length;
  
  // Handle schema filter change
  const handleSchemaChange = useCallback((e) => {
    const newFilters = {
      ...filters,
      schema: e.target.value || undefined
    };
    onFilterChange?.(newFilters);
  }, [filters, onFilterChange]);
  
  // Handle table filter change
  const handleTableChange = useCallback((e) => {
    const newFilters = {
      ...filters,
      table: e.target.value || undefined
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
          {/* Schema Filter */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: styles.spacing.sm,
              fontSize: styles.typography.fontSize.sm,
              fontWeight: styles.typography.fontWeight?.medium || '500',
              color: styles.colors.textSecondary
            }}>
              Schema
            </label>
            <select
              value={filters?.schema || ''}
              onChange={handleSchemaChange}
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
              <option value="">All Schemas</option>
              {schemas.map((schema) => (
                <option key={schema} value={schema}>
                  {schema}
                </option>
              ))}
            </select>
          </div>
          
          {/* Table Filter */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: styles.spacing.sm,
              fontSize: styles.typography.fontSize.sm,
              fontWeight: styles.typography.fontWeight?.medium || '500',
              color: styles.colors.textSecondary
            }}>
              Base Table
            </label>
            <select
              value={filters?.table || ''}
              onChange={handleTableChange}
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
              <option value="">All Tables</option>
              {tables.map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
            </select>
          </div>
          
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
                {filters?.schema && (
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
                        Schema:
                      </span>
                      <strong>{filters.schema}</strong>
                    </div>
                    <button
                      onClick={() => handleSchemaChange({ target: { value: '' } })}
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
                {filters?.table && (
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
                        Table:
                      </span>
                      <strong>{filters.table}</strong>
                    </div>
                    <button
                      onClick={() => handleTableChange({ target: { value: '' } })}
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