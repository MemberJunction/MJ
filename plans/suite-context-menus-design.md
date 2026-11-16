# MemberJunction Productivity Suite — Right-Click Context Menu System Design

**Status:** Implementation-Ready Technical & UX Specification  
**Target Branch / Worktree:** `feat/unified-agent-artifacts` (`/Users/amith/mj-worktrees/unified-agent-artifacts`)  
**Target Package:** `@memberjunction/ng-artifacts` (`packages/Angular/Generic/artifacts`)  
**Scope:** Shared `<mj-context-menu>` infrastructure + complete context menu coverage for **MJ Docs** (`MarkdownArtifactViewerComponent`), **MJ Slides** (`SlideDeckArtifactViewerComponent`), **MJ Sheets** (`SpreadsheetArtifactViewerComponent`), plus embedded **Whiteboard / Canvas** (`WhiteboardBoardComponent`) and shared container (`ArtifactViewerPanelComponent`) integration.

---

## 0. Executive Summary & Architectural Decisions

1. **Single Shared Menu Component, Pure Per-Viewer Descriptor Builders:**
   - Introduce a reusable, WAI-ARIA-compliant `<mj-context-menu>` component (`standalone: false` declared & exported by `ArtifactsModule`) backed by pure viewport/collision/submenu positioning functions (`context-menu-position.util.ts`).
   - Keep the three large artifact viewers (`12.5k`, `5.8k`, and `8.1k` lines respectively) lean by isolating all menu construction logic into pure, strongly-typed builder modules (`docs-context-menu.helper.ts`, `slides-context-menu.helper.ts`, `sheets-context-menu.helper.ts`). Each viewer simply computes a typed target context snapshot, asks its helper for `ContextMenuItem<TCommand>[]`, and dispatches the returned discriminated-union `TCommand` in a single `OnContextMenuCommand(cmd)` switch.
2. **Fixed-Viewport Rendering & Z-Index Strategy (Shared Container Integration):**
   - Productivity viewers render inside `ArtifactViewerPanelComponent` docked drawers (`--mj-z-drawer: 1000`), maximized Studio tabs, modals (`--mj-z-dialog: 1200`), and `MJDialogService` / `mj-window` overlays (`10000–10001`), often nested inside `overflow: hidden` or `overflow: auto` scroll regions.
   - `<mj-context-menu>` renders its root panel and active cascading submenus using `position: fixed` with `z-index: var(--mj-z-context-menu, 10050)`. No changes to `ArtifactViewerPanelComponent` are required, and menus never clip against pane splitters, filmstrips, or sheet scroll viewports.
3. **Embedded Whiteboard / OLE Canvas Integration (`event.defaultPrevented` Contract):**
   - `WhiteboardBoardComponent` (`packages/Angular/Generic/whiteboard/src/lib/whiteboard-board.component.ts:1740`) **already implements** a rich custom right-click menu (`OnCanvasContextMenu`, `OnElementContextMenu`, `OnPageTabContextMenu`) that calls `event.preventDefault()` *without* calling `event.stopPropagation()`.
   - Therefore, every host viewer (`MarkdownArtifactViewerComponent`, `SlideDeckArtifactViewerComponent`, `SpreadsheetArtifactViewerComponent`) MUST guard its `(contextmenu)` handlers with `if (event.defaultPrevented || event.shiftKey) return;`.
   - **Result:** When an embedded Whiteboard card is in **interactive inline-edit mode** (`[readonly]="false"`), right-clicking inside the board opens the Whiteboard's own canvas/element menu cleanly without double-opening the host's menu. When the Whiteboard card is in **snapshot / read-only preview mode** (`[readonly]="true"`), `WhiteboardBoardComponent` returns early without `preventDefault()`, allowing the event to bubble naturally to the host's **Embedded Artifact Card** context menu (*Edit Inline*, *Open Full Screen*, *Open Source Artifact*, *Pin/Update Version*, *Comment*, *Delete*).
4. **Native Browser Context Menu Opt-Out (`Shift + Right-Click`) & Native Input Exemption:**
   - Holding **`Shift + Right-Click`** (`event.shiftKey`) bypasses custom context menu interception across the entire suite so users always retain one-gesture access to browser native spellcheck suggestions (in `contenteditable` blocks) and browser DevTools *Inspect Element*.
   - Native text form controls (`<input>`, `<textarea>`, and `[data-native-contextmenu="true"]`) are exempted by default so native Cut/Copy/Paste/Spellcheck works naturally inside toolbar inputs, modal fields, formula bar inputs, active inline sheet cell `<input>` editors, raw source `<textarea>`, and comment composers.
5. **Strict Escape Precedence:**
   - When `<mj-context-menu>` is open, a capture-phase `keydown` listener intercepts `Escape`, closing **only** the deepest open submenu (or the root context menu) and calling `event.preventDefault()`, `event.stopPropagation()`, and `event.stopImmediatePropagation()`. Pressing `Escape` to dismiss a right-click menu will **never** exit Slide Presentation mode, close an open Configure/Chart modal, or dismiss the `ArtifactViewerPanelComponent` drawer.
6. **Honest Engine Grounding (Zero Dead or Fake Menu Items):**
   - Every menu item maps to verified engine capabilities in `DocumentLiveBlockEngine`, `SlideDeckEngine`, and `SpreadsheetEngine`. Unsupported spreadsheet concepts (such as merged cells, which do not exist in `SpreadsheetEngine`) are intentionally omitted rather than rendered as non-functional stubs, while structured slide layouts expose **Region Swap / Move Earlier–Later** rather than fake free-canvas z-order.

---

## 1. Shared Right-Click Context Menu Infrastructure

### 1.1 Public Types & Contracts (`context-menu.types.ts`)

All types use strict TypeScript with **zero `any` and zero `unknown`**. The payload type parameter `TPayload` defaults to `string` and allows each viewer to pass a strongly-typed discriminated union command object.

```typescript
export type ContextMenuItemRole = 'menuitem' | 'menuitemcheckbox' | 'menuitemradio';

export interface ContextMenuSwatchOption<TPayload = string> {
    /** Accessible label, e.g. 'Brand Blue Fill' or 'Clear Fill' */
    Label: string;
    /** CSS color value or semantic token expression rendered in the swatch preview dot */
    PreviewCssColor: string;
    /** Strongly-typed command dispatched when clicked */
    Command: TPayload;
    /** True when this swatch matches the current selection's color */
    Selected?: boolean;
    /** Renders a diagonal slash icon for 'Reset / Clear color' */
    IsClearSwatch?: boolean;
}

export interface ContextMenuActionItem<TPayload = string> {
    Kind: 'action';
    ID: string;
    Label: string;
    /** Font Awesome class string, e.g. 'fa-solid fa-copy' */
    Icon?: string;
    /** Platform-normalized shortcut display badge, e.g. '⌘C' or 'Ctrl+C' */
    Shortcut?: string;
    /** Optional right-aligned subtle pill/meta text (e.g. '3 rows') */
    BadgeText?: string;
    Role?: ContextMenuItemRole;
    /** Used when Role is 'menuitemcheckbox' or 'menuitemradio' */
    Checked?: boolean;
    /** Renders label/icon in semantic error token on hover/focus */
    Destructive?: boolean;
    /** Keeps item focusable via aria-disabled="true" while blocking execution */
    Disabled?: boolean;
    /** Shown as tooltip / inline assistive title when Disabled is true */
    DisabledReason?: string;
    /** Strongly-typed payload emitted on activation */
    Command: TPayload;
}

export interface ContextMenuSubmenuItem<TPayload = string> {
    Kind: 'submenu';
    ID: string;
    Label: string;
    Icon?: string;
    Disabled?: boolean;
    DisabledReason?: string;
    Children: ReadonlyArray<ContextMenuItem<TPayload>>;
}

export interface ContextMenuSwatchRowItem<TPayload = string> {
    Kind: 'swatch-row';
    ID: string;
    Label: string;
    Disabled?: boolean;
    DisabledReason?: string;
    Swatches: ReadonlyArray<ContextMenuSwatchOption<TPayload>>;
}

export interface ContextMenuSeparatorItem {
    Kind: 'separator';
    ID?: string;
}

export interface ContextMenuHeaderItem {
    Kind: 'header';
    ID?: string;
    Label: string;
    Icon?: string;
}

export type ContextMenuItem<TPayload = string> =
    | ContextMenuActionItem<TPayload>
    | ContextMenuSubmenuItem<TPayload>
    | ContextMenuSwatchRowItem<TPayload>
    | ContextMenuSeparatorItem
    | ContextMenuHeaderItem;

export interface ContextMenuViewportSize {
    Width: number;
    Height: number;
}

export interface ContextMenuPanelDimensions {
    Width: number;
    Height: number;
}

export interface ContextMenuAnchorRect {
    Top: number;
    Left: number;
    Right: number;
    Bottom: number;
    Width: number;
    Height: number;
}

export interface ContextMenuComputedPlacement {
    Left: number;
    Top: number;
    MaxHeight: number;
    FlippedHorizontally: boolean;
    FlippedVertically: boolean;
}

export interface ContextMenuState<TPayload = string> {
    IsOpen: boolean;
    AnchorX: number;
    AnchorY: number;
    Items: ReadonlyArray<ContextMenuItem<TPayload>>;
    AriaLabel: string;
    RestoreFocusElement: HTMLElement | null;
}
```

### 1.2 Platform Shortcut Helper

Provide a small pure utility `FormatMenuShortcut(macShortcut: string, winShortcut: string, isMac?: boolean): string` (detecting `/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)` when `isMac` is omitted):
- macOS displays compact glyphs: `⌘X`, `⌘C`, `⌘V`, `⇧⌘V`, `⌘K`, `⌥↑`, `⌥↓`, `⌫`.
- Windows/Linux displays explicit labels: `Ctrl+X`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Shift+V`, `Ctrl+K`, `Alt+↑`, `Alt+↓`, `Del`.

### 1.3 Viewport Collision Flipping & Clamping Math (`context-menu-position.util.ts`)

All coordinate math is implemented as pure, deterministic functions so unit tests run without layout mocks:

1. **Root Menu Placement (`ComputeRootMenuPlacement(anchorX, anchorY, panel, viewport, edgeMargin = 8)`):**
   - `maxHeight = Math.max(160, viewport.Height - edgeMargin * 2)`.
   - Effective height `effectiveHeight = Math.min(panel.Height, maxHeight)`.
   - **Horizontal flip/clamp:**
     - Default `left = anchorX`.
     - If `anchorX + panel.Width > viewport.Width - edgeMargin`:
       - Try flipping left of cursor: `flippedLeft = anchorX - panel.Width`.
       - `left = flippedLeft >= edgeMargin ? flippedLeft : Math.max(edgeMargin, viewport.Width - panel.Width - edgeMargin)`.
       - `flippedHorizontally = true`.
     - Clamp lower bound: `left = Math.max(edgeMargin, left)`.
   - **Vertical flip/clamp:**
     - Default `top = anchorY`.
     - If `anchorY + effectiveHeight > viewport.Height - edgeMargin`:
       - Try flipping above cursor: `flippedTop = anchorY - effectiveHeight`.
       - `top = flippedTop >= edgeMargin ? flippedTop : Math.max(edgeMargin, viewport.Height - effectiveHeight - edgeMargin)`.
       - `flippedVertically = true`.
     - Clamp lower bound: `top = Math.max(edgeMargin, top)`.
2. **Cascading Submenu Placement (`ComputeSubmenuPlacement(parentItemRect, submenuPanel, viewport, parentFlippedHorizontally = false, overlapPx = 4, edgeMargin = 8)`):**
   - Preferred horizontal direction inherits `parentFlippedHorizontally ? 'left' : 'right'` so multi-level menus cascade coherently.
   - When opening right: `left = parentItemRect.Right - overlapPx`. If `left + submenuPanel.Width > viewport.Width - edgeMargin` and `parentItemRect.Left + overlapPx - submenuPanel.Width >= edgeMargin`, flip left (`left = parentItemRect.Left + overlapPx - submenuPanel.Width`). Otherwise clamp to `viewport.Width - submenuPanel.Width - edgeMargin`.
   - Vertical alignment starts at `top = parentItemRect.Top - 4` (aligning first child item with parent item row) and clamps to `[edgeMargin, viewport.Height - effectiveHeight - edgeMargin]`.
3. **Two-Phase Render Without Visual Jump:**
   - When `IsOpen` flips `true`, render the panel at `(AnchorX, AnchorY)` with `visibility: hidden`, measure `getBoundingClientRect()` synchronously in `afterNextRender` / `requestAnimationFrame` (or immediately after `ChangeDetectorRef.detectChanges()`), apply `ComputeRootMenuPlacement`, and flip `IsPositioned = true` (`visibility: visible`).
4. **Automatic Separator Normalization (`NormalizeContextMenuItems(items)`):**
   - Before rendering, strip leading separators, trailing separators, consecutive duplicate separators, and headers whose entire section was filtered out — guaranteeing builders can compose sections conditionally without ever leaving orphaned divider lines.

### 1.4 Keyboard Navigation, WAI-ARIA APG Compliance & Cascading Submenus

- **Container ARIA:** `<div class="mj-context-menu-panel" role="menu" [attr.aria-label]="AriaLabel" tabindex="-1">`.
- **Item ARIA & Focusable Disabled Pattern:**
  - Interactive items (`action`, `submenu`) render as `<button type="button" class="mj-context-menu-item" [attr.role]="GetItemRole(item)" [attr.aria-checked]="GetAriaChecked(item)" [attr.aria-haspopup]="item.Kind === 'submenu' ? 'menu' : null" [attr.aria-expanded]="item.Kind === 'submenu' ? IsSubmenuOpen(item.ID) : null" [attr.aria-disabled]="item.Disabled ? 'true' : null" [attr.title]="item.Disabled && item.DisabledReason ? item.DisabledReason : null" [tabIndex]="IsItemFocused(level, idx) ? 0 : -1">`.
  - **Do NOT set the HTML `[disabled]` attribute.** Using `aria-disabled="true"` keeps disabled items reachable via `ArrowDown`/`ArrowUp` per WAI-ARIA Authoring Practices, announces `"dimmed / unavailable"` to screen readers, and displays the `DisabledReason` badge/tooltip so users in Edit mode know *why* a governance-locked or single-remaining-slide action cannot run. Clicking or pressing `Enter`/`Space` on an `aria-disabled="true"` item is a no-op (menu stays open).
- **Keyboard Map:**
  - `ArrowDown` / `ArrowUp`: Moves roving focus to next / previous focusable item in the active menu level (wrapping from last to first and first to last), skipping `separator` and `header` rows.
  - `Home` / `End`: Moves focus to first / last focusable item in the active menu level.
  - `ArrowRight`:
    - If focused item is an enabled `submenu`, opens the submenu immediately and focuses its first focusable child.
    - If focused item is a `swatch-row`, moves focus across swatches within that row.
  - `ArrowLeft`:
    - If focused inside a `swatch-row` (index > 0), moves left to previous swatch.
    - If inside a child `submenu` (`level > 0`), closes that submenu and restores focus to its parent `submenu` item.
  - `Enter` / `Space`:
    - On enabled `action` or `swatch`: emits `(ItemSelected)` with `item.Command` and closes the entire menu tree.
    - On enabled `submenu`: opens submenu and focuses its first child.
    - On `Disabled` item: no-op (`preventDefault()`, menu remains open).
  - **Printable Character Typeahead:** Typing printable characters (`event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey`) appends to a `500ms` rolling buffer and moves focus to the next item in the active menu level whose normalized `Label` starts with the buffer prefix.
- **Hover Intent & Safe-Triangle Submenu Corridor:**
  - Hovering an enabled `submenu` row starts a `140ms` open timer.
  - Moving the pointer diagonally from the open `submenu` row toward the child panel checks `IsPointInTriangle(cursor, prevCursor, childTopCorner, childBottomCorner)`. While the cursor is moving toward the child panel inside the safe triangle, sibling hover switches are deferred for `180ms` so the submenu never collapses mid-transit.
- **Selection Preservation on Pointer Interaction:**
  - Every menu panel and button binds `(mousedown)="$event.preventDefault()"` so clicking a context menu item **never** blurs or collapses an active `contenteditable` prose selection in MJ Docs!

### 1.5 Dismissal Rules & Strict `Escape` Precedence

While `IsOpen === true`, `<mj-context-menu>` registers listener teardown via `DestroyRef` / `ngOnDestroy`:
1. **`Escape` Key (`document.addEventListener('keydown', onCaptureKeyDown, { capture: true })`):**
   - Immediately executes:
     ```typescript
     event.preventDefault();
     event.stopPropagation();
     event.stopImmediatePropagation();
     ```
   - If `OpenSubmenuPath.length > 0`: pops the deepest open submenu and focuses its parent `menuitem` (keeping the parent menu open!).
   - Otherwise: closes the root menu and calls `RestoreFocusElement?.focus({ preventScroll: true })`.
   - Because `capture: true` + `stopImmediatePropagation()` runs before `@HostListener('document:keydown')` on `SlideDeckArtifactViewerComponent` (`L2927`), `MJDialogService`, or `ArtifactViewerPanelComponent`, pressing `Escape` **only** dismisses one menu layer at a time.
2. **Outside Pointer Down (`document` capture `pointerdown`):** If `!menuHostElement.contains(event.target as Node)`, close the menu. Note: if `event.button === 2` (a new right-click elsewhere), let the new `contextmenu` event open the replacement menu cleanly at the new target without flicker.
3. **Scroll / Resize / Window Blur:**
   - `window` `resize` and `window` `blur` close the menu immediately.
   - Capture-phase `scroll` on `document` closes the menu **unless** `event.target` is a `.mj-context-menu-panel` (allowing long context menus to scroll internally without self-dismissing).

### 1.6 Keyboard Context Trigger (`Shift+F10` / `ContextMenu`) & Touch Long-Press

1. **Keyboard Context Key:**
   - Each viewer handles `event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')`.
   - Calls `event.preventDefault()` + `event.stopPropagation()`, resolves the active logical zone from `document.activeElement` (or active cell / active slide / focused segment), computes anchor coordinates from `targetEl.getBoundingClientRect()` (`x = rect.left + Math.min(28, rect.width / 2)`, `y = rect.top + Math.min(28, rect.height / 2)`), and opens `<mj-context-menu>` with `RestoreFocusElement = document.activeElement as HTMLElement`.
2. **Touch & Trackpad Support:**
   - Two-finger tap on macOS/Windows trackpads fires the standard DOM `contextmenu` event natively — supported automatically.
   - For iOS/Android touchscreens where `pointerdown` has `event.pointerType === 'touch'`, provide a lightweight reusable directive/helper `TouchContextMenuMonitor` (`500ms` timer, cancelled if `pointermove` distance exceeds `10px`, `pointerup`, `pointercancel`, or multi-touch gesture; suppresses the trailing synthetic `click` once triggered), matching the proven pattern in `conversation-list.component.ts`.

### 1.7 Native Browser Context Menu Override vs. Opt-Out Policy

| Scenario | Behavior | Rationale |
|---|---|---|
| Standard Right-Click (`!event.shiftKey`) on any productivity zone | Custom `<mj-context-menu>` opens (`event.preventDefault()`) | Consistent, rich domain actions across Docs, Slides, and Sheets |
| **`Shift + Right-Click` (`event.shiftKey`)** anywhere | **Native browser menu opens** (handler returns immediately without `preventDefault()`) | Preserves browser native spellcheck suggestions in `contenteditable` blocks and DevTools *Inspect* |
| Right-Click inside `<input>`, `<textarea>`, or `[data-native-contextmenu="true"]` (formula bar, inline cell input, search input, comment composer, raw source textarea) | **Native browser menu opens** | Native undo, OS clipboard paste, IME tools, and browser spellcheck work seamlessly in text inputs |
| Right-Click inside an **active inline-editing OLE Whiteboard** (`event.defaultPrevented === true`) | **Child Whiteboard context menu opens**; host viewer sees `event.defaultPrevented` and exits | Zero-conflict composition with `WhiteboardBoardComponent` |

### 1.8 Edit Mode vs. Read-Only / Viewer Mode Policy

Across all three suite applications, visibility vs. disabled state follows one coherent rule:
1. **Viewer / Read-Only Mode (`!CanEdit` or `ViewMode === 'preview'`):**
   - **Hide** mutating commands (*Insert*, *Delete*, *Duplicate*, *Move*, *Format*, *Cut*, *Paste*, *Change Layout*). Do not clutter a viewer's menu with 15 grayed-out authoring rows.
   - **Expose high-value non-mutating & collaborative actions:** *Copy*, *Copy Values / Markdown / CSV / Code*, *Copy Section / Block Reference*, *Add Comment* (when `CanComment` is true) / *Jump to Comment Thread*, *Refresh Live Data* (viewer-scoped live execution), *Expand Full Screen*, *Open Source Artifact*, *Present / Presenter View*, *Export (.pptx / .pdf / .xlsx / .csv)*, and *Switch to Write Mode* (in Docs Preview when `CanUserEdit` is true).
2. **Edit Mode with Contextual / Governance Guardrails (`CanEdit === true`):**
   - Keep structurally relevant mutating items **visible with `Disabled: true` + `DisabledReason`** whenever the user is in Edit mode and needs to understand why an action is blocked:
     - Governance lock (`!CanEditSegment(seg)`, `!CanActorEditSlide`, `!CanActorEditRegion`, or `ProtectedRanges` overlap): `DisabledReason: "Locked by owner — you do not have permission to edit this region"`.
     - Owner-only lock toggle (`!CanUserShareArtifact`): `DisabledReason: "Only artifact owners can lock or unlock sections"`.
     - Minimum-item invariant (`Deck.Slides.length <= 1`, `Workbook.Worksheets.length <= 1`, `DocumentSegments.length <= 1`, single-row/col table delete): `DisabledReason: "A workbook must contain at least 1 worksheet"`.

### 1.9 Design Tokens & CSS Compliance (`mj-context-menu.component.css`)

Because `@memberjunction/ng-artifacts` compiles with `"build": "ngc"`, styles MUST use plain CSS (`.css`, **not** `.scss`), `/* ... */` comments only, flat class selectors (no `&__` nesting), **zero raw hex/rgb colors**, no `.mj-btn` overrides, and `box-shadow: var(--mj-focus-ring)` (never `outline: var(--mj-focus-ring)`):

| Visual Element | Semantic `--mj-*` Token Mapping |
|---|---|
| Menu surface | `background: var(--mj-bg-surface-elevated); border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md); box-shadow: var(--mj-shadow-lg); z-index: var(--mj-z-context-menu, 10050);` |
| Item default text & icon | `color: var(--mj-text-primary);` icon: `color: var(--mj-text-secondary);` |
| Item hover / keyboard active | `background: var(--mj-bg-surface-hover); color: var(--mj-text-primary);` |
| Keyboard focus-visible ring | `outline: none; box-shadow: inset 0 0 0 1px var(--mj-brand-primary), var(--mj-focus-ring);` |
| Shortcut & submenu chevron | `color: var(--mj-text-muted);` |
| Checked indicator (`✓` / radio dot) | `color: var(--mj-brand-primary);` |
| Destructive item | `color: var(--mj-status-error);` hover/focus: `background: var(--mj-status-error-bg); color: var(--mj-status-error);` |
| Disabled item (`[aria-disabled="true"]`) | `color: var(--mj-text-disabled); cursor: not-allowed;` (no hover highlight) |
| Section header & separator | Header: `color: var(--mj-text-muted);` Separator: `background: var(--mj-border-subtle); height: 1px;` |

---

## 2. MJ Docs (`MarkdownArtifactViewerComponent`) Context Menu Specification

**Target File:** `packages/Angular/Generic/artifacts/src/lib/components/plugins/markdown-artifact-viewer.component.ts`  
**Menu Builder Helper:** `packages/Angular/Generic/artifacts/src/lib/components/plugins/context-menus/docs-context-menu.helper.ts`

### 2.1 Critical Selection & Focus Mechanics in MJ Docs

1. **Snapshot Selection Before Menu Opens:** Inside `OnDocsContextMenu(event: MouseEvent, zoneTarget: DocsContextTarget)`, if `event.shiftKey || event.defaultPrevented` return immediately. If `event.target` is `<input>` or `<textarea>` (e.g., `ViewMode === 'source'` raw editor, slash filter input, comment box), return immediately so native browser context menu runs. Otherwise call **`this.CaptureSelectionSnapshot()`** (`L5206`) *before* `event.preventDefault()`, capturing `selectedText`, `activeEditableSegmentId`, and the active DOM `Range` so formatting snippets (`**bold**`, `[link](url)`), Cut/Copy, Comment quoting, and Ask AI operate on the exact highlighted text!
2. **Select Focused Block:** Update `this.SelectedAnchorKey = seg.AnchorKey` so the targeted block shows active block chrome while its context menu is open.

### 2.2 Zone 2a — Prose / Block Editor & Selection (`edit` & `suggest` modes)

**DOM Targets:** `.mj-doc-segment` (`[data-segment-id]`) where `seg.Kind === 'markdown'` and `seg.BlockKind` is `'paragraph' | 'heading' | 'list' | 'callout' | 'code'`.  
**Governance Check:** `const segEditable = this.CanUserEdit && this.CanEditSegment(seg);` (`L9665`). In `ViewMode === 'suggest'`, prose mutations that are disabled or routed through tracked changes expose **Propose Tracked Edit** prominently at the top.

| Group | Menu Item | Icon | Shortcut | Mode / Condition | Handler / Engine Wiring |
|---|---|---|---|---|---|
| **Clipboard** | **Cut** | `fa-solid fa-scissors` | `⌘X` | `edit` (disabled if `!segEditable` or no selection & empty block) | `CutDocsSelectionOrBlock(seg)` (writes selection or `seg.RawMarkdown` to clipboard + deletes selection/segment) |
| | **Copy** | `fa-regular fa-copy` | `⌘C` | Always | `CopyDocsSelectionOrBlock(seg, 'rich')` (copies selected text or `seg.RawMarkdown`) |
| | **Copy Block as Markdown** | `fa-brands fa-markdown` | `⇧⌘C` | Always | `CopyDocsSelectionOrBlock(seg, 'markdown')` |
| | **Copy Code** *(Code blocks only)* | `fa-solid fa-code` | — | `seg.BlockKind === 'code'` | `CopyCodeBlockText(seg)` -> `navigator.clipboard.writeText(GetParsedCodeBlock(seg).Code)` (`L6993`) |
| | **Paste** | `fa-regular fa-clipboard` | `⌘V` | `edit` (disabled if `!segEditable`) | `PasteIntoDocsSegment(seg)` (`navigator.clipboard.readText()` inserted at saved snapshot range; if browser denies read permission, shows `StatusToast` guiding `⌘V` / `Ctrl+V`) |
| **Format** *(Submenu)* | **Format Text ▸** | `fa-solid fa-bold` | — | `edit` & `seg.BlockKind !== 'code'` (disabled if `!segEditable`) | Submenu calling `InsertFormattingSnippet(prefix, suffix)` (`L7858`): **Bold** (`⌘B`, `'**','**'`), **Italic** (`⌘I`, `'*','*'`), **Strikethrough** (`'~~','~~'`), **Inline Code** (`⌘E`, `` '`','`' ``), **Link…** (`⌘K`, `'[','](https://)'`) |
| **Turn Into** *(Submenu)* | **Turn Into / Block Type ▸** | `fa-solid fa-paragraph` | — | `edit` & `!IsSimpleNoteMode` (disabled if `!segEditable`) | Submenu (`ConvertSegmentBlockType(seg, targetType)`): **Paragraph**, **Heading 1**, **Heading 2**, **Heading 3**, **Bullet List**, **Numbered List**, **Task Checklist**, **Callout Note**, **Code Block** (shows checkmark on current `seg.BlockKind`) |
| **Callout** *(Callout only)* | **Callout Style ▸** | `fa-solid fa-circle-info` | — | `edit` & `seg.BlockKind === 'callout'` | Submenu calling `UpdateCalloutType(seg, type)` (`L6968`): `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION` |
| **Structure** | **Insert Block Above** | `fa-solid fa-arrow-up` | — | `edit` & `!IsSimpleNoteMode` | New helper `InsertParagraphAboveSegment(seg)` (mirrors `InsertParagraphBelowSegment` at `L5298`) |
| | **Insert Block Below** | `fa-solid fa-arrow-down` | — | `edit` & `!IsSimpleNoteMode` | `InsertParagraphBelowSegment(seg)` (`L5298`) |
| | **Insert via `/` Menu…** | `fa-solid fa-plus` | `/` | `edit` & `!IsSimpleNoteMode` | `OpenSlashMenuForSegment(seg)` (`L878`) |
| | **Duplicate Block** | `fa-regular fa-clone` | `⌘D` | `edit` & `!IsSimpleNoteMode` | New helper `DuplicateSegment(seg)` (clones `seg.RawMarkdown` into `idx + 1`) |
| | **Move Block Up** | `fa-solid fa-chevron-up` | `⌥↑` | `edit` & `!IsSimpleNoteMode` (disabled at `idx === 0`) | `MoveSegment(seg, -1)` (`L7752`) |
| | **Move Block Down** | `fa-solid fa-chevron-down` | `⌥↓` | `edit` & `!IsSimpleNoteMode` (disabled at last segment) | `MoveSegment(seg, 1)` (`L7752`) |
| **Review & AI** | **Add Anchored Comment** | `fa-regular fa-comment-dots` | `⌥⌘M` | Always when comments enabled | `OpenAnchorCommentForSegment(seg)` (`L11373`, pre-fills `savedSelectionText` quote!) |
| | **Propose Tracked Suggestion…** | `fa-solid fa-code-pull-request` | — | `edit` or `suggest` | `OpenSuggestionModalForSegment(seg)` (`L10908`) |
| | **Ask AI About Section…** | `fa-solid fa-wand-magic-sparkles` | — | `IsAiAssistantEnabled` | `OpenAskAiAssistant(seg)` (`L9562`) |
| **Heading / Lock** | **Collapse / Expand Section** | `fa-solid fa-compress` | — | `seg.BlockKind === 'heading'` | `ToggleHeadingCollapse(seg)` (`L9548`) |
| | **Lock Section (Owner Only)** / **Unlock Section** | `fa-solid fa-lock` / `fa-lock-open` | — | `edit` & `seg.BlockKind === 'heading'` (disabled with reason if `!CanUserShareArtifact`) | `ToggleHeadingLock(seg)` (`L9680`, toggles `<!-- mj-lock: owner-only -->`) |
| **Danger** | **Delete Block** | `fa-regular fa-trash-can` | `⌫` | `edit` & `!IsSimpleNoteMode` (disabled if `!segEditable` or `DocumentSegments.length <= 1`) | `DeleteSegment(seg)` (`L7770`), `Destructive: true` |

### 2.3 Zone 2b — Markdown / Rich Tables (`seg.BlockKind === 'table'`)

**DOM Targets:** `<th [attr.data-testid]="'table-header-' + ...">` (`L1028`) and `<td [attr.data-testid]="'table-cell-' + ...">` (`L1044`) in Edit mode, plus `<table>` / `<th>` / `<td>` inside rendered `.markdown-preview` in Preview/Viewer mode.  
**Context Target Metadata:** `{ Kind: 'table', Segment: seg, RowIndex: number, ColIndex: number, IsHeaderRow: boolean }`.

**Table Model Enhancement (Small Self-Contained Upgrade in `MarkdownArtifactViewerComponent`):**
- Extend `ParsedMarkdownTable` (`L6504`) with `Alignments: Array<'left' | 'center' | 'right' | 'none'>` parsed from the GFM separator line (`:---`, `:---:`, `---:`, `---`) at `L6520`, and update `serializeParsedTable` (`L6531`) to write the alignment markers back instead of always emitting `'---'`. Bind `[style.text-align]="GetColumnTextAlign(tableData, cIdx)"` on `<th>` and `<td>` in the interactive table template (`L1028`, `L1044`).

| Group | Menu Item | Icon | Mode / Condition | Handler / Engine Wiring |
|---|---|---|---|---|
| **Rows** | **Insert Row Above** | `fa-solid fa-arrow-up` | `edit` & `!IsHeaderRow` (disabled if `!segEditable`) | `InsertTableRowAt(seg, rowIndex, 'above')` |
| | **Insert Row Below** | `fa-solid fa-arrow-down` | `edit` (if `IsHeaderRow`, inserts at body index `0`) | `InsertTableRowAt(seg, IsHeaderRow ? 0 : rowIndex + 1, 'below')` |
| | **Delete Row** | `fa-solid fa-minus` | `edit` & `!IsHeaderRow` (disabled if `Rows.length <= 1` with reason `"Table must keep at least 1 body row"`) | `DeleteTableRowAt(seg, rowIndex)`, `Destructive: true` |
| **Columns** | **Insert Column Left** | `fa-solid fa-arrow-left` | `edit` (disabled if `!segEditable`) | `InsertTableColumnAt(seg, colIndex, 'left')` |
| | **Insert Column Right** | `fa-solid fa-arrow-right` | `edit` (disabled if `!segEditable`) | `InsertTableColumnAt(seg, colIndex, 'right')` |
| | **Column Alignment ▸** *(Submenu)* | `fa-solid fa-align-left` | `edit` | Radio submenu (`SetTableColumnAlignment(seg, colIndex, align)`): **Align Left** (`:---`), **Align Center** (`:---:`), **Align Right** (`---:`) |
| | **Sort by This Column ▸** *(Submenu)* | `fa-solid fa-arrow-down-a-z` | `edit` & `Rows.length > 1` | **Sort A → Z** (`SortTableByColumn(seg, colIndex, 'asc')`), **Sort Z → A** (`SortTableByColumn(seg, colIndex, 'desc')`) — numeric-aware collator |
| | **Delete Column** | `fa-solid fa-table-columns` | `edit` (disabled if `Headers.length <= 1` with reason `"Table must keep at least 1 column"`) | `DeleteTableColumnAt(seg, colIndex)`, `Destructive: true` |
| **Copy & Collaborate** | **Copy Cell Text** | `fa-regular fa-copy` | Always (Edit & Viewer) | Copies target cell text |
| | **Copy Table As ▸** *(Submenu)* | `fa-solid fa-file-export` | Always (Edit & Viewer!) | `CopyTableAs(seg, 'markdown' \| 'csv' \| 'tsv')` |
| | **Add Anchored Comment** | `fa-regular fa-comment-dots` | Always | `OpenAnchorCommentForSegment(seg)` |
| **Danger** | **Delete Entire Table** | `fa-regular fa-trash-can` | `edit` (disabled if `!segEditable`) | `DeleteSegment(seg)`, `Destructive: true` |

### 2.4 Zone 2c — Live Data Blocks & Embedded OLE Artifact Cards (`seg.Kind === 'live-block'`)

**DOM Targets:** `.mj-live-block-card` (`L1383`, `Kind !== 'Artifact'`) and `.mj-embedded-artifact-card` (`L1220`, `Kind === 'Artifact'`).  
**OLE Guard:** When `block.Kind === 'Artifact'` and `IsInlineEditingBlock(block.BlockID)` (`L10540`) is `true`, `if (event.defaultPrevented) return;` lets an inline Whiteboard own right-click on its canvas while the card header still opens the host's Embedded Artifact menu.

| Block Type | Menu Item | Icon | Mode / Condition | Handler / Engine Wiring |
|---|---|---|---|---|
| **Live Data Block** (`EntityView`, `RunQuery`, `Chart`, `AggregateKPI`) | **Refresh Live Data** | `fa-solid fa-arrows-rotate` | Always when `block.Mode !== 'snapshot'` (Edit & Viewer!) | `RefreshLiveBlock(block)` (`L10442`) |
| | **Configure Live Block…** | `fa-solid fa-sliders` | `edit` (disabled if `!segEditable`) | `OpenConfigureBlockModal(block)` (`L1443`) |
| | **Open Record in Explorer** | `fa-solid fa-arrow-up-right-from-square` | Right-clicked on a record-link cell (`col.IsRecordLink`) | `OnBlockRecordCellClick(block, col, row, event)` (`L9900`) |
| | **Freeze Snapshot…** / **Switch to Live Mode** | `fa-solid fa-snowflake` / `fa-bolt` | `edit` (disabled if `!segEditable`) | `block.Mode === 'snapshot' ? UnfreezeLiveBlock(block) : PromptFreezeBlock(block)` (`L10426`, `L10343`) |
| | **Copy Result Data as CSV** | `fa-solid fa-file-csv` | Always when `GetBlockExecutionResult(block)?.Rows?.length` | Serializes `GetBlockExecutionResult(block)` rows to CSV on clipboard |
| | **Inspect / Copy `:::mj-block` JSON** | `fa-solid fa-code` | Always | Copies `DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(block)` |
| | **Collapse / Expand Card** | `fa-solid fa-chevron-up` | Always (persisted via `UserInfoEngine`) | `ToggleBlockCollapsed(block)` (`L9537`) |
| | **Add Anchored Comment** | `fa-regular fa-comment-dots` | Always | `OpenAnchorCommentForSegment(seg)` |
| | **Ask AI About Block…** | `fa-solid fa-wand-magic-sparkles` | `IsAiAssistantEnabled` | `OpenAskAiAssistant(seg)` |
| | **Delete Live Block** | `fa-regular fa-trash-can` | `edit` (disabled if `!segEditable`) | `DeleteSegment(seg)`, `Destructive: true` |
| **Embedded Artifact Card** (`block.Kind === 'Artifact'`) | **Edit Inline** / **Finish Inline Edit** | `fa-solid fa-pen-to-square` / `fa-check` | `edit` & `CanInlineEditEmbeddedArtifact(block)` | `ToggleInlineArtifactEdit(block)` (`L10528`) |
| | **Open Full Screen** | `fa-solid fa-expand` | Always (Edit & Viewer!) | `ToggleExpandOleBlock(block)` (`L7783`) |
| | **Open Source Artifact** | `fa-solid fa-arrow-up-right-from-square` | Always when `block.Source.ArtifactID` present | Emits `OpenEntityRecord` (`MJ: Artifacts`, `ID = block.Source.ArtifactID`) |
| | **Update to Latest Version (`vN`)** | `fa-solid fa-cloud-arrow-down` | `edit` & `GetNewerEmbeddedArtifactVersion(block) != null` | `UpdateEmbeddedArtifactToLatestVersion(block)` (`L10598`) |
| | **Pin Version** / **Follow Latest Version** | `fa-solid fa-thumbtack` | `edit` | `TogglePinArtifactVersion(block)` (`L7799`) |
| | **Configure Embedded Block…** | `fa-solid fa-sliders` | `edit` | `OpenConfigureBlockModal(block)` (`L1285`) |
| | **Collapse / Expand Card** | `fa-solid fa-chevron-up` | Always | `ToggleBlockCollapsed(block)` |
| | **Copy Block Reference JSON** | `fa-solid fa-link` | Always | Copies serialized `DocumentBlockSpec` |
| | **Add Anchored Comment** | `fa-regular fa-comment-dots` | Always | `OpenAnchorCommentForSegment(seg)` |
| | **Delete Embedded Block** | `fa-regular fa-trash-can` | `edit` (disabled if `!segEditable`) | `DeleteSegment(seg)`, `Destructive: true` |

### 2.5 Zone 2d — Rendered Preview (`ViewMode === 'preview'` / Read-Only Viewer), Suggestion Cards & Outline Rail

1. **Rendered Preview Prose / Code / Links / Images (`.markdown-preview` at `L1203`):**
   - Inspects `event.target` via `closest('a, img, pre, table')`:
     - **Copy Selection** (`⌘C` — shown when non-empty selection exists) / **Copy Section Markdown** (copies `seg.RawMarkdown`).
     - **Copy Code Block** (when inside `<pre>` or `seg.BlockKind === 'code'`).
     - **Copy Table as CSV / Markdown** (when inside `<table>` or `seg.BlockKind === 'table'`).
     - **Copy Link URL** / **Open Link in New Tab** (when right-clicking `<a href>`).
     - **Copy Image URL** (when right-clicking `<img src>`).
     - **Copy Section Reference (`#anchor`)** (when `seg.BlockKind === 'heading'`, copies `#${seg.AnchorKey}` + selects outline anchor).
     - **Add Anchored Comment** (`OpenAnchorCommentForSegment(seg)` — available in Preview/Viewer mode whenever comments are enabled!).
     - **Ask AI About Section…** (`OpenAskAiAssistant(seg)` when `IsAiAssistantEnabled`).
     - **Switch to Write & Edit Block** (`OnPreviewBlockDoubleClick(seg)` at `L5125` — shown **only** when `this.CanUserEdit` is `true`).
2. **Tracked Suggestion Redline Cards (`L1670`):**
   - **Accept Suggestion** (`AcceptSuggestion(sug)` `L10983`, shown when `CanUserEdit`), **Reject Suggestion** (`RejectSuggestion(sug)` `L11003`), **Jump to Target Block** (`FocusSegmentByAnchorKey(sug.AnchorKey)`), **Copy Proposed Markdown**.
3. **Document Outline Rail Items (`L712`):**
   - **Jump to Section** (`SelectOutlineItem(item)`), **Collapse / Expand Section** (`ToggleHeadingCollapse`), **Copy Section Anchor**, and in Edit mode: **Lock / Unlock Section** (`ToggleHeadingLock`), **Move Section Block Up / Down**.

---

## 3. MJ Slides (`SlideDeckArtifactViewerComponent`) Context Menu Specification

**Target File:** `packages/Angular/Generic/artifacts/src/lib/components/plugins/slide-deck-artifact-viewer.component.ts`  
**Menu Builder Helper:** `packages/Angular/Generic/artifacts/src/lib/components/plugins/context-menus/slides-context-menu.helper.ts`

### 3.1 Data Model Grounding (`SlideDeckEngine`)

`SlideDeckSpec` (`packages/MJCoreEntities/src/custom/SlideDeckEngine.ts`) models each slide with a structured `Layout: SlideLayoutKind` (`TitleSlide`, `SectionHeader`, `TitleAndBody`, `TwoColumn`, `Comparison`, `BigNumber`, `Quote`, `LiveDataSlide`, `ChartAndText`, `Timeline`, `Blank`), an ordered `Regions: SlideRegionSpec[]` array, `Transition?: 'none' | 'fade' | 'slide'` (`L168`), `Hidden?: boolean` (`L170`), and `Lock?: SlideGovernanceLock` (`L172`).
- Because regions occupy named/ordered CSS grid slots rather than arbitrary absolute `(x, y, zIndex)` coordinates, **region ordering on multi-region slides** (`Regions.length > 1`) is exposed honestly as **Move Region Earlier (Swap Left)** and **Move Region Later (Swap Right)** (`SwapSlideRegion(slideId, regionId, -1 | 1)`), never as fake "Bring to Front / Send to Back".
- **`SlideSpec.Hidden` Wiring:** `Hidden?: boolean` already exists on `SlideSpec` (`SlideDeckEngine.ts:170`). As part of Slides wiring:
  1. Render a subtle `fa-solid fa-eye-slash` badge + dimmed opacity on hidden filmstrip thumbnails.
  2. Update `NextSlide()` (`L3043`) and `PrevSlide()` (`L3035`) to skip `slide.Hidden === true` **only when `IsPresentationActive` (`present` or `presenter` mode)** while keeping hidden slides selectable in the Studio editor!

### 3.2 Zone 3a — Left Slide Filmstrip Thumbnail & Empty Strip

**DOM Targets:** `[data-testid="filmstrip-slide-..."]` (`L569`) and `.mj-slides-filmstrip` background (`L562`).  
**Selection Rule:** Right-clicking thumbnail `slide` sets `ActiveSlideID = slide.SlideID` (`SelectSlide(slide.SlideID)`) so visual selection and context actions always match the clicked slide; actions also accept explicit `slide.SlideID` in the command payload.

| Group | Menu Item | Icon | Shortcut | Mode / Condition | Handler / Engine Wiring |
|---|---|---|---|---|---|
| **Create** | **New Slide After** | `fa-solid fa-plus` | — | `IsEditable` | `InsertSlideAfter(slide.SlideID, 'TitleAndBody')` (`SlideDeckEngine.Instance.AddSlide` + `ReorderSlides` after target index) |
| | **New Slide With Layout ▸** *(Submenu)* | `fa-solid fa-table-columns` | — | `IsEditable` | Lists all 11 `LayoutCatalog` layouts -> `InsertSlideAfter(slide.SlideID, layout.Kind)` |
| | **Duplicate Slide** | `fa-regular fa-clone` | `⌘D` | `IsEditable` | `DuplicateSlideById(slide.SlideID)` (`SlideDeckEngine.Instance.DuplicateSlide` at `L1034`) |
| **Order** | **Move Slide Up** | `fa-solid fa-arrow-up` | `⌥↑` | `IsEditable` (disabled at `index === 0`) | `OnMoveSlide(slide.SlideID, -1)` (`L3127`) |
| | **Move Slide Down** | `fa-solid fa-arrow-down` | `⌥↓` | `IsEditable` (disabled at last slide) | `OnMoveSlide(slide.SlideID, 1)` (`L3127`) |
| | **Move to Beginning** | `fa-solid fa-angles-up` | — | `IsEditable` (disabled at `index === 0`) | `MoveSlideToEdge(slide.SlideID, 'start')` (`SlideDeckEngine.Instance.ReorderSlides`) |
| | **Move to End** | `fa-solid fa-angles-down` | — | `IsEditable` (disabled at last slide) | `MoveSlideToEdge(slide.SlideID, 'end')` (`SlideDeckEngine.Instance.ReorderSlides`) |
| **Design & Flow** | **Change Layout ▸** *(Submenu)* | `fa-solid fa-border-all` | — | `IsEditable` (disabled if `!CanUserEditSlide(slide)`) | Radio submenu over `LayoutCatalog` (`ChangeSlideLayoutById(slide.SlideID, kind)`) |
| | **Slide Transition ▸** *(Submenu)* | `fa-solid fa-wand-sparkles` | — | `IsEditable` (disabled if `!CanUserEditSlide(slide)`) | Radio submenu (`SetSlideTransition(slide.SlideID, 'none' \| 'fade' \| 'slide')` via `UpdateSlideMetadata`) |
| | **Skip / Hide Slide in Presentation** | `fa-regular fa-eye-slash` | — | `IsEditable` (`Role: 'menuitemcheckbox'`, `Checked: !!slide.Hidden`) | `ToggleSlideHidden(slide.SlideID)` via `SlideDeckEngine.Instance.UpdateSlideMetadata` |
| **Present & Review** | **Present from This Slide** | `fa-solid fa-play` | `⇧⌘Enter` | Always (Edit & Viewer!) | `SelectSlide(slide.SlideID)` then `EnterPresentationMode('present')` (`L2984`) |
| | **Presenter View from Here** | `fa-solid fa-chalkboard-user` | — | Always (Edit & Viewer!) | `SelectSlide(slide.SlideID)` then `EnterPresentationMode('presenter')` |
| | **Focus Speaker Notes** | `fa-regular fa-note-sticky` | — | `IsEditable` | Opens/expands notes bar (`ShowSpeakerNotes = true`) & focuses `[data-testid="speaker-notes-textarea"]` |
| | **Comment on Slide** | `fa-regular fa-comment-dots` | — | Always | `OpenCommentForSlide(slide)` (`L4505`) |
| | **Lock Slide** / **Unlock Slide** | `fa-solid fa-lock` | — | `IsEditable` (disabled with reason if locked by higher-privilege owner) | `ToggleSlideLockById(slide.SlideID)` (`SlideDeckEngine.Instance.SetSlideLock` `L1126`) |
| | **Copy Slide as Markdown** | `fa-regular fa-copy` | — | Always (Edit & Viewer!) | Serializes slide title, subtitle, and region text/tables to Markdown |
| **Danger** | **Delete Slide** | `fa-regular fa-trash-can` | `⌫` | `IsEditable` (disabled with reason `"A presentation must keep at least 1 slide"` when `Deck.Slides.length <= 1` or `!CanUserEditSlide(slide)`) | `DeleteSlideById(slide.SlideID)` (`SlideDeckEngine.Instance.DeleteSlide` `L1387`), `Destructive: true` |

*(Right-clicking the empty space below thumbnails in `.mj-slides-filmstrip` shows a compact strip menu: **New Slide**, **New Slide With Layout ▸**, **Theme & Brand Colors…**, **Start Presentation**, **Export `.pptx` / `.pdf`**.)*

### 3.3 Zone 3b — Slide Canvas Stage Background (Edit Mode)

**DOM Targets:** `.mj-slide-canvas-stage` / `.mj-slide-frame` / `.mj-slide-heading-zone` (`L688`) when right-clicking outside a `.mj-slide-region` card (or on the slide header area).

| Group | Menu Item | Icon | Mode / Condition | Handler / Engine Wiring |
|---|---|---|---|---|
| **Insert / Embed** | **Embed Live Data View…** | `fa-solid fa-table-list` | `IsEditable` & `CanUserEditActiveSlide` | Targets `FocusedRegion ?? DisplayedSlide.Regions[0]` -> `EmbedLiveEntityViewInRegion(region)` (`L3800`) |
| | **Embed Spreadsheet Chart / Range…** | `fa-solid fa-chart-column` | `IsEditable` & `CanUserEditActiveSlide` | `OpenSheetEmbedModal(region)` (`L3829`) |
| | **Embed Inline Whiteboard** | `fa-solid fa-draw-polygon` | `IsEditable` & `CanUserEditActiveSlide` | `EmbedInlineWhiteboardInRegion(region)` (`L3765`) |
| | **Paste Region Content** | `fa-regular fa-clipboard` | `IsEditable` (disabled if no `copiedSlideRegionSpec` & clipboard unavailable) | `PasteIntoSlideRegion(FocusedRegion ?? DisplayedSlide.Regions[0])` |
| **Slide Design** | **Change Slide Layout ▸** *(Submenu)* | `fa-solid fa-border-all` | `IsEditable` & `CanUserEditActiveSlide` | Radio submenu over `LayoutCatalog` -> `OnChangeActiveSlideLayout(kind)` (`L3557`) |
| | **Deck Theme Preset ▸** *(Submenu)* | `fa-solid fa-palette` | `IsEditable` | Radio submenu over `ThemePresets` -> `OnSelectThemePreset(preset)` (`L4373`) + **Customize Theme Drawer…** (`ToggleRightDrawer('theme')` `L3052`) |
| | **Slide Transition ▸** *(Submenu)* | `fa-solid fa-wand-sparkles` | `IsEditable` | `'none' \| 'fade' \| 'slide'` |
| | **New Slide After** / **Duplicate Slide** | `fa-solid fa-plus` / `fa-clone` | `IsEditable` | `OnAddSlide()` / `OnDuplicateActiveSlide()` |
| **Governance & AI** | **Lock / Unlock Current Slide** | `fa-solid fa-lock` | `IsEditable` | `ToggleCurrentSlideLock()` (`L4680`) |
| | **Ask AI for This Slide…** | `fa-solid fa-wand-magic-sparkles` | `IsAiAssistantEnabled` | `OpenAskAiForPresentation()` (`L4742`) |
| **Present** | **Present from Current Slide** | `fa-solid fa-play` | Always | `EnterPresentationMode('present')` |
| | **Open Presenter Cockpit** | `fa-solid fa-chalkboard-user` | Always | `EnterPresentationMode('presenter')` |

### 3.4 Zone 3c — Slide Region / Live Block / Sheet Chart / OLE Card

**DOM Targets:** `[data-testid="slide-region-..."]` (`L747`).  
**OLE Guard:** If `event.defaultPrevented || event.shiftKey` return immediately (preserving `WhiteboardBoardComponent`'s canvas context menu when `IsOleRegionEditing(region.RegionID)` is true!). Otherwise set `FocusedRegionID = region.RegionID`.

| Group | Menu Item | Icon | Mode / Condition | Handler / Engine Wiring |
|---|---|---|---|---|
| **Edit & Clipboard** | **Edit Content Inline** / **Done Editing Canvas** | `fa-solid fa-pen` | `IsEditable` & `CanUserEditRegion(DisplayedSlide, region)` | Focuses `[data-testid="editable-region-content-..."]` or calls `ToggleOleRegionEditing(region.RegionID)` (`L3750`) |
| | **Cut Region Content** | `fa-solid fa-scissors` | `IsEditable` (disabled if `!CanUserEditRegion`) | Copies `SlideRegionSpec` to `copiedSlideRegionSpec` + text to OS clipboard, then resets region content |
| | **Copy Region** | `fa-regular fa-copy` | Always (Edit & Viewer!) | Copies `SlideRegionSpec` to `copiedSlideRegionSpec` + Markdown/Block JSON to OS clipboard |
| | **Paste into Region** | `fa-regular fa-clipboard` | `IsEditable` (disabled if `!CanUserEditRegion`) | Applies `copiedSlideRegionSpec` (or `:::mj-block` text from clipboard) via `UpsertSlideRegion` |
| **Region Type & Order** | **Region Content Type ▸** *(Submenu)* | `fa-solid fa-layer-group` | `IsEditable` (disabled if `!CanUserEditRegion`) | Radio submenu calling `OnChangeRegionKind(region, kind)` (`L3667`): **Bullets / Rich Text** (`RichMarkdown`), **Callout** (`Callout`), **Table** (`Table`), **KPI Big Number** (`BigMetric`), **Quote** (`Quote`), **Live MJ Block** (`LiveBlock`) |
| | **Move Region Earlier (Swap Left)** | `fa-solid fa-arrow-left-long` | `IsEditable` & `DisplayedSlide.Regions.length > 1` (disabled at index `0`) | `SwapSlideRegion(DisplayedSlide.SlideID, region.RegionID, -1)` |
| | **Move Region Later (Swap Right)** | `fa-solid fa-arrow-right-long` | `IsEditable` & `DisplayedSlide.Regions.length > 1` (disabled at last region) | `SwapSlideRegion(DisplayedSlide.SlideID, region.RegionID, 1)` |
| **Live Data / Chart / OLE** *(When `block = GetRegionBlockSpec(region)` exists)* | **Refresh Live Data** | `fa-solid fa-arrows-rotate` | Always when `block.Mode !== 'snapshot'` (Edit & Viewer!) | `ExecuteSlideRegionBlock(region, block)` (`L873`) |
| | **Change Sheet Chart / Range…** | `fa-solid fa-chart-pie` | `IsEditable` & Sheet-backed block | `OpenSheetEmbedModal(region)` (`L3829`) |
| | **Update from Latest Workbook (`vN`)** | `fa-solid fa-cloud-arrow-down` | `IsEditable` & `GetNewerSourceWorkbookVersion(block) != null` | `UpdateRegionBlockToLatestWorkbookVersion(region, block)` (`L3992`) |
| | **Freeze Snapshot…** / **Switch to Live** | `fa-solid fa-snowflake` / `fa-bolt` | `IsEditable` | `block.Mode === 'snapshot' ? UnfreezeSlideRegionBlock(region, block) : PromptFreezeSlideRegionBlock(region, block)` (`L4355`, `L882`) |
| | **Open Source Artifact** | `fa-solid fa-arrow-up-right-from-square` | `block.Source.ArtifactID != null` | Emits `OpenEntityRecord` (`MJ: Artifacts`) |
| | **Copy Live Block JSON** | `fa-solid fa-code` | Always | Copies `JSON.stringify(block, null, 2)` |
| **Governance & Review** | **Comment on Region** | `fa-regular fa-comment-dots` | Always | `OpenCommentForSlideRegion(DisplayedSlide, region)` (`L4505`) |
| | **Lock Region** / **Unlock Region** | `fa-solid fa-lock` | `IsEditable` | `ToggleRegionLock(region)` (`L4709`) |
| **Danger** | **Clear Region Content** | `fa-solid fa-eraser` | `IsEditable` (disabled if `!CanUserEditRegion`) | Resets region `Content = ''` and `Block = undefined` via `UpsertSlideRegion`, `Destructive: true` |

### 3.5 Zone 3d — Speaker Notes & Read-Only Viewer / Presentation Modes

1. **Speaker Notes Read-Only / Presenter Cockpit (`.mj-slides-notes-readonly`, `.mj-slides-presenter-notes` at `L1094`, `L1127`):**
   - *(Note: Editable `<textarea data-testid="speaker-notes-textarea">` in Studio Edit mode uses native browser spellcheck/clipboard per §1.7.)*
   - Read-only / Presenter menu: **Copy Speaker Notes**, **Copy Full Slide + Notes as Markdown**, **Reset Timer** (in Presenter mode).
2. **Read-Only Viewer Stage (`!IsEditable`) & Fullscreen Presentation (`present` / `presenter` at `L502`, `L1098`):**
   - **Next Slide** (`→`, `NextSlide()`, disabled on last visible slide), **Previous Slide** (`←`, `PrevSlide()`, disabled on first visible slide), **Jump to Slide ▸** (submenu listing visible slides with current slide checked).
   - **Refresh Live Data** (`RefreshLiveBlocksDuringPresentation()` `L3004` when presenting, or `ExecuteSlideRegionBlock` when right-clicking a live block).
   - **Copy Slide Text as Markdown** (`⌘C`).
   - **Comment on Slide / Region** (when not in fullscreen presentation).
   - **Start Presentation** / **Open Presenter Cockpit** (when `!IsPresentationActive`) OR **Switch to Presenter View / Standard Present** & **Exit Presentation** (`Esc`, `ExitPresentationMode()` `L3018` when `IsPresentationActive`).
   - **Export PowerPoint (`.pptx`)** (`OnExportPptx()` `L4438`) and **Export Printable PDF** (`OnExportPdf()` `L4456`).

---

## 4. MJ Sheets (`SpreadsheetArtifactViewerComponent`) Context Menu Specification

**Target File:** `packages/Angular/Generic/artifacts/src/lib/components/plugins/spreadsheet-artifact-viewer.component.ts`  
**Menu Builder Helper:** `packages/Angular/Generic/artifacts/src/lib/components/plugins/context-menus/sheets-context-menu.helper.ts`

### 4.1 `SpreadsheetEngine` Capability Audit & Scope Truth Table

Every Sheets context menu action was audited directly against `packages/MJCoreEntities/src/custom/SpreadsheetEngine.ts`:

| Capability | Engine Status (`SpreadsheetEngine.ts`) | Context Menu Decision |
|---|---|---|
| Row / Column Insert & Delete with Stable-ID Formula Rewrite | **Supported** (`InsertRows` `L3378`, `DeleteRows` `L3427`, `InsertColumns` `L3473`, `DeleteColumns` `L3523`) | Full support for single & multi-row/column selection (`Insert N Rows Above/Below`, `Delete Row(s)`, `Insert N Columns Left/Right`, `Delete Column(s)`). |
| Clear Contents vs. Formatting vs. All | **Supported** (`ClearRange` `L4367` clears cell/spill values; `cell.Style = undefined` clears formatting) | Expose **Clear ▸** submenu: *Clear Contents* (`Del`), *Clear Formatting*, *Clear All*, *Clear Comments in Range*. |
| Freeze Panes (Rows & Columns) | **Supported** (`WorksheetSpec.FrozenRows` & `WorksheetSpec.FrozenColumns` `L1749–1750`) | Expose **Freeze Panes ▸** on cells, row headers, and column headers (*Freeze Up To Row R*, *Freeze Up To Column C*, *Freeze Header Row 1*, *Unfreeze Panes*). Add `.mj-sheets-frozen-col` sticky CSS alongside existing `.mj-sheets-frozen-row` (`L678`). |
| Row / Column Hide & Unhide + Resize / Auto-Fit | **Supported** (`Hidden`, `Width`, `Height` on `SpreadsheetRowSpec`/`SpreadsheetColumnSpec`; `VisibleRows`/`VisibleColumns` `L3754–3758` already filter `!Hidden`!) | Expose *Hide Row(s)*, *Unhide Adjacent Rows*, *Auto-Fit Row Height / Reset Height*, *Hide Column(s)*, *Unhide Adjacent Columns*, *Auto-Fit Column Width / Set Width…*. |
| Cell Fill & Text Color (`Style.BackgroundColor` / `Style.TextColor`) | **Supported in Engine & `.xlsx` I/O** (`SpreadsheetCellStyleSpec` `L1341`), currently unbound on `<td>` in template | Bind `[style.color]="cell?.Style?.TextColor || null"` and `[style.background-color]="cell?.Style?.BackgroundColor || null"` on `<td class="mj-sheets-cell">` (`L708`) and expose curated semantic swatch rows in the context menu! |
| Worksheet Rename with Cross-Sheet Formula Rewrite | **Supported** (`RenameWorksheet` `L4554`) | Wire Worksheet Tab **Rename Sheet** directly to `SpreadsheetEngine.Instance.RenameWorksheet`. |
| Range Governance (`ProtectedRanges`) | **Supported** (`WorksheetSpec.ProtectedRanges` `L1755`, `ToggleSelectedRangeProtection` `L5959`) | Expose **Protect / Unprotect Range** and disable mutating actions with `DisabledReason` when selection intersects another user's protected range. |
| Custom MJ Formulas (`=MJ.QUERY`, `=MJ.VIEW`, `=MJ.IMPORTRANGE`, `=MJ.AI`) & Dynamic Spills | **Supported** (`SpillRange`, `SpilledFrom`, `RefreshAllLiveData`, `RunAiFormulas`) | When active cell is a live/AI formula or spilled child (`SpilledFrom`), surface contextual **Select Spill Anchor (`A1`)**, **Refresh Live Formula**, or **Evaluate `=MJ.AI` Formula**. |
| Merged Cells (`Merge / Unmerge`) & `WrapText` | **Not in `SpreadsheetEngine` v1** (no `MergedRanges` on `WorksheetSpec`, no `WrapText` on `SpreadsheetCellStyleSpec`) | **Explicitly omitted in v1** — zero fake/dead buttons. Documented in code comments as future `SpreadsheetEngine` schema additions. |

### 4.2 Selection Preservation Rule & Honest Dual-Layer Clipboard

1. **Inside-Selection vs. Outside-Selection Right-Click Rule (`OnCellContextMenu(event, rowIndex, colIndex)`):**
   - If `event.shiftKey || event.defaultPrevented` return immediately.
   - If `InlineEditingAddress` is active and user right-clicks *outside* that `<input>`, call `CommitInlineCellEdit()` first.
   - Check **`this.IsAddressInSelectedRange(rowIndex, colIndex)`** (`L7867`):
     - **`true` (clicked INSIDE current single or multi-range selection, e.g. `B2:E10` or `A1:A5, C1:C5`):** **Preserve `SelectedRanges` and `SelectedRange` untouched!** Only record the clicked `(rowIndex, colIndex)` as the context target reference cell.
     - **`false` (clicked OUTSIDE current selection):** Call **`this.SelectCell(rowIndex, colIndex)`** (`L4397`) first so the clicked cell becomes the active selection (`SelectedRange = FormatCellAddress(rowIndex, colIndex)`), then open `<mj-context-menu>`.
   - Apply the exact same rule on **Row Headers** (preserve multi-row selection if `rowIndex` falls within selected full rows; else `SelectRowHeader(rowIndex)` `L5490`) and **Column Headers** (preserve multi-column selection if `colIndex` falls within selected full columns; else `SelectColumnHeader(col.Letter)` `L5465`).
2. **Honest Dual-Layer Clipboard (`SheetsClipboardBuffer` + Browser Clipboard):**
   - Maintain a typed internal `SheetsClipboardBuffer` on `SpreadsheetArtifactViewerComponent`:
     ```typescript
     interface SheetsClipboardSnapshot {
         Mode: 'copy' | 'cut';
         SourceSheetID: string;
         SourceRangeA1: string;
         Cells: SpreadsheetCellSpec[][];
         PlainTsv: string;
     }
     ```
   - **Copy / Cut / Copy Values Only / Copy Formula:** Synchronously populates `SheetsClipboardBuffer` via `SpreadsheetEngine.Instance.ReadRange` (`L4495`) **and** writes TSV (or raw `Formula` string for *Copy Formula*) via `navigator.clipboard.writeText(...)`. If `Mode === 'cut'`, marks the range with a subtle dashed marching-ants border `.mj-sheets-cell-cut-source` cleared upon paste or `Escape`.
   - **Paste / Paste Values Only / Paste Formatting Only:**
     - First attempts `navigator.clipboard.readText()`.
     - If external clipboard text differs from `SheetsClipboardBuffer.PlainTsv` (meaning the user copied something from Excel/Docs/another app): applies external TSV via `ApplyTsvPasteAtActiveCell(text)` (`L4735`) for *Paste* / *Paste Values Only*.
     - If `SheetsClipboardBuffer` matches (or `navigator.clipboard.readText()` throws `NotAllowedError` in strict browser contexts!): seamlessly applies `SheetsClipboardBuffer.Cells` at `(ActiveRowIndex, ActiveColumnIndex)`:
       - *Paste*: copies `RawValue`, `Formula` (with relative A1 offset translation via `SpreadsheetEngine`), and `Style` (and clears source range if `Mode === 'cut'`).
       - *Paste Values Only*: writes `ComputedValue ?? RawValue` via `SetCell` with `Formula = undefined`.
       - *Paste Formatting Only*: copies cloned `Style` onto target cells without touching values or formulas!
     - If `SheetsClipboardBuffer` is `null` **and** `navigator.clipboard.readText()` is denied by browser permissions: displays an honest banner in `StatusBannerMessage`: `"Browser blocked clipboard read — press ⌘V (or Ctrl+V) directly in the grid to paste external data."`

### 4.3 Zone 4a — Grid Cell & Multi-Cell Range Selection (Edit Mode)

**DOM Targets:** `<td class="mj-sheets-cell">` (`L707`).  
**Governance Check:** `IsSelectionEditable` checks `CanEdit` and verifies no overlap with another user's `ActiveSheet.ProtectedRanges`.

| Group | Menu Item | Icon | Shortcut | Condition | Handler / Engine Wiring |
|---|---|---|---|---|---|
| **Clipboard** | **Cut** | `fa-solid fa-scissors` | `⌘X` | Disabled if `!IsSelectionEditable` | `CutSelectionToSheetsClipboard()` |
| | **Copy** | `fa-regular fa-copy` | `⌘C` | Always | `CopySelectionToSheetsClipboard('all')` |
| | **Copy Special ▸** *(Submenu)* | `fa-regular fa-clone` | — | Always | **Copy Values Only**, **Copy Formula** (enabled when `ActiveCellSpec?.Formula`), **Copy as CSV**, **Copy as Markdown Table**, **Copy Live Block JSON for Docs/Slides** |
| | **Paste** | `fa-regular fa-clipboard` | `⌘V` | Disabled if `!IsSelectionEditable` | `PasteFromSheetsClipboard('all')` |
| | **Paste Special ▸** *(Submenu)* | `fa-solid fa-paste` | — | Disabled if `!IsSelectionEditable` | **Paste Values Only** (`⇧⌘V`), **Paste Formatting Only** (enabled when internal `SheetsClipboardBuffer` exists) |
| **MJ Live / Spill** *(Contextual)* | **Refresh `=MJ.*` Formula Data** | `fa-solid fa-arrows-rotate` | — | Shown when `ActiveCellSpec?.Formula` uses `MJ.QUERY` / `MJ.VIEW` / `MJ.IMPORTRANGE` | `RefreshAllLiveData(true)` (`L5873`) |
| | **Run `=MJ.AI` Formula(s)** | `fa-solid fa-wand-magic-sparkles` | — | Shown when `ActiveCellSpec?.Formula` uses `MJ.AI` | `RunAiFormulas()` (`L5924`) |
| | **Select Spill Anchor (`A1`)** | `fa-solid fa-crosshairs` | — | Shown when `ActiveCellSpec?.SpilledFrom` is set | `FocusCellAddress(ActiveCellSpec.SpilledFrom)` |
| **Structure** | **Insert `N` Row(s) Above** | `fa-solid fa-arrow-up` | — | Disabled if `!IsSelectionEditable` | `InsertRowsAtSelection('above')` (`SpreadsheetEngine.Instance.InsertRows` `L3378`) |
| | **Insert `N` Row(s) Below** | `fa-solid fa-arrow-down` | — | Disabled if `!IsSelectionEditable` | `InsertRowsAtSelection('below')` |
| | **Insert `N` Column(s) Left** | `fa-solid fa-arrow-left` | — | Disabled if `!IsSelectionEditable` | `InsertColumnsAtSelection('left')` (`SpreadsheetEngine.Instance.InsertColumns` `L3473`) |
| | **Insert `N` Column(s) Right** | `fa-solid fa-arrow-right` | — | Disabled if `!IsSelectionEditable` | `InsertColumnsAtSelection('right')` |
| | **Delete Row(s) (`r1–r2`)** | `fa-solid fa-minus` | — | Disabled if `!IsSelectionEditable` or deleting all rows | `DeleteSelectedRows()` (`SpreadsheetEngine.Instance.DeleteRows` `L3427`), `Destructive: true` |
| | **Delete Column(s) (`A–C`)** | `fa-solid fa-table-columns` | — | Disabled if `!IsSelectionEditable` or deleting all cols | `DeleteSelectedColumns()` (`SpreadsheetEngine.Instance.DeleteColumns` `L3523`), `Destructive: true` |
| | **Clear ▸** *(Submenu)* | `fa-solid fa-eraser` | — | Disabled if `!IsSelectionEditable` | **Clear Contents** (`⌫`, `ClearSelectedRange` `L4664`), **Clear Formatting** (`ClearSelectedRangeFormatting`), **Clear All** (`ClearSelectedRangeAll`) |
| **Format & Style** | **Number Format ▸** *(Submenu)* | `fa-solid fa-hashtag` | — | Disabled if `!IsSelectionEditable` | Radio submenu (`ApplyFormatToSelectedRanges(fmt)` extending `ApplyActiveCellFormat` `L5688` to all `SelectedRanges`): **Automatic (`general`)**, **Currency (`$1,234.00`)**, **Percent (`12.3%`)**, **Decimal (`1,234.56`)**, **Integer (`1,235`)**, **Date (`yyyy-mm-dd`)** |
| | **Style & Alignment ▸** *(Submenu)* | `fa-solid fa-sliders` | — | Disabled if `!IsSelectionEditable` | Checkbox/Radio items: **Bold** (`⌘B`), **Italic** (`⌘I`), separator, **Align Left**, **Align Center**, **Align Right**, separator, `swatch-row` **Fill Color** (Clear + 6 semantic light/tint swatches), `swatch-row` **Text Color** (Default + 6 high-contrast palette swatches) |
| **Data & View** | **Sort by Column `X` (A → Z)** | `fa-solid fa-arrow-down-a-z` | — | Disabled if `!IsSelectionEditable` | `SortColumnByIndex(ActiveColumnIndex, 'asc')` (`L5745`) |
| | **Sort by Column `X` (Z → A)** | `fa-solid fa-arrow-up-z-a` | — | Disabled if `!IsSelectionEditable` | `SortColumnByIndex(ActiveColumnIndex, 'desc')` |
| | **Freeze Panes ▸** *(Submenu)* | `fa-solid fa-thumbtack` | — | Edit mode | **Freeze Up To Row `R`**, **Freeze Up To Column `C`**, **Freeze Header Row (Row 1)** (`ToggleFreezeHeaderRow` `L5757`), **Unfreeze All Panes** (enabled when `FrozenRows > 0 \|\| FrozenColumns > 0`) |
| | **Create Chart from Selection…** | `fa-solid fa-chart-column` | — | Multi-cell selection (`SelectedRange.includes(':')`) | Creates chart via `AddRangeChartFromSelection('bar')` (`L6684`) and immediately opens `OpenChartEditorModal(newChart)` (`L6391`) |
| **Collaborate & AI** | **Add / View Comment on `A1:C4`** | `fa-regular fa-comment-dots` | `⌥⌘M` | Always | Opens `ShowCommentsDrawer = true` pre-targeted to `SelectedRange` (or `OpenCommentThreadFromCell` if comments exist) |
| | **Protect / Unprotect Range** | `fa-solid fa-shield-halved` | — | Edit mode | `ToggleSelectedRangeProtection()` (`L5959`) |
| | **Ask AI About Range…** | `fa-solid fa-wand-magic-sparkles` | — | `IsAiAssistantEnabled` | `OpenAskAiForSpreadsheet()` (`L6003`) |

### 4.4 Zone 4b — Row Headers (`1, 2, 3…`, `<td class="mj-sheets-row-header">` at `L682`)

- **Select Row** (already selected on right-click outside existing row selection; preserves `N` selected rows when inside).
- **Copy** (`⌘C`) / **Cut** (`⌘X`) / **Paste** (`⌘V`).
- **Insert `N` Row(s) Above** / **Insert `N` Row(s) Below**.
- **Delete Row(s)** (`Destructive: true`, guarded so at least 1 row remains).
- **Clear Row Contents** / **Clear Row Formatting**.
- **Row Height ▸** (submenu: **Auto-Fit Row Height**, **Compact (`24px`)**, **Default (`28px`)**, **Comfortable (`38px`)**).
- **Hide Row(s)** (`row.Hidden = true`) / **Unhide Adjacent Rows** (shown when `rowIndex - 1` or `rowIndex + 1` is hidden, plus **Unhide All Rows in Sheet** when any row in `ActiveSheet.Rows` is hidden).
- **Freeze Up To Row `R`** / **Unfreeze Rows** (`ActiveSheet.FrozenRows = row.Index` / `0`).
- **Protect Row**.

### 4.5 Zone 4c — Column Headers (`A, B, C…`, `<th class="mj-sheets-col-header">` at `L640`)

- **Copy** (`⌘C`) / **Cut** (`⌘X`) / **Paste** (`⌘V`).
- **Insert `N` Column(s) Left** / **Insert `N` Column(s) Right**.
- **Delete Column(s)** (`Destructive: true`, guarded so at least 1 column remains).
- **Clear Column Contents** / **Clear Column Formatting**.
- **Sort Sheet A → Z** / **Sort Sheet Z → A** (`SortColumnByIndex(col.Index, 'asc' | 'desc')`).
- **Format Column ▸** (submenu applying `FormatType` across populated cells in selected column(s): **Automatic**, **Currency**, **Percent**, **Decimal**, **Integer**, **Date**).
- **Column Width ▸** (submenu: **Auto-Fit Column Width** — computes max rendered text length in column * `7.5px + 24px` clamped `[64, 420]` — **Narrow (`80px`)**, **Default (`110px`)**, **Wide (`180px`)**).
- **Hide Column(s)** (`col.Hidden = true`) / **Unhide Adjacent Columns** / **Unhide All Columns in Sheet**.
- **Freeze Up To Column `C`** / **Unfreeze Columns** (`ActiveSheet.FrozenColumns = col.Index` / `0`).

### 4.6 Zone 4d — Worksheet Tabs (`.mj-sheets-tab-pill` at `L1086`)

Right-clicking a tab targets `ws: WorksheetSpec` by `ws.SheetID`:
- **Rename Sheet…** (`BeginRenameWorksheetTab(ws.SheetID)` — renders an inline `<input class="mj-sheets-tab-rename-input">` right inside the tab pill on `Enter`/`blur`, calling `SpreadsheetEngine.Instance.RenameWorksheet(Workbook, ws.SheetID, nextName)` `L4554` so cross-sheet formulas update automatically! Also wires double-click on tab pill as a bonus UX polish).
- **Duplicate Sheet** (`DuplicateWorksheetTab(ws.SheetID)` — deep-clones `WorksheetSpec` with fresh `SheetID`, unique name `"{Name} (Copy)"`, and cloned sheet-scoped charts/tables inserted at `idx + 1`).
- **Insert New Sheet** (`AddNewWorksheetTab()` `L5777`, inserting right after `ws`).
- **Move Left** (`MoveWorksheetTab(ws.SheetID, -1)`, disabled at `idx === 0`) / **Move Right** (`MoveWorksheetTab(ws.SheetID, 1)`, disabled at last tab).
- **Unhide All Rows & Columns** (shown when `ws` has hidden rows or columns).
- **Export This Sheet as `.csv`** (`ExportWorksheetByIdAsCsv(ws.SheetID)`).
- **Sheet Summary** (non-interactive header/info badge or status banner: e.g. `"{PopulatedCells} cells · {FormulaCells} formulas · {Charts} charts"`).
- **Delete Sheet** (`DeleteWorksheetById(ws.SheetID)` wrapping `L5788`, `Destructive: true`, disabled with `DisabledReason: "Workbook must keep at least 1 worksheet"` when `Workbook.Worksheets.length <= 1`).

### 4.7 Zone 4e — Charts (Floating & Docked), Bound Live Tables & Embedded Artifacts

1. **Range Charts — Both Floating Canvas Overlay (`.mj-sheets-floating-chart` at `L830`) & Docked Bottom Strip (`.mj-sheets-chart-card` at `L1016`):**
   - **Edit Chart & Range Properties…** (`OpenChartEditorModal(chart, event)` `L6391` — Edit mode).
   - **Chart Type ▸** (radio submenu in Edit mode calling `OnChartTypeChanged(chart, type)` `L7052`: **Bar** `bar`, **Line** `line`, **Area** `area`, **Pie** `pie`).
   - **Move onto Sheet Canvas** / **Dock Below Sheet** (`ToggleChartPlacement(chart)` `L6325` — Edit mode, label dynamically reflects `(chart.Placement || 'floating') === 'floating'`).
   - **Reset Chart Size (`400 × 240`)** (Edit mode, shown when floating and custom `Width`/`Height` differs from default).
   - **Bring to Front** (Edit mode, shown when `FloatingSheetCharts.length > 1` — moves `chart` to end of `ActiveSheet.Charts` array so it renders on top of overlapping floating charts!).
   - **Select Source Data Range (`B2:D12`)** (`SelectChartSourceRange(chart)` — works in **both Edit and Viewer** modes!).
   - **Duplicate Chart** (`DuplicateRangeChart(chart)` — Edit mode).
   - **Copy Live Block JSON (for Docs / Slides)** (`CopySlideBlockDescriptorForChart(chart)` `L7058` — **both Edit and Viewer** modes!).
   - **Delete Chart** (`RemoveRangeChart(chart)` `L6712`, `Destructive: true` — Edit mode).
2. **Bound Live Data Tables (`.mj-sheets-live-table-chip` / `.mj-sheets-live-card` at `L885`):**
   - **Refresh Live Table Now** (`RefreshSingleLiveTable(table)` `L6047` — Edit & Viewer!).
   - **Jump to Anchor Cell (`A1`)** (`FocusCellAddress(table.AnchorCell)`).
   - **Freeze Snapshot…** / **Unfreeze Live Table** (`PromptFreezeLiveTable(table)` `L6113` / `UnfreezeLiveTable(table)` `L6192` — Edit mode).
   - **Copy Live Block JSON** (serializes as `DocumentBlockSpec` for pasting into Docs/Slides).
   - **Remove Bound Table** (`RemoveLiveTable(table)` `L6082`, `Destructive: true` — Edit mode).
3. **Embedded OLE Artifact Cards (`.mj-sheets-embedded-card` at `L1042`):**
   - Guards `if (event.defaultPrevented || event.shiftKey) return;` so an active inline Whiteboard uses its own canvas menu!
   - **Jump to Anchor Cell (`emb.AnchorCell`)**, **Open Source Artifact** (`OpenEntityRecord.emit`), **Copy Artifact Reference**, **Remove Embedded Artifact** (`RemoveEmbeddedArtifact(emb)` `L6252`, `Destructive: true` — Edit mode).

### 4.8 Zone 4f — MJ Sheets Read-Only Viewer Mode (`!CanEdit` or `FallbackXlsxBytes`)

In Viewer mode (`!CanEdit`), mutating items are cleanly omitted so right-clicking any cell, multi-cell selection, header, tab, or chart presents a focused data-exploration menu:
- **Copy** (`⌘C`), **Copy Values Only**, **Copy as CSV**, **Copy as Markdown Table**.
- **Select Spill Anchor** (when on a spilled array cell).
- **Jump to Comment Thread** (when `GetCommentsForCell(r, c).length > 0` via `OpenCommentThreadFromCell` `L7584`) / **Add Comment on Range** (when `CanComment` is enabled).
- **Refresh All Live Data** (`RefreshAllLiveData(true)` — viewer-scoped in-memory refresh, does not mutate saved artifact).
- **Select Chart Source Range** & **Copy Chart Block for Docs / Slides** (on charts).
- **Export Workbook (`.xlsx`)** (`ExportWorkbookAsXlsx()` `L7641`) & **Export Active Sheet (`.csv`)** (`ExportActiveSheetAsCsv()` `L7653`).
- *(Sorting/Filtering in Viewer mode is intentionally excluded in v1 because `SortActiveColumn` mutates `WorksheetSpec.Cells` in place; excluding it avoids silent unsaved state divergence in read-only mode.)*

---

## 5. Implementation Architecture, Phasing & Automated Test Plan

### 5.1 Exact File Layout

All new code lives inside `packages/Angular/Generic/artifacts/src/`:

```text
packages/Angular/Generic/artifacts/src/
├── public-api.ts                                              # Export context-menu component, types & position util
└── lib/
    ├── artifacts.module.ts                                    # Declare & export MjContextMenuComponent (standalone: false)
    └── components/
        ├── context-menu/
        │   ├── context-menu.types.ts                          # Public interfaces (zero any / unknown)
        │   ├── context-menu-position.util.ts                  # Pure root/submenu collision math, safe-triangle, shortcut fmt, separator normalizer
        │   ├── context-menu-position.util.test.ts             # Pure Vitest unit tests for math, normalization & shortcuts
        │   ├── mj-context-menu.component.ts                   # Reusable WAI-ARIA menu + recursive cascading submenu renderer
        │   ├── mj-context-menu.component.html                 # @if / @for / @switch template
        │   ├── mj-context-menu.component.css                  # Plain ngc-safe CSS using only --mj-* semantic tokens
        │   └── mj-context-menu.component.dom.test.ts          # Angular TestBed DOM tests (keyboard, Escape precedence, submenus, disabled tooltips)
        └── plugins/
            ├── context-menus/
            │   ├── docs-context-menu.helper.ts                # Pure BuildDocsContextMenu(ctx) + DocsContextMenuCommand union
            │   ├── docs-context-menu.helper.test.ts           # Unit tests across all Docs zones & Edit/Suggest/Preview/Locked states
            │   ├── slides-context-menu.helper.ts              # Pure BuildSlidesContextMenu(ctx) + SlidesContextMenuCommand union
            │   ├── slides-context-menu.helper.test.ts         # Unit tests across Filmstrip, Stage, Region, LiveBlock, Notes & Present states
            │   ├── sheets-context-menu.helper.ts              # Pure BuildSheetsContextMenu(ctx) + SheetsContextMenuCommand union
            │   └── sheets-context-menu.helper.test.ts         # Unit tests across Cell/Range, Headers, Tabs, Charts, LiveTables & Viewer states
            ├── markdown-artifact-viewer.component.ts          # Wire <mj-context-menu>, OnDocsContextMenu & OnDocsContextMenuCommand
            ├── markdown-artifact-viewer.component.dom.test.ts # Add Docs context-menu DOM integration suite
            ├── slide-deck-artifact-viewer.component.ts        # Wire <mj-context-menu>, OnSlidesContextMenu, Hidden skip & OnSlidesContextMenuCommand
            ├── slide-deck-artifact-viewer.component.dom.test.ts # Add Slides context-menu DOM integration suite
            ├── spreadsheet-artifact-viewer.component.ts       # Wire <mj-context-menu>, multi-range hit-test, clipboard buffer, cell colors & commands
            └── spreadsheet-artifact-viewer.component.dom.test.ts # Add Sheets context-menu DOM integration suite
```

### 5.2 Modularity Pattern (Preventing Viewer Bloat)

Each helper exports a discriminated union command type and a pure builder function:

```typescript
// Example pattern in sheets-context-menu.helper.ts
export type SheetsContextMenuCommand =
    | { Type: 'clipboard'; Action: 'cut' | 'copy' | 'copy-values' | 'copy-formula' | 'copy-csv' | 'copy-markdown' | 'paste' | 'paste-values' | 'paste-format' }
    | { Type: 'insert-rows'; Placement: 'above' | 'below'; Count: number }
    | { Type: 'delete-rows'; StartRow: number; Count: number }
    | { Type: 'format-range'; Format: SpreadsheetCellFormatType }
    | { Type: 'cell-color'; Target: 'fill' | 'text'; CssColor: string | null }
    | { Type: 'freeze'; Target: 'row' | 'col' | 'header-row' | 'unfreeze'; Index?: number }
    | { Type: 'chart-type'; ChartID: string; ChartType: SpreadsheetRangeChartType }
    | { Type: 'chart-placement'; ChartID: string }
    | { Type: 'tab-rename'; SheetID: string }
    /* ...complete strongly-typed variants... */;

export function BuildSheetsContextMenu(
    ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] { ... }
```

In each viewer template, a single `<mj-context-menu>` instance sits at the root of the viewer host:
```html
<mj-context-menu
    [IsOpen]="ContextMenuOpen"
    [AnchorX]="ContextMenuX"
    [AnchorY]="ContextMenuY"
    [Items]="ContextMenuItems"
    [AriaLabel]="ContextMenuAriaLabel"
    [RestoreFocusElement]="ContextMenuRestoreFocusEl"
    (ItemSelected)="OnContextMenuCommand($event)"
    (Closed)="CloseContextMenu()">
</mj-context-menu>
```

### 5.3 CI Gate & MJ Standards Compliance Checklist

Every file created or modified MUST pass all repository static gates before completion:
1. **Zero `any` / lazy `unknown` (`AGENTS.md` Rule 2):** `<mj-context-menu>` uses `<mj-context-menu>` with `ContextMenuItem<TPayload>` (defaulting to `unknown`-free generic or concrete union via `@Input() Items: ReadonlyArray<ContextMenuItem<TPayload>>` — in Angular templates, type the component class as `MjContextMenuComponent<TPayload = unknown>`? **NO** — per Rule 2, avoid `unknown`! Type the base payload constraint as `export interface ContextMenuCommandBase { readonly Type: string }` so `MjContextMenuComponent<TCommand extends ContextMenuCommandBase = ContextMenuCommandBase>` has **zero `any` and zero `unknown`** anywhere!).
2. **Plain `ngc` CSS (`.github/scripts/check-ngc-scss.sh`):** Use `.css` extension (`styleUrls: ['./mj-context-menu.component.css']`), `/* ... */` comments only, no Sass `$variables` or `&` nesting.
3. **Semantic `--mj-*` Design Tokens Only (`.github/scripts/check-css-hex-tokens.sh`):** Zero `#hex`, `rgb()`, `rgba()`, `hsl()`, or named CSS colors in `.css` or inline component `styles`. Even Sheet fill/text color swatches in CSS/templates use `color-mix(in srgb, var(--mj-brand-primary) 16%, var(--mj-bg-surface))` or `--mj-*` status/brand variables (translating to canonical hex only inside `SpreadsheetEngine` `.xlsx` binary export if needed).
4. **Focus Ring Validity (`.github/scripts/check-focus-ring.sh`):** Use `outline: none; box-shadow: var(--mj-focus-ring);` — never `outline: var(--mj-focus-ring)`.
5. **No `.mj-btn` Selector Overrides (`.github/scripts/check-mj-btn-override.sh`):** Menu rows use `.mj-context-menu-item`, never `.mj-btn`.
6. **Widget Layer Purity (`packages/Angular/Generic/CLAUDE.md`):** Zero imports from `@angular/router` or `@memberjunction/ng-shared`. Declare `standalone: false` in `ArtifactsModule`, use `@if`/`@for`/`@switch` control flow, `inject()` DI, setter `@Input()`s (no `ngOnChanges`), and Font Awesome icons.

### 5.4 Parallel Execution Workstreams (Ready for Hydrogen High)

The implementation splits cleanly into a small serial foundation followed by **three 100% file-disjoint parallel workstreams**:

- **Phase 0 — Shared `<mj-context-menu>` Foundation (1 Worker, Prerequisite):**
  - Owns: `src/lib/components/context-menu/*`, `src/lib/artifacts.module.ts`, `src/public-api.ts`.
  - Delivers: `MjContextMenuComponent`, collision/safe-triangle/shortcut utilities, `Escape` capture precedence, `Shift+F10` & touch long-press helper, `ngc` build pass, and Phase 0 unit + DOM tests.
- **Phase 1 — Parallel Viewer Workstreams (3 Concurrent Workers, Zero Shared Files):**
  - **Workstream A (MJ Docs):** Owns `context-menus/docs-context-menu.helper.ts`, `context-menus/docs-context-menu.helper.test.ts`, `markdown-artifact-viewer.component.ts`, and `markdown-artifact-viewer.component.dom.test.ts`. Implements Zones 2a–2d, selection snapshot preservation, GFM table row/col/alignment/sort/copy helpers, block duplicate/insert-above, and OLE `defaultPrevented` guard.
  - **Workstream B (MJ Slides):** Owns `context-menus/slides-context-menu.helper.ts`, `context-menus/slides-context-menu.helper.test.ts`, `slide-deck-artifact-viewer.component.ts`, and `slide-deck-artifact-viewer.component.dom.test.ts`. Implements Zones 3a–3d, `SlideSpec.Hidden` badge + presentation skip, `Transition`, `MoveSlideToEdge`, `SwapSlideRegion`, `copiedSlideRegionSpec` clipboard, and OLE `defaultPrevented` guard.
  - **Workstream C (MJ Sheets):** Owns `context-menus/sheets-context-menu.helper.ts`, `context-menus/sheets-context-menu.helper.test.ts`, `spreadsheet-artifact-viewer.component.ts`, and `spreadsheet-artifact-viewer.component.dom.test.ts`. Implements Zones 4a–4f, inside-vs-outside multi-range selection preservation, `SheetsClipboardBuffer` + honest browser fallback, freeze rows+columns sticky CSS, row/col hide/unhide/auto-fit, cell `[style.color]`/`[style.background-color]`, inline tab rename via `RenameWorksheet`, chart floating/docked context menu, and OLE `defaultPrevented` guard.
- **Phase 2 — Suite Integration & CI Gate Verification:**
  - Run `npm run build` and `npm run test` in `packages/Angular/Generic/artifacts`, plus `.github/scripts/check-css-hex-tokens.sh`, `check-ngc-scss.sh`, `check-mj-btn-override.sh`, and `check-focus-ring.sh`.

### 5.5 Concrete Automated Test Plan (Vitest Unit + Angular DOM Suites)

Every new element exposes deterministic `data-testid` hooks:
- `data-testid="mj-context-menu-root"`, `data-testid="mj-context-menu-submenu-<id>"`, `data-testid="mj-context-menu-item-<id>"`, `data-testid="mj-context-menu-swatch-<id>-<idx>"`.

1. **`context-menu-position.util.test.ts` (Pure Unit Suite — ~15 tests):**
   - Cursor near bottom-right corner `(1260, 780)` in `1280×800` viewport flips both horizontally and vertically and stays `>= 8px` inside edges.
   - Oversized menu (`height: 950` in `720px` viewport) clamps `Top: 8` and sets `MaxHeight: 704` for internal scrolling.
   - Cascading submenu flips left when `parentItemRect.Right + submenu.Width > viewport.Width - 8`, and second-level submenu inherits left cascade direction.
   - Safe-triangle helper returns `true` for diagonal cursor vector toward submenu and `false` when moving vertically onto sibling item away from submenu.
   - `NormalizeContextMenuItems` strips leading, trailing, consecutive separators, and empty-section headers.
   - `FormatMenuShortcut` outputs `⌘C` / `⇧⌘V` on macOS and `Ctrl+C` / `Ctrl+Shift+V` on Windows/Linux.
2. **`mj-context-menu.component.dom.test.ts` (Angular TestBed DOM Suite — ~14 tests):**
   - Renders `role="menu"`, `menuitem`, `menuitemcheckbox` (`aria-checked`), and `menuitemradio`.
   - `ArrowDown` / `ArrowUp` wraps across items, skips separators/headers, **lands on `aria-disabled="true"` items** (exposing `title` with `DisabledReason`), and pressing `Enter` on a disabled item does NOT emit `ItemSelected` or close the menu.
   - `ArrowRight` opens submenu and focuses first child; `ArrowLeft` and first `Escape` close ONLY the submenu and return focus to parent `menuitem`.
   - **Escape Precedence Test:** Attach a spy `@HostListener('document:keydown.escape')` on a parent wrapper host; press `Escape` while menu is open -> menu closes and parent spy count is **`0`**!
   - Printable character typeahead (`'d'`, `'u'`) focuses *Duplicate*.
   - `mousedown` on menu item calls `preventDefault()` so selection in an adjacent `contenteditable` element remains intact.
3. **`docs-context-menu.helper.test.ts` & `markdown-artifact-viewer.component.dom.test.ts` (~18 tests):**
   - Builder matrix across `edit`, `suggest`, `preview`, `IsSimpleNoteMode`, owner-locked heading (`!CanUserShareArtifact` disables Lock toggle with reason; non-owner sees disabled edits on locked section), table header vs. body row, live data block (`live` vs. `snapshot`), and embedded OLE artifact (`newerVersion` available vs. pinned).
   - DOM test: Highlight text in `contenteditable` block -> dispatch `contextmenu` -> click `Format Text ▸ Bold` -> selection wraps in `**...**` without losing range.
   - DOM test: Right-click table cell `(1, 1)` -> Insert Row Below, Align Center (`:---:` serialized in GFM), Delete Row, Copy Table as CSV.
   - DOM test: `Shift + Right-Click` does NOT call `event.preventDefault()` and leaves `<mj-context-menu>` closed.
   - DOM test: Synthetic `contextmenu` with `defaultPrevented === true` (simulating active inline Whiteboard) does NOT open Docs context menu.
4. **`slides-context-menu.helper.test.ts` & `slide-deck-artifact-viewer.component.dom.test.ts` (~16 tests):**
   - Builder matrix: Filmstrip thumbnail (`Slides.length === 1` disables *Delete Slide* with reason; first/last slide disables *Move Up*/*Move Down*), Stage background, Multi-region slide (`TwoColumn` shows *Move Region Earlier/Later*; `TitleAndBody` single body region hides swap), Sheet-backed chart region, Viewer mode, and Fullscreen `present` mode.
   - DOM test: Right-click thumbnail 2 -> *Toggle Skip / Hide Slide* -> `slide.Hidden === true`, hidden badge renders, and `EnterPresentationMode('present')` + `NextSlide()` skips slide 2 cleanly!
   - DOM test: Open context menu during `EnterPresentationMode('present')` -> press `Escape` -> context menu closes while **`IsPresentationActive` remains `true`**!
5. **`sheets-context-menu.helper.test.ts` & `spreadsheet-artifact-viewer.component.dom.test.ts` (~20 tests):**
   - Builder matrix: Single cell vs. multi-cell range, `=MJ.QUERY` / `=MJ.AI` / `SpilledFrom` cells, Protected range overlap (disables mutating items with `DisabledReason`), Row header, Column header (with hidden adjacent columns), Worksheet tab (`Worksheets.length === 1` disables *Delete Sheet*), Floating vs. Docked chart, Live Table, and Read-Only Viewer mode (`!CanEdit` omits mutating actions, retains Copy/CSV/Comment/Refresh/Export).
   - DOM test (**Selection Preservation**): Select `B2:D4` -> right-click `C3` (inside) -> `SelectedRange` stays `'B2:D4'`; right-click `F6` (outside) -> `SelectedRange` moves to `'F6'`.
   - DOM test (**Dual-Layer Clipboard**): Copy `A1:B2` with formula + currency style -> right-click `D1` -> *Paste Values Only* writes values without formula; *Paste Formatting Only* copies style without overwriting values.
   - DOM test (**Chart & Tab Actions**): Right-click floating chart -> *Change Chart Type ▸ Line* updates `chart.ChartType === 'line'`; *Dock Below Sheet* toggles `chart.Placement === 'docked'`; right-click worksheet tab -> *Rename Sheet* updates cross-sheet formulas via `SpreadsheetEngine.Instance.RenameWorksheet`.
