## Architecture
React functional component for displaying AI-generated markdown content with built-in actions and collapsible UI.

## Dependencies
- **marked** (11.1.1): Markdown parsing and rendering (global: marked)
- Conditional loading: Component works with or without marked library (fallback to plain text)

## State Management (React Hooks)
- **collapsed** (boolean): Panel expansion state (default: `defaultCollapsed` prop)
- **copyFeedback** (boolean): Copy success indicator (auto-resets after 2s)

## Props Structure
```javascript
{
  // Required
  insights: string,        // AI-generated markdown text
  loading: boolean,        // Generation in progress
  error: string,          // Error message
  onGenerate: function,   // Refresh callback
  
  // Optional customization
  title: 'AI Insights',
  icon: 'fa-wand-magic-sparkles',
  iconColor: '#8B5CF6',
  maxHeight: '400px',
  showRefresh: true,
  showExport: true,
  showCopy: true,
  position: 'top',
  defaultCollapsed: false,
  onClose: undefined,
  customButtons: []
}
```

## Markdown Rendering

### formatInsights Function
**Process**:
1. Check if `insights` prop exists
2. Check if `marked` library available:
   - **If available**:
     ```javascript
     try {
       const htmlContent = marked.parse(insights);
       return (
         <div 
           className="markdown-insights"
           dangerouslySetInnerHTML={{ __html: htmlContent }}
         />
       );
     } catch (err) {
       console.warn('Failed to parse markdown:', err);
       // Fall through to plain text
     }
     ```
   - **If unavailable** OR **parse error**:
     ```javascript
     return (
       <div style={{ whiteSpace: 'pre-wrap', color: '#374151', lineHeight: '1.6' }}>
         {insights}
       </div>
     );
     ```

### CSS Styling (Injected via <style> tag)
```css
.markdown-insights h1 { font-size: 20px; font-weight: 600; color: #111827; margin: 16px 0 12px 0; }
.markdown-insights h2 { font-size: 18px; font-weight: 600; color: #1F2937; margin: 14px 0 10px 0; }
.markdown-insights h3 { font-size: 16px; font-weight: 600; color: #374151; margin: 12px 0 8px 0; }
.markdown-insights h4 { font-size: 14px; font-weight: 600; color: #4B5563; margin: 10px 0 6px 0; }
.markdown-insights p { margin: 8px 0; color: #374151; line-height: 1.6; }
.markdown-insights ul, ol { margin: 8px 0; padding-left: 24px; color: #374151; }
.markdown-insights li { margin: 4px 0; line-height: 1.5; }
.markdown-insights strong { font-weight: 600; color: #1F2937; }
.markdown-insights em { font-style: italic; }
.markdown-insights code { background: #F3F4F6; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
.markdown-insights blockquote { border-left: 3px solid ${iconColor}; padding-left: 12px; margin: 12px 0; color: #4B5563; }
.markdown-insights hr { border: none; border-top: 1px solid #E5E7EB; margin: 16px 0; }
.markdown-insights a { color: ${iconColor}; text-decoration: none; }
.markdown-insights a:hover { text-decoration: underline; }
.markdown-insights table { border-collapse: collapse; width: 100%; margin: 12px 0; }
.markdown-insights th, td { border: 1px solid #E5E7EB; padding: 8px; text-align: left; }
.markdown-insights th { background: #F9FAFB; font-weight: 600; }
.markdown-insights pre { background: #1F2937; color: #F9FAFB; padding: 12px; border-radius: 6px; overflow-x: auto; }
```

## Button Actions

### Collapse/Expand (Always Present)
**Implementation**:
```javascript
const handleToggle = () => setCollapsed(!collapsed);

// Button render
<button onClick={handleToggle}>
  <i className={`fa-solid fa-chevron-${collapsed ? 'down' : 'up'}`}></i>
</button>

// Also on double-click header
<div onDoubleClick={handleToggle}>
  {/* Header content */}
</div>
```

### Copy to Clipboard (showCopy=true)
**Implementation**:
```javascript
const copyToClipboard = async () => {
  if (!insights) return;
  
  try {
    await navigator.clipboard.writeText(insights);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};
```

**Visual feedback**:
- Button changes from gray to green
- Icon changes from `fa-copy` to `fa-check`
- Shows "Copied!" text for 2 seconds
- Auto-resets after timeout

### Export as Markdown (showExport=true)
**Implementation**:
```javascript
const exportAsMarkdown = () => {
  if (!insights) return;
  
  const timestamp = new Date().toISOString().split('T')[0];
  const markdownContent = `# ${title}

Generated: ${new Date().toLocaleString()}

---

${insights}`;
  
  const blob = new Blob([markdownContent], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-insights-${timestamp}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

**File format**:
- Filename: `ai-insights-YYYY-MM-DD.md`
- Header with title and generation timestamp
- Horizontal rule separator
- Original insights markdown

### Refresh Insights (showRefresh=true)
**Implementation**:
```javascript
const handleRefresh = () => {
  setCollapsed(false);  // Auto-expand panel
  onGenerate();         // Call parent's generate function
};

// Button disabled while loading
<button 
  onClick={handleRefresh}
  disabled={loading}
>
  <i className={`fa-solid fa-${loading ? 'spinner fa-spin' : 'arrows-rotate'}`}></i>
</button>
```

### Custom Buttons (customButtons array)
**Structure**:
```javascript
customButtons={[
  {
    icon: 'fa-solid fa-share',
    label: 'Share',         // Optional text beside icon
    title: 'Share insights', // Tooltip
    onClick: handleShare,
    disabled: false,
    style: {}               // Optional CSS overrides
  }
]}
```

**Rendering**:
```javascript
{customButtons.map((button, index) => (
  <button
    key={index}
    onClick={button.onClick}
    disabled={button.disabled}
    title={button.title}
    style={{
      /* Base button styles */
      ...button.style
    }}
  >
    {button.icon && <i className={button.icon}></i>}
    {button.label && <span>{button.label}</span>}
  </button>
))}
```

## Visual States

### Loading State
```javascript
{loading && (
  <div style={{
    padding: '24px',
    textAlign: 'center',
    color: '#6B7280',
    backgroundColor: '#F9FAFB',
    borderRadius: '6px'
  }}>
    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '24px', marginBottom: '12px' }}></i>
    <div>Generating AI insights...</div>
  </div>
)}
```

### Error State
```javascript
{error && !loading && (
  <div style={{
    color: '#EF4444',
    padding: '12px',
    backgroundColor: '#FEE2E2',
    borderRadius: '6px',
    border: '1px solid #FECACA',
    display: 'flex',
    alignItems: 'start',
    gap: '8px'
  }}>
    <i className="fa-solid fa-exclamation-triangle" style={{ marginTop: '2px' }}></i>
    <div>{error}</div>
  </div>
)}
```

### Success State (Insights Content)
```javascript
{insights && !loading && (
  <div style={{
    maxHeight: maxHeight,
    overflowY: 'auto',
    padding: '12px',
    backgroundColor: '#F9FAFB',
    borderRadius: '6px'
  }}>
    {formatInsights(insights)}
  </div>
)}
```

## Panel Styling

### Container
```javascript
const panelStyles = {
  marginBottom: position === 'top' ? (styles?.spacing?.lg || '20px') : 0,
  marginTop: position === 'bottom' ? (styles?.spacing?.lg || '20px') : 0,
  padding: styles?.spacing?.lg || '20px',
  backgroundColor: styles?.colors?.surface || 'white',
  borderRadius: styles?.borders?.radius || '8px',
  border: `1px solid ${styles?.colors?.border || '#E5E7EB'}`,
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
  transition: 'all 0.3s ease',
  cursor: 'default'
};
```

### Header Layout
```javascript
<div style={{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: collapsed ? 0 : '16px'
}}>
  {/* Title */}
  <h3>
    <i className={`fa-solid ${icon}`} style={{ color: iconColor }}></i>
    {title}
  </h3>
  
  {/* Button group */}
  <div style={{ display: 'flex', gap: '8px' }}>
    {/* Buttons rendered here */}
  </div>
</div>
```

### Button Styling
```javascript
const buttonStyle = {
  background: 'none',
  border: `1px solid #E5E7EB`,
  borderRadius: '6px',
  color: '#6B7280',
  cursor: 'pointer',
  padding: '6px 10px',
  fontSize: '14px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.2s'
};

// Hover via onMouseEnter/onMouseLeave
onMouseEnter={(e) => {
  e.currentTarget.style.backgroundColor = '#F9FAFB';
}}
```

## Conditional Rendering Logic
```javascript
// Don't render if no content and no state
if (!insights && !error && !loading) {
  return null;
}

// Render panel with conditional content area
return (
  <div style={panelStyles} onDoubleClick={handleToggle}>
    {/* Header always visible */}
    <div>{/* Header */}</div>
    
    {/* Content only when not collapsed */}
    {!collapsed && (
      <div>
        {loading && <LoadingState />}
        {error && !loading && <ErrorState />}
        {insights && !loading && <ContentState />}
      </div>
    )}
  </div>
);
```

## Event Firing
Events are informational only (no cancellation):
```javascript
// onToggleCollapse
if (onToggleCollapse) {
  onToggleCollapse({ collapsed: !collapsed });
}

// onCopy (after successful copy)
if (onCopy) {
  onCopy();
}

// onExport (after file download)
if (onExport) {
  onExport();
}

// onClose (when X button clicked)
if (onClose) {
  onClose();
}
```

## Performance Optimizations
- Markdown parsing memoized per insights value (useMemo)
- Button handlers don't cause re-renders (pure CSS hover states)
- Collapse animation uses CSS transitions (no JavaScript)
- No unnecessary re-renders on hover (event handlers inline or memoized)

## Accessibility
- Semantic HTML (h3 for title)
- Button tooltips via title attribute
- Keyboard navigation (all buttons focusable)
- High contrast error states
- Screen reader friendly (text alternatives for icons)
