// CustomerBalances Sub-component
const CustomerBalances = ({ data, columns, onRowClick, sortConfig, onSort, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) => {
  const handleSort = (column) => {
    if (onSort) {
      const newOrder = sortConfig?.column === column && sortConfig?.order === 'asc' ? 'desc' : 'asc';
      onSort({ column, order: newOrder });
    }
  };

  const handleRowClick = (row) => {
    if (onRowClick) {
      onRowClick(row);
    }
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse',
        backgroundColor: '#fff'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
            {columns && columns.map((col, index) => (
              <th 
                key={col.field || index}
                onClick={() => handleSort(col.field)}
                style={{
                  padding: '12px',
                  textAlign: col.align || 'left',
                  cursor: col.sortable !== false ? 'pointer' : 'default',
                  userSelect: 'none'
                }}
              >
                {col.header}
                {sortConfig?.column === col.field && (
                  <span style={{ marginLeft: '5px' }}>
                    {sortConfig.order === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data && data.map((row, rowIndex) => (
            <tr 
              key={row.id || rowIndex}
              onClick={() => handleRowClick(row)}
              style={{ 
                borderBottom: '1px solid #dee2e6',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background-color 0.1s'
              }}
              onMouseEnter={(e) => {
                if (onRowClick) e.currentTarget.style.backgroundColor = '#f8f9fa';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {columns && columns.map((col, colIndex) => (
                <td 
                  key={col.field || colIndex}
                  style={{
                    padding: '12px',
                    textAlign: col.align || 'left'
                  }}
                >
                  {col.render ? col.render(row[col.field], row) : row[col.field]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(!data || data.length === 0) && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>
          No data available
        </div>
      )}
    </div>
  );
};

return CustomerBalances;