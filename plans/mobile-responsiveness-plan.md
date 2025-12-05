# Plan: Issue 3 - Mobile Responsiveness Audit for MJExplorer

## Overview
Comprehensive audit and fix of mobile responsiveness across MJExplorer, targeting 375px (iPhone) and 768px (iPad) breakpoints.

## Key Strategy: Container Queries for Golden Layout Content

Since Golden Layout panels can be resized independently of the viewport (a panel could be 400px wide on a 1920px screen), we'll use **CSS Container Queries** as the primary responsive strategy for content rendered inside GL panels.

### Why Container Queries?
- GL panels resize independently of viewport
- User can have split panes at any width
- Components should respond to their container, not the window
- Provides true component-level responsiveness

### Implementation Approach

1. **Define containment** on GL content wrappers:
```css
/* In tab-container.component.css or a shared location */
mj-tab-container .lm_content {
  container-type: inline-size;
  container-name: gl-panel;
}
```

2. **Use container queries in components**:
```css
/* Instead of @media (max-width: 768px) */
@container gl-panel (max-width: 768px) {
  /* Responsive styles */
}

@container gl-panel (max-width: 480px) {
  /* Small container styles */
}
```

3. **Fallback with @media for non-GL contexts**:
```css
/* Container query for GL panels */
@container gl-panel (max-width: 768px) {
  .my-component { /* styles */ }
}

/* Media query fallback for standalone/modal contexts */
@media (max-width: 768px) {
  .my-component { /* same styles */ }
}
```

### Browser Support
Container queries are supported in all modern browsers (Chrome 105+, Firefox 110+, Safari 16+). For MJExplorer's target audience, this should be acceptable.

---

## Current State Summary

| Area | Status | Breakpoints | Priority |
|------|--------|-------------|----------|
| Chat/Conversations | Mixed (67%) | 768px, 480px | High |
| Home Dashboard | Excellent | 1200px, 992px, 768px, 480px | Reference |
| Settings | Good | 768px only | Medium |
| Query Browser | Good base | 1200px, 768px | Medium |
| Data Browser | Good | 768px, 1024px, 480px | Low |
| Generic Browse List | Good | 768px, 480px | Low |
| Golden Layout Tabs | **CRITICAL** | NONE | Critical |
| Entity Forms | **POOR** | 768px only | High |
| User View Grid | **POOR** | NONE | High |
| Report Browser | **NONE** | NONE | High |
| Files Component | **NONE** | NONE | Medium |
| Scheduling Dashboard | **NONE** | NONE | Medium |
| EntityAdmin Dashboard | **NONE** | NONE | Low |

## Reference: Home Dashboard Patterns to Replicate

The Home Dashboard (`packages/Angular/Explorer/dashboards/src/Home/home-dashboard.component.css`) uses these effective patterns:

```css
/* Multi-level breakpoints */
@media (max-width: 1200px) { /* Small desktop */ }
@media (max-width: 992px)  { /* Tablet */ }
@media (max-width: 768px)  { /* Mobile */ }
@media (max-width: 480px)  { /* Small phone */ }

/* Flexible grid */
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
/* Changes to 1fr on mobile */

/* Overlay sidebar pattern */
.sidebar {
  position: fixed;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
}
```

---

## Implementation Plan

### Phase 1: Foundation (Container Query Setup & Golden Layout)

#### 1.1 Enable Container Queries on Golden Layout
**File:** `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.css`

**Add container context to `.lm_content`:**
```css
mj-tab-container .lm_content {
  /* Existing styles... */
  container-type: inline-size;
  container-name: gl-panel;
}
```

This enables all child components to use `@container gl-panel (max-width: Xpx)` queries.

#### 1.2 Golden Layout Tab Header Responsiveness
**File:** `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.css`

**Issues:**
- Zero media queries for tab header
- Fixed tab heights (35-38px)
- 16px padding wastes space on mobile
- Tabs won't scroll on narrow screens

**Changes (use @media for header since it's outside .lm_content):**
```css
@media (max-width: 768px) {
  mj-tab-container .lm_header .lm_tab {
    padding: 8px 12px;
    font-size: 12px;
  }
}
```
- Add horizontal scroll for tab overflow
- Reduce tab padding on mobile

#### 1.3 User View Grid
**File:** `packages/Angular/Explorer/user-view-grid/src/lib/ng-user-view-grid.component.css`

**Issues:**
- No responsive queries
- Fixed widths (360px search, 65% search bar)

**Changes (use @container):**
```css
@container gl-panel (max-width: 768px) {
  .search-container { width: 100%; }
  .toolbar { flex-wrap: wrap; gap: 8px; }
}
@container gl-panel (max-width: 480px) {
  .toolbar-buttons { width: 100%; justify-content: space-between; }
}
```

---

### Phase 2: Chat/Conversations Components

Chat components render inside GL panels, so use `@container` queries.

#### 2.1 Thread Panel (Critical)
**File:** `packages/Angular/Generic/conversations/src/lib/components/thread-panel/thread-panel.component.css`

**Issues:**
- Fixed width at 450px (too wide for narrow panels)
- Only has `max-width: 90vw` as fallback

**Changes:**
```css
@container gl-panel (max-width: 600px) {
  .thread-panel {
    width: 100%;
    position: absolute;
    inset: 0;
  }
}
@container gl-panel (max-width: 480px) {
  .thread-panel { padding: 12px; }
}
```

#### 2.2 Mention Dropdown (Critical)
**File:** `packages/Angular/Generic/conversations/src/lib/components/mention-dropdown/mention-dropdown.component.css`

**Issues:**
- `min-width: 280px` causes overflow on narrow containers
- `max-width: 400px` exceeds small panels

**Changes:**
```css
.mention-dropdown {
  min-width: min(280px, 90cqw); /* container query width */
  max-width: min(400px, 95cqw);
}
@container gl-panel (max-width: 480px) {
  .suggestion-icon { width: 24px; height: 24px; }
}
```

#### 2.3 Share Modals
**Files:**
- `packages/Angular/Generic/conversations/src/lib/components/artifact-share-modal/artifact-share-modal.component.css`
- `packages/Angular/Generic/conversations/src/lib/components/collection-share-modal/collection-share-modal.component.css`

**Note:** Modals render in overlay, use `@media` queries (not in GL container context).

**Changes:**
```css
@media (max-width: 768px) {
  .modal-container { max-width: 90vw; }
  .permissions-grid { grid-template-columns: 1fr; }
  .user-avatar { width: 32px; height: 32px; }
}
@media (max-width: 480px) {
  .modal-content { padding: 12px; }
}
```

#### 2.4 Message List
**File:** `packages/Angular/Generic/conversations/src/lib/components/message-list/message-list.component.css`

**Issues:**
- Padding fixed at 40px (too large for narrow panels)

**Changes:**
```css
@container gl-panel (max-width: 768px) {
  .message-list { padding: 16px; }
}
@container gl-panel (max-width: 480px) {
  .message-list { padding: 8px; }
  .date-nav { min-width: auto; }
}
```

---

### Phase 3: Browser Components

Browser components render inside GL panels, so use `@container` queries.

#### 3.1 Report Browser
**File:** `packages/Angular/Explorer/explorer-core/src/lib/report-browser-component/report-browser.component.css`

**Issues:**
- Only 3 lines of CSS
- No responsive styles at all

**Changes:**
```css
@container gl-panel (max-width: 768px) {
  .report-grid { grid-template-columns: 1fr; }
  .k-card-body { height: auto; min-height: 60px; }
}
@container gl-panel (max-width: 480px) {
  .report-card { padding: 12px; }
}
```

#### 3.2 Query Browser Refinements
**File:** `packages/Angular/Explorer/explorer-core/src/lib/query-browser-component/query-browser.component.css`

**Issues:**
- Missing small container breakpoint
- Search container fixed at 300px
- Panel grid `minmax(350px, 1fr)` too wide for narrow panels

**Changes:**
```css
.search-container {
  width: min(300px, 100cqw);
}

.panel-grid {
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100cqw), 1fr));
}

@container gl-panel (max-width: 768px) {
  .query-browser-header { flex-direction: column; gap: 12px; }
  .filter-bar { flex-direction: column; }
}

@container gl-panel (max-width: 480px) {
  .query-browser-header { padding: 12px; }
  .panel-grid { grid-template-columns: 1fr; }
}
```

---

### Phase 4: Entity Forms

Entity forms render inside GL panels, so use `@container` queries.

#### 4.1 Form Styles (Shared)
**File:** `packages/Angular/Explorer/core-entity-forms/src/shared/form-styles.css`

**Changes:**
```css
@container gl-panel (max-width: 768px) {
  .record-form-row { flex-direction: column; }
  .form-section { padding: 16px; }
}
@container gl-panel (max-width: 480px) {
  .form-section { padding: 12px; }
  .section-title { font-size: 14px; }
}
```

#### 4.2 Action Form
**File:** `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Actions/action-form.component.css`

**Issues:**
- No responsive queries
- Hero header with fixed 80px icons, 400px input
- 2em title font not scaled

**Changes:**
```css
@container gl-panel (max-width: 768px) {
  .hero-section { flex-direction: column; text-align: center; }
  .hero-icon { width: 60px; height: 60px; }
  .hero-title { font-size: 1.5em; }
  .hero-input { width: 100%; max-width: none; }
}
@container gl-panel (max-width: 480px) {
  .hero-icon { width: 48px; height: 48px; }
  .hero-title { font-size: 1.25em; }
}
```

#### 4.3 AI Agent Run Form
**File:** `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run.component.css`

**Issues:**
- No responsive queries
- Fixed 48px icons, 24px font
- Configuration bar `gap: 24px` will overflow

**Changes:**
```css
@container gl-panel (max-width: 768px) {
  .config-bar { flex-wrap: wrap; gap: 12px; }
  .header-icon { width: 36px; height: 36px; }
  .header-title { font-size: 18px; }
}
@container gl-panel (max-width: 480px) {
  .config-bar { gap: 8px; }
  .header-icon { width: 28px; height: 28px; }
}
```

---

### Phase 5: Dashboard Components

Dashboards render inside GL panels, so use `@container` queries.

#### 5.1 Scheduling Dashboard
**File:** `packages/Angular/Explorer/dashboards/src/Scheduling/scheduling-dashboard.component.css`

**Issues:**
- No responsive queries at all

**Changes:**
```css
@container gl-panel (max-width: 1024px) {
  .dashboard-grid { grid-template-columns: 1fr 1fr; }
}
@container gl-panel (max-width: 768px) {
  .dashboard-grid { grid-template-columns: 1fr; }
  .dashboard-header { flex-direction: column; gap: 12px; }
}
@container gl-panel (max-width: 480px) {
  .dashboard-content { padding: 12px; }
}
```

#### 5.2 AI Dashboard Components
**Files:**
- `packages/Angular/Explorer/dashboards/src/AI/components/models/model-management-v2.component.css`
- `packages/Angular/Explorer/dashboards/src/AI/components/prompts/prompt-management-v2.component.css`
- `packages/Angular/Explorer/dashboards/src/AI/components/agents/agent-configuration.component.css`

**Issues:**
- Only 768px breakpoint (media query)
- Missing small container support

**Changes (convert existing @media to @container + add small breakpoint):**
```css
@container gl-panel (max-width: 768px) {
  .model-grid { grid-template-columns: 1fr; }
  .dashboard-header { flex-direction: column; }
}
@container gl-panel (max-width: 480px) {
  .card-content { padding: 12px; }
  .section-title { font-size: 14px; }
}
```

---

### Phase 6: Settings & Files

Settings and Files render inside GL panels, so use `@container` queries.

#### 6.1 Settings Component
**File:** `packages/Angular/Explorer/explorer-settings/src/lib/settings/settings.component.css`

**Issues:**
- Only 768px breakpoint (media query)
- Missing tablet and small container support

**Changes (convert to @container + add breakpoints):**
```css
@container gl-panel (max-width: 992px) {
  .settings-layout { gap: 16px; }
}
@container gl-panel (max-width: 768px) {
  .settings-layout { flex-direction: column; }
  .settings-sidebar { width: 100%; }
  .mobile-navigation { display: flex; }
}
@container gl-panel (max-width: 480px) {
  .settings-content { padding: 12px; }
  .nav-tab { padding: 8px 12px; font-size: 12px; }
}
```

#### 6.2 Files Component
**File:** `packages/Angular/Explorer/explorer-core/src/lib/files/files.component.css`

**Issues:**
- Only 3 lines of CSS (minimal styling)

**Changes:**
```css
:host {
  display: block;
  height: 100%;
}

.files-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

@container gl-panel (max-width: 768px) {
  .files-grid { grid-template-columns: 1fr; }
  .file-card { padding: 12px; }
}
@container gl-panel (max-width: 480px) {
  .files-header { flex-direction: column; gap: 8px; }
}
```

---

## Standard Breakpoints

### For GL Panel Content (use @container)
```css
/* Small container (narrow panel or mobile) */
@container gl-panel (max-width: 480px) { }

/* Medium container */
@container gl-panel (max-width: 768px) { }

/* Large container */
@container gl-panel (max-width: 1024px) { }
```

### For Non-GL Content (modals, overlays, shell - use @media)
```css
/* Small phones (iPhone SE, small Android) */
@media (max-width: 480px) { }

/* Mobile phones */
@media (max-width: 768px) { }

/* Tablets */
@media (max-width: 992px) { }
```

## Common CSS Patterns

### Container-Responsive Sizing (for GL content)
```css
/* Use cqw (container query width) units */
max-width: min(400px, 95cqw);
min-width: min(280px, 90cqw);

/* Container-responsive grid */
grid-template-columns: repeat(auto-fill, minmax(min(280px, 100cqw), 1fr));

@container gl-panel (max-width: 600px) {
  grid-template-columns: 1fr;
}
```

### Viewport-Responsive Sizing (for modals/overlays)
```css
/* Use vw for viewport-relative sizing */
max-width: min(400px, 95vw);
```

### Responsive Padding Pattern
```css
/* Base padding */
padding: 24px;

/* Container query version (GL content) */
@container gl-panel (max-width: 768px) { padding: 16px; }
@container gl-panel (max-width: 480px) { padding: 12px; }

/* Media query version (non-GL) */
@media (max-width: 768px) { padding: 16px; }
@media (max-width: 480px) { padding: 12px; }
```

### When to Use Which
| Context | Query Type | Units |
|---------|------------|-------|
| Inside GL panel | `@container gl-panel` | `cqw`, `cqh` |
| Modals/Dialogs | `@media` | `vw`, `vh` |
| Shell/Header/Nav | `@media` | `vw`, `vh` |
| Standalone pages | `@media` | `vw`, `vh` |

---

## Files to Modify (Full List)

### Critical (Phase 1)
1. `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.css`
2. `packages/Angular/Explorer/user-view-grid/src/lib/ng-user-view-grid.component.css`

### High Priority (Phase 2-3)
3. `packages/Angular/Generic/conversations/src/lib/components/thread-panel/thread-panel.component.css`
4. `packages/Angular/Generic/conversations/src/lib/components/mention-dropdown/mention-dropdown.component.css`
5. `packages/Angular/Generic/conversations/src/lib/components/artifact-share-modal/artifact-share-modal.component.css`
6. `packages/Angular/Generic/conversations/src/lib/components/collection-share-modal/collection-share-modal.component.css`
7. `packages/Angular/Generic/conversations/src/lib/components/message-list/message-list.component.css`
8. `packages/Angular/Explorer/explorer-core/src/lib/report-browser-component/report-browser.component.css`
9. `packages/Angular/Explorer/explorer-core/src/lib/query-browser-component/query-browser.component.css`

### Medium Priority (Phase 4-6)
10. `packages/Angular/Explorer/core-entity-forms/src/shared/form-styles.css`
11. `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Actions/action-form.component.css`
12. `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run.component.css`
13. `packages/Angular/Explorer/dashboards/src/Scheduling/scheduling-dashboard.component.css`
14. `packages/Angular/Explorer/dashboards/src/AI/components/models/model-management-v2.component.css`
15. `packages/Angular/Explorer/dashboards/src/AI/components/prompts/prompt-management-v2.component.css`
16. `packages/Angular/Explorer/dashboards/src/AI/components/agents/agent-configuration.component.css`
17. `packages/Angular/Explorer/explorer-settings/src/lib/settings/settings.component.css`
18. `packages/Angular/Explorer/explorer-core/src/lib/files/files.component.css`

---

## Testing Checklist

### Viewport Testing (for shell/modals)
Test at these viewport sizes:
- [ ] 375px width (iPhone SE/12 mini)
- [ ] 390px width (iPhone 13/14)
- [ ] 768px width (iPad portrait)
- [ ] 1024px width (iPad landscape)
- [ ] 1200px width (small desktop)

### Container Query Testing (for GL panel content)
Test GL panels at these widths (resize panels, not viewport):
- [ ] Full width panel (~1200px)
- [ ] Half-width panel (~600px)
- [ ] Narrow panel (~400px)
- [ ] Very narrow panel (~300px)

### Interaction Testing
- [ ] Chat conversation scrolling in narrow panel
- [ ] Thread panel open/close in various panel widths
- [ ] Mention dropdown positioning in narrow containers
- [ ] Tab switching in Golden Layout
- [ ] Form field layout in split view
- [ ] Modal positioning and sizing (viewport-based)
- [ ] Navigation drawer (viewport-based)
- [ ] Query/Report browser in narrow panels
- [ ] Settings panel responsiveness

### Browser DevTools Tips
- Use Chrome DevTools "Elements" panel to inspect container size
- Look for `container-type: inline-size` on `.lm_content`
- Container queries won't work if containment isn't set
- Use "Computed" tab to verify which responsive styles are applied
