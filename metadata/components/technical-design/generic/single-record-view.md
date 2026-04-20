## Architecture
React functional component for read-only display of a single entity record with metadata-driven formatting and four layout modes.

## State Management (React Hooks)
- **entityInfo** (object | null): Entity metadata from `utilities.md.Entities`

## Entity Metadata Loading (useEffect)
Runs on: `entityName`, `utilities` changes

```javascript
useEffect(() => {
  if (!entityName || !utilities?.md?.Entities) return;
  
  const entity = utilities.md.Entities.find(e => e.Name === entityName);
  if (entity) {
    setEntityInfo(entity);
  }
}, [entityName, utilities]);
```

## Field Selection Logic

### getDisplayFields Function
```javascript
const getDisplayFields = () => {
  if (fields && fields.length > 0) {
    return fields; // Explicit selection
  }
  
  // Auto-detect from record
  if (!record) return [];
  
  return Object.keys(record).filter(key => 
    !key.startsWith('__mj') &&  // Exclude system fields
    key !== 'ID' &&              // Exclude ID
    typeof record[key] !== 'object' // Exclude nested objects
  );
};
```

## Field Info Lookup

### getFieldInfo Function
```javascript
const getFieldInfo = (fieldName) => {
  if (!entityInfo || !entityInfo.Fields) return null;
  return entityInfo.Fields.find(f => f.Name === fieldName);
};
```

Returns field metadata with: Type, DisplayName, Length, etc.

## Value Formatting System

### formatValue Function
**Signature**: `formatValue(value, fieldInfo) => ReactNode | null`

**Process**:
1. **Null/empty handling**:
   ```javascript
   if (value == null || value === '') {
     return showEmptyFields 
       ? <span style={{ color: '#999', fontStyle: 'italic' }}>Empty</span>
       : null;
   }
   ```

2. **Type-based formatting** (if fieldInfo available):
   
   **Boolean** (Type='bit'):
   ```javascript
   return value ? '✓ Yes' : '✗ No';
   ```
   
   **Date** (Type='datetime' or 'date'):
   ```javascript
   try {
     const date = new Date(value);
     if (isNaN(date.getTime())) return value;
     
     if (dateFormat === 'long') {
       return date.toLocaleDateString('en-US', { 
         weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
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
     } else { // 'short'
       return date.toLocaleDateString('en-US', { 
         year: 'numeric', month: 'short', day: 'numeric'
       });
     }
   } catch {
     return value;
   }
   ```
   
   **Integer** (Type='int' or 'bigint'):
   ```javascript
   return parseInt(value).toLocaleString();
   ```
   
   **Decimal/Currency** (Type='decimal' | 'float' | 'money'):
   ```javascript
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
   return num.toLocaleString(undefined, { 
     minimumFractionDigits: 2, 
     maximumFractionDigits: 2
   });
   ```

3. **Text truncation** (if string > maxTextLength):
   ```javascript
   if (typeof value === 'string' && value.length > maxTextLength) {
     return (
       <span title={value}>
         {value.substring(0, maxTextLength)}...
       </span>
     );
   }
   ```

4. **Default**: Return value as-is

## Field Rendering

### renderField Function
**Signature**: `renderField(fieldName) => ReactNode | null`

**Process**:
1. Get field info and format value
2. Return null if empty and `showEmptyFields=false`
3. Check if field is highlighted
4. Render based on layout mode

### Layout-Specific Rendering

#### List Mode (default)
```javascript
<div 
  key={fieldName}
  style={{ marginBottom: '12px', ...highlightStyle }}
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
  <div style={{ fontSize: '14px', color: '#333', ...fieldStyle }}>
    {formattedValue || '-'}
  </div>
</div>
```

#### Table Mode
```javascript
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
  <td style={{ fontSize: '14px', color: '#333', padding: '8px', ...fieldStyle }}>
    {formattedValue || '-'}
  </td>
</tr>
```

#### Inline Mode
```javascript
<span 
  key={fieldName}
  style={{ marginRight: '20px', display: 'inline-block', ...highlightStyle }}
  onClick={() => handleFieldClick(fieldName, value)}
>
  {showLabels && (
    <span style={{ fontWeight: 500, color: '#666', fontSize: '12px', marginRight: '4px' }}>
      {label}:
    </span>
  )}
  <span style={{ fontSize: '14px', color: '#333', ...fieldStyle }}>
    {formattedValue || '-'}
  </span>
</span>
```

#### Card Mode
Same as list mode but wrapped in styled container:
```javascript
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
      <WrappedOpenRecordButton ... />
    </div>
  )}
</div>
```

## Highlighting System
```javascript
const isHighlighted = highlightFields.includes(fieldName);
const highlightStyle = isHighlighted ? {
  backgroundColor: '#fffbe6',
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid #ffe58f'
} : {};
```

## Click Handling

### handleFieldClick
```javascript
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
```

## OpenRecordButton Integration

### Primary Key Extraction (useCallback)
```javascript
const handleOpenRecordClick = useCallback((recordToOpen, entityNameToOpen) => {
  // Get primary keys from entity metadata
  let primaryKeys = [];
  if (entityInfo) {
    let primaryKeyFields = [];
    
    if (entityInfo.PrimaryKey) {
      if (entityInfo.PrimaryKey.Columns && Array.isArray(entityInfo.PrimaryKey.Columns)) {
        primaryKeyFields = entityInfo.PrimaryKey.Columns;
      } else if (entityInfo.PrimaryKey.Name) {
        primaryKeyFields = [entityInfo.PrimaryKey.Name];
      } else if (typeof entityInfo.PrimaryKey === 'string') {
        primaryKeyFields = [entityInfo.PrimaryKey];
      }
    }
    
    // Fallback to ID
    if (primaryKeyFields.length === 0) {
      primaryKeyFields = ['ID'];
    }
    
    primaryKeys = primaryKeyFields.map(fieldName => ({
      FieldName: fieldName,
      Value: recordToOpen[fieldName]
    }));
  }
  
  // Create cancelable event
  const eventData = {
    record: recordToOpen,
    entityName: entityNameToOpen,
    cancel: false,
    primaryKeys
  };
  
  // Fire event
  if (onOpenRecord) {
    onOpenRecord(eventData);
  }
  
  // Check if canceled
  if (eventData.cancel) {
    return false;
  }
  
  // Call OpenEntityRecord
  if (callbacks && callbacks.OpenEntityRecord && primaryKeys.length > 0) {
    callbacks.OpenEntityRecord(entityNameToOpen, primaryKeys);
  }
  
  return true;
}, [entityInfo, onOpenRecord, callbacks]);
```

### WrappedOpenRecordButton (useMemo)
```javascript
const WrappedOpenRecordButton = useMemo(() => {
  if (!OpenRecordButton) return null;
  
  return (props) => {
    const handleWrapperClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleOpenRecordClick(props.record, props.entityName);
    };
    
    return (
      <div onClick={handleWrapperClick} style={{ display: 'inline-block', cursor: 'pointer' }}>
        <button style={{
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
          pointerEvents: 'none' // Prevent button from handling clicks
        }}>
          {props.text || 'Open Record'}
          <span style={{ fontSize: '14px' }}>↗</span>
        </button>
      </div>
    );
  };
}, [OpenRecordButton, handleOpenRecordClick]);
```

## Empty State
```javascript
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
```

## Performance Optimizations
- Metadata loaded once via useEffect (cached in state)
- Field info lookup efficient (single find operation)
- Format value function called only when needed
- No re-renders on hover (CSS only)
- useMemo for WrappedOpenRecordButton (prevents recreating on every render)
- useCallback for handleOpenRecordClick (stable reference)
