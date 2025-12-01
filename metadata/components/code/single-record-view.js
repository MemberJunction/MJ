function SingleRecordView({
  record,
  entityName,
  fields,
  layout = 'list',
  showLabels = true,
  labelWidth = 150,
  dateFormat = 'short',
  showEmptyFields = false,
  maxTextLength = 200,
  highlightFields = [],
  allowOpenRecord = false,
  onFieldClicked,
  onOpenRecord,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  const [entityInfo, setEntityInfo] = React.useState(null);

  // Get OpenRecordButton component from registry if needed
  const { OpenRecordButton } = components;
  const shouldShowOpenButton = allowOpenRecord && OpenRecordButton;
  
  // Handle open record button click with cancelable event - moved outside useMemo
  const handleOpenRecordClick = React.useCallback((recordToOpen, entityNameToOpen) => {
    console.log('handleOpenRecordClick called for:', entityNameToOpen, recordToOpen);
    
    // Get primary keys from entity metadata
    let primaryKeys = [];
    if (entityInfo) {
      // Handle different PrimaryKey structures in MJ metadata
      let primaryKeyFields = [];
      
      if (entityInfo.PrimaryKey) {
        if (entityInfo.PrimaryKey.Columns && Array.isArray(entityInfo.PrimaryKey.Columns)) {
          // Multi-column primary key
          primaryKeyFields = entityInfo.PrimaryKey.Columns;
        } else if (entityInfo.PrimaryKey.Name) {
          // Single column primary key with Name property
          primaryKeyFields = [entityInfo.PrimaryKey.Name];
        } else if (typeof entityInfo.PrimaryKey === 'string') {
          // Primary key as string
          primaryKeyFields = [entityInfo.PrimaryKey];
        }
      }
      
      // Fallback to ID if no primary key found
      if (primaryKeyFields.length === 0) {
        primaryKeyFields = ['ID'];
      }
      
      primaryKeys = primaryKeyFields.map(fieldName => ({
        FieldName: fieldName,
        Value: recordToOpen[fieldName]
      }));
    }
    
    // Create cancelable event object
    const eventData = {
      record: recordToOpen,
      entityName: entityNameToOpen,
      cancel: false, // Parent can set this to true to cancel
      primaryKeys // Populated with actual primary key values
    };
    
    // Fire the event if handler exists
    if (onOpenRecord) {
      onOpenRecord(eventData);
    }
    
    // Check if the event was canceled
    if (eventData.cancel) {
      return false; // Return false to prevent default action
    }
    
    // If not canceled (or no handler), proceed with default behavior
    // Call the OpenEntityRecord callback directly
    if (callbacks && callbacks.OpenEntityRecord && primaryKeys.length > 0) {
      callbacks.OpenEntityRecord(entityNameToOpen, primaryKeys);
    } else {
      console.error('Unable to open record - missing callback or primary keys', {
        hasCallbacks: !!callbacks,
        hasOpenEntityRecord: !!(callbacks && callbacks.OpenEntityRecord),
        primaryKeysLength: primaryKeys.length
      });
    }
    
    return true;
  }, [entityInfo, onOpenRecord, callbacks]);
  
  // Create wrapped OpenRecordButton with intercepted click
  const WrappedOpenRecordButton = React.useMemo(() => {
    if (!OpenRecordButton) return null;
    
    return (props) => {
      const handleWrapperClick = (e) => {
        // Stop all propagation first
        e.preventDefault();
        e.stopPropagation();
        
        // Call the centralized handler
        handleOpenRecordClick(props.record, props.entityName);
      };
      
      return (
        <div 
          onClick={handleWrapperClick} 
          style={{ 
            display: 'inline-block',
            cursor: 'pointer'
          }}
        >
          {/* Render a button that looks like OpenRecordButton but doesn't have onClick */}
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'none',
              pointerEvents: 'none' // Prevent button from handling clicks
            }}
          >
            {props.text || 'Open Record'}
            <span style={{ fontSize: '14px' }}>↗</span>
          </button>
        </div>
      );
    };
  }, [OpenRecordButton, handleOpenRecordClick]);
  
  // Load entity metadata
  React.useEffect(() => {
    if (!entityName || !utilities?.md?.Entities) return;
    
    const entity = utilities.md.Entities.find(e => e.Name === entityName);
    if (entity) {
      setEntityInfo(entity);
    }
  }, [entityName, utilities]);
  
  // Format value based on field type
  const formatValue = (value, fieldInfo) => {
    if (value == null || value === '') {
      return showEmptyFields ? <span style={{ color: '#999', fontStyle: 'italic' }}>Empty</span> : null;
    }
    
    // Handle different field types
    if (fieldInfo) {
      // Boolean fields
      if (fieldInfo.Type === 'bit') {
        return value ? '✓ Yes' : '✗ No';
      }
      
      // Date fields
      if (fieldInfo.Type === 'datetime' || fieldInfo.Type === 'date') {
        try {
          const date = new Date(value);
          if (isNaN(date.getTime())) return value;
          
          if (dateFormat === 'long') {
            return date.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
          } else if (dateFormat === 'relative') {
            const now = new Date();
            const diff = now - date;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            if (days === 0) return 'Today';
            if (days === 1) return 'Yesterday';
            if (days < 7) return `${days} days ago`;
            if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
            if (days < 365) return `${Math.floor(days / 30)} months ago`;
            return `${Math.floor(days / 365)} years ago`;
          } else {
            return date.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            });
          }
        } catch {
          return value;
        }
      }
      
      // Number fields
      if (fieldInfo.Type === 'int' || fieldInfo.Type === 'bigint') {
        return parseInt(value).toLocaleString();
      }
      
      // Decimal/currency fields
      if (fieldInfo.Type === 'decimal' || fieldInfo.Type === 'float' || fieldInfo.Type === 'money') {
        const num = parseFloat(value);
        // Check if field name suggests currency
        if (fieldInfo.Name.toLowerCase().includes('amount') || 
            fieldInfo.Name.toLowerCase().includes('price') ||
            fieldInfo.Name.toLowerCase().includes('cost') ||
            fieldInfo.Type === 'money') {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(num);
        }
        return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
    
    // Text fields - truncate if needed
    if (typeof value === 'string' && value.length > maxTextLength) {
      return (
        <span title={value}>
          {value.substring(0, maxTextLength)}...
        </span>
      );
    }
    
    return value;
  };
  
  // Get fields to display
  const getDisplayFields = () => {
    if (fields && fields.length > 0) {
      return fields;
    }
    
    // Auto-select fields if not specified
    if (!record) return [];
    
    return Object.keys(record).filter(key => 
      !key.startsWith('__mj') && 
      key !== 'ID' &&
      typeof record[key] !== 'object'
    );
  };
  
  // Get field info from entity
  const getFieldInfo = (fieldName) => {
    if (!entityInfo || !entityInfo.Fields) return null;
    return entityInfo.Fields.find(f => f.Name === fieldName);
  };
  
  // Handle field click
  const handleFieldClick = (fieldName, value) => {
    if (onFieldClicked) {
      const fieldInfo = getFieldInfo(fieldName);
      onFieldClicked({ 
        fieldName, 
        value, 
        fieldType: fieldInfo?.Type,
        record 
      });
    }
  };
  
  
  // Render field based on layout
  const renderField = (fieldName) => {
    const fieldInfo = getFieldInfo(fieldName);
    const value = record[fieldName];
    const formattedValue = formatValue(value, fieldInfo);
    
    if (!showEmptyFields && !formattedValue) return null;
    
    const isHighlighted = highlightFields.includes(fieldName);
    const label = fieldInfo?.DisplayName || fieldName;
    
    const fieldStyle = {
      cursor: onFieldClicked ? 'pointer' : 'default'
    };
    
    const highlightStyle = isHighlighted ? {
      backgroundColor: '#fffbe6',
      padding: '4px 8px',
      borderRadius: '4px',
      border: '1px solid #ffe58f'
    } : {};
    
    if (layout === 'list' 
        || layout === 'card') {
      return (
        <div 
          key={fieldName}
          style={{ 
            marginBottom: '12px',
            ...highlightStyle
          }}
          onClick={() => handleFieldClick(fieldName, value)}
        >
          {showLabels && (
            <div style={{ 
              fontWeight: 500, 
              color: '#666', 
              fontSize: '12px',
              marginBottom: '4px',
              textTransform: 'uppercase'
            }}>
              {label}
            </div>
          )}
          <div style={{ 
            fontSize: '14px', 
            color: '#333',
            ...fieldStyle
          }}>
            {formattedValue || '-'}
          </div>
        </div>
      );
    }
    
    if (layout === 'table') {
      return (
        <tr 
          key={fieldName}
          style={highlightStyle}
          onClick={() => handleFieldClick(fieldName, value)}
        >
          {showLabels && (
            <td style={{ 
              fontWeight: 500, 
              color: '#666', 
              fontSize: '14px',
              padding: '8px',
              width: labelWidth,
              verticalAlign: 'top'
            }}>
              {label}
            </td>
          )}
          <td style={{ 
            fontSize: '14px', 
            color: '#333',
            padding: '8px',
            ...fieldStyle
          }}>
            {formattedValue || '-'}
          </td>
        </tr>
      );
    }
    
    if (layout === 'inline') {
      return (
        <span 
          key={fieldName}
          style={{ 
            marginRight: '20px',
            display: 'inline-block',
            ...highlightStyle
          }}
          onClick={() => handleFieldClick(fieldName, value)}
        >
          {showLabels && (
            <span style={{ 
              fontWeight: 500, 
              color: '#666', 
              fontSize: '12px',
              marginRight: '4px'
            }}>
              {label}:
            </span>
          )}
          <span style={{ 
            fontSize: '14px', 
            color: '#333',
            ...fieldStyle
          }}>
            {formattedValue || '-'}
          </span>
        </span>
      );
    }
    
    return null;
  };
  
  // No record provided
  if (!record) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        color: '#999' 
      }}>
        No record to display
      </div>
    );
  }
  
  const displayFields = getDisplayFields();
  
  // Render based on layout
  if (layout === 'card') {
    return (
      <div style={{
        border: '1px solid #d9d9d9',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        {displayFields.map(renderField)}
        {allowOpenRecord && WrappedOpenRecordButton && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
            <WrappedOpenRecordButton
              record={record}
              entityName={entityName}
              variant="primary"
              size="medium"
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
              savedUserSettings={savedUserSettings}
              onSaveUserSettings={onSaveUserSettings}
            />
          </div>
        )}
      </div>
    );
  }
  
  if (layout === 'table') {
    return (
      <div>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse'
        }}>
          <tbody>
            {displayFields.map(renderField)}
          </tbody>
        </table>
        {allowOpenRecord && WrappedOpenRecordButton && (
          <div style={{ marginTop: '12px' }}>
            <WrappedOpenRecordButton
              record={record}
              entityName={entityName}
              variant="default"
              size="medium"
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
              savedUserSettings={savedUserSettings}
              onSaveUserSettings={onSaveUserSettings}
            />
          </div>
        )}
      </div>
    );
  }
  
  if (layout === 'inline') {
    return (
      <div style={{
        padding: '8px',
        lineHeight: '1.8'
      }}>
        {displayFields.map(renderField)}
        {allowOpenRecord && WrappedOpenRecordButton && (
          <span style={{ marginLeft: '20px', display: 'inline-block' }}>
            <WrappedOpenRecordButton
              record={record}
              entityName={entityName}
              variant="link"
              size="small"
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
              savedUserSettings={savedUserSettings}
              onSaveUserSettings={onSaveUserSettings}
            />
          </span>
        )}
      </div>
    );
  }
  
  // Default list layout
  return (
    <div style={{ padding: '8px' }}>
      {displayFields.map(renderField)}
      {shouldShowOpenButton && (
        <div style={{ marginTop: '12px' }}>
          <OpenRecordButton
            record={record}
            entityName={entityName}
            variant="default"
            size="medium"
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings}
            onSaveUserSettings={onSaveUserSettings}
          />
        </div>
      )}
    </div>
  );
}