# MJExplorer UI Improvements Tracking

## Issue 1: Golden Layout Content Scrolling
**Status**: Complete

**Problem**: Content in Golden Layout tabs doesn't always scroll (primarily affects Chat).

**Key Files**:
- [tab-container.component.css](packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.css)
- [conversation-chat-area.component.css](packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.css)

**Root Cause**: The `.lm_content` class (Golden Layout's content container) only had `background: white` set. It was missing `display: flex`, `flex-direction: column`, and proper height constraints needed for child flex layouts to work.

**Fix Applied**:
1. Added flexbox properties to `.lm_content` in tab-container.component.css:
```css
mj-tab-container .lm_content {
  background: white !important;
  display: flex !important;
  flex-direction: column !important;
  height: 100% !important;
}
```

2. Added `:host` and `min-height: 0` to conversation-list.component.ts:
```css
:host { display: block; height: 100%; }
.list-content { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 0; }
```

---

## Issue 2: Golden Layout Browser Resize
**Status**: Complete

**Problem**: When resizing the browser, Golden Layout windows don't always adjust to available width.

**Key Files**:
- [golden-layout-manager.ts](packages/Angular/Explorer/base-application/src/lib/golden-layout-manager.ts)
- [tab-container.component.ts](packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts)
- [tab-container.component.css](packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.css)

**Root Cause**: Golden Layout creates an anonymous `<div>` without a CSS class between `.lm_items` and `.lm_content` (in `component-item.ts:51`). This div wasn't being properly sized during resize operations because CSS selectors couldn't target it directly.

**Fix Applied** (commit 57dbee298):

1. **JavaScript Timing Fixes** in `golden-layout-manager.ts`:
   - Reduced resize debounce interval from 100ms to 50ms for snappier response
   - Disabled extended debounce so layout resizes during drag, not just after
   - Re-enabled delayed `setSize()` calls (50ms, 150ms, 300ms) to handle flexbox timing issues on page load
   - Uncommented and restored the `updateSize()` method for manual resize triggering

2. **Fallback Safety Mechanism** in `tab-container.component.ts`:
   - Added `@HostListener('window:resize')` as a backup mechanism to catch resize events that ResizeObserver might miss

3. **CSS Fixes** in `tab-container.component.css`:
   - Added proper sizing for `.lm_goldenlayout`, `.lm_root`, `.lm_items` containers
   - **Key fix**: Target the anonymous ComponentItem div with `.lm_items > div` selector to ensure 100% width/height
   - Added clearfix for float-based row layouts (GL uses `float:left` for horizontal panes)
   - Added `max-width: 100%` constraint on `.lm_content > *` to force content to respect parent bounds
   - Added proper `box-sizing: border-box` to all GL layout elements

4. **Related Fix** in `conversation-chat-area.component.css`:
   - Changed `min-width` constraint in chat-messages-pane to respect container bounds

---

## Issue 3: Mobile Responsiveness Audit
**Status**: Not Started

**Problem**: Ensure all areas of MJExplorer are mobile responsive (375px iPhone, 768px iPad).

**Areas to Audit**:
- [ ] Chat/Conversations
- [ ] Dashboard Browser
- [ ] Report Browser
- [ ] Query Browser
- [ ] Data Explorer
- [ ] Files
- [ ] Lists
- [ ] Settings
- [ ] Entity Forms
- [ ] Golden Layout Tabs

**Note**: Home Dashboard already has comprehensive responsive styles.

---

## Issue 4: Home Dashboard Enhancement
**Status**: Not Started

**Problem**: Make home dashboard more fleshed out; make nav item chips clickable for direct navigation to tertiary pages.

**Key Files**:
- [home-dashboard.component.ts](packages/Angular/Explorer/dashboards/src/Home/home-dashboard.component.ts)
- [home-dashboard.component.html](packages/Angular/Explorer/dashboards/src/Home/home-dashboard.component.html)
- [home-dashboard.component.css](packages/Angular/Explorer/dashboards/src/Home/home-dashboard.component.css)

**Current State**: Cards show first 3 nav items as preview chips with "+X more" indicator. Clicking card navigates to application.

**Enhancement**: Make individual nav item chips clickable to navigate directly to that item.

---

## Issue 5: Quick Action Behavior
**Status**: Not Started

**Problem**: Experiment with quick action behavior to display as a list on the dashboard, but as a main nav item when on another app page.

---

## Implementation Order
1. Issue 1 (GL Scrolling) - High impact, likely simple CSS fix
2. Issue 2 (GL Resize) - High impact, related to Issue 1
3. Issue 3 (Mobile Audit) - Medium impact, larger effort
4. Issue 4 (Dashboard) - Medium impact, feature enhancement
