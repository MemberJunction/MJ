function SimpleChart({
  entityName,
  data,
  groupBy,
  stackBy,
  valueField,
  aggregateMethod = 'count',
  chartType = 'auto',
  title,
  height = 400,
  sortBy = undefined,
  sortOrder = 'asc',
  limit,
  colors,
  showLegend = true,
  legendPosition = 'auto', // New prop: 'auto', 'top', 'bottom', 'left', 'right'
  legendFontSize = 12, // New prop for legend font size
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
      return { chartData: [], categories: [], values: [], datasets: [], isEmpty: true };
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
          return { chartData: [], categories: [], values: [], datasets: [], isEmpty: true };
        }

        if (stackBy && !(stackBy in data[0])) {
          const error = `Stack field "${stackBy}" not found in data. Available fields: ${Object.keys(data[0]).join(', ')}`;
          console.error(error);
          setError(error);
          return { chartData: [], categories: [], values: [], datasets: [], isEmpty: true };
        }

        if (valueField && !(valueField in data[0])) {
          const error = `Value field "${valueField}" not found in data. Available fields: ${Object.keys(data[0]).join(', ')}`;
          console.error(error);
          setError(error);
          return { chartData: [], categories: [], values: [], datasets: [], isEmpty: true };
        }
      }

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

      // STACKED MODE: If stackBy is provided, create multiple datasets
      if (stackBy) {
        // Collect all unique primary categories (X-axis)
        const categoriesSet = new Set();
        data.forEach(record => {
          let key = record[groupBy] || 'Unknown';
          if (isDateField && key !== 'Unknown') {
            const date = new Date(key);
            if (!isNaN(date.getTime())) {
              key = date.toISOString().split('T')[0];
            }
          }
          categoriesSet.add(key);
        });

        let categories = Array.from(categoriesSet);

        // Sort categories if requested
        if (sortBy === 'label') {
          categories.sort((a, b) => {
            const comparison = String(a).localeCompare(String(b));
            return sortOrder === 'asc' ? comparison : -comparison;
          });
        }

        // Apply limit to categories
        if (limit && limit > 0) {
          categories = categories.slice(0, limit);
        }

        // Collect all unique stack values (series/colors)
        const stackValuesSet = new Set();
        data.forEach(record => {
          const stackValue = record[stackBy] || 'Unknown';
          stackValuesSet.add(stackValue);
        });
        const stackValues = Array.from(stackValuesSet).sort();

        // Group data by both primary category AND stack value
        const grouped = {};
        data.forEach(record => {
          let categoryKey = record[groupBy] || 'Unknown';
          if (isDateField && categoryKey !== 'Unknown') {
            const date = new Date(categoryKey);
            if (!isNaN(date.getTime())) {
              categoryKey = date.toISOString().split('T')[0];
            }
          }

          // Skip if category was filtered out by limit
          if (!categories.includes(categoryKey)) return;

          const stackValue = record[stackBy] || 'Unknown';
          const key = `${categoryKey}|||${stackValue}`;

          if (!grouped[key]) {
            grouped[key] = {
              category: categoryKey,
              stackValue: stackValue,
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

        // Create datasets array - one dataset per stack value
        const datasets = stackValues.map((stackValue, stackIndex) => {
          const datasetValues = categories.map(category => {
            const key = `${category}|||${stackValue}`;
            return grouped[key] ? grouped[key].value : 0;
          });

          return {
            label: String(stackValue),
            data: datasetValues,
            backgroundColor: (colors || defaultColors)[stackIndex % (colors || defaultColors).length],
            borderColor: (colors || defaultColors)[stackIndex % (colors || defaultColors).length],
            borderWidth: 1
          };
        });

        return {
          chartData: Object.values(grouped),
          categories: categories.map(c => String(c)),
          values: [], // Not used in stacked mode
          datasets: datasets,
          isEmpty: false
        };
      }

      // NON-STACKED MODE: Original single-series logic
      const grouped = {};

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

      // Convert to array
      let dataArray = Object.values(grouped);

      // Only sort if explicitly requested (preserves input order by default)
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
      // If sortBy is undefined/null, preserve the input order

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
        datasets: [], // Empty in non-stacked mode
        isEmpty: false
      };
    } catch (err) {
      console.error('Error processing chart data:', err);
      setError(err.message);
      return { chartData: [], categories: [], values: [], datasets: [], isEmpty: true };
    }
  }, [data, groupBy, stackBy, valueField, aggregateMethod, sortBy, sortOrder, limit, entityInfo]);

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
    
    // Use pie for small number of categories (preferred over doughnut)
    if (processData.categories && processData.categories.length <= 5) {
      return 'pie';
    }
    
    // Default to bar chart
    return 'bar';
  };

  const actualChartType = determineChartType();

  // Generate chart configuration for Chart.js
  const getChartConfig = () => {
    const isPieOrDoughnut = actualChartType === 'pie' || actualChartType === 'doughnut';
    const isLineOrArea = actualChartType === 'line' || actualChartType === 'area';
    const isStacked = stackBy && processData.datasets && processData.datasets.length > 0;

    const config = {
      type: actualChartType === 'area' ? 'line' : actualChartType,
      data: {
        labels: processData.categories,
        datasets: isStacked
          ? processData.datasets // Use pre-built datasets for stacked mode
          : [{
              label: valueField || 'Count',
              data: processData.values,
              backgroundColor: isPieOrDoughnut
                ? (colors || defaultColors).slice(0, processData.values.length)
                : isLineOrArea
                  ? 'rgba(24, 144, 255, 0.2)'
                  : (colors || defaultColors).slice(0, processData.values.length), // Different color for each bar
              borderColor: isPieOrDoughnut
                ? undefined
                : isLineOrArea
                  ? (colors || defaultColors)[0]
                  : (colors || defaultColors).slice(0, processData.values.length), // Different color for each bar border
              borderWidth: isLineOrArea ? 2 : 1,
              fill: actualChartType === 'area',
              tension: isLineOrArea ? 0.1 : undefined
            }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 750, // Initial animation
          onComplete: () => {
            // Disable animations after initial render to prevent re-animation on clicks
            if (chartInstanceRef.current) {
              chartInstanceRef.current.options.animation = false;
            }
          }
        },
        interaction: {
          mode: 'nearest',
          intersect: true
        },
        hover: {
          mode: 'nearest',
          intersect: true
        },
        elements: {
          bar: {
            hoverBackgroundColor: undefined, // Use default color
            hoverBorderWidth: 3,
            hoverBorderColor: '#1890ff'
          },
          arc: {
            hoverOffset: 8,
            hoverBorderWidth: 3,
            hoverBorderColor: '#1890ff'
          },
          line: {
            hoverBorderWidth: 4,
            hoverBorderColor: '#1890ff'
          },
          point: {
            hoverRadius: 6,
            hoverBorderWidth: 3,
            hoverBorderColor: '#1890ff'
          }
        },
        onHover: (event, activeElements) => {
          // Change cursor to pointer when hovering over data points
          event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
        },
        onClick: (_event, elements) => {
          if (elements && elements.length > 0 && onDataPointClick) {
            const clickedElement = elements[0];
            const categoryIndex = clickedElement.index;
            const datasetIndex = clickedElement.datasetIndex;
            const isStacked = stackBy && processData.datasets && processData.datasets.length > 0;

            let clickedData;
            let clickedLabel;
            let clickedRecords;
            let clickedValue;

            if (isStacked) {
              // STACKED MODE: Filter by both category and stack value
              const category = processData.categories[categoryIndex];
              const stackValue = processData.datasets[datasetIndex].label;

              // Find records matching BOTH category and stack value
              clickedRecords = data.filter(record => {
                const recordCategory = record[groupBy] || 'Unknown';
                const recordStackValue = record[stackBy] || 'Unknown';
                return String(recordCategory) === String(category) &&
                       String(recordStackValue) === String(stackValue);
              });

              clickedValue = processData.datasets[datasetIndex].data[categoryIndex];
              clickedLabel = `${category} - ${stackValue}`;
            } else {
              // NON-STACKED MODE: Use existing logic
              clickedData = processData.chartData[categoryIndex];
              clickedLabel = clickedData.label;
              clickedValue = clickedData.value;
              clickedRecords = clickedData.records;
            }

            // Highlight the clicked element using Chart.js active state
            if (chartInstanceRef.current) {
              // Use setActiveElements to highlight without re-rendering the entire chart
              chartInstanceRef.current.setActiveElements([
                {
                  datasetIndex: datasetIndex,
                  index: categoryIndex
                }
              ]);

              // Only update the visual state (highlights), don't re-render data
              chartInstanceRef.current.render();
            }

            // Calculate total for percentage (sum across all datasets)
            let total;
            if (isStacked) {
              total = processData.datasets.reduce((sum, ds) => {
                return sum + ds.data.reduce((a, b) => a + b, 0);
              }, 0);
            } else {
              total = processData.values.reduce((a, b) => a + b, 0);
            }

            onDataPointClick({
              chartType: actualChartType,
              series: isStacked ? clickedLabel : (valueField || 'Count'),
              label: clickedLabel,
              value: clickedValue,
              records: clickedRecords,
              percentage: (clickedValue / total) * 100
            });
          }
        },
        plugins: {
          title: {
            display: !!title,
            text: title,
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
            position: legendPosition === 'auto'
              ? (isPieOrDoughnut ? 'bottom' : 'top')
              : legendPosition,
            labels: {
              font: {
                size: legendFontSize
              }
            }
          },
          datalabels: showDataLabels ? {
            display: true,
            formatter: (value) => formatValue(value),
            color: isPieOrDoughnut ? '#fff' : '#666'
          } : undefined,
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFont: {
              size: 14,
              weight: 'bold'
            },
            bodyFont: {
              size: 13
            },
            padding: 12,
            cornerRadius: 4,
            displayColors: true,
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
          stacked: isStacked, // Enable stacking on Y-axis
          ticks: {
            callback: (value) => formatValue(value)
          }
        },
        x: {
          stacked: isStacked, // Enable stacking on X-axis
          ticks: {
            autoSkip: true,
            maxRotation: 45,
            minRotation: 0,
            maxTicksLimit: 20, // Limit number of ticks to prevent overcrowding
            font: {
              size: 11
            }
          },
          // For charts with many categories, use better label management
          grid: {
            display: processData.categories.length <= 20
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
  }, [processData, actualChartType, title, height, colors, showLegend, legendPosition, legendFontSize, showDataLabels, enableExport, ChartJS]);

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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <button
            onClick={() => window.SimpleChartExport && window.SimpleChartExport()}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Download as PNG"
          >
            ⬇ Export
          </button>
        </div>
      )}
      <div style={{ width: '100%', height: `${height}px` }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}