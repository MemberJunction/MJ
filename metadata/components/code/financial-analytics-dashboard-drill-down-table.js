function DrillDownTable({ data, title, onClose, sortConfig, setSortConfig, callbacks }) {
  const formatCurrency = (value) => {
    if (!value) return '$0';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };

  const sortedData = [...data].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    if (sortConfig.direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '20px',
      margin: '20px',
      border: '1px solid #E5E7EB',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
          {title} ({data.length} records)
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#6B7280'
          }}
        >
          <i className="fa-solid fa-times"></i>
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
              <th
                onClick={() => handleSort('Type')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Type {sortConfig.key === 'Type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('InvoiceNumber')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Reference {sortConfig.key === 'InvoiceNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('InvoiceDate')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Date {sortConfig.key === 'InvoiceDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('DisplayAmount')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'right',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Amount {sortConfig.key === 'DisplayAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('Status')}
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase'
                }}
              >
                Status {sortConfig.key === 'Status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{
                padding: '12px 8px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase'
              }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((item, index) => (
              <tr
                key={item.ID || index}
                style={{
                  borderBottom: '1px solid #F3F4F6',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <td style={{ padding: '12px 8px', fontSize: '14px' }}>
                  <span style={{
                    padding: '2px 8px',
                    backgroundColor: item.Type === 'Paid Invoice' ? '#D1FAE5' :
                                     item.Type === 'Unpaid Invoice' ? '#FEE2E2' :
                                     item.Type === 'Projected Deal' ? '#FEF3C7' : '#E5E7EB',
                    color: item.Type === 'Paid Invoice' ? '#065F46' :
                           item.Type === 'Unpaid Invoice' ? '#991B1B' :
                           item.Type === 'Projected Deal' ? '#92400E' : '#374151',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    {item.Type}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', fontSize: '14px' }}>
                  {item.InvoiceNumber || item.DealName || item.ProductName || '-'}
                </td>
                <td style={{ padding: '12px 8px', fontSize: '14px', color: '#6B7280' }}>
                  {formatDate(item.InvoiceDate || item.CloseDate || item.CreatedAt)}
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px', fontWeight: '500' }}>
                  {formatCurrency(item.DisplayAmount || item.TotalAmount || item.Amount || item.Price)}
                </td>
                <td style={{ padding: '12px 8px', fontSize: '14px' }}>
                  <span style={{
                    padding: '2px 8px',
                    backgroundColor: item.Status === 'Paid' ? '#D1FAE5' :
                                     item.Status === 'Pending' ? '#FEF3C7' :
                                     item.Stage === 'Closed Won' ? '#D1FAE5' :
                                     item.Stage === 'Closed Lost' ? '#FEE2E2' : '#E5E7EB',
                    color: item.Status === 'Paid' ? '#065F46' :
                           item.Status === 'Pending' ? '#92400E' :
                           item.Stage === 'Closed Won' ? '#065F46' :
                           item.Stage === 'Closed Lost' ? '#991B1B' : '#374151',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    {item.Status || item.Stage || 'Active'}
                  </span>
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  <button
                    onClick={() => {
                      if (callbacks && callbacks.OpenEntityRecord) {
                        callbacks.OpenEntityRecord(item.EntityType, [{ FieldName: 'ID', Value: item.ID }]);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4F46E5',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px'
                    }}
                    title="Open Record"
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
