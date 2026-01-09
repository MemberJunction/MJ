## Architecture
React functional component with intelligent primary key detection from MemberJunction entity metadata.

## State Management (React Hooks)
- **isHovered** (boolean): Button hover state for styling
- **primaryKeyFields** (Array): Detected primary key fields from metadata
- **entityInfo** (object | null): Entity metadata from `utilities.md.Entities`

## Initialization & Metadata Loading (useEffect)

### Trigger
Runs on: `entityName`, `utilities` changes

### Process
1. **Validate inputs**:
   ```javascript
   if (!entityName || !utilities?.md?.Entities) {
     console.error('Entity name not provided' or 'Entity metadata not loaded');
     return;
   }
   ```

2. **Find entity**:
   ```javascript
   const entity = utilities.md.Entities.find(e => e.Name === entityName);
   if (entity) {
     setEntityInfo(entity);
     // Continue to key detection
   }
   ```

3. **Detect primary keys** (handles multiple metadata structures):
   ```javascript
   const keyFields = [];
   
   if (entity.PrimaryKeys && entity.PrimaryKeys.length > 0) {
     // Multi-column or array format
     entity.PrimaryKeys.forEach(field => {
       keyFields.push({
         FieldName: field.Name,
         DisplayName: field.DisplayName || field.Name
       });
     });
   } else if (entity.FirstPrimaryKey) {
     // Single key object
     keyFields.push({
       FieldName: entity.FirstPrimaryKey.Name,
       DisplayName: entity.FirstPrimaryKey.DisplayName || entity.FirstPrimaryKey.Name
     });
   } else {
     // Fallback to ID
     keyFields.push({
       FieldName: 'ID',
       DisplayName: 'ID'
     });
   }
   
   setPrimaryKeyFields(keyFields);
   ```

## Validation Logic (useMemo)

### canOpen Calculation
```javascript
const canOpen = useMemo(() => {
  if (!record || !entityName || !callbacks?.OpenEntityRecord) return false;
  if (primaryKeyFields.length === 0) return false;
  
  // Check all primary key fields have values
  for (const keyField of primaryKeyFields) {
    if (!record[keyField.FieldName]) {
      return false;
    }
  }
  
  return true;
}, [record, entityName, callbacks, primaryKeyFields]);
```

## Click Handler

### handleClick Implementation
```javascript
const handleClick = () => {
  if (!canOpen) return;
  
  try {
    // Build key-value pairs
    const keyValues = primaryKeyFields.map(keyField => ({
      FieldName: keyField.FieldName,
      Value: record[keyField.FieldName]
    }));
    
    // Call OpenEntityRecord
    callbacks.OpenEntityRecord(entityName, keyValues);
    
    // Fire event
    if (onRecordOpened) {
      onRecordOpened({ 
        record, 
        entityName,
        primaryKeys: keyValues
      });
    }
    
    // Log action
    console.log(`Opening ${entityName}`);
  } catch (err) {
    console.error('[OpenRecordButton] Error opening record:', err);
  }
};
```

## Styling System

### Button Style Variants
```javascript
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
```

### Size Variants
```javascript
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
```

### Base Styles
```javascript
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
```

### Hover State Handling
```javascript
const getHoverStyles = () => {
  if (!canOpen || !isHovered) return {};
  
  const hoverStyles = {
    primary: { backgroundColor: '#40a9ff' },
    default: { backgroundColor: '#2563EB' },
    text: { backgroundColor: '#f0f5ff' },
    link: { color: '#40a9ff' }
  };
  
  return hoverStyles[variant] || {};
};

// Combined styles
const buttonStyles = {
  ...getButtonStyles(),
  ...getHoverStyles()
};
```

## Tooltip Generation

### getTooltipText Function
```javascript
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
```

## Render Output
```javascript
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
```

## Icon Sizing Logic
Icon scales with button size:
- small → 14px
- medium → 16px
- large → 18px

## Error Handling
- Graceful fallback if metadata not loaded (button disabled with tooltip)
- Console warning if primary keys missing or invalid
- Try/catch around OpenEntityRecord call with error logging
- No exceptions thrown (button simply disabled)

## Performance
- Metadata lookup happens once on mount (cached in `entityInfo` state)
- Primary key detection computed once per `entityName` change (cached in `primaryKeyFields` state)
- Validation memoized with `useMemo` (recalculates only when dependencies change)
- Button styles calculated dynamically but efficiently (no unnecessary re-renders)
- Hover state managed with simple boolean (minimal state updates)
