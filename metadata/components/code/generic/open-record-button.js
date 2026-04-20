function OpenRecordButton({
  record,
  entityName,
  text = 'Open Record',
  variant = 'default',
  size = 'medium',
  icon,
  showIcon = false,
  fullWidth = false,
  onRecordOpened,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // State for button interaction
  const [isHovered, setIsHovered] = React.useState(false);
  const [primaryKeyFields, setPrimaryKeyFields] = React.useState([]);
  const [entityInfo, setEntityInfo] = React.useState(null);
  
  // Load entity metadata and determine primary key fields
  React.useEffect(() => {
    if (!entityName || !utilities?.md?.Entities) {
      if (!entityName) console.error('Entity name not provided');
      if (!utilities?.md?.Entities) console.error('Entity metadata not loaded.');
      return;
    }
    
    // Find the entity in metadata
    const entity = utilities.md.Entities.find(e => e.Name === entityName);
    if (entity) {
      setEntityInfo(entity);
      
      // Get primary key fields from the entity object
      // The entity has a PrimaryKeys property that returns an array of primary key fields
      const keyFields = [];
      
      if (entity.PrimaryKeys && entity.PrimaryKeys.length > 0) {
        // Use the PrimaryKeys property from the entity
        entity.PrimaryKeys.forEach(field => {
          keyFields.push({
            FieldName: field.Name,
            DisplayName: field.DisplayName || field.Name
          });
        });
      } else if (entity.FirstPrimaryKey) {
        // Fallback to FirstPrimaryKey if available
        keyFields.push({
          FieldName: entity.FirstPrimaryKey.Name,
          DisplayName: entity.FirstPrimaryKey.DisplayName || entity.FirstPrimaryKey.Name
        });
      } else {
        // Final fallback to ID field
        keyFields.push({
          FieldName: 'ID',
          DisplayName: 'ID'
        });
      }
      
      setPrimaryKeyFields(keyFields);
    }
  }, [entityName, utilities]);
  
  // Check if we can open the record
  const canOpen = React.useMemo(() => {
    if (!record || !entityName || !callbacks?.OpenEntityRecord) return false;
    if (primaryKeyFields.length === 0) return false;
    
    // Check that all primary key fields have values
    for (const keyField of primaryKeyFields) {
      if (!record[keyField.FieldName]) {
        return false;
      }
    }
    
    return true;
  }, [record, entityName, callbacks, primaryKeyFields]);
  
  // Handle button click
  const handleClick = () => {
    if (!canOpen) return;
    
    try {
      // Build the key-value pairs for OpenEntityRecord
      const keyValues = primaryKeyFields.map(keyField => ({
        FieldName: keyField.FieldName,
        Value: record[keyField.FieldName]
      }));
      
      // Use MJ's OpenEntityRecord callback with the primary key fields
      callbacks.OpenEntityRecord(entityName, keyValues);
      
      // Fire event with details
      if (onRecordOpened) {
        onRecordOpened({ 
          record, 
          entityName,
          primaryKeys: keyValues
        });
      }
      
      // Log opening action
      console.log(`Opening ${entityName}`);
    } catch (err) {
      console.error('[OpenRecordButton] Error opening record:', err);
    }
  };
  
  // Button styles based on variant and size
  const getButtonStyles = () => {
    const baseStyles = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      border: 'none',
      borderRadius: '4px',
      cursor: canOpen ? 'pointer' : 'not-allowed',
      transition: 'all 0.3s ease',
      fontFamily: 'inherit',
      width: fullWidth ? '100%' : 'auto',
      opacity: canOpen ? 1 : 0.5
    };
    
    // Size styles
    const sizeStyles = {
      small: {
        padding: '4px 8px',
        fontSize: '12px'
      },
      medium: {
        padding: '6px 12px',
        fontSize: '14px'
      },
      large: {
        padding: '8px 16px',
        fontSize: '16px'
      }
    };
    
    // Variant styles
    const variantStyles = {
      primary: {
        backgroundColor: '#1890ff',
        color: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      },
      default: {
        backgroundColor: '#3B82F6',
        color: '#fff',
        border: 'none'
      },
      text: {
        backgroundColor: 'transparent',
        color: '#1890ff',
        padding: '2px 4px'
      },
      link: {
        backgroundColor: 'transparent',
        color: '#1890ff',
        textDecoration: 'underline',
        padding: '0'
      }
    };
    
    return {
      ...baseStyles,
      ...sizeStyles[size],
      ...variantStyles[variant]
    };
  };
  
  // Hover styles
  const getHoverStyles = () => {
    if (!canOpen || !isHovered) return {};
    
    const hoverStyles = {
      primary: {
        backgroundColor: '#40a9ff'
      },
      default: {
        backgroundColor: '#2563EB'
      },
      text: {
        backgroundColor: '#f0f5ff'
      },
      link: {
        color: '#40a9ff'
      }
    };
    
    return hoverStyles[variant] || {};
  };
  
  // Combined styles
  const buttonStyles = {
    ...getButtonStyles(),
    ...getHoverStyles()
  };
  
  // Tooltip text
  const getTooltipText = () => {
    if (!record) return 'No record selected';
    if (!entityName) return 'Entity name not provided';
    if (!entityInfo) return `Entity '${entityName}' not found in metadata`;
    if (primaryKeyFields.length === 0) return 'No primary key fields found';
    
    // Check for missing key values
    for (const keyField of primaryKeyFields) {
      if (!record[keyField.FieldName]) {
        return `Missing value for primary key field: ${keyField.DisplayName}`;
      }
    }
    
    // Build descriptive text
    const displayValue = record.Name || record.Title || record.DisplayName || 
                        primaryKeyFields.map(kf => record[kf.FieldName]).join('-');
    return `Open ${entityName}: ${displayValue}`;
  };
  
  return (
    <button
      onClick={handleClick}
      disabled={!canOpen}
      style={buttonStyles}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={getTooltipText()}
      aria-label={`Open ${entityName} record`}
    >
      {showIcon && icon && (
        <span style={{ fontSize: size === 'small' ? '14px' : size === 'large' ? '18px' : '16px' }}>
          {icon}
        </span>
      )}
      <span>{text}</span>
      <span style={{ fontSize: '14px', marginLeft: '4px' }}>↗</span>
    </button>
  );
}