// Example: How to integrate DataExportPanel with a chart component
// This shows the dual approach: visual capture for PDF, data export for Excel/CSV

function SalesChartWithExport({ utilities, styles, components, callbacks }) {
  // Get the DataExportPanel from the registry
  const DataExportPanel = components?.DataExportPanel;
  
  // Reference to the chart container for visual capture
  const chartContainerRef = React.useRef(null);
  
  // Sample chart data
  const [chartData] = React.useState({
    series: [{
      name: 'Revenue',
      data: [
        { x: '2024-01', y: 45000 },
        { x: '2024-02', y: 52000 },
        { x: '2024-03', y: 48000 },
        { x: '2024-04', y: 61000 },
        { x: '2024-05', y: 58000 },
        { x: '2024-06', y: 67000 }
      ]
    }],
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  });
  
  // Transform chart data into tabular format for Excel/CSV export
  const tableData = chartData.series[0].data.map(point => ({
    month: point.x,
    revenue: point.y,
    growth: point.y > 50000 ? 'Above Target' : 'Below Target'
  }));
  
  // Define columns for the data export
  const exportColumns = [
    { key: 'month', label: 'Month', type: 'string' },
    { key: 'revenue', label: 'Revenue', type: 'currency' },
    { key: 'growth', label: 'Performance', type: 'string' }
  ];
  
  // Chart options for ApexCharts
  const chartOptions = {
    chart: {
      type: 'area',
      height: 350,
      toolbar: { show: false }
    },
    xaxis: {
      categories: chartData.categories
    },
    yaxis: {
      labels: {
        formatter: (value) => `$${(value/1000).toFixed(0)}K`
      }
    },
    colors: [styles?.colors?.primary || '#3B82F6'],
    fill: {
      type: 'gradient',
      gradient: {
        opacityFrom: 0.6,
        opacityTo: 0.1
      }
    }
  };
  
  return (
    <div style={{ 
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      {/* Header with title and export button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
          Monthly Revenue Trend
        </h2>
        
        {/* DataExportPanel in UI mode with dropdown */}
        <DataExportPanel
          // Data for Excel/CSV export
          data={tableData}
          columns={exportColumns}
          
          // HTML element for PDF visual capture
          htmlElement={chartContainerRef.current}
          
          // Export configuration
          filename="revenue-report"
          formats={['csv', 'excel', 'pdf']}
          buttonStyle="dropdown"
          buttonText="Export Chart"
          icon="fa-download"
          
          // PDF-specific options
          pdfOptions={{
            orientation: 'landscape',  // Better for wide charts
            pageSize: 'a4',
            margins: { top: 40, bottom: 40, left: 40, right: 40 },
            title: 'Monthly Revenue Report',
            includeDataTable: true  // Include data table after the chart image
          }}
          
          // Excel-specific options
          excelOptions={{
            sheetName: 'Revenue Data',
            includeFilters: true,
            autoWidth: true
          }}
          
          // Component props
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
        />
      </div>
      
      {/* Chart container - this will be captured for PDF export */}
      <div ref={chartContainerRef}>
        {/* Title and metadata (will be part of the PDF image) */}
        <div style={{ marginBottom: '16px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#6B7280' }}>
            Q1-Q2 2024 Performance
          </p>
        </div>
        
        {/* The actual chart */}
        <ApexChart
          options={chartOptions}
          series={chartData.series}
          type="area"
          height={350}
        />
        
        {/* Summary statistics (will be part of the PDF image) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#F9FAFB',
          borderRadius: '8px'
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>Total Revenue</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: '600' }}>
              ${tableData.reduce((sum, row) => sum + row.revenue, 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>Average Monthly</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: '600' }}>
              ${Math.round(tableData.reduce((sum, row) => sum + row.revenue, 0) / tableData.length).toLocaleString()}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>Best Month</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: '600' }}>
              {tableData.reduce((best, row) => row.revenue > best.revenue ? row : best).month.split('-')[1]}/2024
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Alternative: Using DataExportPanel in headless mode for custom UI
function CustomExportImplementation({ data, chartRef }) {
  const exportPanelRef = React.useRef(null);
  
  // Custom export buttons
  const handleExcelExport = () => {
    exportPanelRef.current?.exportToExcel();
  };
  
  const handlePDFExport = () => {
    exportPanelRef.current?.exportToPDF();
  };
  
  return (
    <>
      {/* Hidden DataExportPanel in headless mode */}
      <DataExportPanel
        ref={exportPanelRef}
        mode="headless"
        data={data}
        columns={columns}
        htmlElement={chartRef}
        filename="custom-export"
        pdfOptions={{
          orientation: 'landscape',
          includeDataTable: true
        }}
      />
      
      {/* Custom UI buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleExcelExport}>
          <i className="fa-solid fa-file-excel"></i> Excel
        </button>
        <button onClick={handlePDFExport}>
          <i className="fa-solid fa-file-pdf"></i> PDF
        </button>
      </div>
    </>
  );
}

// Example: Mixed content export (multiple charts + data)
function DashboardWithExport({ charts, data }) {
  const dashboardRef = React.useRef(null);
  
  return (
    <div ref={dashboardRef}>
      {/* Multiple charts and content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <ChartComponent data={charts[0]} />
        <ChartComponent data={charts[1]} />
        <TableComponent data={data} />
      </div>
      
      {/* Export captures entire dashboard */}
      <DataExportPanel
        htmlElement={dashboardRef.current}  // Captures whole dashboard
        data={data}                          // Underlying data for Excel/CSV
        columns={columns}
        filename="dashboard-export"
        buttonStyle="icon"
        position="floating"
        pdfOptions={{
          orientation: 'portrait',
          pageSize: 'a4',
          includeDataTable: false  // Just the visual, no data table
        }}
      />
    </div>
  );
}