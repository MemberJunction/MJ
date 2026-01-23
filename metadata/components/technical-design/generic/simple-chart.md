## Architecture
React functional component using Chart.js 4.4.1 for canvas-based chart rendering with NO built-in drill-down (emits events only).

## Dependencies
- **Chart.js** (4.4.1): Canvas chart rendering (global: Chart)
- Unwrapped via `unwrapLibraryComponents(Chart, 'Chart')` to handle various package formats

## State Management (React Hooks)
- **error** (string | null): Error message if rendering fails
- **entityInfo** (object | null): Entity metadata from `utilities.md.Entities`

## Refs
- **canvasRef** (React.useRef): Reference to canvas element
- **chartInstanceRef** (React.useRef): Reference to Chart.js instance (for updates/destroy)

## Data Processing Pipeline (useMemo)

### processData Function
**Dependencies**: `data`, `groupBy`, `stackBy`, `valueField`, `aggregateMethod`, `sortBy`, `sortOrder`, `limit`, `entityInfo`

**Process** (non-stacked mode - for stacked mode see "Stacked Mode" section below):
1. **Validation**:
   ```javascript
   if (!data || data.length === 0) {
     return { isEmpty: true };
   }
   if (!data[0][groupBy]) {
     throw new Error(`Field '${groupBy}' not found. Available: ${Object.keys(data[0]).join(', ')}`);
   }
   ```

2. **Grouping** (handles date fields specially):
   ```javascript
   const groups = {};
   data.forEach(record => {
     let key = record[groupBy];
     
     // Special date handling
     if (isDateField(groupBy)) {
       key = new Date(key).toISOString().split('T')[0]; // YYYY-MM-DD
     }
     
     if (!groups[key]) {
       groups[key] = [];
     }
     groups[key].push(record);
   });
   ```

3. **Aggregation**:
   ```javascript
   const aggregated = Object.entries(groups).map(([label, records]) => {
     let value;
     if (aggregateMethod === 'count') {
       value = records.length;
     } else if (aggregateMethod === 'sum') {
       value = records.reduce((sum, r) => sum + (parseFloat(r[valueField]) || 0), 0);
     } else if (aggregateMethod === 'average') {
       const sum = records.reduce((s, r) => s + (parseFloat(r[valueField]) || 0), 0);
       value = sum / records.length;
     } else if (aggregateMethod === 'min') {
       value = Math.min(...records.map(r => parseFloat(r[valueField]) || 0));
     } else if (aggregateMethod === 'max') {
       value = Math.max(...records.map(r => parseFloat(r[valueField]) || 0));
     }
     
     return { label, value, records };
   });
   ```

4. **Sorting** (if sortBy specified):
   ```javascript
   if (sortBy === 'value') {
     aggregated.sort((a, b) => 
       sortOrder === 'asc' ? a.value - b.value : b.value - a.value
     );
   } else if (sortBy === 'label') {
     aggregated.sort((a, b) => 
       sortOrder === 'asc' 
         ? a.label.localeCompare(b.label)
         : b.label.localeCompare(a.label)
     );
   }
   // else: preserve original order
   ```

5. **Limiting** (top-N):
   ```javascript
   if (limit && limit > 0) {
     aggregated = aggregated.slice(0, limit);
   }
   ```

6. **Extract arrays**:
   ```javascript
   return {
     categories: aggregated.map(item => item.label),
     values: aggregated.map(item => item.value),
     chartData: aggregated, // Full data for click events
     isEmpty: false
   };
   ```

## Stacked Mode (stackBy Property)

When `stackBy` property is provided, the component creates a multi-series stacked bar chart with separate datasets for each unique stack value.

### Stacked Data Processing
**Dependencies**: `data`, `groupBy`, `stackBy`, `valueField`, `aggregateMethod`, `sortBy`, `sortOrder`, `limit`, `entityInfo`

**Process**:
1. **Collect primary categories** (X-axis values):
   ```javascript
   const categoriesSet = new Set();
   data.forEach(record => {
     let key = record[groupBy] || 'Unknown';
     // Apply date formatting if needed
     if (isDateField) {
       key = new Date(key).toISOString().split('T')[0];
     }
     categoriesSet.add(key);
   });
   let categories = Array.from(categoriesSet);
   ```

2. **Collect stack values** (series/colors):
   ```javascript
   const stackValuesSet = new Set();
   data.forEach(record => {
     const stackValue = record[stackBy] || 'Unknown';
     stackValuesSet.add(stackValue);
   });
   const stackValues = Array.from(stackValuesSet).sort();
   ```

3. **Group by BOTH dimensions**:
   ```javascript
   const grouped = {};
   data.forEach(record => {
     const categoryKey = record[groupBy] || 'Unknown';
     const stackValue = record[stackBy] || 'Unknown';
     const key = `${categoryKey}|||${stackValue}`; // Composite key

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
   ```

4. **Aggregate each group** (same logic as non-stacked: count/sum/average/min/max)

5. **Create datasets array** - one dataset per stack value:
   ```javascript
   const datasets = stackValues.map((stackValue, stackIndex) => {
     const datasetValues = categories.map(category => {
       const key = `${category}|||${stackValue}`;
       return grouped[key] ? grouped[key].value : 0; // Zero if no data
     });

     return {
       label: String(stackValue),
       data: datasetValues,
       backgroundColor: (colors || defaultColors)[stackIndex % (colors || defaultColors).length],
       borderColor: (colors || defaultColors)[stackIndex % (colors || defaultColors).length],
       borderWidth: 1
     };
   });
   ```

6. **Return structure**:
   ```javascript
   return {
     categories: categories.map(c => String(c)),
     datasets: datasets, // Multiple datasets, one per stack value
     values: [], // Not used in stacked mode
     chartData: Object.values(grouped),
     isEmpty: false
   };
   ```

### Stacked Chart Configuration
When `isStacked` is true (stackBy provided and datasets exist):
```javascript
const config = {
  type: 'bar', // or 'line'
  data: {
    labels: processData.categories,
    datasets: processData.datasets // Use pre-built datasets
  },
  options: {
    scales: {
      y: {
        stacked: true, // Enable stacking on Y-axis
        beginAtZero: true
      },
      x: {
        stacked: true // Enable stacking on X-axis
      }
    }
    // ... other options same as non-stacked
  }
};
```

**Key difference**: In non-stacked mode, there's one dataset with different colors per bar. In stacked mode, each dataset has one color and represents a series across all categories.

## Auto Chart Type Detection

### determineChartType Function
```javascript
const determineChartType = () => {
  if (chartType) return chartType; // Explicit type takes priority
  
  // Check if groupBy is date field
  if (isDateField(groupBy)) {
    return 'line';
  }
  
  // Use pie for small number of categories (≤5, preferred over doughnut)
  if (processData.categories && processData.categories.length <= 5) {
    return 'pie';
  }
  
  // Default to bar
  return 'bar';
};

// Map aliases
const actualChartType = {
  'donut': 'doughnut',
  'column': 'bar'
}[determineChartType()] || determineChartType();
```

## Chart.js Configuration

### Dataset Configuration
```javascript
const datasets = [{
  label: valueField || 'Count',
  data: processData.values,
  backgroundColor: isPieOrDoughnut
    ? (colors || defaultColors).slice(0, processData.values.length)
    : isLineOrArea
      ? 'rgba(24, 144, 255, 0.2)'
      : (colors || defaultColors).slice(0, processData.values.length), // Different color per bar
  borderColor: isPieOrDoughnut
    ? undefined
    : isLineOrArea
      ? (colors || defaultColors)[0]
      : (colors || defaultColors).slice(0, processData.values.length), // Different border per bar
  borderWidth: isPieOrDoughnut ? 1 : 2,
  fill: isLineOrArea ? true : false,
  tension: isLineOrArea ? 0.4 : undefined
}];
```

### Chart Options
```javascript
const options = {
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
  hover: {
    mode: 'nearest',
    intersect: true
  },
  onHover: (event, activeElements) => {
    // Change cursor to pointer when hovering over data points
    event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
  },
  onClick: (_event, elements) => {
    if (elements && elements.length > 0 && onDataPointClick) {
      const index = elements[0].index;
      const clickedData = processData.chartData[index];
      
      // Highlight clicked element
      if (chartInstanceRef.current) {
        const meta = chartInstanceRef.current.getDatasetMeta(0);
        const element = meta.data[index];
        if (element) {
          // Store original border width
          if (!element._originalBorderWidth) {
            element._originalBorderWidth = element.options.borderWidth || 1;
          }
          
          // Reset all elements
          meta.data.forEach((el) => {
            if (el._originalBorderWidth) {
              el.options.borderWidth = el._originalBorderWidth;
            }
          });
          
          // Highlight clicked element (3x thicker border)
          element.options.borderWidth = element._originalBorderWidth * 3;
          
          // Update chart without animation
          chartInstanceRef.current.update('none');
        }
      }
      
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
      text: title
    },
    legend: {
      display: legend?.show !== false,
      position: legend?.position || 'auto',
      labels: {
        fontSize: legend?.fontSize || 12
      }
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const label = context.label || '';
          const value = formatValue(context.parsed.y || context.parsed);
          return `${label}: ${value}`;
        }
      }
    },
    datalabels: showDataLabels ? {
      anchor: 'end',
      align: 'top',
      formatter: (value) => formatValue(value)
    } : false
  },
  scales: !isPieOrDoughnut ? {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value) => formatValue(value)
      }
    },
    x: {
      ticks: {
        maxRotation: 45,
        minRotation: 0
      }
    }
  } : undefined
};
```

## Value Formatting

### formatValue Function
```javascript
const formatValue = (value) => {
  if (value == null) return 'N/A';
  
  // Check if date
  if (value instanceof Date || !isNaN(Date.parse(value))) {
    try {
      return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      // Not a date, continue
    }
  }
  
  // Check if currency
  const isCurrency = valueField && (
    valueField.toLowerCase().includes('amount') ||
    valueField.toLowerCase().includes('price') ||
    valueField.toLowerCase().includes('cost')
  );
  
  if (isCurrency || (entityInfo && /* check Type === 'money' */)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  }
  
  // Format as number with commas
  return new Intl.NumberFormat('en-US').format(value);
};
```

## Chart Rendering (useEffect)

### Dependencies
Runs on: `processData`, `canvasRef`, `actualChartType`, `colors`, etc.

### Process
```javascript
useEffect(() => {
  // Check empty state
  if (processData.isEmpty || !canvasRef.current) return;
  
  // Validate Chart.js loaded
  if (!Chart) {
    setError('Chart.js library not loaded');
    return;
  }
  
  // Destroy existing chart
  if (chartInstanceRef.current) {
    chartInstanceRef.current.destroy();
  }
  
  // Get canvas context
  const ctx = canvasRef.current.getContext('2d');
  
  // Create new Chart.js instance
  chartInstanceRef.current = new Chart(ctx, {
    type: actualChartType,
    data: {
      labels: processData.categories,
      datasets: [/* dataset config */]
    },
    options: {/* options config */}
  });
  
  // Fire onChartRendered event
  if (onChartRendered) {
    onChartRendered({
      chartType: actualChartType,
      dataPointCount: processData.values.length,
      aggregateMethod: aggregateMethod,
      totalValue: processData.values.reduce((a, b) => a + b, 0)
    });
  }
  
  // Cleanup
  return () => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }
  };
}, [/* dependencies */]);
```

## Export Functionality (useEffect)

### Implementation
```javascript
useEffect(() => {
  if (enableExport && canvasRef.current) {
    const handleExport = () => {
      const dataURL = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = `chart-${Date.now()}.png`;
      a.click();
    };
    
    // Store in global for button access
    window.SimpleChartExport = handleExport;
    
    return () => {
      delete window.SimpleChartExport;
    };
  }
}, [enableExport, canvasRef]);
```

## Render Output

### Error State
```javascript
if (error) {
  return (
    <div style={{ 
      color: '#EF4444', 
      padding: '20px', 
      backgroundColor: '#FEE2E2',
      height: height || '400px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {error}
    </div>
  );
}
```

### Empty State
```javascript
if (processData.isEmpty) {
  return (
    <div style={{
      backgroundColor: '#F3F4F6',
      height: height || '400px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#6B7280'
    }}>
      No data available
    </div>
  );
}
```

### Success State
```javascript
return (
  <div style={{ position: 'relative', height: height || '400px' }}>
    {enableExport && (
      <button
        onClick={() => window.SimpleChartExport && window.SimpleChartExport()}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 10,
          padding: '6px 12px',
          backgroundColor: '#3B82F6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        ⬇ Export
      </button>
    )}
    <div style={{ height: '100%' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  </div>
);
```

## Performance Optimizations
- Data processing memoized (useMemo) - only recalculates when dependencies change
- Chart instance reused/updated when possible (destroy/recreate only when necessary)
- Animation disabled after initial render (prevents re-animation on interactions)
- Canvas rendering (hardware accelerated via Chart.js)
- Efficient color slicing (no array copies)
