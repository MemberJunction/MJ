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
  // Load DataGrid component from registry
  const DataGrid = components['DataGrid'];

  // Helper function to get border radius value
  const getBorderRadius = (size) => {
    return typeof styles.borders.radius === 'object' ? styles.borders.radius[size] : styles.borders.radius;
  };

  // Handle entity selection
  const handleEntityClick = useCallback((entityId) => {
    onSelectEntity?.(entityId);
  }, [onSelectEntity]);

  // Define columns for DataGrid
  const gridColumns = [
    {
      field: 'Name',
      header: 'Name',
      sortable: true,
      width: '150px'
    },
    {
      field: 'DisplayName',
      header: 'Display Name',
      sortable: true,
      width: '150px',
      render: (value, row) => value || row.Name
    },
    {
      field: 'Description',
      header: 'Description',
      sortable: false,
      width: '300px',
      render: (value) => value || '-'
    },
    {
      field: 'SchemaName',
      header: 'Schema',
      sortable: false,
      width: '120px',
      render: (value) => value || '-'
    },
    {
      field: 'BaseTable',
      header: 'Table',
      sortable: false,
      width: '150px',
      render: (value) => value || '-'
    },
    {
      field: 'BaseView',
      header: 'Base View',
      sortable: false,
      width: '150px',
      render: (value) => value || '-'
    }
  ];

  // Handle row click to open entity details
  const handleRowClick = useCallback((row) => {
    // When a row is clicked, select the entity and open its details
    handleEntityClick(row.ID);
  }, [handleEntityClick]);

  // Grid View
  if (viewMode === 'grid') {
    return (
      <div style={{
        width: '100%',
        overflowX: 'auto'
      }}>
        {DataGrid ? (
          <DataGrid
            data={entities}
            columns={gridColumns}
            pageSize={50}
            showFilters={true}
            showExport={false}
            selectionMode="none"  // Disable selection mode since we're using row clicks
            onRowClick={handleRowClick}  // Handle row clicks to open the entity
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