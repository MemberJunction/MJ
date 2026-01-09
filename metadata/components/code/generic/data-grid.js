function DataGrid({
  data,
  entityName,
  entityPrimaryKeys,
  columns, // Array of column definitions: [{field: 'Name', header: 'Product Name', render: fn, width: '200px', sortable: true}]
  sorting = true,
  paging = true,
  pageSize = 20,
  showPageSizeChanger = true,
  filtering = true,  // Changed default to true
  highlightFilterMatches = true,
  filterFields,
  filterDebounceTime = 300,
  selectionMode = 'none',
  longTextDisplay = 'expand', // Options: 'truncate', 'expand', 'tooltip', 'wrap', 'none'
  longTextThreshold = 100, // Characters before truncation
  autoFitColumns = true, // Auto-fit columns to container width vs fixed widths with scroll
  onSelectionChanged,
  onPageChanged,
  onSortChanged,
  onFilterChanged,
  onRowClick,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Always use the MJ unwrapLibraryComponents function to get components from global libraries like antd, this ensures
  // that various library build/package formats are handled correctly and transparently for your code!
  const { Table, Input, Space, Typography, Tag, Tooltip } = unwrapLibraryComponents(antd, 'Table', 'Input', 'Space', 'Typography', 'Tag', 'Tooltip');
  const { Search } = Input;
  const { Text } = Typography;
  const [filterText, setFilterText] = React.useState('');
  const [debouncedFilter, setDebouncedFilter] = React.useState('');
  const [selectedRowKeys, setSelectedRowKeys] = React.useState([]);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [currentPageSize, setCurrentPageSize] = React.useState(pageSize);
  const [sortConfig, setSortConfig] = React.useState(null);
  const [entityInfo, setEntityInfo] = React.useState(null);
  const [expandedCells, setExpandedCells] = React.useState({}); // Track which cells are expanded


  // Update current page size when pageSize prop changes
  React.useEffect(() => {
    setCurrentPageSize(pageSize);
  }, [pageSize]);

  // Load entity metadata if we have an entity name
  React.useEffect(() => {
    if (entityName && utilities?.md?.Entities) {
      const entity = utilities.md.Entities.find(e => e.Name === entityName);
      setEntityInfo(entity || null);
    } else {
      setEntityInfo(null);
    }
  }, [entityName, utilities]);
  
  // Helper function to format dates
  const formatDate = (value) => {
    if (!value) return '-';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value; // Invalid date, return as-is
      // Format as YYYY-MM-DD HH:MM
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return value;
    }
  };
  
  // Color mapping for common status values (darker for better contrast with white text)
  const statusColorMap = {
    // Green colors for positive states
    active: '#389e0d',      // darker green
    approved: '#52c41a',    // green
    complete: '#237804',    // dark green
    completed: '#135200',   // very dark green
    success: '#3f6600',     // olive green
    successful: '#5b8c00',  // light olive
    enabled: '#7cb305',     // lime
    published: '#a0d911',   // light lime
    
    // Red colors for negative states
    inactive: '#cf1322',    // darker red
    rejected: '#f5222d',    // red
    failed: '#a8071a',      // dark red
    error: '#820014',       // very dark red
    disabled: '#ff4d4f',    // light red
    cancelled: '#ff7875',   // salmon
    canceled: '#ff9c9c',    // light salmon
    terminated: '#873800',  // burnt orange
    expired: '#ad4e00',     // dark orange
    deprecated: '#d4380d',  // rust orange
    
    // Yellow/Orange for pending states
    pending: '#d48806',     // darker orange
    paused: '#fa8c16',      // orange
    temporary: '#faad14',   // gold
    draft: '#d4b106',       // dark gold
    review: '#ad8b00',      // darker gold
    waiting: '#ffc53d',     // light gold
    
    // Blue for informational states
    processing: '#096dd9',  // darker blue
    running: '#1890ff',     // blue
    inprogress: '#0050b3',  // dark blue
    'in progress': '#003a8c', // very dark blue
    'in-progress': '#40a9ff' // light blue
  };
  
  // 50 distinct colors for value lists (excluding colors used in statusColorMap)
  // These are carefully selected to be visually distinct from each other
  const fallbackColors = [
    '#722ed1', // purple
    '#9254de', // light purple
    '#531dab', // dark purple
    '#391085', // very dark purple
    '#b37feb', // lavender
    
    '#c41d7f', // magenta
    '#eb2f96', // pink
    '#f759ab', // light pink
    '#9e1068', // dark magenta
    '#780650', // very dark magenta
    
    '#08979c', // teal
    '#13c2c2', // cyan
    '#006d75', // dark teal
    '#36cfc9', // light cyan
    '#5cdbd3', // pale cyan
    
    '#1d39c4', // indigo
    '#2f54eb', // royal blue
    '#597ef7', // periwinkle
    '#10239e', // dark indigo
    '#061178', // navy
    
    '#fa541c', // vermillion
    '#ff7a45', // coral
    '#ff9c6e', // peach
    '#d4380d', // rust (if not used above)
    '#ad2102', // brick red
    
    '#8c8c8c', // gray
    '#595959', // dark gray
    '#bfbfbf', // light gray
    '#434343', // charcoal
    '#262626', // near black
    
    '#614700', // brown
    '#874d00', // tan
    '#a8730f', // amber
    '#c79816', // mustard
    '#d4a017', // goldenrod
    
    '#00474f', // dark cyan
    '#006064', // petrol
    '#004851', // dark petrol
    '#1a535c', // ocean
    '#2c5f2d', // forest green
    
    '#4a7c59', // sage
    '#6b8e23', // olive drab
    '#556b2f', // dark olive
    '#8fbc8f', // dark sea green
    '#3cb371', // medium sea green
    
    '#cd5c5c', // indian red
    '#bc8f8f', // rosy brown
    '#daa520', // goldenrod
    '#b8860b', // dark goldenrod
    '#ff6347'  // tomato
  ];
  
  // Get color for a value in a value list - ensures unique colors for all values
  const getValueColor = (value, possibleValues) => {
    if (!value) return null;
    
    const normalized = value.toString().toLowerCase().trim();
    
    // Build a complete color assignment map for this column
    const colorAssignments = new Map();
    let nextColorIndex = 0;
    
    // First, assign colors to all possible values in order
    if (possibleValues && Array.isArray(possibleValues)) {
      possibleValues.forEach(pv => {
        const pvValue = (pv.Value || pv.Code || '').toLowerCase().trim();
        if (pvValue && !colorAssignments.has(pvValue)) {
          // Check if this value has a predefined color in statusColorMap
          if (statusColorMap[pvValue]) {
            colorAssignments.set(pvValue, statusColorMap[pvValue]);
          } else {
            // Assign next available fallback color
            colorAssignments.set(pvValue, fallbackColors[nextColorIndex % fallbackColors.length]);
            nextColorIndex++;
          }
        }
      });
    }
    
    // Return the assigned color for this value
    if (colorAssignments.has(normalized)) {
      return colorAssignments.get(normalized);
    }
    
    // If value wasn't in possibleValues, check statusColorMap first
    if (statusColorMap[normalized]) {
      return statusColorMap[normalized];
    }
    
    // Otherwise assign a fallback color based on hash
    // This ensures consistency even for unexpected values
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
    }
    return fallbackColors[Math.abs(hash) % fallbackColors.length];
  };
  
  // Debounce filter input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(filterText);
    }, filterDebounceTime);
    return () => clearTimeout(timer);
  }, [filterText, filterDebounceTime]);
  
  // Normalize column definitions - support both simple strings and full column definitions
  // Also handles edge case: LLM might pass Ant Design format (title/dataIndex) instead of DataGrid format (field/header)
  const normalizedColumns = React.useMemo(() => {
    if (!columns || columns.length === 0) {
      // Auto-discover columns from data if none provided
      if (data && Array.isArray(data) && data.length > 0) {
        const allKeys = new Set();
        data.forEach(row => {
          if (row && typeof row === 'object') {
            Object.keys(row).forEach(key => {
              if (key !== 'key') {
                allKeys.add(key);
              }
            });
          }
        });
        return Array.from(allKeys).map(key => ({ field: key }));
      }
      return [];
    }

    // Normalize columns to standard format
    const normalized = columns.map(col => {
      if (typeof col === 'string') {
        // Simple string field name - use defaults
        return { field: col };
      } else if (typeof col === 'object') {
        // Check if this is Ant Design format (title/dataIndex/key) instead of DataGrid format (field/header)
        if (!col.field && (col.dataIndex || col.title)) {
          console.warn('[DataGrid] Detected Ant Design column format - auto-converting to DataGrid format:', col);
          return {
            field: col.dataIndex || col.title,
            header: col.title || col.dataIndex,
            render: col.render,
            width: col.width,
            sortable: col.sortable
          };
        } else if (col.field) {
          // Already correct DataGrid format
          return col;
        } else {
          console.warn('[DataGrid] Invalid column configuration (missing field property):', col);
          return null;
        }
      } else {
        console.warn('[DataGrid] Invalid column configuration:', col);
        return null;
      }
    }).filter(Boolean);

    // Fallback: If zero valid columns after normalization, auto-discover from data
    if (normalized.length === 0 && data && Array.isArray(data) && data.length > 0) {
      console.warn('[DataGrid] Zero valid columns detected after normalization - falling back to auto-discovery from data');
      const allKeys = new Set();
      data.forEach(row => {
        if (row && typeof row === 'object') {
          Object.keys(row).forEach(key => {
            if (key !== 'key') {
              allKeys.add(key);
            }
          });
        }
      });
      return Array.from(allKeys).map(key => ({ field: key }));
    }

    return normalized;
  }, [columns, data]);

  // Extract just the field names for filtering and other operations
  const displayFields = React.useMemo(() => {
    return normalizedColumns.map(col => col.field);
  }, [normalizedColumns]);
  
  // Build table columns from column definitions with metadata-aware formatting
  const tableColumns = React.useMemo(() => {
    return normalizedColumns.map(colDef => {
      const fieldName = colDef.field;

      // Get field metadata if available
      const fieldInfo = entityInfo?.Fields?.find(f => f.Name === fieldName);
      const fieldType = fieldInfo?.Type?.toLowerCase() || '';
      const hasValueList = fieldInfo?.ValueListType === 'List' || fieldInfo?.ValueListType === 'ListOrUserEntry';
      const possibleValues = fieldInfo?.EntityFieldValues;
      
      
      // Determine alignment based on field type
      let align = 'left';
      if (fieldType.includes('int') || fieldType.includes('decimal') || 
          fieldType.includes('float') || fieldType.includes('numeric') || 
          fieldType.includes('money') || fieldType === 'bit') {
        align = 'right';
      }
      
      // Set column width based on field metadata (type and length)
      // In autoFit mode, we don't set widths (let table auto-size)
      // In fixed mode, set proper widths for all columns with horizontal scroll
      let columnWidth = autoFitColumns ? undefined : 150; // Default width or auto
      const fieldLength = fieldInfo?.Length;
      
      // Determine if this is a long text field based on SQL type
      // Note: SQL Server returns length = -1 for max fields (varchar(max), nvarchar(max))
      const isLongTextField = fieldType.includes('text') || // text, ntext types
                              (fieldType.includes('varchar') && fieldLength === -1) || // varchar(max) or nvarchar(max)
                              (fieldType.includes('char') && fieldLength === -1) || // char(max) or nchar(max)
                              (fieldType.includes('varchar') && fieldLength && fieldLength > 200) ||
                              (fieldType.includes('char') && fieldLength && fieldLength > 200);
      
      
      // Set appropriate widths based on data type (only when not auto-fitting)
      if (!autoFitColumns) {
        if (fieldType.includes('uniqueidentifier')) {
          columnWidth = 280; // GUIDs need space
        } else if (isLongTextField) {
          columnWidth = 400; // Generous width for long text fields
        } else if (fieldType.includes('varchar') || fieldType.includes('char')) {
          // Scale width based on field length
          if (fieldLength && fieldLength <= 50) {
            columnWidth = Math.min(200, Math.max(100, fieldLength * 3));
          } else if (fieldLength && fieldLength <= 100) {
            columnWidth = 250;
          } else if (fieldLength && fieldLength <= 200) {
            columnWidth = 300;
          } else {
            columnWidth = 350; // Default for varchar without length
          }
        } else if (fieldType.includes('date') || fieldType.includes('time')) {
          columnWidth = 160;
        } else if (fieldType === 'bit') {
          columnWidth = 80;
        } else if (fieldType.includes('int')) {
          columnWidth = 100;
        } else if (fieldType.includes('decimal') || fieldType.includes('numeric')) {
          columnWidth = 120;
        } else if (fieldType.includes('money')) {
          columnWidth = 130;
        }
      }
      
      // If no metadata available, use default width
      // We don't make assumptions based on field names
      
      
      // Enable ellipsis for long text fields
      const useEllipsis = isLongTextField;
      
      // Handle special __mj fields display names
      // Priority: colDef.header > fieldInfo.DisplayName > default handling
      let displayName = colDef.header || fieldInfo?.DisplayName || fieldName;
      if (!colDef.header) {
        if (fieldName === '__mj_CreatedAt') {
          displayName = 'Created At';
        } else if (fieldName === '__mj_UpdatedAt') {
          displayName = 'Updated At';
        } else if (fieldName === '__mj_DeletedAt') {
          displayName = 'Deleted At';
        }
      }

      const columnDef = {
        title: displayName,
        dataIndex: fieldName,
        key: fieldName,
        align: align,
        width: colDef.width || columnWidth, // Use column-specific width if provided
        ellipsis: false, // We'll handle ellipsis manually for click expansion
        sorter: (colDef.sortable !== undefined ? colDef.sortable : sorting) ? (a, b) => {
          const valA = a[fieldName];
          const valB = b[fieldName];
          if (valA == null) return 1;
          if (valB == null) return -1;
          if (typeof valA === 'string') {
            return valA.localeCompare(valB);
          }
          return valA - valB;
        } : false,
        render: (value, record) => {
          // Check for custom render function first
          if (colDef.render && typeof colDef.render === 'function') {
            return colDef.render(value, record, fieldInfo);
          }

          // Default handling for null values
          if (value == null) return '-';

          // Create a unique key for this cell
          const cellKey = `${record.key || record.ID || record.id}_${fieldName}`;
          const isExpanded = expandedCells[cellKey];

          // Format based on field type (default behavior)
          let displayValue = value;
          let formattedContent = null;
          
          // Handle date/time fields
          if (fieldType.includes('date') || fieldType.includes('time')) {
            displayValue = formatDate(value);
            formattedContent = displayValue;
          }
          // Handle boolean fields
          else if (fieldType === 'bit') {
            displayValue = value ? 'Yes' : 'No';
            formattedContent = displayValue;
          }
          // Handle fields with value lists - render as tags
          else if (hasValueList && possibleValues) {
            const color = getValueColor(value, possibleValues);
            formattedContent = (
              <Tag 
                color={color}
                style={{ 
                  borderRadius: '12px',
                  fontSize: '12px',
                  padding: '2px 8px'
                }}
              >
                {value}
              </Tag>
            );
          }
          // Handle numeric fields with formatting
          else if (fieldType.includes('money')) {
            displayValue = typeof value === 'number'
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
              : value;
            formattedContent = displayValue;
          }
          else if (fieldType.includes('decimal') || fieldType.includes('float')) {
            displayValue = typeof value === 'number' 
              ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
              : value;
            formattedContent = displayValue;
          }
          else if (fieldType.includes('int')) {
            displayValue = typeof value === 'number' 
              ? value.toLocaleString('en-US')
              : value;
            formattedContent = displayValue;
          }
          else {
            formattedContent = displayValue;
          }
          
          // Handle long text fields based on longTextDisplay mode
          if (useEllipsis && typeof displayValue === 'string' && displayValue.length > longTextThreshold && !hasValueList) {
            const shouldTruncate = displayValue.length > longTextThreshold;
            
            // Mode: truncate - simple ellipsis
            if (longTextDisplay === 'truncate') {
              const truncated = displayValue.substring(0, longTextThreshold) + '...';
              return (
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {truncated}
                </div>
              );
            }
            
            // Mode: tooltip - show full text on hover
            if (longTextDisplay === 'tooltip') {
              const truncated = displayValue.substring(0, longTextThreshold) + '...';
              return (
                <Tooltip title={displayValue} placement="topLeft">
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {truncated}
                  </div>
                </Tooltip>
              );
            }
            
            // Mode: wrap - show all text with wrapping
            if (longTextDisplay === 'wrap') {
              return (
                <div style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {displayValue}
                </div>
              );
            }
            
            // Mode: expand (default) - click to expand/collapse
            if (longTextDisplay === 'expand') {
              const shouldTruncate = !isExpanded && displayValue.length > longTextThreshold;
              const displayText = shouldTruncate 
                ? displayValue.substring(0, longTextThreshold) 
                : displayValue;
              
              // Apply highlight for filter matches
              let finalContent = displayText;
              if (filtering && highlightFilterMatches && debouncedFilter) {
                const str = String(displayText);
                const searchTerm = debouncedFilter.toLowerCase();
                const index = str.toLowerCase().indexOf(searchTerm);
                if (index >= 0) {
                  finalContent = (
                    <span>
                      {str.substring(0, index)}
                      <Text mark>{str.substring(index, index + searchTerm.length)}</Text>
                      {str.substring(index + searchTerm.length)}
                    </span>
                  );
                }
              }
              
              return (
                <div 
                  style={{ 
                    cursor: shouldTruncate ? 'pointer' : 'default',
                    whiteSpace: isExpanded ? 'normal' : 'nowrap',
                    wordBreak: isExpanded ? 'break-word' : 'normal'
                  }}
                  onClick={() => {
                    if (displayValue.length > longTextThreshold) {
                      setExpandedCells(prev => ({
                        ...prev,
                        [cellKey]: !prev[cellKey]
                      }));
                    }
                  }}
                >
                  {finalContent}
                  {shouldTruncate && (
                    <Text type="secondary" style={{ marginLeft: 2 }}>
                      ... <Text type="link">[show more]</Text>
                    </Text>
                  )}
                  {isExpanded && displayValue.length > longTextThreshold && (
                    <Text type="link" style={{ marginLeft: 4 }}>
                      [show less]
                    </Text>
                  )}
                </div>
              );
            }
            
            // Mode: none - no special handling
            // Falls through to regular display
          }
          
          // Apply highlight for filter matches (for non-expandable content)
          if (filtering && highlightFilterMatches && debouncedFilter && !hasValueList) {
            const str = String(displayValue);
            const index = str.toLowerCase().indexOf(debouncedFilter.toLowerCase());
            if (index >= 0) {
              return (
                <span>
                  {str.substring(0, index)}
                  <Text mark>{str.substring(index, index + debouncedFilter.length)}</Text>
                  {str.substring(index + debouncedFilter.length)}
                </span>
              );
            }
          }
          
          return formattedContent;
        }
      };

      // Only add sortOrder if explicitly provided (for controlled sorting)
      // If undefined, Ant Design uses uncontrolled sorting with the sorter function
      if (colDef.sortOrder !== undefined) {
        columnDef.sortOrder = colDef.sortOrder;
      }

      return columnDef;
    });
  }, [normalizedColumns, entityInfo, sorting, filtering, highlightFilterMatches, debouncedFilter, expandedCells]);
  
  // Filter data based on search term
  // Handles null/undefined data gracefully and returns appropriate defaults
  const filteredData = React.useMemo(() => {
    // If data is null/undefined, return empty array
    if (!data || !Array.isArray(data)) {
      return [];
    }
    
    // If filtering is disabled or no filter text, return original data
    if (!filtering || !debouncedFilter) {
      return data;
    }
    
    // Determine which fields to search - use specified fields or all display fields
    const searchFields = filterFields || displayFields;
    const searchTerm = debouncedFilter.toLowerCase();
    
    // Filter rows that match the search term in any of the specified fields
    return data.filter(row => {
      // Skip null/undefined rows
      if (!row || typeof row !== 'object') return false;
      
      return searchFields.some(field => {
        const value = row[field];
        if (value == null) return false;
        return String(value).toLowerCase().includes(searchTerm);
      });
    });
  }, [data, displayFields, filtering, filterFields, debouncedFilter]);
  
  // Handle filter change
  React.useEffect(() => {
    if (onFilterChanged && filtering) {
      onFilterChanged({ filterValue: debouncedFilter, matchingData: filteredData });
    }
  }, [debouncedFilter, filteredData, onFilterChanged, filtering]);
  
  // Selection configuration
  const rowSelection = selectionMode !== 'none' ? {
    type: selectionMode === 'radio' ? 'radio' : 'checkbox',
    selectedRowKeys,
    onChange: (keys, rows) => {
      setSelectedRowKeys(keys);
      if (onSelectionChanged) {
        onSelectionChanged({ selectedRows: rows });
      }
    },
    ...(selectionMode === 'row' ? {
      onSelect: (record) => {
        const key = record.key || record.ID || record.id;
        const isSelected = selectedRowKeys.includes(key);
        const newKeys = isSelected 
          ? selectedRowKeys.filter(k => k !== key)
          : [...selectedRowKeys, key];
        setSelectedRowKeys(newKeys);
        if (onSelectionChanged) {
          const rows = filteredData.filter(r => 
            newKeys.includes(r.key || r.ID || r.id)
          );
          onSelectionChanged({ selectedRows: rows });
        }
      }
    } : {})
  } : undefined;
  
  // Pagination configuration
  const pagination = paging ? {
    current: currentPage,
    pageSize: currentPageSize,
    total: filteredData.length,
    showSizeChanger: showPageSizeChanger,
    pageSizeOptions: ['5', '10', '20', '50', '100'],
    showTotal: (total, range) => `${range?.[0] ?? 0}-${range?.[1] ?? 0} of ${total}`,
    onChange: (page, newPageSize) => {
      setCurrentPage(page);
      if (newPageSize !== currentPageSize) {
        setCurrentPageSize(newPageSize);
      }
      if (onPageChanged) {
        const startIdx = (page - 1) * (newPageSize || currentPageSize);
        const endIdx = Math.min(startIdx + (newPageSize || currentPageSize), filteredData.length);
        onPageChanged({
          pageNumber: page - 1,
          pageSize: newPageSize || currentPageSize,
          visibleRows: filteredData.slice(startIdx, endIdx)
        });
      }
    },
    onShowSizeChange: (current, size) => {
      setCurrentPageSize(size);
      setCurrentPage(1); // Reset to first page when changing page size
      if (onPageChanged) {
        const endIdx = Math.min(size, filteredData.length);
        onPageChanged({
          pageNumber: 0,
          pageSize: size,
          visibleRows: filteredData.slice(0, endIdx)
        });
      }
    }
  } : false;
  
  // Handle table sort change
  const handleTableChange = (pag, filters, sorter) => {
    if (sorter && onSortChanged) {
      setSortConfig(sorter);

      // Three-state sorting: ascend -> descend -> undefined (clear)
      if (sorter.order) {
        // Valid sort order (ascend or descend)
        onSortChanged({
          sortState: {
            column: sorter.field,
            direction: sorter.order === 'ascend' ? 'asc' : 'desc'
          }
        });
      } else if (sorter.field) {
        // sorter.order is undefined - user clicked third time to clear sort
        onSortChanged({
          sortState: {
            column: sorter.field,
            direction: null // Signal to clear sort
          }
        });
      }
    }
  };

  // Handle row click with cancelable event pattern
  const handleRowClick = (record) => {
    // Create event object with cancel property (cancelable event pattern)
    const rowClickEvent = {
      record: record,
      cancel: false
    };

    // Always call onRowClick first if provided (allows custom handling + optional cancellation)
    if (onRowClick) {
      onRowClick(rowClickEvent);
    }

    // If the event was cancelled, don't execute default behavior
    if (rowClickEvent.cancel) {
      return;
    }

    // Default behavior: If entityName and entityPrimaryKeys are provided, open the record
    if (entityName && entityPrimaryKeys && Array.isArray(entityPrimaryKeys) && entityPrimaryKeys.length > 0 && callbacks?.OpenEntityRecord) {
      try {
        // Build the key-value pairs for OpenEntityRecord
        const keyValues = entityPrimaryKeys.map(fieldName => ({
          FieldName: fieldName,
          Value: record[fieldName]
        }));

        // Check that all primary key values exist
        const hasAllKeys = keyValues.every(kv => kv.Value != null);
        if (hasAllKeys) {
          callbacks.OpenEntityRecord(entityName, keyValues);
        } else {
          console.warn('[DataGrid] Cannot open record: missing primary key values', {
            entityName,
            entityPrimaryKeys,
            record
          });
        }
      } catch (err) {
        console.error('[DataGrid] Error opening record:', err);
      }
    }
  };
  
  // Add keys to data for row selection
  // React tables need a unique key for each row to track selection state
  const dataWithKeys = React.useMemo(() => {
    // Handle empty/null data gracefully
    if (!filteredData || !Array.isArray(filteredData)) {
      return [];
    }
    
    return filteredData.map((row, index) => ({
      ...row,
      // Use existing key, ID fields, or fall back to index
      key: row?.key || row?.ID || row?.id || index
    }));
  }, [filteredData]);
  
  return (
    <div className="data-grid-component" style={{ width: '100%' }}>
      <style>{`
        .data-grid-component .ant-table-wrapper,
        .data-grid-component .ant-table,
        .data-grid-component .ant-table-tbody,
        .data-grid-component .ant-table-row,
        .data-grid-component .ant-table-cell,
        .data-grid-component .ant-table-tbody > tr {
          animation: none !important;
          transition: none !important;
        }
        .data-grid-component .ant-table-tbody > tr.ant-table-row {
          animation: none !important;
        }
        .data-grid-component * {
          animation-duration: 0s !important;
          transition-duration: 0s !important;
        }
      `}</style>
      {filtering && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <Search
              placeholder={`Search in ${filterFields ? filterFields.join(', ') : 'all fields'}`}
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              allowClear
              onClear={() => setFilterText('')}
              style={{ width: '100%' }}  // Full width to match grid
            />
            <style>{`
              .data-grid-component .ant-btn.ant-input-search-button {
                margin-top: -1px;
              }
            `}</style>
          </div>
          {debouncedFilter && (
            <Text type="secondary">
              Found {filteredData.length} matching records
            </Text>
          )}
        </Space>
      )}
      
      <Table
        columns={tableColumns}
        dataSource={dataWithKeys}
        rowSelection={rowSelection}
        pagination={pagination}
        onChange={handleTableChange}
        scroll={autoFitColumns ? undefined : { x: 'max-content' }}  // Enable horizontal scrolling only when not auto-fitting
        loading={data === null}  // Only show loading when data is explicitly null (not yet loaded)
        locale={{
          emptyText: `No ${entityName || 'records'} found`
        }}
        size="middle"
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
          style: {
            cursor: (onRowClick || (entityName && entityPrimaryKeys && callbacks?.OpenEntityRecord)) ? 'pointer' : 'default'
          }
        })}
      />
    </div>
  );
} 