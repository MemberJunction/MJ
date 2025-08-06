function EntityFieldSummaryTable({ data, utilities, styles, components, onStateChanged, filters, sortBy, sortDirection }) {
  const { TableComponent, FiltersPanel } = components;

  const handleSort = (column, direction) => {
    onStateChanged?.({ sortBy: column, sortDirection: direction });
  };

  const handleFiltersChange = (updatedFilters) => {
    onStateChanged?.({ filters: updatedFilters });
  };

  const columns = [
    {
      key: 'EntityName',
      title: 'Entity Name',
      dataIndex: 'EntityName',
      width: 200,
      ellipsis: true,
      sortable: true,
      render: (text) => (
        <div style={{ 
          maxWidth: '200px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          cursor: 'pointer',
          color: styles.colors.primary
        }} title={text}>
          {text}
        </div>
      )
    },
    {
      key: 'EntityDescription',
      title: 'Description',
      dataIndex: 'EntityDescription',
      width: 300,
      ellipsis: true,
      sortable: false,
      render: (text) => (
        <div style={{ 
          maxWidth: '300px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: styles.colors.textSecondary
        }} title={text}>
          {text || 'No description'}
        </div>
      )
    },
    {
      key: 'TotalFields',
      title: 'Total Fields',
      dataIndex: 'TotalFields',
      width: 100,
      sortable: true,
      align: 'right',
      render: (value) => (
        <span style={{ 
          fontWeight: styles.typography.fontWeight?.medium || '500',
          color: styles.colors.text
        }}>
          {value || 0}
        </span>
      )
    },
    {
      key: 'TextFields',
      title: 'Text',
      dataIndex: 'TextFields',
      width: 80,
      sortable: true,
      align: 'right',
      render: (value) => (
        <span style={{ color: styles.colors.info }}>
          {value || 0}
        </span>
      )
    },
    {
      key: 'NumberFields',
      title: 'Number',
      dataIndex: 'NumberFields',
      width: 80,
      sortable: true,
      align: 'right',
      render: (value) => (
        <span style={{ color: styles.colors.success }}>
          {value || 0}
        </span>
      )
    },
    {
      key: 'DateFields',
      title: 'Date',
      dataIndex: 'DateFields',
      width: 80,
      sortable: true,
      align: 'right',
      render: (value) => (
        <span style={{ color: styles.colors.warning }}>
          {value || 0}
        </span>
      )
    },
    {
      key: 'BooleanFields',
      title: 'Boolean',
      dataIndex: 'BooleanFields',
      width: 80,
      sortable: true,
      align: 'right',
      render: (value) => (
        <span style={{ color: styles.colors.error }}>
          {value || 0}
        </span>
      )
    },
    {
      key: 'GuidFields',
      title: 'GUID',
      dataIndex: 'GuidFields',
      width: 80,
      sortable: true,
      align: 'right',
      render: (value) => (
        <span style={{ color: styles.colors.textSecondary }}>
          {value || 0}
        </span>
      )
    },
    {
      key: 'BinaryFields',
      title: 'Binary',
      dataIndex: 'BinaryFields',
      width: 80,
      sortable: true,
      align: 'right',
      render: (value) => (
        <span style={{ color: styles.colors.textTertiary }}>
          {value || 0}
        </span>
      )
    },
    {
      key: 'EntityRowCount',
      title: 'Rows',
      dataIndex: 'EntityRowCount',
      width: 100,
      sortable: true,
      align: 'right',
      render: (value) => (
        <span style={{ fontSize: styles.typography.fontSize.sm }}>
          {value?.toLocaleString() || '0'}
        </span>
      )
    },
    {
      key: 'EntityStatus',
      title: 'Status',
      dataIndex: 'EntityStatus',
      width: 100,
      sortable: true,
      render: (value) => (
        <span style={{
          padding: '4px 8px',
          borderRadius: styles.borders.radius,
          fontSize: styles.typography.fontSize.xs,
          backgroundColor: value === 'Active' ? styles.colors.successLight : 
                          value === 'Deprecated' ? styles.colors.warningLight : 
                          styles.colors.errorLight,
          color: value === 'Active' ? styles.colors.success : 
                 value === 'Deprecated' ? styles.colors.warning : 
                 styles.colors.error
        }}>
          {value}
        </span>
      )
    },
    {
      key: 'LastFieldUpdate',
      title: 'Last Updated',
      dataIndex: 'LastFieldUpdate',
      width: 150,
      sortable: true,
      render: (value) => (
        <div title={value ? new Date(value).toLocaleString() : ''}>
          <span style={{
            fontSize: styles.typography.fontSize.sm,
            color: styles.colors.textSecondary
          }}>
            {value ? new Date(value).toLocaleDateString() : 'Never'}
          </span>
        </div>
      )
    }
  ];

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: styles.colors.background,
    fontFamily: styles.typography.fontFamily
  };

  const filterContainerStyle = {
    padding: styles.spacing.md,
    borderBottom: `1px solid ${styles.colors.border}`,
    backgroundColor: styles.colors.surface
  };

  const tableContainerStyle = {
    flex: 1,
    overflow: 'auto',
    padding: styles.spacing.md
  };

  return (
    <div style={containerStyle}>
      <div style={filterContainerStyle}>
        <FiltersPanel
          searchTerm={filters?.searchTerm || ''}
          minFields={filters?.minFields || 0}
          maxFields={filters?.maxFields || 9999}
          selectedStatuses={filters?.selectedStatuses || ['Active']}
          typeFilters={filters?.typeFilters || {}}
          onFiltersChange={handleFiltersChange}
          styles={styles}
          utilities={utilities}
          components={components}
        />
      </div>
      <div style={tableContainerStyle}>
        <TableComponent
          columns={columns}
          data={data || []}
          sortColumn={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          styles={styles}
          utilities={utilities}
          components={components}
        />
      </div>
    </div>
  );
}

/*******************************************************
   TableComponent
   undefined
*******************************************************/
function TableComponent({ columns = [], data = [], sortColumn, sortDirection, styles = {}, callbacks = {}, ...userState }) {
  const updateState = (newState) => {
    callbacks?.UpdateUserState?.({ ...userState, ...newState });
  };

  const handleSort = (columnName) => {
    const newDirection = sortColumn === columnName && sortDirection === 'asc' ? 'desc' : 'asc';
    updateState({ sortColumn: columnName, sortDirection: newDirection });
  };

  const containerStyle = {
    height: '100%',
    overflow: 'auto',
    backgroundColor: styles.colors?.background || '#ffffff',
    border: `1px solid ${styles.colors?.border || '#e0e0e0'}`,
    borderRadius: styles.borders?.radius || '4px',
    fontFamily: styles.typography?.fontFamily || 'Arial, sans-serif'
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: styles.typography?.fontSize?.md || '14px'
  };

  const headerStyle = {
    backgroundColor: styles.colors?.surface || '#f5f5f5',
    borderBottom: `1px solid ${styles.colors?.border || '#e0e0e0'}`,
    padding: styles.spacing?.md || '12px',
    textAlign: 'left',
    fontWeight: styles.typography?.fontWeight?.semibold || '600',
    color: styles.colors?.text || '#333333',
    cursor: 'pointer',
    userSelect: 'none'
  };

  const cellStyle = {
    padding: styles.spacing?.md || '12px',
    borderBottom: `1px solid ${styles.colors?.borderLight || styles.colors?.border || '#e0e0e0'}`,
    color: styles.colors?.textSecondary || '#666666'
  };

  const sortIconStyle = {
    marginLeft: styles.spacing?.xs || '4px',
    fontSize: styles.typography?.fontSize?.sm || '12px'
  };

  return (
    <div style={containerStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={column.field}
                style={{
                  ...headerStyle,
                  ...(sortColumn === column.field 
                    ? { backgroundColor: styles.colors?.primaryLight || styles.colors?.primary || '#e3f2fd' }
                    : {})
                }}
                onClick={() => handleSort(column.field)}
              >
                {column.title}
                {sortColumn === column.field && (
                  <span style={sortIconStyle}>
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td 
                  key={`${index}-${column.field}`}
                  style={cellStyle}
                >
                  {row[column.field] || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*******************************************************
   FiltersPanel
   undefined
*******************************************************/
function FiltersPanel({ data, utilities, styles, components, searchTerm, minFields, maxFields, selectedStatuses, typeFilters, onStateChanged }) {
  const handleSearchChange = (e) => {
    onStateChanged?.({ searchTerm: e.target.value });
  };

  const handleMinFieldsChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    onStateChanged?.({ minFields: value });
  };

  const handleMaxFieldsChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    onStateChanged?.({ maxFields: value });
  };

  const handleStatusToggle = (status) => {
    const updatedStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
    onStateChanged?.({ selectedStatuses: updatedStatuses });
  };

  const handleTypeChange = (typeName, value) => {
    const updatedTypeFilters = { ...typeFilters, [typeName]: value };
    onStateChanged?.({ typeFilters: updatedTypeFilters });
  };

  const containerStyle = {
    padding: styles.spacing.md,
    backgroundColor: styles.colors.surface,
    border: `1px solid ${styles.colors.border}`,
    borderRadius: styles.borders.radius,
    height: '100%',
    overflow: 'auto'
  };

  const inputStyle = {
    width: '100%',
    padding: styles.spacing.sm,
    border: `1px solid ${styles.colors.border}`,
    borderRadius: styles.borders.radius,
    fontSize: styles.typography.fontSize.sm,
    marginBottom: styles.spacing.sm
  };

  const labelStyle = {
    display: 'block',
    marginBottom: styles.spacing.xs,
    fontSize: styles.typography.fontSize.sm,
    color: styles.colors.textSecondary,
    fontWeight: styles.typography.fontWeight?.medium || '500'
  };

  const statusButtonStyle = (isActive) => ({
    padding: `${styles.spacing.xs} ${styles.spacing.sm}`,
    margin: `0 ${styles.spacing.xs} ${styles.spacing.xs} 0`,
    border: `1px solid ${isActive ? styles.colors.primary : styles.colors.border}`,
    borderRadius: styles.borders.radius,
    backgroundColor: isActive ? styles.colors.primary : 'transparent',
    color: isActive ? styles.colors.textInverse || styles.colors.background : styles.colors.text,
    cursor: 'pointer',
    fontSize: styles.typography.fontSize.xs
  });

  const numberInputStyle = {
    width: '80px',
    padding: styles.spacing.xs,
    border: `1px solid ${styles.colors.border}`,
    borderRadius: styles.borders.radius,
    fontSize: styles.typography.fontSize.sm,
    margin: `0 ${styles.spacing.sm}`
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: styles.spacing.lg }}>
        <label style={labelStyle}>Entity Name Search</label>
        <input
          type="text"
          value={searchTerm || ''}
          onChange={handleSearchChange}
          placeholder="Search entities..."
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: styles.spacing.lg }}>
        <label style={labelStyle}>Field Count Range</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: styles.spacing.sm }}>
          <span>Min:</span>
          <input
            type="number"
            value={minFields || 0}
            onChange={handleMinFieldsChange}
            min="0"
            style={numberInputStyle}
          />
          <span>Max:</span>
          <input
            type="number"
            value={maxFields || 0}
            onChange={handleMaxFieldsChange}
            min="0"
            style={numberInputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: styles.spacing.lg }}>
        <label style={labelStyle}>Status Filters</label>
        <div>
          {['Active', 'Deprecated', 'Disabled'].map(status => (
            <button
              key={status}
              onClick={() => handleStatusToggle(status)}
              style={statusButtonStyle(selectedStatuses.includes(status))}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Type Distribution Threshold</label>
        {Object.entries(typeFilters || {}).map(([typeName, currentValue]) => (
          <div key={typeName} style={{ marginBottom: styles.spacing.sm }}>
            <label style={{ ...labelStyle, fontSize: styles.typography.fontSize.xs }}>
              {typeName}:
            </label>
            <input
              type="number"
              value={currentValue || 0}
              onChange={(e) => handleTypeChange(typeName, parseInt(e.target.value) || 0)}
              min="0"
              style={numberInputStyle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}