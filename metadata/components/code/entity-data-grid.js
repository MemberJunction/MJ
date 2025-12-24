function EntityDataGrid({
  entityName,
  extraFilter,
  fields,
  orderBy,
  pageSize = 20,
  initialPage = 1,
  maxCachedRows = 1000,
  enablePageCache = true,
  showPageSizeChanger = true,
  enableSorting = true,
  enableFiltering = true,
  selectionMode = 'none',
  autoFitColumns = true,
  showRefreshButton = false,
  showCacheModeIndicator = false,
  warnOnPartialResults = false,
  onPageChanged,
  onDataLoaded,
  onLoadError,
  onCacheModeChanged,
  onRowClick,
  onSelectionChanged,
  onSortChanged,
  onFilterChanged,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Get DataGrid component from registry
  const { DataGrid } = components;

  // State management for adaptive caching
  const [data, setData] = React.useState(null); // Current page data for display
  const [allDataCache, setAllDataCache] = React.useState(null); // Full cache mode: all records
  const [originalDataOrder, setOriginalDataOrder] = React.useState(null); // Full cache mode: preserve original order
  const [pageCache, setPageCache] = React.useState(new Map()); // Partial cache mode: Map<pageNum, data>
  const [cacheMode, setCacheMode] = React.useState('loading'); // 'full' | 'partial' | 'loading'
  const [loading, setLoading] = React.useState(false);
  const [sortLoading, setSortLoading] = React.useState(false); // Separate loading state for sorts
  const [error, setError] = React.useState(null);
  const [currentPage, setCurrentPage] = React.useState(initialPage);
  const [currentPageSize, setCurrentPageSize] = React.useState(pageSize);
  const [totalRecords, setTotalRecords] = React.useState(null);
  const [entityInfo, setEntityInfo] = React.useState(null);
  const [currentOrderBy, setCurrentOrderBy] = React.useState(orderBy || '');
  const [defaultOrderBy, setDefaultOrderBy] = React.useState(orderBy || ''); // Track initial/default order
  const [currentSortColumn, setCurrentSortColumn] = React.useState(null); // Track active sort column
  const [currentSortDirection, setCurrentSortDirection] = React.useState(null); // Track sort direction ('asc' | 'desc')
  const [currentFilter, setCurrentFilter] = React.useState(''); // DataGrid text filter
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);
  const [showFilterWarning, setShowFilterWarning] = React.useState(false);

  // Load entity metadata
  React.useEffect(() => {
    if (!entityName || !utilities?.md?.Entities) {
      setEntityInfo(null);
      return;
    }

    const entity = utilities.md.Entities.find(e => e.Name === entityName);
    if (entity) {
      setEntityInfo(entity);
    } else {
      console.warn(`[EntityDataGrid] Entity '${entityName}' not found in metadata`);
      setEntityInfo(null);
    }
  }, [entityName, utilities]);

  // Auto-detect fields from entity metadata if not provided
  const autoDetectedFields = React.useMemo(() => {
    // If user provided fields, validate them
    if (fields) {
      if (!entityInfo?.Fields) {
        // Can't validate without metadata - return as-is
        return fields;
      }

      const validFields = [];
      const invalidFields = [];

      fields.forEach(fieldDef => {
        const fieldName = typeof fieldDef === 'string' ? fieldDef : fieldDef.field;
        const exists = entityInfo.Fields.some(f => f.Name === fieldName);

        if (exists) {
          validFields.push(fieldDef);
        } else {
          invalidFields.push(fieldName);
        }
      });

      // Log warning for invalid fields
      if (invalidFields.length > 0) {
        const availableFields = entityInfo.Fields
          .filter(f => !f.Name.startsWith('__mj') || ['__mj_CreatedAt', '__mj_UpdatedAt'].includes(f.Name))
          .map(f => f.Name)
          .join(', ');

        console.warn(
          `[EntityDataGrid] The following fields were not found in entity '${entityName}': ${invalidFields.join(', ')}.\n` +
          `Available fields: ${availableFields}`
        );
      }

      return validFields.length > 0 ? validFields : null;
    }

    // Auto-detect fields if not provided
    if (!entityInfo?.Fields) return null;

    const detectedFields = entityInfo.Fields
      .filter(f => {
        if (f.Name.startsWith('__mj') && !['__mj_CreatedAt', '__mj_UpdatedAt'].includes(f.Name)) {
          return false;
        }
        if (f.Type && ['image', 'varbinary', 'binary'].some(t => f.Type.toLowerCase().includes(t))) {
          return false;
        }
        return true;
      })
      .slice(0, 15)
      .map(f => f.Name);

    return detectedFields.length > 0 ? detectedFields : null;
  }, [entityInfo, fields, entityName]);

  // Extract just the field names from autoDetectedFields for filtering/searching
  // This handles both string arrays and ColumnDef object arrays
  const fieldNames = React.useMemo(() => {
    if (!autoDetectedFields) return [];
    return autoDetectedFields.map(fieldDef =>
      typeof fieldDef === 'string' ? fieldDef : fieldDef.field
    );
  }, [autoDetectedFields]);

  // Auto-detect primary keys from entity metadata (always use metadata, no override)
  const autoDetectedPrimaryKeys = React.useMemo(() => {
    if (!entityInfo?.Fields) return ['ID']; // Fallback to 'ID'

    const pkFields = entityInfo.Fields.filter(f => f.IsPrimaryKey).map(f => f.Name);
    return pkFields.length > 0 ? pkFields : ['ID'];
  }, [entityInfo]);

  // Transform fields into column definitions with sortable property and sortOrder state
  // This allows us to control sorting behavior while showing sort UI
  const columnDefinitions = React.useMemo(() => {
    // ALWAYS use autoDetectedFields (which has been validated)
    if (!autoDetectedFields) return null;

    // Handle mixed arrays of strings and ColumnDef objects
    return autoDetectedFields.map(fieldDef => {
      // Check if this specific element is a ColumnDef object or string
      if (typeof fieldDef === 'object' && fieldDef.field) {
        // It's a ColumnDef object - enhance it with sortable and sortOrder
        const columnSortable = fieldDef.sortable !== undefined ? fieldDef.sortable : enableSorting;

        return {
          ...fieldDef,
          sortable: columnSortable,
          sortOrder: (columnSortable && fieldDef.field === currentSortColumn)
            ? (currentSortDirection === 'asc' ? 'ascend' : 'descend')
            : undefined
        };
      } else {
        // It's a string field name - convert to column object
        const fieldName = fieldDef; // It's a string
        return {
          field: fieldName,
          sortable: enableSorting,
          sortOrder: (enableSorting && fieldName === currentSortColumn)
            ? (currentSortDirection === 'asc' ? 'ascend' : 'descend')
            : undefined
        };
      }
    });
  }, [autoDetectedFields, enableSorting, currentSortColumn, currentSortDirection]);

  // Determine default orderBy if not provided
  const effectiveOrderBy = React.useMemo(() => {
    if (currentOrderBy) return currentOrderBy;
    if (autoDetectedPrimaryKeys && autoDetectedPrimaryKeys.length > 0) {
      return autoDetectedPrimaryKeys.join(', ');
    }
    if (entityInfo?.Fields && entityInfo.Fields.length > 0) {
      return entityInfo.Fields[0].Name;
    }
    return 'ID';
  }, [currentOrderBy, autoDetectedPrimaryKeys, entityInfo]);

  // Build searchable dataset from all cached data (full + partial modes)
  const searchableData = React.useMemo(() => {
    if (cacheMode === 'full' && allDataCache) {
      // Full cache: search all loaded records
      return allDataCache;
    } else if (cacheMode === 'partial' && pageCache.size > 0) {
      // Partial cache: search all cached pages (user has visited)
      const cachedPages = Array.from(pageCache.values()).flat();

      // Remove duplicates by primary key
      const uniqueRecords = new Map();
      cachedPages.forEach(record => {
        const key = autoDetectedPrimaryKeys.map(pk => record[pk]).join('|');
        uniqueRecords.set(key, record);
      });

      return Array.from(uniqueRecords.values());
    }
    return [];
  }, [cacheMode, allDataCache, pageCache, autoDetectedPrimaryKeys]);

  // Clear caches when key parameters change
  React.useEffect(() => {
    setAllDataCache(null);
    setPageCache(new Map());
    setCacheMode('loading');
    setCurrentPage(1);
    setShowFilterWarning(false);
  }, [entityName, extraFilter, refreshTrigger]);

  // Initial data load - determines cache mode
  React.useEffect(() => {
    if (!entityName || !utilities?.rv) {
      setError('Missing required utilities or entityName');
      setData([]);
      setCacheMode('partial');
      return;
    }

    const loadInitialData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Set default order if not already set (for three-state sort)
        if (!defaultOrderBy) {
          setDefaultOrderBy(effectiveOrderBy);
        }

        // Load maxCachedRows to determine cache mode
        const runViewParams = {
          EntityName: entityName,
          ExtraFilter: extraFilter || '',
          OrderBy: effectiveOrderBy,
          ResultType: 'simple', // Use 'simple' for plain objects, not entity instances
          MaxRows: maxCachedRows,
          Skip: 0
        };

        const result = await utilities.rv.RunView(runViewParams);

        if (result && result.Success) {
          const loadedData = result.Results || [];
          // Use TotalRowCount which is the total matching records (not limited by MaxRows)
          // RowCount is just the number of rows returned in this specific result
          const totalCount = result.TotalRowCount != null ? result.TotalRowCount : (result.RowCount != null ? result.RowCount : loadedData.length);

          setTotalRecords(totalCount);

          // Determine cache mode based on total records vs maxCachedRows
          if (totalCount <= maxCachedRows) {
            // FULL CACHE MODE: We have all the data
            setCacheMode('full');
            setAllDataCache(loadedData);
            setOriginalDataOrder(loadedData); // Preserve original order for clear sort
            setData(loadedData.slice(0, currentPageSize));
            setPageCache(new Map());

            if (onCacheModeChanged) {
              onCacheModeChanged({
                cacheMode: 'full',
                totalRecords: totalCount,
                maxCachedRows: maxCachedRows
              });
            }
          } else {
            // PARTIAL CACHE MODE: More data exists on server
            setCacheMode('partial');
            setAllDataCache(null);

            // Cache all loaded pages (not just the first page)
            // We loaded maxCachedRows records, so cache them all for searching
            if (enablePageCache) {
              const newPageCache = new Map();
              const totalPages = Math.ceil(loadedData.length / currentPageSize);

              for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const startIdx = (pageNum - 1) * currentPageSize;
                const endIdx = Math.min(startIdx + currentPageSize, loadedData.length);
                const pageData = loadedData.slice(startIdx, endIdx);
                newPageCache.set(pageNum, pageData);
              }

              setPageCache(newPageCache);
            }

            // Display first page
            const firstPageData = loadedData.slice(0, currentPageSize);
            setData(firstPageData);

            if (onCacheModeChanged) {
              onCacheModeChanged({
                cacheMode: 'partial',
                totalRecords: totalCount,
                maxCachedRows: maxCachedRows
              });
            }
          }

          if (onDataLoaded) {
            onDataLoaded({
              data: loadedData,
              totalRecords: totalCount,
              pageNumber: 1,
              pageSize: currentPageSize,
              cacheMode: totalCount <= maxCachedRows ? 'full' : 'partial'
            });
          }
        } else {
          const errorMsg = result?.ErrorMessage || 'Failed to load data';
          setError(errorMsg);
          setData([]);
          setCacheMode('partial');

          if (onLoadError) {
            onLoadError({
              error: errorMsg,
              extraFilter: extraFilter,
              entityName: entityName
            });
          }
        }
      } catch (err) {
        const errorMsg = err.message || 'Network error occurred';
        setError(errorMsg);
        setData([]);
        setCacheMode('partial');

        if (onLoadError) {
          onLoadError({
            error: errorMsg,
            extraFilter: extraFilter,
            entityName: entityName
          });
        }
      } finally {
        setLoading(false);
        setSortLoading(false); // Clear sort loading state
      }
    };

    loadInitialData();
  }, [entityName, extraFilter, effectiveOrderBy, refreshTrigger, maxCachedRows, utilities]);

  // Handle pagination in different cache modes
  React.useEffect(() => {
    // Skip if initial load hasn't completed
    if (cacheMode === 'loading') return;

    const loadPageData = async () => {
      if (cacheMode === 'full') {
        // FULL CACHE MODE: Slice from allDataCache
        if (!allDataCache || allDataCache.length === 0) return; // Guard: wait for cache to be populated

        const startIdx = (currentPage - 1) * currentPageSize;
        const endIdx = startIdx + currentPageSize;
        const pageData = allDataCache.slice(startIdx, endIdx);
        setData(pageData);

        if (onPageChanged) {
          onPageChanged({
            pageNumber: currentPage,
            pageSize: currentPageSize,
            totalRecords: totalRecords,
            totalPages: Math.ceil((totalRecords || 0) / currentPageSize),
            visibleRows: pageData,
            cacheMode: 'full',
            cacheHit: true
          });
        }
      } else {
        // PARTIAL CACHE MODE: Check cache or fetch from server
        const cacheHit = enablePageCache && pageCache.has(currentPage);

        if (cacheHit) {
          // Use cached page
          const cachedPage = pageCache.get(currentPage);
          setData(cachedPage);

          if (onPageChanged) {
            onPageChanged({
              pageNumber: currentPage,
              pageSize: currentPageSize,
              totalRecords: totalRecords,
              totalPages: totalRecords ? Math.ceil(totalRecords / currentPageSize) : null,
              visibleRows: cachedPage,
              cacheMode: 'partial',
              cacheHit: true
            });
          }
        } else {
          // Fetch page from server
          setLoading(true);

          try {
            const skipRecords = (currentPage - 1) * currentPageSize;
            const result = await utilities.rv.RunView({
              EntityName: entityName,
              ExtraFilter: extraFilter || '',
              OrderBy: effectiveOrderBy,
              ResultType: 'simple', // Use 'simple' for plain objects, not entity instances
              MaxRows: currentPageSize,
              Skip: skipRecords
            });

            if (result && result.Success) {
              const pageData = result.Results || [];
              setData(pageData);

              // Cache this page (with LRU eviction if needed)
              if (enablePageCache) {
                const newCache = new Map(pageCache);
                newCache.set(currentPage, pageData);

                // LRU eviction: Keep only last 10 pages
                if (newCache.size > 10) {
                  const firstKey = newCache.keys().next().value;
                  newCache.delete(firstKey);
                }

                setPageCache(newCache);
              }

              if (onPageChanged) {
                onPageChanged({
                  pageNumber: currentPage,
                  pageSize: currentPageSize,
                  totalRecords: totalRecords,
                  totalPages: totalRecords ? Math.ceil(totalRecords / currentPageSize) : null,
                  visibleRows: pageData,
                  cacheMode: 'partial',
                  cacheHit: false
                });
              }
            }
          } catch (err) {
            console.error('[EntityDataGrid] Error loading page:', err);
          } finally {
            setLoading(false);
          }
        }
      }
    };

    loadPageData();
  }, [currentPage, cacheMode]); // Intentionally minimal deps - page changes only

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage < 1) return;
    const maxPage = totalRecords ? Math.ceil(totalRecords / currentPageSize) : Infinity;
    if (newPage > maxPage) return;

    setCurrentPage(newPage);
  };

  // Handle page size change
  const handlePageSizeChange = (newSize) => {
    setCurrentPageSize(newSize);
    setCurrentPage(1);

    // In full cache mode, just re-slice the data
    if (cacheMode === 'full' && allDataCache) {
      setData(allDataCache.slice(0, newSize));
    }
    // In partial cache mode, clear page cache and reload
    else if (cacheMode === 'partial') {
      setPageCache(new Map());
      setRefreshTrigger(prev => prev + 1);
    }
  };

  // Handle sorting (three-state: asc -> desc -> clear)
  const handleSort = (sortInfo) => {
    if (!sortInfo || !sortInfo.sortState) return;

    const { column, direction } = sortInfo.sortState;

    // Three-state sorting logic
    if (direction === null) {
      // Third click: Clear sort and return to default order
      setCurrentSortColumn(null);
      setCurrentSortDirection(null);
      setCurrentOrderBy(defaultOrderBy);

      if (cacheMode === 'full' && originalDataOrder) {
        // Full cache: Restore original order without server reload
        setAllDataCache(originalDataOrder);
        setData(originalDataOrder.slice(0, currentPageSize));
        setCurrentPage(1);
      } else {
        // Partial mode: reload with default order from server
        setPageCache(new Map());
        setCurrentPage(1);
        setRefreshTrigger(prev => prev + 1);
      }
    } else {
      // First or second click: Apply sort
      const newOrderBy = `${column} ${direction === 'asc' ? 'ASC' : 'DESC'}`;

      // Update sort state for UI tracking
      setCurrentSortColumn(column);
      setCurrentSortDirection(direction);

      if (cacheMode === 'full' && allDataCache) {
        // CLIENT-SIDE SORT: Sort allDataCache and update display
        const sorted = [...allDataCache].sort((a, b) => {
          const valA = a[column];
          const valB = b[column];

          if (valA == null) return 1;
          if (valB == null) return -1;

          if (typeof valA === 'string') {
            const cmp = valA.localeCompare(valB);
            return direction === 'asc' ? cmp : -cmp;
          }

          return direction === 'asc' ? valA - valB : valB - valA;
        });

        setAllDataCache(sorted);
        const startIdx = (currentPage - 1) * currentPageSize;
        setData(sorted.slice(startIdx, startIdx + currentPageSize));
      } else {
        // PARTIAL CACHE MODE: Server-side sort
        // Show loading overlay while keeping data visible for better UX
        setSortLoading(true);
        setCurrentOrderBy(newOrderBy);
        setPageCache(new Map());
        setCurrentPage(1);
        setRefreshTrigger(prev => prev + 1);
      }
    }

    if (onSortChanged) {
      onSortChanged(sortInfo);
    }
  };

  // Handle DataGrid text filter
  const handleFilter = (filterInfo) => {
    const filterValue = filterInfo?.filterValue || '';
    setCurrentFilter(filterValue);

    if (filterValue && searchableData.length > 0) {
      // FILTER ACROSS ALL CACHED DATA (both full and partial modes)
      const filtered = searchableData.filter(row => {
        return fieldNames.some(fieldName => {
          const value = row[fieldName];
          return value != null && String(value).toLowerCase().includes(filterValue.toLowerCase());
        });
      });

      setData(filtered.slice(0, currentPageSize));
      setCurrentPage(1); // Reset to first page of filtered results

      // Show warning in partial cache mode if not all records are cached
      if (cacheMode === 'partial' && totalRecords > searchableData.length) {
        setShowFilterWarning(true);
      } else {
        setShowFilterWarning(false);
      }
    } else {
      // No filter: restore original view for current page
      if (cacheMode === 'full' && allDataCache) {
        const startIdx = (currentPage - 1) * currentPageSize;
        const endIdx = startIdx + currentPageSize;
        setData(allDataCache.slice(startIdx, endIdx));
      } else if (cacheMode === 'partial' && pageCache.has(currentPage)) {
        setData(pageCache.get(currentPage));
      }
      setShowFilterWarning(false);
    }

    if (onFilterChanged) {
      onFilterChanged(filterInfo);
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    setAllDataCache(null);
    setPageCache(new Map());
    setCurrentPage(1);
    setShowFilterWarning(false);
    setRefreshTrigger(prev => prev + 1);
  };

  // Calculate pagination info
  const paginationInfo = React.useMemo(() => {
    const totalPages = totalRecords != null && currentPageSize > 0
      ? Math.ceil(totalRecords / currentPageSize)
      : null;

    const hasPrevious = currentPage > 1;
    const hasNext = cacheMode === 'full'
      ? (allDataCache && ((currentPage * currentPageSize) < allDataCache.length))
      : (totalPages != null ? currentPage < totalPages : (data && data.length === currentPageSize));

    const startRecord = totalRecords != null && totalRecords > 0
      ? ((currentPage - 1) * currentPageSize) + 1
      : 0;

    const endRecord = cacheMode === 'full'
      ? Math.min(currentPage * currentPageSize, allDataCache?.length || 0)
      : (totalRecords != null
          ? Math.min(currentPage * currentPageSize, totalRecords)
          : (data ? ((currentPage - 1) * currentPageSize + data.length) : 0));

    return {
      totalPages,
      hasPrevious,
      hasNext,
      startRecord,
      endRecord
    };
  }, [currentPage, currentPageSize, totalRecords, data, cacheMode, allDataCache]);

  // Render error state
  if (error) {
    return (
      <div style={{
        padding: '24px',
        border: '1px solid #ff4d4f',
        borderRadius: '4px',
        backgroundColor: '#fff2f0',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '48px',
          color: '#ff4d4f',
          marginBottom: '16px'
        }}>
          ⚠️
        </div>
        <div style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#cf1322',
          marginBottom: '8px'
        }}>
          Unable to Load Data
        </div>
        <div style={{
          fontSize: '14px',
          color: '#595959',
          marginBottom: '4px'
        }}>
          {error}
        </div>
        {extraFilter && (
          <div style={{
            fontSize: '12px',
            color: '#8c8c8c',
            marginTop: '8px',
            fontFamily: 'monospace',
            backgroundColor: '#fafafa',
            padding: '8px',
            borderRadius: '4px',
            display: 'inline-block'
          }}>
            Filter: {extraFilter}
          </div>
        )}
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={handleRefresh}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  // Render initial loading state
  if (cacheMode === 'loading' || (loading && data === null)) {
    return (
      <div style={{
        padding: '60px 24px',
        textAlign: 'center',
        color: '#595959'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '16px',
          animation: 'spin 1s linear infinite'
        }}>
          ⏳
        </div>
        <div style={{ fontSize: '16px' }}>
          Loading {entityName || 'records'}...
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Check for DataGrid component
  if (!DataGrid) {
    return (
      <div style={{
        padding: '24px',
        border: '1px solid #ff4d4f',
        borderRadius: '4px',
        backgroundColor: '#fff2f0',
        color: '#cf1322',
        textAlign: 'center'
      }}>
        Error: DataGrid component not found. Please ensure DataGrid is properly registered.
      </div>
    );
  }

  // Render success state with DataGrid
  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {/* Cache Mode Indicator */}
      {showCacheModeIndicator && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: cacheMode === 'full' ? '#f6ffed' : '#fff7e6',
          border: `1px solid ${cacheMode === 'full' ? '#b7eb8f' : '#ffd591'}`,
          borderRadius: '4px',
          fontSize: '13px',
          color: cacheMode === 'full' ? '#389e0d' : '#d48806',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>
            {cacheMode === 'full'
              ? `✓ All ${totalRecords?.toLocaleString() || 0} records loaded (instant sort/filter)`
              : `Showing first ${maxCachedRows.toLocaleString()} of ${totalRecords?.toLocaleString() || '?'} records`}
          </span>
          {showRefreshButton && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: '1px solid currentColor',
                borderRadius: '3px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                color: 'inherit'
              }}
            >
              🔄 Refresh
            </button>
          )}
        </div>
      )}

      {/* Partial Results Warning */}
      {cacheMode === 'partial' && warnOnPartialResults && (
        <div style={{
          marginBottom: '12px',
          padding: '12px 16px',
          backgroundColor: '#fffbe6',
          border: '1px solid #ffe58f',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          <div style={{ fontWeight: 600, color: '#d46b08', marginBottom: '4px' }}>
            ⚠️ Viewing Partial Results
          </div>
          <div style={{ color: '#8c6c00' }}>
            Loading {totalRecords?.toLocaleString()} records in paginated mode. Sorting and text search operate on current page only. For full-dataset operations, use 'extraFilter' to reduce total records or increase 'maxCachedRows'.
          </div>
        </div>
      )}

      {/* Text Filter Warning in Partial Mode */}
      {showFilterWarning && cacheMode === 'partial' && (
        <div style={{
          marginBottom: '12px',
          padding: '12px 16px',
          backgroundColor: '#e6f7ff',
          border: '1px solid #91d5ff',
          borderRadius: '4px',
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 600, color: '#0050b3', marginBottom: '4px' }}>
              🔍 Searching {searchableData.length.toLocaleString()} of {totalRecords?.toLocaleString()} records
            </div>
            <div style={{ color: '#096dd9' }}>
              Text search filters cached data only. Some matches may not be visible.
              Component designers can increase 'maxCachedRows' or use 'extraFilter' for complete database-level search.
            </div>
          </div>
          <button
            onClick={() => setShowFilterWarning(false)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              color: '#096dd9'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* DataGrid with loaded data - wrapped in relative container for loading overlay */}
      <div style={{ position: 'relative' }}>
        <DataGrid
          data={data}
          entityName={entityName}
          entityPrimaryKeys={autoDetectedPrimaryKeys}
          columns={columnDefinitions}
          sorting={false} // Disable DataGrid's internal sorting - we handle it via onSortChanged
          paging={false} // We handle pagination ourselves
          filtering={enableFiltering}
          selectionMode={selectionMode}
          autoFitColumns={autoFitColumns}
          onRowClick={onRowClick}
          onSelectionChanged={onSelectionChanged}
          onSortChanged={enableSorting ? handleSort : undefined}
          onFilterChanged={handleFilter}
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
          savedUserSettings={savedUserSettings}
          onSaveUserSettings={onSaveUserSettings}
        />

        {/* Subtle loading overlay during sorts - keeps data visible */}
        {sortLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10
          }}>
            <div style={{
              padding: '16px 24px',
              backgroundColor: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '20px',
                height: '20px',
                border: '3px solid #f0f0f0',
                borderTop: '3px solid #1890ff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <span style={{ fontSize: '14px', color: '#595959' }}>Sorting...</span>
            </div>
          </div>
        )}

        {/* Add keyframe animation for spinner */}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* Custom pagination controls */}
      <div style={{
        marginTop: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0',
        borderTop: '1px solid #f0f0f0'
      }}>
        {/* Pagination info */}
        <div style={{ fontSize: '14px', color: '#595959' }}>
          {totalRecords != null ? (
            <span>
              {paginationInfo.startRecord}-{paginationInfo.endRecord} of {totalRecords.toLocaleString()} {entityName || 'records'}
            </span>
          ) : (
            <span>
              Showing {data?.length || 0} {entityName || 'records'}
            </span>
          )}
        </div>

        {/* Pagination controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Page size selector */}
          {showPageSizeChanger && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', color: '#595959' }}>Show:</span>
              <select
                value={currentPageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          )}

          {/* Previous button */}
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!paginationInfo.hasPrevious || loading}
            style={{
              padding: '6px 12px',
              backgroundColor: paginationInfo.hasPrevious && !loading ? '#fff' : '#f5f5f5',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              cursor: paginationInfo.hasPrevious && !loading ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              color: paginationInfo.hasPrevious && !loading ? '#262626' : '#bfbfbf'
            }}
          >
            ← Previous
          </button>

          {/* Page indicator */}
          <span style={{ fontSize: '14px', color: '#262626', fontWeight: 500 }}>
            Page {currentPage}
            {paginationInfo.totalPages != null && (
              <span style={{ color: '#8c8c8c' }}> of {paginationInfo.totalPages}</span>
            )}
          </span>

          {/* Next button */}
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!paginationInfo.hasNext || loading}
            style={{
              padding: '6px 12px',
              backgroundColor: paginationInfo.hasNext && !loading ? '#fff' : '#f5f5f5',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              cursor: paginationInfo.hasNext && !loading ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              color: paginationInfo.hasNext && !loading ? '#262626' : '#bfbfbf'
            }}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Loading overlay for page changes in partial mode */}
      {loading && data !== null && cacheMode === 'partial' && (
        <div style={{
          position: 'absolute',
          top: showCacheModeIndicator ? '60px' : '0',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          borderRadius: '4px'
        }}>
          <div style={{
            padding: '16px 32px',
            backgroundColor: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: '14px',
            color: '#595959'
          }}>
            ⏳ Loading page {currentPage}...
          </div>
        </div>
      )}
    </div>
  );
}
