function AccountsByIndustryList ({
  accounts,
  selectedIndustry,
  sortConfig,
  onSort,
  onAccountClick,
  currentPage,
  pageSize,
  onPageChange,
  onClearFilter
}) {
  // Calculate pagination
  const totalPages = Math.ceil(accounts.length / pageSize);
  const paginatedAccounts = accounts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  
  // Format currency
  const formatCurrency = (value) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  };
  
  if (!selectedIndustry) {
    return null;
  }
  
  return (
    <div style={{ 
      marginTop: '32px',
      padding: '20px',
      backgroundColor: '#F9FAFB',
      borderRadius: '8px',
      border: '1px solid #E5E7EB'
    }}>
      <div style={{ 
        fontSize: '18px', 
        fontWeight: '600', 
        color: '#111827',
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>Selected: {selectedIndustry} ({accounts.length} accounts)</span>
        {onClearFilter && (
          <button
            onClick={onClearFilter}
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              color: '#6B7280',
              backgroundColor: '#fff',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Clear Filter
          </button>
        )}
      </div>
      
      {/* Account Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '6px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F3F4F6' }}>
              <th 
                onClick={() => onSort('AccountName')}
                style={{ 
                  padding: '12px', 
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                Account Name {sortConfig.field === 'AccountName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => onSort('AnnualRevenue')}
                style={{ 
                  padding: '12px', 
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                Revenue {sortConfig.field === 'AnnualRevenue' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => onSort('AccountStatus')}
                style={{ 
                  padding: '12px', 
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                Status {sortConfig.field === 'AccountStatus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => onSort('AccountType')}
                style={{ 
                  padding: '12px', 
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                Type {sortConfig.field === 'AccountType' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ padding: '12px', width: '50px' }}></th>
            </tr>
          </thead>
          <tbody>
            {paginatedAccounts.map(account => (
              <tr 
                key={account.ID}
                style={{ 
                  borderBottom: '1px solid #E5E7EB',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => onAccountClick(account)}
              >
                <td style={{ padding: '12px', fontSize: '14px', color: '#111827' }}>
                  {account.AccountName}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#111827' }}>
                  {formatCurrency(account.AnnualRevenue)}
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '4px',
                    backgroundColor: account.AccountStatus === 'Active' ? '#D1FAE5' : '#FEE2E2',
                    color: account.AccountStatus === 'Active' ? '#065F46' : '#991B1B'
                  }}>
                    {account.AccountStatus}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '4px',
                    backgroundColor: 
                      account.AccountType === 'Customer' ? '#DBEAFE' :
                      account.AccountType === 'Prospect' ? '#FEF3C7' :
                      account.AccountType === 'Partner' ? '#E9D5FF' :
                      account.AccountType === 'Vendor' ? '#FED7AA' :
                      '#F3F4F6',
                    color: 
                      account.AccountType === 'Customer' ? '#1E40AF' :
                      account.AccountType === 'Prospect' ? '#92400E' :
                      account.AccountType === 'Partner' ? '#6B21A8' :
                      account.AccountType === 'Vendor' ? '#9A3412' :
                      '#374151'
                  }}>
                    {account.AccountType}
                  </span>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <span style={{ color: '#9CA3AF' }}>›</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ 
            padding: '12px',
            display: 'flex',
            justifyContent: 'center',
            gap: '4px',
            borderTop: '1px solid #E5E7EB'
          }}>
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                color: currentPage === 1 ? '#D1D5DB' : '#374151',
                backgroundColor: '#fff',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                cursor: currentPage === 1 ? 'default' : 'pointer'
              }}
            >
              ‹
            </button>
            
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={i}
                  onClick={() => onPageChange(pageNum)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    color: pageNum === currentPage ? '#fff' : '#374151',
                    backgroundColor: pageNum === currentPage ? '#3B82F6' : '#fff',
                    border: '1px solid ' + (pageNum === currentPage ? '#3B82F6' : '#D1D5DB'),
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
             
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                color: currentPage === totalPages ? '#D1D5DB' : '#374151',
                backgroundColor: '#fff',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                cursor: currentPage === totalPages ? 'default' : 'pointer'
              }}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}