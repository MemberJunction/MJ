## Purpose
Read-only display component for a **single entity record** with metadata-driven field type formatting. Four layout modes with intelligent formatting based on SQL field types.

## Required Props
- **record** (object): Entity record to display
- **entityName** (string): Name of entity for metadata lookup

## Field Selection

### Auto-detection (if `fields` prop omitted)
Discovers fields from record using smart filtering:
- All top-level properties from record object
- **Excludes**: Fields starting with `__mj` (system fields)
- **Excludes**: Field named `ID` (usually shown elsewhere)
- **Excludes**: Nested objects (typeof === 'object')
- Order: As they appear in Object.keys(record)

### Explicit Selection
`fields={['InvoiceName', 'Amount', 'DueDate', 'Status']}`:
- Controls which fields display
- Controls display order
- Can include system fields if needed
- Unknown fields logged as warnings

## Layout Modes

### 1. List (Vertical, default)
- Each field as vertical block
- Label div: uppercase, 12px, gray, 4px margin-bottom
- Value div: 14px, dark gray, below label
- 12px margin-bottom between fields

### 2. Table (Two-column)
- `<table>` with label/value columns
- `labelWidth` prop (default 150px) sets label column width
- Labels: 500 weight, gray, left-aligned
- Values: regular weight, dark, right column
- 8px padding in cells
- Vertical-align: top (for long values)

### 3. Inline (Horizontal Compact)
- All fields in single line as `<span>` elements
- Format: `Label: Value` with 20px margin-right between fields
- Wraps naturally if container too narrow
- Good for space-constrained summaries

### 4. Card (Styled Container)
- Wrapper div with border, radius, shadow, padding
- Fields rendered same as list mode inside
- Visual style: 1px border (#d9d9d9), 8px radius, white background
- Box shadow: 0 2px 4px rgba(0,0,0,0.05)
- 16px padding
- Optional OpenRecordButton at bottom with top border separator

## Metadata-Driven Formatting

### Date Fields (`datetime`, `date`)
Three format modes via `dateFormat` prop:

1. **short** (default): "Jan 15, 2024" (month short, day, year)
2. **long**: "Monday, January 15, 2024" (weekday, month long, day, year)
3. **relative**: Context-aware
   - "Today" (0 days ago)
   - "Yesterday" (1 day ago)
   - "5 days ago" (< 7 days)
   - "2 weeks ago" (< 30 days)
   - "3 months ago" (< 365 days)
   - "2 years ago" (≥ 365 days)

### Boolean Fields (`bit`)
- `true` → "✓ Yes" (checkmark)
- `false` → "✗ No" (X mark)

### Number Fields
- **Integer** (`int`, `bigint`): 1,234,567 (commas, no decimals)
- **Decimal** (`decimal`, `float`, `numeric`): 1,234.56 (commas, 2 decimals)

### Currency Fields
Auto-detected when:
- Field type is `money`
- **OR** field name includes: "amount", "price", "cost" (case-insensitive)

Format: $1,234.56 (USD currency with symbol, commas, 2 decimals)

### Null/Empty Values
- If `showEmptyFields={false}` (default): Field not rendered
- If `showEmptyFields={true}`: Shows "Empty" in gray italic text

## Features

### Text Truncation
For string values exceeding `maxTextLength` (default 200 chars):
- Displays: First 200 chars + "..."
- Hover tooltip: Shows full text via title attribute
- Prevents layout breaking from long text
- Applies to string fields only (not dates/numbers)

### Field Highlighting
`highlightFields={['Amount', 'Status']}`:
- Yellow background (#fffbe6)
- Yellow border (#ffe58f)
- 4px/8px padding
- 4px border-radius
- Visual emphasis for important fields

### Clickable Fields
If `onFieldClicked` callback provided:
- All field values get `cursor: pointer`
- Click fires event: `{fieldName, value, fieldType, record}`
- Use for: drill-downs, filters, custom actions
- Example: Click email to compose, click status to filter

### OpenRecordButton Integration
`allowOpenRecord={true}`:
- Loads OpenRecordButton from components registry
- Renders at bottom of record view
- Auto-detects primary keys from metadata
- Layout-specific button styling:
  - **card**: `primary` variant, medium size, top border separator
  - **table/list**: `default` variant, medium size, 12px top margin
  - **inline**: `link` variant, small size, 20px left margin

**Cancelable Event**: `onOpenRecord`
```javascript
onOpenRecord={(eventData) => {
  // eventData: {record, entityName, cancel, primaryKeys}
  if (record.Status === 'Locked') {
    eventData.cancel = true; // Prevent opening
    alert('Cannot open locked records');
  }
}}
```

### Primary Key Extraction
For OpenRecord functionality, handles various metadata structures:
- `entityInfo.PrimaryKey.Columns` array (multi-column)
- `entityInfo.PrimaryKey.Name` string (single)
- `entityInfo.PrimaryKey` as string
- Fallback to `'ID'`

Validates all primary key values exist before enabling button.

## Display Labels
Preferred sources (priority order):
1. `field.DisplayName` from entity metadata
2. Field name as-is
3. Special handling for `__mj` fields:
   - `__mj_CreatedAt` → "Created At"
   - `__mj_UpdatedAt` → "Updated At"
   - `__mj_DeletedAt` → "Deleted At"

## Visual States

### Empty State
If no `record` prop:
- Centered message: "No record to display"
- Gray text, 20px padding
- No error thrown

### Empty Fields
Based on `showEmptyFields` prop:
- `false` (default): Field not rendered
- `true`: Renders as "Empty" (gray italic)

## Events

1. **onFieldClicked**: `({fieldName, value, fieldType, record}) => void`
   - Fired when field value clicked (if handler provided)
   - Includes field type from metadata

2. **onOpenRecord**: `(eventData) => void` (cancelable)
   - Fired before OpenEntityRecord called
   - Can set `eventData.cancel = true` to prevent
   - Includes `{record, entityName, cancel, primaryKeys}`

## Styling Integration
- Respects MemberJunction styles prop for spacing/colors
- Layout-specific hardcoded styles (margins, padding, font sizes)
- Highlight styles use yellow (#fffbe6 bg, #ffe58f border)
- Card mode uses subtle shadow and border

## Performance
- Metadata loaded once on mount via useEffect
- Field info lookup cached per entity
- Format value memoized for repeated renders
- No unnecessary re-renders on hover (CSS only)

## Accessibility
- Proper semantic HTML (divs, tables, spans)
- Title attributes on truncated text (hover for full value)
- High contrast text colors (dark on light)
- OpenRecordButton has ARIA labels and tooltips
