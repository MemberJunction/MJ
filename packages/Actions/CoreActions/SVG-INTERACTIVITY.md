# SVG Visualization Interactivity Guide

## Overview

MemberJunction SVG visualization actions now support interactive features including tooltips, pan/zoom, and hover behaviors. These features enhance usability for large datasets and provide better user experience.

## Features

### 1. **Interactive Tooltips**
- Hover over nodes/elements to see contextual information
- Server-generated JavaScript (no external dependencies)
- Automatic positioning that follows mouse cursor
- Semi-transparent background for readability

### 2. **Pan and Zoom**
- **Mouse Wheel:** Scroll to zoom in/out
- **Click + Drag:** Pan around the visualization
- **Touch Gestures:** Pinch-to-zoom and two-finger pan on mobile
- **Zoom Controls:** Optional +/- buttons and reset button
- **Zoom Limits:** Configurable min (0.5x) and max (3x) scale
- **Smart Zooming:** Zooms toward mouse cursor position

### 3. **Scrolling Containers**
- Wrap large visualizations in scrollable div
- Configurable max width/height
- Styled with border and shadow
- Ideal for 500+ node networks

## Usage

### Enable Tooltips

```javascript
await runAction({
    ActionName: 'Create SVG Network',
    Params: [
        { Name: 'NetworkType', Value: 'force' },
        { Name: 'Nodes', Value: JSON.stringify(nodes) },
        { Name: 'Edges', Value: JSON.stringify(edges) },
        { Name: 'EnableTooltips', Value: 'true' }  // Enable tooltips
    ]
});
```

### Enable Pan/Zoom

```javascript
await runAction({
    ActionName: 'Create SVG Network',
    Params: [
        { Name: 'NetworkType', Value: 'force' },
        { Name: 'Nodes', Value: JSON.stringify(nodes) },
        { Name: 'Edges', Value: JSON.stringify(edges) },
        { Name: 'EnablePanZoom', Value: 'true' },      // Enable pan/zoom
        { Name: 'ShowZoomControls', Value: 'true' }   // Show +/- buttons
    ]
});
```

### Enable Scrolling Container

```javascript
await runAction({
    ActionName: 'Create SVG Network',
    Params: [
        { Name: 'NetworkType', Value: 'force' },
        { Name: 'Nodes', Value: JSON.stringify(nodes) },
        { Name: 'Edges', Value: JSON.stringify(edges) },
        { Name: 'WrapWithContainer', Value: 'true' },    // Enable scrolling
        { Name: 'MaxContainerWidth', Value: '1200' },    // Max width in px
        { Name: 'MaxContainerHeight', Value: '800' }     // Max height in px
    ]
});
```

### Combine Multiple Features

```javascript
await runAction({
    ActionName: 'Create SVG Network',
    Params: [
        { Name: 'NetworkType', Value: 'force' },
        { Name: 'Nodes', Value: JSON.stringify(nodes) },
        { Name: 'Edges', Value: JSON.stringify(edges) },
        { Name: 'EnableTooltips', Value: 'true' },
        { Name: 'EnablePanZoom', Value: 'true' },
        { Name: 'ShowZoomControls', Value: 'true' },
        { Name: 'WrapWithContainer', Value: 'true' }
    ]
});
```

## Parameters

### Create SVG Network

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `EnableTooltips` | boolean | false | Show tooltips on hover |
| `EnablePanZoom` | boolean | false | Enable pan/zoom interactivity |
| `ShowZoomControls` | boolean | false | Show +/-/reset buttons |
| `WrapWithContainer` | boolean | false | Wrap in scrollable container |
| `MaxContainerWidth` | number | 1200 | Max container width (px) |
| `MaxContainerHeight` | number | 800 | Max container height (px) |

## Embedding Interactive SVGs

### ✅ Correct: Inline SVG

Interactive features require inline SVG embedding:

```html
<!-- Works with interactivity -->
<div [innerHTML]="svgString | safeHtml"></div>
```

```typescript
// Angular Component
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export class MyComponent {
    svgString: SafeHtml;

    constructor(private sanitizer: DomSanitizer) {
        this.svgString = this.sanitizer.bypassSecurityTrustHtml(svgHtml);
    }
}
```

### ❌ Incorrect: Image Tag

```html
<!-- Does NOT work with interactivity (browser security) -->
<img [src]="'data:image/svg+xml,' + svgString">
```

## Content Security Policy (CSP)

Interactive SVGs use inline JavaScript and require CSP configuration:

### Option 1: Allow Inline Scripts (Simple)

```http
Content-Security-Policy: script-src 'self' 'unsafe-inline';
```

### Option 2: Nonce-Based (Secure)

```html
<!-- Server-side: Add nonce to SVG -->
<svg nonce="{{generatedNonce}}">
    <script nonce="{{generatedNonce}}">...</script>
</svg>
```

```http
Content-Security-Policy: script-src 'self' 'nonce-abc123';
```

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge | Mobile |
|---------|--------|---------|--------|------|--------|
| Tooltips | ✅ 90+ | ✅ 88+ | ✅ 14+ | ✅ 90+ | ✅ iOS 14+, Android 90+ |
| Pan/Zoom (Mouse) | ✅ 90+ | ✅ 88+ | ✅ 14+ | ✅ 90+ | N/A |
| Pan/Zoom (Touch) | ✅ 90+ | ✅ 88+ | ✅ 14+ | ✅ 90+ | ✅ iOS 14+, Android 90+ |
| Scrolling Container | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All |

## Security

### Safe by Design
- ✅ All JavaScript is server-generated
- ✅ No user input in script content
- ✅ Scoped to SVG element only
- ✅ Event listeners are properly cleaned up

### Sanitization
- ✅ External script sources blocked
- ✅ External hrefs blocked (except #anchors and mailto:)
- ⚠️ Inline `<script>` tags preserved (intentional for interactivity)

## Performance

### Recommended Limits
- **Small graphs:** < 100 nodes - All features work smoothly
- **Medium graphs:** 100-500 nodes - Pan/zoom recommended
- **Large graphs:** 500+ nodes - Use scrolling container + pan/zoom
- **Very large graphs:** 1000+ nodes - Consider pagination or filtering

### Optimization Tips
1. Enable pan/zoom only when needed (large graphs)
2. Use scrolling container for better performance than DOM pan/zoom
3. Limit tooltip text to 1-2 lines
4. Avoid zoom controls on mobile (use native touch gestures)

## Examples

### Example 1: Research Network with Tooltips

```typescript
const nodes = [
    { id: '1', label: 'Paper A', group: 'ML' },
    { id: '2', label: 'Paper B', group: 'NLP' },
    { id: '3', label: 'Paper C', group: 'CV' }
];

const edges = [
    { source: '1', target: '2', weight: 0.8, directed: true },
    { source: '2', target: '3', weight: 0.6, directed: true }
];

const result = await runAction({
    ActionName: 'Create SVG Network',
    Params: [
        { Name: 'NetworkType', Value: 'force' },
        { Name: 'Nodes', Value: JSON.stringify(nodes) },
        { Name: 'Edges', Value: JSON.stringify(edges) },
        { Name: 'EnableTooltips', Value: 'true' },
        { Name: 'ShowLabels', Value: 'true' },
        { Name: 'ShowLegend', Value: 'true' }
    ]
});

// Tooltips show: "Paper A (ML)", "Paper B (NLP)", etc.
```

### Example 2: Large Org Chart with Pan/Zoom

```typescript
const orgData = {
    id: '1',
    label: 'CEO',
    role: 'Chief Executive',
    children: [
        { id: '2', label: 'CTO', role: 'Technology', children: [...] },
        { id: '3', label: 'CFO', role: 'Finance', children: [...] }
    ]
};

const result = await runAction({
    ActionName: 'Create SVG Network',
    Params: [
        { Name: 'NetworkType', Value: 'tree' },
        { Name: 'Nodes', Value: JSON.stringify(orgData) },
        { Name: 'EnablePanZoom', Value: 'true' },
        { Name: 'ShowZoomControls', Value: 'true' },
        { Name: 'Width', Value: '1600' },
        { Name: 'Height', Value: '1200' }
    ]
});
```

### Example 3: Dashboard Infographic with Scrolling

```typescript
const panels = [
    { svg: chartSvg1, title: 'Revenue' },
    { svg: chartSvg2, title: 'Users' },
    { svg: networkSvg, title: 'Connections' }
];

const result = await runAction({
    ActionName: 'Create SVG Infographic',
    Params: [
        {
            Name: 'Spec',
            Value: JSON.stringify({
                title: 'Q4 2024 Dashboard',
                columns: 2,
                panels: panels,
                width: 1400
            })
        },
        { Name: 'WrapWithContainer', Value: 'true' },
        { Name: 'MaxContainerHeight', Value: '900' }
    ]
});
```

## Troubleshooting

### Tooltips Not Appearing
- ✅ Check that SVG is inline (not `<img>` tag)
- ✅ Verify CSP allows inline scripts
- ✅ Check browser console for JavaScript errors
- ✅ Ensure `EnableTooltips` is set to `'true'` (string)

### Pan/Zoom Not Working
- ✅ Verify SVG is inline embedded
- ✅ Check that content is wrapped in `pan-zoom-container` group
- ✅ Test with mouse wheel first (easier to diagnose)
- ✅ On mobile, ensure touch events are not blocked

### Scrolling Container Not Showing
- ✅ Check that `WrapWithContainer` is `'true'`
- ✅ Verify SVG dimensions exceed container max dimensions
- ✅ Check that parent element allows overflow

### Performance Issues
- ✅ Reduce number of nodes (< 500 recommended)
- ✅ Disable unnecessary features (tooltips if not needed)
- ✅ Use scrolling container instead of pan/zoom for very large graphs
- ✅ Consider pagination or filtering data

## Advanced Usage

### Custom Tooltip Content

To customize tooltip content, generate nodes with custom data attributes:

```typescript
// Server-side action modification (advanced)
node.setAttribute('data-tooltip', `
    ${node.label}
    Connections: ${node.degree}
    Group: ${node.group}
    Last Updated: ${node.lastUpdated}
`.trim());
```

### Custom Pan/Zoom Limits

Modify `svg-utils.ts` to expose min/max scale as parameters:

```typescript
// Future enhancement - expose as action parameters
SVGUtils.generatePanZoomScript(containerId, minScale, maxScale, showControls);
```

### Styling Zoom Controls

Zoom control buttons can be styled via CSS:

```css
#zoom-controls rect {
    fill: #4CAF50 !important;
    stroke: #2E7D32 !important;
}

#zoom-controls text {
    fill: white !important;
}
```

## API Reference

### SVGUtils Methods

#### `wrapWithScrollContainer(svgString, maxWidth, maxHeight, showBorder, borderColor)`
Wraps SVG in scrollable HTML div container.

**Parameters:**
- `svgString` (string): The SVG XML string
- `maxWidth` (number): Max container width (default: 1200)
- `maxHeight` (number): Max container height (default: 800)
- `showBorder` (boolean): Show container border (default: true)
- `borderColor` (string): Border color hex (default: '#ddd')

**Returns:** HTML string with wrapped SVG

---

#### `addTooltipSupport(svg, doc)`
Adds interactive tooltip support to SVG.

**Parameters:**
- `svg` (SVGElement): The SVG element to enhance
- `doc` (Document): The document context

**Side Effects:** Appends tooltip elements and script to SVG

---

#### `generatePanZoomScript(containerId, minScale, maxScale, showControls)`
Generates self-contained pan/zoom JavaScript.

**Parameters:**
- `containerId` (string): ID of group to transform (default: 'pan-zoom-container')
- `minScale` (number): Minimum zoom level (default: 0.5)
- `maxScale` (number): Maximum zoom level (default: 3)
- `showControls` (boolean): Show zoom buttons (default: false)

**Returns:** `<script>` tag string with pan/zoom implementation

---

## Future Enhancements

Planned features for future releases:

- [ ] **Minimap overlay** - Show zoomed-out view with viewport indicator
- [ ] **Search/filter** - Highlight nodes matching search criteria
- [ ] **Lasso selection** - Select multiple nodes with mouse drag
- [ ] **Export state** - Save/restore pan/zoom position
- [ ] **Animation** - Smooth transitions when data changes
- [ ] **Highlight connected** - Fade unconnected nodes on hover
- [ ] **Expand/collapse** - Toggle tree branches
- [ ] **Rough.js integration** - Hand-drawn style diagrams

---

## Support

For issues or feature requests:
- GitHub: https://github.com/MemberJunction/MJ/issues
- Documentation: https://docs.memberjunction.org

---

**Last Updated:** 2025-10-20
**Version:** 2.108.0+
