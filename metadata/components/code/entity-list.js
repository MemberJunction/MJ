function EntityList({ 
  entities, 
  viewMode, 
  selectedEntityId, 
  onSelectEntity, 
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
    return typeof styles.borders.radius === 'object' ? styles.borders.radius[size] : styles.borders.radius;
  };
  
  // Handle sort column click
  const handleSortClick = useCallback((field) => {
    if (sortBy === field) {
      // Toggle direction if same field
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      onSortChange?.(field, newDirection);
    } else {
      // New field, default to ascending
      onSortChange?.(field, 'asc');
    }
  }, [sortBy, sortDirection, onSortChange]);
  
  // Handle entity selection
  const handleEntityClick = useCallback((entityId) => {
    onSelectEntity?.(entityId);
  }, [onSelectEntity]);
  
  // Render sort indicator
  const renderSortIndicator = (field) => {
    if (sortBy !== field) return null;
    
    return (
      <span style={{ marginLeft: styles.spacing.xs }}>
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };
  
  // Grid View
  if (viewMode === 'grid') {
    return (
      <div style={{
        width: '100%',
        overflowX: 'auto'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: styles.colors.surface
        }}>
          <thead>
            <tr style={{
              borderBottom: `2px solid ${styles.colors.border}`
            }}>
              <th
                onClick={() => handleSortClick('Name')}
                style={{
                  padding: styles.spacing.md,
                  textAlign: 'left',
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.text,
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Name {renderSortIndicator('Name')}
              </th>
              <th
                onClick={() => handleSortClick('DisplayName')}
                style={{
                  padding: styles.spacing.md,
                  textAlign: 'left',
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.text,
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Display Name {renderSortIndicator('DisplayName')}
              </th>
              <th style={{
                padding: styles.spacing.md,
                textAlign: 'left',
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                fontSize: styles.typography.fontSize.md,
                color: styles.colors.text
              }}>
                Description
              </th>
              <th style={{
                padding: styles.spacing.md,
                textAlign: 'left',
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                fontSize: styles.typography.fontSize.md,
                color: styles.colors.text
              }}>
                Schema
              </th>
              <th style={{
                padding: styles.spacing.md,
                textAlign: 'left',
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                fontSize: styles.typography.fontSize.md,
                color: styles.colors.text
              }}>
                Table
              </th>
              <th style={{
                padding: styles.spacing.md,
                textAlign: 'left',
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                fontSize: styles.typography.fontSize.md,
                color: styles.colors.text
              }}>
                Base View
              </th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => (
              <tr
                key={entity.ID}
                onClick={() => handleEntityClick(entity.ID)}
                style={{
                  backgroundColor: selectedEntityId === entity.ID 
                    ? styles.colors.primary + '20' 
                    : 'transparent',
                  borderBottom: `1px solid ${styles.colors.borderLight || styles.colors.border}`,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (selectedEntityId !== entity.ID) {
                    e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedEntityId !== entity.ID) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.text,
                  fontWeight: selectedEntityId === entity.ID 
                    ? (styles.typography.fontWeight?.semibold || '600')
                    : (styles.typography.fontWeight?.regular || '400')
                }}>
                  {entity.Name}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.text
                }}>
                  {entity.DisplayName || entity.Name}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.sm,
                  color: styles.colors.textSecondary,
                  maxWidth: '300px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {entity.Description || '-'}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.textSecondary
                }}>
                  {entity.SchemaName || '-'}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.textSecondary
                }}>
                  {entity.BaseTable || '-'}
                </td>
                <td style={{
                  padding: styles.spacing.md,
                  fontSize: styles.typography.fontSize.md,
                  color: styles.colors.textSecondary
                }}>
                  {entity.BaseView || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  
  // Card View
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: styles.spacing.lg
    }}>
      {entities.map((entity) => (
        <div
          key={entity.ID}
          onClick={() => handleEntityClick(entity.ID)}
          style={{
            padding: styles.spacing.lg,
            backgroundColor: selectedEntityId === entity.ID 
              ? styles.colors.primary + '20'
              : styles.colors.surface,
            border: selectedEntityId === entity.ID
              ? `2px solid ${styles.colors.primary}`
              : `1px solid ${styles.colors.border}`,
            borderRadius: getBorderRadius('md'),
            cursor: 'pointer',
            transition: 'all 0.2s',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            if (selectedEntityId !== entity.ID) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${styles.colors.shadow || 'rgba(0, 0, 0, 0.1)'}`;
            }
          }}
          onMouseLeave={(e) => {
            if (selectedEntityId !== entity.ID) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          {/* Card Header */}
          <div style={{
            marginBottom: styles.spacing.md,
            paddingBottom: styles.spacing.md,
            borderBottom: `1px solid ${styles.colors.borderLight || styles.colors.border}`
          }}>
            <h3 style={{
              margin: 0,
              fontSize: styles.typography.fontSize.lg,
              fontWeight: styles.typography.fontWeight?.semibold || '600',
              color: styles.colors.text,
              marginBottom: styles.spacing.xs
            }}>
              {entity.DisplayName || entity.Name}
            </h3>
            {entity.DisplayName && entity.DisplayName !== entity.Name && (
              <div style={{
                fontSize: styles.typography.fontSize.sm,
                color: styles.colors.textSecondary
              }}>
                {entity.Name}
              </div>
            )}
          </div>
          
          {/* Card Body */}
          {entity.Description && (
            <p style={{
              margin: 0,
              marginBottom: styles.spacing.md,
              fontSize: styles.typography.fontSize.md,
              color: styles.colors.textSecondary,
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {entity.Description}
            </p>
          )}
          
          {/* Card Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: styles.typography.fontSize.sm,
            color: styles.colors.textSecondary
          }}>
            <div>
              {entity.SchemaName && (
                <span style={{ marginRight: styles.spacing.md }}>
                  Schema: <strong>{entity.SchemaName}</strong>
                </span>
              )}
              {entity.BaseTable && (
                <span>
                  Table: <strong>{entity.BaseTable}</strong>
                </span>
              )}
            </div>
            {entity.BaseView && (
              <div style={{
                fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                color: styles.colors.textSecondary
              }}>
                View: {entity.BaseView}
              </div>
            )}
          </div>
          
          {/* Selection Indicator */}
          {selectedEntityId === entity.ID && (
            <div style={{
              position: 'absolute',
              top: styles.spacing.sm,
              right: styles.spacing.sm,
              width: '8px',
              height: '8px',
              backgroundColor: styles.colors.primary,
              borderRadius: '50%'
            }} />
          )}
        </div>
      ))}
    </div>
  );
}