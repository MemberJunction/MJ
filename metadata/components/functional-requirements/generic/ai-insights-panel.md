## Purpose
Display AI-generated insights with markdown rendering, built-in actions (copy/export/refresh), and collapsible UI. Styled panel optimized for showing AI analysis text.

## Required Props
- **insights** (string): AI-generated markdown text to display
- **loading** (boolean): True while AI is generating insights
- **error** (string): Error message if generation failed
- **onGenerate** (function): Callback to generate/regenerate insights

## Content Rendering

### Markdown Support
- Uses **marked.js 11.1.1** for markdown parsing
- Fallback to plain text if marked unavailable
- Supported markdown features:
  - Headings (h1-h4) with hierarchy
  - Bold, italic, strikethrough
  - Lists (ordered and unordered)
  - Code blocks with syntax highlighting
  - Inline code with background
  - Blockquotes with colored left border
  - Tables with borders
  - Horizontal rules
  - Links with hover underline

### Styling
- Proper heading hierarchy: h1 (20px) → h2 (18px) → h3 (16px) → h4 (14px)
- Code blocks: Dark background (#1F2937) with light text
- Inline code: Light gray background (#F3F4F6)
- Blockquote: Colored left border matches icon color
- Links: Match icon color with hover underline
- Tables: Bordered with header background

## Features

### Collapsible Panel
- **Double-click header** OR **collapse button** to toggle
- Starts expanded by default (or `defaultCollapsed={true}`)
- Smooth transitions (all 0.3s ease)
- Icon changes: chevron-up ↔ chevron-down
- Content hidden when collapsed (not just height:0)
- Fires `onToggleCollapse` event with collapsed state

### Built-in Actions

1. **Collapse/Expand** (always visible):
   - Button with chevron icon
   - Double-click header also toggles
   - Preserves state during session

2. **Copy to Clipboard** (`showCopy={true}`, default):
   - Copies raw markdown text to clipboard
   - Success feedback: Button turns green, shows "Copied!" for 2 seconds
   - Uses navigator.clipboard API
   - Falls back gracefully if clipboard unavailable

3. **Export as Markdown** (`showExport={true}`, default):
   - Downloads `.md` file with timestamp
   - Includes title and generation date in file header
   - Filename format: `ai-insights-YYYY-MM-DD.md`
   - Uses Blob download (no server upload)

4. **Refresh/Regenerate** (`showRefresh={true}`, default):
   - Calls `onGenerate()` callback
   - Disabled while `loading={true}`
   - Shows spinner icon during generation
   - Auto-expands panel when clicked

5. **Close Button** (optional via `onClose` callback):
   - X button on far right
   - Red hover effect
   - Fires `onClose()` - parent handles actual removal

6. **Custom Buttons** (via `customButtons` array):
   - Add your own action buttons
   - Format: `{icon: 'fa-share', title: 'Share', onClick: handler, disabled: boolean}`
   - Rendered between built-in buttons

### Visual States

**Loading State**:
- Shows spinner icon with "Generating AI insights..." message
- Gray background (#F9FAFB)
- Centered layout
- Replaces content area (not overlaid)

**Error State**:
- Red alert banner with exclamation icon
- Light red background (#FEE2E2) with red border
- Shows error message from `error` prop
- Only visible when `error` exists and not loading

**Success State**:
- Rendered markdown content in scrollable area
- Light gray background (#F9FAFB)
- Default max-height: 400px with scroll
- Configurable via `maxHeight` prop

**Empty State**:
- Component returns null if no insights, no error, and not loading
- Use this for conditional mounting

## Customization

### Appearance
- **title** (default "AI Insights"): Panel header text
- **icon** (default "fa-wand-magic-sparkles"): Font Awesome icon class
- **iconColor** (default "#8B5CF6" purple): Icon and link color
- **maxHeight** (default "400px"): Content scroll height
- **position** ("top" | "bottom"): Affects margin (spacing from neighbors)

### Button Visibility
- **showRefresh** (default true): Show/hide refresh button
- **showExport** (default true): Show/hide export button
- **showCopy** (default true): Show/hide copy button
- **onClose** (optional): If provided, shows close button

### Custom Buttons
Array of button configs:
```javascript
customButtons={[
  {
    icon: 'fa-solid fa-share',
    label: 'Share', // optional text
    title: 'Share insights', // tooltip
    onClick: handleShare,
    disabled: false,
    style: {} // optional CSS overrides
  }
]}
```

## Styling Details

### Panel Container
- White background with subtle gradient
- 1px border (#E5E7EB)
- 8px border radius
- Box shadow: 0 2px 4px rgba(0,0,0,0.1)
- Padding: 20px (configurable via styles prop)

### Header
- Flex layout: title left, buttons right
- Title: 18px, 600 weight, with icon
- Button bar: 8px gap between buttons
- All buttons: 1px border, 6px radius, 6px-10px padding

### Content Area
- Light gray background (#F9FAFB)
- 6px border radius
- 12px padding
- Scrollable with custom scrollbar (webkit)

## Events

1. **onToggleCollapse**: `({collapsed: boolean}) => void`
   - Fired when panel expands or collapses

2. **onCopy**: `() => void`
   - Fired after successful clipboard copy

3. **onExport**: `() => void`
   - Fired after markdown file download

4. **onGenerate**: `() => void`
   - Called by refresh button (required prop)

5. **onClose**: `() => void`
   - Called by close button (optional)

## Accessibility
- Button tooltips with descriptive titles
- Semantic HTML (h3 for title)
- Keyboard accessible (all buttons focusable)
- ARIA labels for icon-only buttons
- High contrast error states

## Performance
- Markdown parsing cached per insights value
- Button handlers use useCallback where appropriate
- Smooth CSS transitions without JavaScript animation
- No re-renders on hover states (pure CSS)
