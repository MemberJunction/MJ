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
  exportable = true, // Built-in CSV/Excel export icon; false renders the grid without it
  exportLabel, // Export menu label and file name; defaults to entityName or 'Data'
  exportGetRows, // Replaces the exported rows, e.g. EntityDataGrid loading every matching record rather than one page
  headerStyle, // Optional header row colors: { background, color, borderColor }. Unset keeps the theme's header.
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
  // Built-in export: DataGrid renders its table inside the registry ExportableData component, which
  // gives it CSV and Excel export of every row the user's filter and sort leave, across all pages.
  // The helpers below decide the exported rows, columns and file label; they hold no React state.

  const EXPORT_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  const EXPORT_SNIFF_ROWS = 200;

  /** Export column type from a SQL field type, or null when the type is unknown. */
  function exportTypeFromFieldType(fieldType) {
    const type = (fieldType || '').toLowerCase();
    if (!type) return null;
    if (type.includes('money')) return 'currency';
    if (type === 'bit') return 'boolean';
    if (type.includes('date') || type.includes('time')) return 'date';
    if (/int|decimal|numeric|float|real/.test(type)) return 'number';
    return 'string';
  }

  /** The type every non-empty value of `field` shares (number, boolean, date), else 'string'. */
  function sniffExportType(rows, field) {
    let found = null;
    for (const row of rows.slice(0, EXPORT_SNIFF_ROWS)) {
      const value = row ? row[field] : undefined;
      if (value === null || value === undefined || value === '') continue;
      let type = 'string';
      if (typeof value === 'number') type = 'number';
      else if (typeof value === 'boolean') type = 'boolean';
      else if (value instanceof Date || (typeof value === 'string' && EXPORT_ISO_DATE_PATTERN.test(value))) type = 'date';
      if (type === 'string' || (found && found !== type)) return 'string';
      found = type;
    }
    return found || 'string';
  }

  /** One export column per displayed column, typed from entity metadata when known, else from the values. */
  function buildExportColumns(tableColumns, entityInfo, rows) {
    return tableColumns.map(column => {
      const fieldInfo = entityInfo?.Fields?.find(f => f.Name === column.dataIndex);
      const hasValueList = fieldInfo?.ValueListType === 'List' || fieldInfo?.ValueListType === 'ListOrUserEntry';
      const metadataType = hasValueList ? 'string' : exportTypeFromFieldType(fieldInfo?.Type);
      return {
        field: column.dataIndex,
        label: typeof column.title === 'string' ? column.title : String(column.dataIndex),
        type: metadataType || sniffExportType(rows, column.dataIndex)
      };
    });
  }

  /**
   * The record's primary key columns, placed first so an exported row can be found again, joined or
   * re-imported. Keys come from `entityPrimaryKeys`, else from entity metadata; a key is added only when the
   * rows carry it and the table does not already show it. Typed from metadata (a GUID stays text).
   */
  function buildKeyExportColumns(entityPrimaryKeys, entityInfo, tableColumns, rows) {
    const declared = Array.isArray(entityPrimaryKeys) && entityPrimaryKeys.length > 0
      ? entityPrimaryKeys
      : (entityInfo?.Fields || []).filter(f => f.IsPrimaryKey).map(f => f.Name);
    const shown = new Set(tableColumns.map(column => column.dataIndex));
    const sample = rows.slice(0, EXPORT_SNIFF_ROWS);
    return declared
      .filter(field => !shown.has(field) && sample.some(row => row && row[field] !== undefined))
      .map(field => {
        const fieldInfo = entityInfo?.Fields?.find(f => f.Name === field);
        return { field, label: field, type: exportTypeFromFieldType(fieldInfo?.Type) || sniffExportType(rows, field) };
      });
  }

  /**
   * The sort the table is showing: a controlled column's `sortOrder` when any column is controlled
   * (as antd does), otherwise the sorter from the table's last onChange.
   */
  function activeTableSort(tableColumns, sortConfig) {
    const controlled = tableColumns.filter(column => column.sortOrder !== undefined);
    if (controlled.length > 0) {
      const sorted = controlled.find(column => column.sortOrder === 'ascend' || column.sortOrder === 'descend');
      return sorted ? { column: sorted, order: sorted.sortOrder } : null;
    }
    const sorter = Array.isArray(sortConfig) ? sortConfig.find(Boolean) : sortConfig;
    if (!sorter || !sorter.order) return null;
    const key = sorter.columnKey !== undefined ? sorter.columnKey : sorter.field;
    const column = tableColumns.find(candidate => candidate.key === key);
    return column ? { column, order: sorter.order } : null;
  }

  /** Rows in the order the table shows them: the column's own sorter, reversed for descend (antd's rule). */
  function sortRowsLikeTable(rows, sort) {
    if (!sort || typeof sort.column.sorter !== 'function') return rows;
    const compare = sort.column.sorter;
    return rows.slice().sort((a, b) => {
      const result = compare(a, b, sort.order);
      return sort.order === 'descend' ? -result : result;
    });
  }

  /** A kebab-case export ID from the grid's label, so it is stable across renders. */
  function gridExportID(label) {
    const slug = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug ? `${slug}-grid` : 'data-grid';
  }

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
  
  // Theme tokens, with the previous hardcoded values kept as fallbacks for a host
  // that renders this component without styles.
  const themeColors = styles?.colors || {};

  // Shifts a hex color toward black (negative) or white (positive) by `pct`.
  const shade = (hex, pct) => {
    if (typeof hex !== 'string') return hex;
    const raw = hex.trim().replace('#', '');
    const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
    const int = parseInt(full, 16);
    const mix = (channel) => {
      const target = pct < 0 ? 0 : 255;
      const moved = channel + ((target - channel) * Math.abs(pct)) / 100;
      return Math.max(0, Math.min(255, Math.round(moved)));
    };
    const out = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map(mix);
    return `#${out.map(v => v.toString(16).padStart(2, '0')).join('')}`;
  };

  // Value pills render as antd <Tag color={hex}>, which puts WHITE text on a custom
  // color. A theme whose status colors are light would therefore produce white-on-light
  // and unreadable pills, so every pill color is darkened until it can carry white text.
  const darkenForWhiteText = (hex) => {
    let current = hex;
    for (let attempt = 0; attempt < 6; attempt++) {
      const raw = current.trim().replace('#', '');
      const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
      if (!/^[0-9a-fA-F]{6}$/.test(full)) return current;
      const int = parseInt(full, 16);
      const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255];
      // Perceived luminance (ITU-R BT.601), good enough to decide "too light for white".
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luminance <= 0.5) return current;
      current = shade(current, -20);
    }
    return current;
  };

  // Original per-status pill colors (darker for better contrast with white text) — the
  // exact pre-theming literals, kept for any family whose base color the theme does not supply.
  const originalStatusColors = {
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

  // Status families. When the theme supplies a family's base hue, a shade ramp keeps
  // values inside the family distinguishable the way the original palette did.
  const statusFamilies = [
    { token: 'success', statuses: ['active', 'approved', 'complete', 'completed', 'success', 'successful', 'enabled', 'published'] },
    { token: 'error', statuses: ['inactive', 'rejected', 'failed', 'error', 'disabled', 'cancelled', 'canceled'] },
    { token: 'warning', statuses: ['terminated', 'expired', 'deprecated', 'pending', 'paused', 'temporary', 'draft', 'review', 'waiting'] },
    { token: 'info', statuses: ['processing', 'running', 'inprogress', 'in progress', 'in-progress'] }
  ];

  // Only a parseable hex base can be shaded. A theme expressing a status as a named
  // CSS color ('lime') or rgb() would otherwise pass through unshaded, collapsing a
  // whole family to one color AND skipping the readability check.
  const asHex = (color) =>
    (typeof color === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim()))
      ? color.trim()
      : null;

  const statusColorMap = { ...originalStatusColors };
  statusFamilies.forEach(family => {
    const base = asHex(themeColors[family.token]);
    if (!base) return;
    const span = Math.max(1, family.statuses.length - 1);
    family.statuses.forEach((name, index) => {
      // -35% (darkest) through +15% (lightest) across the family.
      const pct = -35 + Math.round((50 * index) / span);
      statusColorMap[name] = darkenForWhiteText(shade(base, pct));
    });
  });

  // Categorical colors for arbitrary value lists. The theme's chart palette is exactly
  // this — distinct series colors — and is also where the host resolves an organization
  // default or a user-requested palette. The literal list stays as the fallback.
  const builtInFallbackColors = [
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

  const fallbackColors = (styles?.chartPalette && styles.chartPalette.length > 0)
    ? styles.chartPalette.map(darkenForWhiteText)
    : builtInFallbackColors;

  // A themed chartPalette is typically short (~10 colors); wrapping modulo would hand
  // the 11th+ distinct value a duplicate color. Overflow past the palette falls through
  // to the built-in 50-color list so distinct values keep getting distinct colors.
  const fallbackColorAt = (index) =>
    index < fallbackColors.length
      ? fallbackColors[index]
      : builtInFallbackColors[(index - fallbackColors.length) % builtInFallbackColors.length];
  const fallbackColorCount = Math.max(fallbackColors.length, builtInFallbackColors.length);

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
            colorAssignments.set(pvValue, fallbackColorAt(nextColorIndex));
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
    return fallbackColorAt(Math.abs(hash) % fallbackColorCount);
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
  // Header row colors supplied by the caller, e.g. an organization's branding. Only
  // the fields given are applied, so an unset field keeps the theme's header styling.
  const headerCellStyle = React.useMemo(() => {
    if (!headerStyle) return null;
    const style = {};
    if (headerStyle.background) style.background = headerStyle.background;
    if (headerStyle.color) style.color = headerStyle.color;
    if (headerStyle.borderColor) style.borderBottom = `2px solid ${headerStyle.borderColor}`;
    return Object.keys(style).length > 0 ? style : null;
  }, [headerStyle?.background, headerStyle?.color, headerStyle?.borderColor]);

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
        onHeaderCell: headerCellStyle ? () => ({ style: headerCellStyle }) : undefined,
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
  }, [normalizedColumns, entityInfo, sorting, filtering, highlightFilterMatches, debouncedFilter, expandedCells, styles, headerCellStyle]);
  
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
    // Tracked even without onSortChanged: the export writes rows in the order the user sees.
    if (sorter) {
      setSortConfig(sorter);
    }
    if (sorter && onSortChanged) {

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
      key: row?.key
        || (entityPrimaryKeys?.length && entityPrimaryKeys.map(k => row?.[k]).filter(v => v != null).join('_'))
        || row?.ID
        || row?.id
        || index
    }));
  }, [filteredData, entityPrimaryKeys]);
  
  // Built-in export (see the export helpers at the top of the component). Callers never wrap DataGrid in ExportableData.
  const { ExportableData } = components || {};
  const exportEnabled = exportable !== false && Boolean(ExportableData);
  const exportTitle = exportLabel || entityName || 'Data';
  const exportColumns = React.useMemo(() => {
    if (!exportEnabled) return [];
    const rows = Array.isArray(data) ? data : [];
    return [
      ...buildKeyExportColumns(entityPrimaryKeys, entityInfo, tableColumns, rows),
      ...buildExportColumns(tableColumns, entityInfo, rows)
    ];
  }, [exportEnabled, entityPrimaryKeys, tableColumns, entityInfo, data]);
  // Read at export time, so the file has every filtered row (all pages) in the order the user sees.
  const getExportRows = () => sortRowsLikeTable(filteredData, activeTableSort(tableColumns, sortConfig));

  const grid = (
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
          <div style={{ position: 'relative', paddingRight: exportEnabled ? 40 : 0 }}>
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
      
      {/* Auto-fit lets columns shrink and wrap, but an unbreakable value (an email, a tag) can still make the
          table wider than its container. Scroll inside the grid then, rather than spilling past the parent's
          border and widening the whole page. `contain: inline-size` keeps the table's width out of the parent's
          minimum size, so a flex item or grid track holding the grid shrinks to fit instead of growing; minWidth
          keeps a squeezed grid usable (240px still fits a phone-width card). With
          autoFitColumns off, antd's scroll.x scrolls the table itself. */}
      <div style={autoFitColumns ? { width: '100%', maxWidth: '100%', minWidth: 240, overflowX: 'auto', contain: 'inline-size' } : undefined}>
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
    </div>
  );

  if (!exportEnabled) return grid;
  // With a search row the export button is part of it (toolbar); without one it overlays the table's corner on hover.
  return (
    <ExportableData
      exportID={gridExportID(exportTitle)}
      label={exportTitle}
      kind="table"
      getRows={exportGetRows || getExportRows}
      columns={exportColumns}
      placement={filtering ? 'toolbar' : 'overlay'}
      style={{ width: '100%' }}
      utilities={utilities}
      styles={styles}
      components={components}
      callbacks={callbacks}
    >
      {grid}
    </ExportableData>
  );
}
