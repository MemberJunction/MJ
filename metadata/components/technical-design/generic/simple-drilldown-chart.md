## Architecture
React functional component that composes SimpleChart + DataGrid + optional SingleRecordView with fixed two-level drill-down pattern (chart → table).

## CRITICAL ARCHITECTURAL CONSTRAINT
**HARDCODED vertical structure** - cannot support chart-to-chart, dynamic levels, or custom hierarchies. For complex patterns, developers must create custom components with multiple SimpleChart instances.

## State Management (React Hooks)
- **selectedSegment** (object | null): Clicked segment data `{label, value, records: Array, percentage}`
- **showGrid** (boolean): Grid visibility control
- **selectedRecord** (object | null): Selected row for SingleRecordView (three-column mode only)

## Component Dependencies
Requires from components registry:
- **SimpleChart** (required): Chart rendering
- **DataGrid** (required): Table display
- **SingleRecordView** (optional): Detail panel (three-column mode only)

Shows error message if DataGrid not found.

## State Flow

### Initial State
```javascript
const [selectedSegment, setSelectedSegment] = useState(null);
const [showGrid, setShowGrid] = useState(false);
const [selectedRecord, setSelectedRecord] = useState(null);
```

Chart only, no info bar, no grid.

### Segment Selection Flow
```javascript
const handleChartClick = (clickData) => {
  setSelectedSegment({
    label: clickData.label,
    value: clickData.value,
    records: clickData.records,
    percentage: clickData.percentage
  });
  setShowGrid(true);
  
  // Fire event
  if (onSegmentSelected) {
    onSegmentSelected({ segment: clickData });
  }
};
```

### Clear Selection Flow
```javascript
const handleClearSelection = () => {
  setSelectedSegment(null);
  setShowGrid(false);
  setSelectedRecord(null);
  
  // Fire event
  if (onSelectionCleared) {
    onSelectionCleared();
  }
};
```

### Row Selection Flow (Three-column mode)
```javascript
const handleRowClick = (record) => {
  setSelectedRecord(record);
  
  // Fire event
  if (onRowSelected) {
    onRowSelected({ record, segment: selectedSegment });
  }
};
```

## Grid Column Detection

### getGridColumns Function
```javascript
const getGridColumns = () => {
  if (gridFields && gridFields.length > 0) {
    return gridFields; // Explicit field list
  }
  
  // Auto-detect from first record
  if (!selectedSegment || !selectedSegment.records || selectedSegment.records.length === 0) {
    return [];
  }
  
  const firstRecord = selectedSegment.records[0];
  return Object.keys(firstRecord)
    .filter(key => 
      !key.startsWith('__mj') &&  // Exclude system fields
      key !== 'ID' &&              // Exclude ID
      typeof firstRecord[key] !== 'object' // Exclude nested objects
    )
    .slice(0, 10); // Limit to first 10 fields
};
```

## Layout Modes

### Two-Column Mode (showSingleRecordView=false)
Vertical stack:
1. SimpleChart (full width)
2. Info bar (when selectedSegment exists)
3. DataGrid (full width, height: drilldownHeight default 300px)

**Row click behavior**:
- If `entityName` + `entityPrimaryKeys`: Opens record via callbacks.OpenEntityRecord
- Else: Read-only grid

### Three-Column Mode (showSingleRecordView=true, entityName required)
Layout:
1. SimpleChart (full width at top)
2. Info bar (when selectedSegment exists)
3. Side-by-side below:
   - DataGrid (60% width, left)
   - SingleRecordView (40% width, right)

**Row click behavior**:
- Populates SingleRecordView (does NOT open record form)
- Use allowOpenRecord=true on SingleRecordView for Open Record button

## Info Bar Rendering

### Implementation
```javascript
{selectedSegment && (
  <div style={{
    backgroundColor: '#f0f5ff',
    borderLeft: '4px solid #1890ff',
    padding: '12px 16px',
    marginTop: '12px',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  }}>
    <div style={{ display: 'flex', gap: '24px' }}>
      <div>
        <strong>{selectedSegment.label}</strong>
      </div>
      <div>
        Value: <strong>{selectedSegment.value.toLocaleString()}</strong>
      </div>
      <div>
        Records: <strong>{selectedSegment.records.length}</strong>
      </div>
      {selectedSegment.percentage && (
        <div>
          Percentage: <strong>{selectedSegment.percentage.toFixed(1)}%</strong>
        </div>
      )}
    </div>
    <button
      onClick={handleClearSelection}
      style={{
        backgroundColor: '#fff',
        border: '1px solid #d9d9d9',
        borderRadius: '4px',
        padding: '4px 12px',
        cursor: 'pointer'
      }}
    >
      Clear Selection
    </button>
  </div>
)}
```

## Chart Rendering

### Chart Border Highlight
```javascript
<div style={{
  border: selectedSegment ? '2px solid #1890ff' : 'none',
  transition: 'all 0.3s ease'
}}>
  <SimpleChart
    data={data}
    entityName={entityName}
    groupBy={groupBy}
    valueField={valueField}
    aggregateMethod={aggregateMethod}
    chartType={chartType}
    sortBy={sortBy}
    sortOrder={sortOrder}
    limit={limit}
    colors={colors}
    legend={legend}
    showDataLabels={showDataLabels}
    enableExport={enableExport}
    onDataPointClick={handleChartClick}
    utilities={utilities}
    styles={styles}
    components={components}
    callbacks={callbacks}
    savedUserSettings={savedUserSettings}
    onSaveUserSettings={onSaveUserSettings}
  />
</div>
```

## DataGrid Integration

### Two-Column Mode
```javascript
{showGrid && selectedSegment && (
  <div style={{
    border: '1px solid #d9d9d9',
    borderRadius: '4px',
    height: drilldownHeight || '300px',
    overflow: 'auto',
    animation: 'slideIn 0.3s ease-out'
  }}>
    <DataGrid
      data={selectedSegment.records}
      entityName={entityName}
      entityPrimaryKeys={entityPrimaryKeys}
      columns={getGridColumns()}
      sorting={true}
      filtering={true}
      paging={true}
      autoFitColumns={true}
      utilities={utilities}
      styles={styles}
      components={components}
      callbacks={callbacks}
      savedUserSettings={savedUserSettings}
      onSaveUserSettings={onSaveUserSettings}
    />
  </div>
)}
```

### Three-Column Mode
```javascript
{showGrid && selectedSegment && (
  <div style={{
    display: 'flex',
    gap: '16px',
    animation: 'slideIn 0.3s ease-out'
  }}>
    {/* DataGrid: 60% width */}
    <div style={{
      flex: '0 0 60%',
      border: '1px solid #d9d9d9',
      borderRadius: '4px',
      height: drilldownHeight || '300px',
      overflow: 'auto'
    }}>
      <DataGrid
        data={selectedSegment.records}
        entityName={entityName}
        columns={getGridColumns()}
        sorting={true}
        filtering={true}
        paging={true}
        autoFitColumns={true}
        onRowClick={handleRowClick}
        {...otherProps}
      />
    </div>
    
    {/* SingleRecordView: 40% width */}
    <div style={{
      flex: '0 0 40%',
      border: '1px solid #d9d9d9',
      borderRadius: '4px',
      height: drilldownHeight || '300px',
      overflow: 'auto'
    }}>
      {selectedRecord ? (
        <SingleRecordView
          record={selectedRecord}
          entityName={entityName}
          layout="list"
          allowOpenRecord={true}
          {...otherProps}
        />
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#999'
        }}>
          Select a record to view details
        </div>
      )}
    </div>
  </div>
)}
```

## CSS Animations

### Injected Styles
```css
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Applied to info bar and grid container for smooth transitions.

## Event Firing

### 1. segmentSelected
```javascript
if (onSegmentSelected) {
  onSegmentSelected({ 
    segment: {
      label: clickData.label,
      value: clickData.value,
      records: clickData.records,
      percentage: clickData.percentage
    }
  });
}
```

### 2. selectionCleared
```javascript
if (onSelectionCleared) {
  onSelectionCleared();
}
```

### 3. rowSelected (three-column mode)
```javascript
if (onRowSelected) {
  onRowSelected({ 
    record: clickedRecord,
    segment: selectedSegment
  });
}
```

### 4. dataPointClick (bubbles from SimpleChart)
Passed through if parent needs raw click data.

### 5. All DataGrid events
rowClick, pageChanged, sortChanged, filterChanged, etc. bubble up if parent needs them.

## Props Passthrough

### To SimpleChart
All chart-related props:
- groupBy, valueField, aggregateMethod
- chartType, sortBy, sortOrder, limit
- colors, legend, showDataLabels, enableExport
- Plus: data, entityName, utilities, styles, components, callbacks

### To DataGrid
- data: `selectedSegment.records` (filtered array)
- entityName, entityPrimaryKeys
- columns: Auto-detected or from gridFields prop
- sorting=true, filtering=true, paging=true
- autoFitColumns=true
- onRowClick (if three-column mode)

### To SingleRecordView (three-column mode)
- record: selectedRecord
- entityName
- layout='list'
- allowOpenRecord=true (for Open Record button)

## Error Handling

### Missing DataGrid
```javascript
if (!DataGrid) {
  return (
    <div style={{
      color: '#EF4444',
      padding: '20px',
      backgroundColor: '#FEE2E2',
      border: '1px solid #FECACA',
      borderRadius: '4px'
    }}>
      Error: DataGrid component not found in registry
    </div>
  );
}
```

### Missing SingleRecordView (three-column mode)
Falls back to two-column mode with console warning.

### Empty Records
Info bar and grid handle gracefully (show 0 records).

## Performance Considerations
- State updates are minimal (3 state variables)
- No complex memoization needed (component is lightweight)
- DataGrid handles its own performance (sorting, filtering, paging)
- SimpleChart memoizes data processing
- CSS animations via keyframes (hardware accelerated)

## Limitations
- **CANNOT** support chart-to-chart drill-down
- **CANNOT** support dynamic drill levels (3+)
- **CANNOT** support multiple child charts
- **CANNOT** support custom drill patterns
- **FIXED** vertical structure only

For these scenarios, developers must build custom components.
