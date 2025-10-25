# SVG Visualization Actions Improvement Plan

**Created:** 2025-10-20
**Status:** In Progress
**Priority:** High

## Overview

Comprehensive improvements to the SVG visualization actions in `packages/Actions/CoreActions/src/custom/visualization/` including:
- Enhanced scrolling for large outputs
- Interactive tooltips and hover behaviors
- Hand-drawn style diagrams with Rough.js
- Pan/zoom functionality (self-contained, no external runtime dependencies)
- Bug fixes for existing visualizations

---

## Task List

### Phase 1: Bug Fixes (Existing Issues)
- [ ] **Word Cloud**: Fix missing colors in word cloud visualization
  - Issue: Words appear without color differentiation
  - File: `create-svg-word-cloud.action.ts`

- [ ] **Chart Layout**: Improve spacing and centering in chart layouts
  - Issue: Content too close to title, not centered properly
  - File: `create-svg-chart.action.ts`

- [ ] **Line Connections**: Fix disconnected lines in charts
  - Issue: Some chart lines don't properly connect data points
  - File: `create-svg-chart.action.ts`

- [ ] **Diagram Spacing**: Review and improve spacing in all diagram types
  - Files: `create-svg-diagram.action.ts`, `create-svg-network.action.ts`

### Phase 2: Scrolling Containers
- [ ] Add `wrapWithScrollContainer()` utility to `svg-utils.ts`
- [ ] Add `WrapWithContainer` parameter to all 5 visualization actions
- [ ] Add `MaxContainerWidth` and `MaxContainerHeight` parameters
- [ ] Test with large datasets (500+ nodes, complex flowcharts)

### Phase 3: Interactive Tooltips
- [ ] Extend `InteractivityOptions` interface in `svg-types.ts`
- [ ] Implement tooltip generation for Network graphs
  - [ ] Add data attributes for tooltip content
  - [ ] Generate self-contained inline JavaScript
  - [ ] Create SVG tooltip overlay element
- [ ] Implement tooltips for Diagrams (flowcharts, org charts)
- [ ] Implement tooltips for Charts (data points)
- [ ] Add security documentation for inline scripts

### Phase 4: Hover Behaviors
- [ ] **Node Highlighting** (Network graphs)
  - [ ] Highlight connected nodes on hover
  - [ ] Fade unconnected nodes
  - [ ] Add visual edge highlighting

- [ ] **Expand/Collapse** (Decision trees)
  - [ ] Click to toggle branch visibility
  - [ ] Animate transitions (CSS-based)
  - [ ] Persist state in data attributes

### Phase 5: Pan and Zoom
- [ ] Implement self-contained pan/zoom (NO external D3 dependency at runtime)
  - [ ] Mouse wheel zoom
  - [ ] Click-drag pan
  - [ ] Touch gestures (pinch-zoom, two-finger pan)
  - [ ] Zoom controls overlay (optional buttons)
- [ ] Add `EnablePanZoom` parameter to applicable actions
- [ ] Test across browsers (Chrome, Firefox, Safari, Edge)
- [ ] Add zoom limits (min/max scale)
- [ ] Add reset button

### Phase 6: Rough.js Integration
- [ ] Install `roughjs` and `@types/roughjs` packages
- [ ] Create new action: `create-svg-sketch-diagram.action.ts`
- [ ] Support flowchart conversion to hand-drawn style
- [ ] Add roughness/wobble intensity parameter
- [ ] Add fill style options (solid, hachure, cross-hatch, dots)
- [ ] Test with org charts and decision trees
- [ ] Add loader function and exports

### Phase 7: Documentation & Testing
- [ ] Update action metadata in database
- [ ] Add JSDoc examples for new parameters
- [ ] Create sample test cases
- [ ] Update CLAUDE.md with new capabilities
- [ ] Add security notes about inline scripts

---

## Implementation Details

### Bug Fix Targets

#### Word Cloud Color Issue
**File:** `create-svg-word-cloud.action.ts:269`
**Problem:** `getColorForIndex()` may not be applying colors correctly
**Solution:** Verify color palette iteration and ensure fill attribute is set

#### Chart Spacing Issues
**File:** `create-svg-chart.action.ts`
**Problem:** Vega-Lite default padding insufficient
**Solution:** Add explicit padding configuration in Vega-Lite spec

#### Line Connection Issues
**File:** `create-svg-chart.action.ts`
**Problem:** Data interpolation or null handling
**Solution:** Add `defined` parameter to handle missing data points

### Scrolling Implementation

```typescript
// svg-utils.ts addition
static wrapWithScrollContainer(
    svgString: string,
    maxWidth: number,
    maxHeight: number,
    showBorder: boolean = true
): string {
    const borderStyle = showBorder ? 'border: 1px solid #ddd;' : '';
    return `<div style="max-width: ${maxWidth}px; max-height: ${maxHeight}px; overflow: auto; ${borderStyle} border-radius: 4px; background: white;">${svgString}</div>`;
}
```

### Interactive Tooltips Architecture

**No External Dependencies:** All JavaScript embedded in SVG `<script>` tag
**Security:** Server-generated content only, sanitized output
**Compatibility:** Works in inline SVG (`<svg>` in HTML), not `<img>` tags

```typescript
private generateTooltipScript(): string {
    return `<script type="text/javascript"><![CDATA[
        (function() {
            const svg = document.currentScript.closest('svg');
            const tooltip = svg.getElementById('mj-tooltip');

            svg.querySelectorAll('[data-tooltip]').forEach(el => {
                el.addEventListener('mouseenter', (e) => {
                    const rect = svg.getBoundingClientRect();
                    tooltip.setAttribute('x', e.clientX - rect.left + 10);
                    tooltip.setAttribute('y', e.clientY - rect.top - 10);
                    tooltip.textContent = el.getAttribute('data-tooltip');
                    tooltip.style.display = 'block';
                });
                el.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            });
        })();
    ]]></script>`;
}
```

### Pan/Zoom Implementation (Self-Contained)

**Requirements:**
- No external libraries (D3, etc.) at runtime
- Pure inline JavaScript embedded in SVG
- Support mouse wheel, drag, and touch gestures
- Configurable zoom limits

```typescript
private generatePanZoomScript(minScale: number = 0.5, maxScale: number = 3): string {
    return `<script type="text/javascript"><![CDATA[
        (function() {
            const svg = document.currentScript.closest('svg');
            const container = svg.getElementById('pan-zoom-container');

            let scale = 1, translateX = 0, translateY = 0;
            let isDragging = false, startX, startY;

            function updateTransform() {
                container.setAttribute('transform',
                    \`translate(\${translateX}, \${translateY}) scale(\${scale})\`);
            }

            // Mouse wheel zoom
            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                const newScale = Math.max(${minScale}, Math.min(${maxScale}, scale * delta));

                // Zoom toward mouse position
                const rect = svg.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                translateX = x - (x - translateX) * (newScale / scale);
                translateY = y - (y - translateY) * (newScale / scale);
                scale = newScale;

                updateTransform();
            });

            // Pan with drag
            svg.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX - translateX;
                startY = e.clientY - translateY;
                svg.style.cursor = 'grabbing';
            });

            svg.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                translateX = e.clientX - startX;
                translateY = e.clientY - startY;
                updateTransform();
            });

            svg.addEventListener('mouseup', () => {
                isDragging = false;
                svg.style.cursor = 'grab';
            });

            // Touch gestures
            let touchStartDist = 0;
            svg.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    touchStartDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                }
            });

            svg.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const dist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    const delta = dist / touchStartDist;
                    scale = Math.max(${minScale}, Math.min(${maxScale}, scale * delta));
                    touchStartDist = dist;
                    updateTransform();
                }
            });

            svg.style.cursor = 'grab';
        })();
    ]]></script>`;
}
```

### Rough.js Architecture

**New Action:** `CreateSVGSketchDiagramAction`
**Extends:** Existing diagram types (flow, org, er)
**Parameters:**
- All standard diagram parameters
- `Roughness` (0.5-3.0, default 1.5)
- `FillStyle` ('solid' | 'hachure' | 'cross-hatch' | 'dots')
- `Bowing` (curvature of lines, default 1)

---

## Testing Checklist

- [ ] Word cloud with 50+ words displays all colors
- [ ] Charts have proper spacing (40px+ from title)
- [ ] Line charts connect all points correctly
- [ ] Scroll containers work with 1000+ node networks
- [ ] Tooltips display on hover without JavaScript errors
- [ ] Pan/zoom works with mouse wheel
- [ ] Pan/zoom works with click-drag
- [ ] Pan/zoom respects min/max scale limits
- [ ] Touch gestures work on mobile
- [ ] Rough.js diagrams render with hand-drawn style
- [ ] All actions still pass sanitization
- [ ] No external runtime dependencies

---

## Security Considerations

**Inline Scripts:**
- ✅ Generated server-side only
- ✅ No user input in script content
- ✅ Works only in inline SVG (not `<img>` tags)
- ⚠️ Requires `script-src 'unsafe-inline'` CSP or nonce

**Documentation Update:**
```markdown
## Using Interactive SVG Visualizations

Interactive SVG visualizations include embedded JavaScript for tooltips,
pan/zoom, and hover behaviors. These features require:

1. **Inline SVG embedding** - Use `<svg>` tags in HTML, not `<img src="...">`
2. **CSP Configuration** - Add `script-src 'unsafe-inline'` to Content-Security-Policy
   - OR use nonce: `<svg ... nonce="abc123">` and CSP: `script-src 'nonce-abc123'`
3. **Browser Compatibility** - Modern browsers (Chrome 90+, Firefox 88+, Safari 14+)

To disable interactivity: Set `Interactivity.enabled: false` parameter.
```

---

## Files to Modify

### Existing Files
- `packages/Actions/CoreActions/src/custom/visualization/shared/svg-utils.ts`
- `packages/Actions/CoreActions/src/custom/visualization/shared/svg-types.ts`
- `packages/Actions/CoreActions/src/custom/visualization/create-svg-chart.action.ts`
- `packages/Actions/CoreActions/src/custom/visualization/create-svg-network.action.ts`
- `packages/Actions/CoreActions/src/custom/visualization/create-svg-diagram.action.ts`
- `packages/Actions/CoreActions/src/custom/visualization/create-svg-word-cloud.action.ts`
- `packages/Actions/CoreActions/src/custom/visualization/create-svg-infographic.action.ts`
- `packages/Actions/CoreActions/src/index.ts` (add exports)

### New Files
- `packages/Actions/CoreActions/src/custom/visualization/create-svg-sketch-diagram.action.ts`

### Package Files
- `packages/Actions/CoreActions/package.json` (add roughjs dependency)

---

## Estimated Timeline

- **Phase 1 (Bug Fixes):** 4 hours
- **Phase 2 (Scrolling):** 2 hours
- **Phase 3 (Tooltips):** 8 hours
- **Phase 4 (Hover Behaviors):** 6 hours
- **Phase 5 (Pan/Zoom):** 8 hours
- **Phase 6 (Rough.js):** 12 hours
- **Phase 7 (Documentation):** 4 hours

**Total:** ~44 hours (~1 week sprint)

---

## Success Metrics

- [ ] Zero visual bugs in generated SVGs
- [ ] All interactive features work without external dependencies
- [ ] No security vulnerabilities in inline scripts
- [ ] Performance maintained (generation time < 2s for typical visualizations)
- [ ] User satisfaction with hand-drawn diagram style
- [ ] Scrolling improves usability for large graphs (user feedback)

---

## Notes

- All JavaScript must be embedded inline - no external script files
- Maintain backward compatibility - all new features are opt-in
- Sanitization must pass for all outputs
- Test across major browsers before completion
