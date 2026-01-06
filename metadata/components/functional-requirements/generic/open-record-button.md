## Purpose
Intelligent button that opens MemberJunction entity records using metadata-driven primary key detection. Automatically extracts primary keys from entity metadata and calls OpenEntityRecord callback.

## Required Props
- **record** (object): Entity record containing field data including primary key values
- **entityName** (string): Name of the MemberJunction entity

## Primary Key Detection
Fully automatic - no manual key extraction needed:

1. **Loads entity metadata** from `utilities.md.Entities` on mount
2. **Checks multiple primary key sources** (handles different metadata structures):
   - `entity.PrimaryKeys` array (multi-column keys)
   - `entity.FirstPrimaryKey.Name` (single key)
   - Fallback to `'ID'` if no primary key found
3. **Handles composite keys**: `['OrderID', 'LineNumber']` for multi-column primary keys
4. **Validates key values**: Ensures all primary key fields have non-null values before enabling button

## Button Behavior

### Validation
Before opening record, button validates:
- `record` prop exists
- `entityName` prop exists
- `callbacks.OpenEntityRecord` is available
- Primary key fields detected from metadata
- All primary key values exist in record (not null/undefined)

If any validation fails:
- Button disabled (`cursor: not-allowed`, opacity: 0.5)
- Tooltip shows reason (e.g., "Missing value for primary key field: OrderID")

### Click Action
On valid click:
1. Extracts primary key values from record using detected field names
2. Creates key-value pairs: `[{FieldName: 'ID', Value: '123'}, ...]`
3. Calls `callbacks.OpenEntityRecord(entityName, keyValues)`
4. Fires `recordOpened` event with `{record, entityName, primaryKeys}`
5. Logs action to console

## Styling & Variants

### Four Style Variants

1. **primary**: Blue filled (#1890ff) with hover (#40a9ff), box shadow
2. **default**: Brighter blue filled (#3B82F6) with hover (#2563EB)
3. **text**: Transparent with blue text (#1890ff), light gray hover background
4. **link**: Transparent with underlined blue text, color change on hover

### Three Sizes
- **small**: 4px/8px padding, 12px font
- **medium** (default): 6px/12px padding, 14px font
- **large**: 8px/16px padding, 16px font

### Icon Support
- Optional `icon` prop (emoji or unicode): `icon="📂"`
- `showIcon` prop controls visibility (default false)
- Icon size scales with button size
- Always shows arrow icon on right: ↗

### Full Width
- `fullWidth={true}`: Button takes 100% width of container
- Useful in card layouts or sidebars

## User Experience

### Hover States
- Cursor changes to pointer when enabled
- Background color lightens on hover (variant-specific)
- Text color changes for link variant
- Smooth transitions (0.3s ease)

### Tooltips
Auto-generated descriptive tooltips based on state:

**Enabled**: "Open {entityName}: {displayValue}"
- Display value: record.Name OR record.Title OR record.DisplayName OR primary key values joined

**Disabled (various states)**:
- "No record selected"
- "Entity name not provided"
- "Entity '{entityName}' not found in metadata"
- "No primary key fields found"
- "Missing value for primary key field: {fieldName}"

### Loading States
- Disabled during metadata loading (brief)
- Re-validates when record or entityName prop changes

## Events

**recordOpened**: Fires after successful OpenEntityRecord call
```javascript
{
  record: {...}, // Full record object
  entityName: 'Invoices',
  primaryKeys: [
    {FieldName: 'InvoiceID', Value: '12345'}
  ]
}
```

Use for analytics, logging, or chaining additional actions.

## Error Handling
- Graceful fallback if metadata not loaded
- Console warning if primary keys missing or invalid
- Try/catch around OpenEntityRecord call with error logging
- User-friendly disabled state with tooltips (no error throws)

## Integration Patterns

### With DataGrid (row action column)
```javascript
{
  field: 'actions',
  header: 'Actions',
  render: (value, record) => (
    <OpenRecordButton
      record={record}
      entityName="Deals"
      variant="link"
      size="small"
      text="View"
    />
  )
}
```

### With SingleRecordView
```javascript
<SingleRecordView
  record={selectedInvoice}
  entityName="Invoices"
  allowOpenRecord={true} // Uses OpenRecordButton internally
/>
```

### Standalone
```javascript
<OpenRecordButton
  record={selectedContact}
  entityName="Contacts"
  text="View Full Profile"
  variant="primary"
  size="large"
  icon="👤"
  showIcon={true}
/>
```

## Performance
- Metadata lookup happens once on mount (cached in component state)
- Primary key detection computed once per entityName change
- Validation memoized with useMemo
- Button styles calculated dynamically but efficiently
