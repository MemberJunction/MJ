function SimpleChart({
  entityName,
  data,
  groupBy,
  valueField,
  aggregateMethod = 'count',
  chartType = 'auto',
  title,
  height = 400,
  sortBy = 'value',
  sortOrder = 'desc',
  limit,
  colors,
  showLegend = true,
  showDataLabels = false,
  enableExport = true,
  onDataPointClick,
  onChartRendered,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Always use the MJ unwrapLibraryComponents function to get components from global libraries
  // This ensures that various library build/package formats are handled correctly and transparently
  // Chart.js is available as a global 'Chart' based on the spec's globalVariable setting
  // Since Chart.js exports a single constructor function, unwrapLibraryComponents returns it for the requested name
  const { Chart: ChartJS } = unwrapLibraryComponents(Chart, 'Chart');
  
  const canvasRef = React.useRef(null);
  const chartInstanceRef = React.useRef(null);
  const [error, setError] = React.useState(null);
  const [entityInfo, setEntityInfo] = React.useState(null);

  // Default color palette - accessible and visually distinct
  const defaultColors = [
    '#1890ff', // Blue
    '#52c41a', // Green
    '#fa8c16', // Orange
    '#f5222d', // Red
    '#722ed1', // Purple
    '#13c2c2', // Cyan
    '#fa541c', // Red-orange
    '#2f54eb', // Deep blue
    '#a0d911', // Lime
    '#eb2f96'  // Magenta
  ];

  // Load entity metadata
  React.useEffect(() => {
    if (!entityName || !utilities?.md?.Entities) {
      if (!entityName) console.error('Entity name not provided');
      if (!utilities?.md?.Entities) console.error('Entity metadata not loaded.');
      return;
    }
    
    const entity = utilities.md.Entities.find(e => e.Name === entityName);
    if (entity) {
      setEntityInfo(entity);
    }
  }, [entityName, utilities]);

  // Helper function to format values based on type
  const formatValue = (value, isDate = false, isCurrency = false) => {
    if (value == null) return 'N/A';
    
    if (isDate) {
      try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
      } catch {
        return value;
      }
    }
    
    if (isCurrency || (typeof value === 'number' && valueField && valueField.toLowerCase().includes('amount'))) {
      if (typeof value === 'number') {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      }
    }
    
    if (typeof value === 'number') {
      // Format large numbers with commas
      return new Intl.NumberFormat('en-US').format(value);
    }
    
    return value;
  };

  // Process and aggregate data
  const processData = React.useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { chartData: [], categories: [], values: [], isEmpty: true };
    }

    try {
      // Validate that fields exist in the actual data, not just entity metadata
      // This allows for calculated fields from queries that don't exist in base entity
      if (data.length > 0) {
        // Check if fields exist in data
        if (!(groupBy in data[0])) {
          const error = `Field "${groupBy}" not found in data. Available fields: ${Object.keys(data[0]).join(', ')}`;
          console.error(error);
          setError(error);
          return { chartData: [], categories: [], values: [], isEmpty: true };
        }

        if (valueField && !(valueField in data[0])) {
          const error = `Value field "${valueField}" not found in data. Available fields: ${Object.keys(data[0]).join(', ')}`;
          console.error(error);
          setError(error);
          return { chartData: [], categories: [], values: [], isEmpty: true };
        }
      }
      
      // Group data by the specified field
      const grouped = {};
      
      // Check if groupBy field is a date field using entity metadata
      let isDateField = false;
      if (entityInfo && entityInfo.Fields) {
        const fieldInfo = entityInfo.Fields.find(f => f.Name === groupBy);
        isDateField = fieldInfo && (fieldInfo.Type === 'datetime' || fieldInfo.Type === 'date');
      }
      
      // Fallback to value-based detection if no metadata available
      if (!isDateField && data.length > 0) {
        const sampleValue = data[0][groupBy];
        isDateField = sampleValue && (
          sampleValue instanceof Date ||
          (typeof sampleValue === 'string' && !isNaN(Date.parse(sampleValue)))
        );
      }
      
      data.forEach(record => {
        let key = record[groupBy] || 'Unknown';
        
        // Format date values for display
        if (isDateField && key !== 'Unknown') {
          const date = new Date(key);
          if (!isNaN(date.getTime())) {
            // Format as YYYY-MM-DD for grouping
            key = date.toISOString().split('T')[0];
          }
        }
        
        if (!grouped[key]) {
          grouped[key] = {
            label: key,
            records: [],
            value: 0
          };
        }
        grouped[key].records.push(record);
      });

      // Aggregate based on method
      Object.keys(grouped).forEach(key => {
        const group = grouped[key];
        
        if (aggregateMethod === 'count') {
          group.value = group.records.length;
        } else if (valueField) {
          const values = group.records
            .map(r => parseFloat(r[valueField]))
            .filter(v => !isNaN(v));
          
          if (values.length > 0) {
            switch (aggregateMethod) {
              case 'sum':
                group.value = values.reduce((a, b) => a + b, 0);
                break;
              case 'average':
                group.value = values.reduce((a, b) => a + b, 0) / values.length;
                break;
              case 'min':
                group.value = Math.min(...values);
                break;
              case 'max':
                group.value = Math.max(...values);
                break;
              default:
                group.value = values.length;
            }
          }
        }
      });

      // Convert to array and sort
      let dataArray = Object.values(grouped);
      
      if (sortBy === 'label') {
        dataArray.sort((a, b) => {
          const comparison = String(a.label).localeCompare(String(b.label));
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      } else if (sortBy === 'value') {
        dataArray.sort((a, b) => {
          const comparison = a.value - b.value;
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      }
      
      // Apply limit if specified
      if (limit && limit > 0) {
        dataArray = dataArray.slice(0, limit);
      }

      const categories = dataArray.map(d => String(d.label));
      const values = dataArray.map(d => d.value);

      return {
        chartData: dataArray,
        categories,
        values,
        isEmpty: false
      };
    } catch (err) {
      console.error('Error processing chart data:', err);
      setError(err.message);
      return { chartData: [], categories: [], values: [], isEmpty: true };
    }
  }, [data, groupBy, valueField, aggregateMethod, sortBy, sortOrder, limit, entityInfo]);

  // Determine chart type automatically
  const determineChartType = () => {
    if (chartType !== 'auto') {
      // Map 'donut' to Chart.js 'doughnut' 
      if (chartType === 'donut') return 'doughnut';
      // Map 'column' to Chart.js 'bar'
      if (chartType === 'column') return 'bar';
      return chartType;
    }
    
    // Check if groupBy field is a date field using entity metadata
    let isDateField = false;
    if (entityInfo && entityInfo.Fields) {
      const fieldInfo = entityInfo.Fields.find(f => f.Name === groupBy);
      isDateField = fieldInfo && (fieldInfo.Type === 'datetime' || fieldInfo.Type === 'date');
    }
    
    // Fallback to value-based detection if no metadata available
    if (!isDateField && data && data.length > 0) {
      const sampleValue = data[0][groupBy];
      isDateField = sampleValue && (
        sampleValue instanceof Date ||
        (typeof sampleValue === 'string' && !isNaN(Date.parse(sampleValue)))
      );
    }
    
    if (isDateField) {
      return 'line';
    }
    
    // Use pie/doughnut for small number of categories
    if (processData.categories && processData.categories.length <= 5) {
      return 'doughnut';
    }
    
    // Default to bar chart
    return 'bar';
  };

  const actualChartType = determineChartType();

  // Generate chart configuration for Chart.js
  const getChartConfig = () => {
    const isPieOrDoughnut = actualChartType === 'pie' || actualChartType === 'doughnut';
    const isLineOrArea = actualChartType === 'line' || actualChartType === 'area';
    
    const config = {
      type: actualChartType === 'area' ? 'line' : actualChartType,
      data: {
        labels: processData.categories,
        datasets: [{
          label: valueField || 'Count',
          data: processData.values,
          backgroundColor: isPieOrDoughnut 
            ? (colors || defaultColors).slice(0, processData.values.length)
            : isLineOrArea 
              ? 'rgba(24, 144, 255, 0.2)'
              : (colors || defaultColors)[0],
          borderColor: isPieOrDoughnut
            ? undefined
            : isLineOrArea
              ? (colors || defaultColors)[0]
              : (colors || defaultColors)[0],
          borderWidth: isLineOrArea ? 2 : 1,
          fill: actualChartType === 'area',
          tension: isLineOrArea ? 0.1 : undefined
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
          if (elements && elements.length > 0 && onDataPointClick) {
            const index = elements[0].index;
            const clickedData = processData.chartData[index];
            onDataPointClick({
              chartType: actualChartType,
              series: valueField || 'Count',
              label: clickedData.label,
              value: clickedData.value,
              records: clickedData.records,
              percentage: (clickedData.value / processData.values.reduce((a, b) => a + b, 0)) * 100
            });
          }
        },
        plugins: {
          title: {
            display: !!title,
            text: title || `${entityName} by ${groupBy}`,
            font: {
              size: 16,
              weight: 600
            },
            padding: {
              bottom: 10
            }
          },
          legend: {
            display: showLegend && (isPieOrDoughnut || processData.categories.length <= 10),
            position: isPieOrDoughnut ? 'bottom' : 'top'
          },
          datalabels: showDataLabels ? {
            display: true,
            formatter: (value) => formatValue(value),
            color: isPieOrDoughnut ? '#fff' : '#666'
          } : undefined,
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const value = formatValue(context.parsed.y !== undefined ? context.parsed.y : context.parsed);
                return `${label}: ${value}`;
              }
            }
          }
        }
      }
    };

    // Add scales for non-pie/doughnut charts
    if (!isPieOrDoughnut) {
      config.options.scales = {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatValue(value)
          }
        },
        x: {
          ticks: {
            autoSkip: true,
            maxRotation: 45,
            minRotation: 0
          }
        }
      };
    }

    // Add export functionality if enabled
    if (enableExport && config.options.plugins) {
      config.options.plugins.title = {
        ...config.options.plugins.title,
        display: true // Always show title when export is enabled
      };
    }

    return config;
  };

  // Render chart
  React.useEffect(() => {
    if (processData.isEmpty || !canvasRef.current) {
      return;
    }

    if (!ChartJS) {
      console.error('[SimpleChart] Chart.js library not loaded');
      setError('Chart.js library not loaded. Please ensure it is included in the component libraries.');
      return;
    }

    try {
      setError(null);

      // Destroy existing chart
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }

      const config = getChartConfig();
      
      // Create new chart instance
      const ctx = canvasRef.current.getContext('2d');
      chartInstanceRef.current = new ChartJS(ctx, config);

      // Fire rendered event
      if (onChartRendered) {
        onChartRendered({
          chartType: actualChartType,
          dataPointCount: processData.chartData.length,
          aggregateMethod: aggregateMethod,
          totalValue: processData.values.reduce((a, b) => a + b, 0)
        });
      }

    } catch (err) {
      console.error('[SimpleChart] Error rendering chart:', err);
      setError(`Failed to render chart: ${err.message}`);
    }

    // Cleanup on unmount
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [processData, actualChartType, title, height, colors, showLegend, showDataLabels, enableExport, ChartJS]);

  // Download chart as image
  React.useEffect(() => {
    if (enableExport && chartInstanceRef.current && canvasRef.current) {
      // Add a simple export button overlay
      const exportHandler = () => {
        const url = canvasRef.current.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${title || 'chart'}.png`;
        link.href = url;
        link.click();
      };
      
      // Store handler for cleanup
      window.SimpleChartExport = exportHandler;
    }
    
    return () => {
      delete window.SimpleChartExport;
    };
  }, [enableExport, title]);

  // Error state
  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: height,
        color: '#ff4d4f',
        padding: '20px'
      }}>
        <div>Error rendering chart</div>
        <div style={{ fontSize: '12px', marginTop: '8px', color: '#999' }}>{error}</div>
      </div>
    );
  }

  // Empty state
  if (!data || data.length === 0 || processData.isEmpty) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: height,
        color: '#999',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px'
      }}>
        No data available to display
      </div>
    );
  }

  // Render chart container with canvas
  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {enableExport && (
        <button
          onClick={() => window.SimpleChartExport && window.SimpleChartExport()}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            cursor: 'pointer',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Download as PNG"
        >
          📥 Export
        </button>
      )}
      <div style={{ width: '100%', height: `${height}px` }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}