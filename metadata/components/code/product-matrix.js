function ProductMatrix ({ matrixData, products, customers, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Calculate max value for heat map coloring
  const maxValue = matrixData && matrixData.length > 0
    ? Math.max(...matrixData.flat().filter(v => v != null && v > 0))
    : 0;

  // Get heat color based on value intensity
  const getHeatColor = (value) => {
    if (!value || value <= 0) return '#f8f9fa';
    const intensity = maxValue > 0 ? value / maxValue : 0;

    // Green heat scale
    const r = Math.floor(240 - (intensity * 110)); // 240 -> 130
    const g = Math.floor(255 - (intensity * 40));  // 255 -> 215
    const b = Math.floor(240 - (intensity * 110)); // 240 -> 130

    return `rgb(${r}, ${g}, ${b})`;
  };

  // Format currency
  const formatCurrency = (value) => {
    if (!value || value <= 0) return '-';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  // Calculate row totals
  const rowTotals = matrixData && products
    ? matrixData.map(row => row.reduce((sum, val) => sum + (val || 0), 0))
    : [];

  // Calculate column totals
  const colTotals = matrixData && customers
    ? customers.map((_, colIdx) =>
        matrixData.reduce((sum, row) => sum + (row[colIdx] || 0), 0)
      )
    : [];

  // Calculate grand total
  const grandTotal = rowTotals.reduce((sum, val) => sum + val, 0);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        backgroundColor: '#fff'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
            <th style={{
              padding: '12px',
              textAlign: 'left',
              position: 'sticky',
              left: 0,
              backgroundColor: '#f8f9fa',
              zIndex: 10,
              minWidth: '150px'
            }}>
              Product
            </th>
            {customers && customers.map((customer, index) => (
              <th
                key={`customer-${index}`}
                style={{
                  padding: '12px',
                  textAlign: 'right',
                  minWidth: '100px',
                  whiteSpace: 'nowrap'
                }}
              >
                {customer}
              </th>
            ))}
            <th style={{
              padding: '12px',
              textAlign: 'right',
              backgroundColor: '#e9ecef',
              fontWeight: 'bold',
              minWidth: '100px'
            }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {products && products.map((product, rowIndex) => (
            <tr
              key={`product-${rowIndex}`}
              style={{ borderBottom: '1px solid #dee2e6' }}
            >
              <td style={{
                padding: '12px',
                fontWeight: '500',
                position: 'sticky',
                left: 0,
                backgroundColor: '#fff',
                zIndex: 5,
                borderRight: '1px solid #dee2e6'
              }}>
                {product}
              </td>
              {customers && customers.map((_, colIndex) => {
                const value = matrixData?.[rowIndex]?.[colIndex] || 0;
                return (
                  <td
                    key={`cell-${rowIndex}-${colIndex}`}
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      backgroundColor: getHeatColor(value),
                      transition: 'background-color 0.2s',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                    title={value > 0 ? `$${value.toLocaleString()}` : 'No revenue'}
                  >
                    {formatCurrency(value)}
                  </td>
                );
              })}
              <td style={{
                padding: '12px',
                textAlign: 'right',
                backgroundColor: '#e9ecef',
                fontWeight: 'bold',
                fontVariantNumeric: 'tabular-nums'
              }}>
                {formatCurrency(rowTotals[rowIndex])}
              </td>
            </tr>
          ))}
          {/* Totals Row */}
          <tr style={{
            borderTop: '2px solid #dee2e6',
            backgroundColor: '#e9ecef',
            fontWeight: 'bold'
          }}>
            <td style={{
              padding: '12px',
              position: 'sticky',
              left: 0,
              backgroundColor: '#e9ecef',
              zIndex: 5,
              borderRight: '1px solid #dee2e6'
            }}>
              Total
            </td>
            {colTotals && colTotals.map((total, index) => (
              <td
                key={`col-total-${index}`}
                style={{
                  padding: '12px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {formatCurrency(total)}
              </td>
            ))}
            <td style={{
              padding: '12px',
              textAlign: 'right',
              backgroundColor: '#d3d7dc',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {formatCurrency(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
      {(!matrixData || !products || !customers || products.length === 0) && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>
          No data available
        </div>
      )}
    </div>
  );
}