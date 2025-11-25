// CompetitiveAnalysis Sub-component
function CompetitiveAnalysis ({ competitorData, selectedCompetitor, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Define columns for competitive analysis table
  const columns = [
    { header: 'Competitor', field: 'name', align: 'left' },
    { header: 'Win Rate', field: 'winRate', align: 'center', render: (val) => `${(val * 100).toFixed(1)}%` },
    { header: 'Deals', field: 'deals', align: 'center' },
    { header: 'Revenue', field: 'revenue', align: 'right', render: (val) => `$${val.toLocaleString()}` },
    { header: 'Strengths', field: 'strengths', align: 'left', render: (val) => Array.isArray(val) ? val.join(', ') : val },
    { header: 'Weaknesses', field: 'weaknesses', align: 'left', render: (val) => Array.isArray(val) ? val.join(', ') : val }
  ];

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        backgroundColor: '#fff'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
            {columns.map((col, index) => (
              <th
                key={col.field || index}
                style={{
                  padding: '12px',
                  textAlign: col.align || 'left',
                  userSelect: 'none'
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {competitorData && competitorData.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              style={{
                borderBottom: '1px solid #dee2e6',
                backgroundColor: selectedCompetitor === row.id ? '#e7f3ff' : 'transparent',
                transition: 'background-color 0.1s'
              }}
              onMouseEnter={(e) => {
                if (selectedCompetitor !== row.id) {
                  e.currentTarget.style.backgroundColor = '#f8f9fa';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedCompetitor !== row.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {columns.map((col, colIndex) => (
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
      {(!competitorData || competitorData.length === 0) && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>
          No data available
        </div>
      )}
    </div>
  );
}