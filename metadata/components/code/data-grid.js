function DataGrid({ 
  entityName,
  data,
  fields,
  sorting = true,
  paging = true,
  pageSize = 10,
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
  const [sortConfig, setSortConfig] = React.useState(null);
  const [entityInfo, setEntityInfo] = React.useState(null);
  const [expandedCells, setExpandedCells] = React.useState({}); // Track which cells are expanded

  
  // Load entity metadata if we have an entity name
  React.useEffect(() => {
    if (entityName && utilities?.md?.Entities) {
      const entity = utilities.md.Entities.find(e => e.Name === entityName);
      setEntityInfo(entity || null);
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
    approved: '#389e0d',
    complete: '#389e0d',
    completed: '#389e0d',
    success: '#389e0d',
    successful: '#389e0d',
    enabled: '#389e0d',
    published: '#389e0d',
    
    // Red colors for negative states
    inactive: '#cf1322',    // darker red
    rejected: '#cf1322',
    failed: '#cf1322',
    error: '#cf1322',
    disabled: '#cf1322',
    cancelled: '#cf1322',
    canceled: '#cf1322',
    terminated: '#cf1322',
    expired: '#cf1322',
    
    // Yellow/Orange for pending states
    pending: '#d48806',     // darker orange
    paused: '#d48806',
    temporary: '#d48806',
    draft: '#d48806',
    review: '#d48806',
    waiting: '#d48806',
    
    // Blue for informational states
    processing: '#096dd9',  // darker blue
    running: '#096dd9',
    inprogress: '#096dd9',
    'in progress': '#096dd9',
    'in-progress': '#096dd9'
  };
  
  // Fallback colors for value lists (darker for better contrast)
  const fallbackColors = [
    '#096dd9', // darker blue
    '#389e0d', // darker green
    '#d4380d', // darker orange
    '#c41d7f', // darker magenta
    '#531dab', // darker purple
    '#08979c', // darker cyan
    '#cf1322', // darker red/volcano
    '#1d39c4', // darker geekblue
    '#7cb305', // darker lime
    '#d4b106'  // darker gold
  ];
  
  // Get color for a value in a value list
  const getValueColor = (value, possibleValues) => {
    if (!value) return null;
    
    // Check common status mapping first
    const normalized = value.toString().toLowerCase().trim();
    if (statusColorMap[normalized]) {
      return statusColorMap[normalized];
    }
    
    // Use consistent color based on position in possible values
    if (possibleValues && Array.isArray(possibleValues)) {
      const index = possibleValues.findIndex(v => 
        v.Value?.toLowerCase() === normalized || v.Code?.toLowerCase() === normalized
      );
      if (index >= 0) {
        return fallbackColors[index % fallbackColors.length];
      }
    }
    
    // Hash the value to get a consistent color
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
  
  // Determine fields to display - use provided fields or extract from data
  // This handles both explicit field lists and auto-discovery from data
  const displayFields = React.useMemo(() => {
    // If fields are explicitly provided, use them
    if (fields && fields.length > 0) {
      return fields;
    }
    
    // If no fields specified, try to extract all unique keys from data
    // But gracefully handle null/undefined/empty data
    if (data && Array.isArray(data) && data.length > 0) {
      const allKeys = new Set();
      data.forEach(row => {
        if (row && typeof row === 'object') {
          Object.keys(row).forEach(key => {
            // Skip internal keys like 'key' that we add for row selection
            if (key !== 'key') {
              allKeys.add(key);
            }
          });
        }
      });
      return Array.from(allKeys);
    }
    
    // Return empty array if no fields and no data to extract from
    return [];
  }, [fields, data]);
  
  // Build columns from fields with metadata-aware formatting
  const columns = React.useMemo(() => {
    return displayFields.map(fieldName => {
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
      let displayName = fieldInfo?.DisplayName || fieldName;
      if (fieldName === '__mj_CreatedAt') {
        displayName = 'Created At';
      } else if (fieldName === '__mj_UpdatedAt') {
        displayName = 'Updated At';
      } else if (fieldName === '__mj_DeletedAt') {
        displayName = 'Deleted At';
      }
      
      return {
        title: displayName,
        dataIndex: fieldName,
        key: fieldName,
        align: align,
        width: columnWidth,
        ellipsis: false, // We'll handle ellipsis manually for click expansion
        sorter: sorting ? (a, b) => {
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
          if (value == null) return '-';
          
          // Create a unique key for this cell
          const cellKey = `${record.key || record.ID || record.id}_${fieldName}`;
          const isExpanded = expandedCells[cellKey];
          
          // Format based on field type
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
    });
  }, [displayFields, entityInfo, sorting, filtering, highlightFilterMatches, debouncedFilter, expandedCells]);
  
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
    pageSize: pageSize,
    total: filteredData.length,
    showSizeChanger: false,
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
    onChange: (page) => {
      setCurrentPage(page);
      if (onPageChanged) {
        const startIdx = (page - 1) * pageSize;
        const endIdx = Math.min(startIdx + pageSize, filteredData.length);
        onPageChanged({ 
          pageNumber: page - 1,
          visibleRows: filteredData.slice(startIdx, endIdx)
        });
      }
    }
  } : false;
  
  // Handle table sort change
  const handleTableChange = (pag, filters, sorter) => {
    if (sorter && onSortChanged) {
      setSortConfig(sorter);
      onSortChanged({ 
        sortState: {
          column: sorter.field,
          direction: sorter.order === 'ascend' ? 'asc' : 'desc'
        }
      });
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
      {filtering && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Search
            placeholder={`Search in ${filterFields ? filterFields.join(', ') : 'all fields'}`}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            allowClear
            onClear={() => setFilterText('')}
            style={{ width: '100%' }}  // Full width to match grid
          />
          {debouncedFilter && (
            <Text type="secondary">
              Found {filteredData.length} matching records
            </Text>
          )}
        </Space>
      )}
      
      <Table
        columns={columns}
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
      />
    </div>
  );
} 