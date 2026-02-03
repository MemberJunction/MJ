# MemberJunction Design System Strategy

This document outlines the strategy for creating a consistent, themeable design system across all MemberJunction Angular applications.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Strategic Goals](#strategic-goals)
3. [Two-Path Approach](#two-path-approach)
4. [Architecture Overview](#architecture-overview)
5. [Token Strategy](#token-strategy)
6. [Component Patterns](#component-patterns)
7. [Information Architecture Patterns](#information-architecture-patterns)
8. [UI Library Integration](#ui-library-integration)
9. [Migration Strategy](#migration-strategy)
10. [Implementation Checklist](#implementation-checklist)

---

## Problem Statement

### Current Challenges

1. **Inconsistent Styling**: Custom components don't pick up the same styling as library components
2. **Hardcoded Values**: Many components use hardcoded colors, spacing, and other values instead of design tokens
3. **Mixed Approaches**: Some components use inline styles, others use external CSS, with varying encapsulation strategies
4. **Theming Gaps**: Dark/light mode infrastructure exists but isn't applied uniformly
5. **Library Lock-in**: Heavy dependency on Kendo UI (being phased out due to licensing costs)
6. **Custom Component Investment**: Significant domain-specific components (AI chat, query builders, dashboards) that won't map to any UI library

### What We Need

- Consistent look and feel across all components (library and custom)
- Working dark/light mode that affects everything
- Ability to use a UI library for commodity components while building custom functionality on top
- Design system that we control, not locked to any specific library
- Clear patterns for building new components

---

## Strategic Goals

1. **Consistency**: All components—whether from a UI library or custom-built—should look like they belong together
2. **Themeable**: Dark mode, light mode, and potential future themes should "just work"
3. **Library-Agnostic**: Custom components should not be coupled to any specific UI library
4. **Extensible**: Easy to add new components that automatically follow the design system
5. **Maintainable**: Single source of truth for design decisions

---

## Two-Path Approach

### Path 1: Token Consistency (Quick Wins)

**Goal**: Get everything using `--mj-*` tokens so dark/light mode works and colors are consistent.

**Scope**:
- Audit and replace hardcoded values with tokens
- Ensure token coverage for dark mode
- Wire up theme switching infrastructure
- Fix ViewEncapsulation issues

**Deliverables**:
- Theme switcher that works
- All existing components respond to dark/light mode
- No visual changes to light mode (just tokenized)

**Timeline**: Can be done incrementally alongside regular development

### Path 2: Design System Redesign

**Goal**: Cohesive, documented design system with consistent patterns across all component types.

**Scope**:
- Expanded token system with component-specific tokens
- Replace Kendo with PrimeNG (themed to MJ design language)
- Create shared MJ component library with documented patterns
- Information Architecture patterns (layout templates, interaction patterns)
- Storybook documentation
- Systematic migration of custom components

**Deliverables**:
- Complete design system documentation
- PrimeNG integrated and themed
- Shared component library (`mj-card`, `mj-panel`, `mj-button`, etc.)
- IA pattern documentation and templates
- Migration guide and component mapping

**Timeline**: Phased implementation over multiple releases

---

## Architecture Overview

### The Layered Design System

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: MJ Custom Components                              │
│  (Built using Layer 1 & 2 primitives)                       │
│  • AI Chat, Query Builder, Record Forms, Dashboards         │
│  • Uses MJ tokens + extended library components             │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: MJ Component Extensions                           │
│  (Wrappers/extensions of base library)                      │
│  • mj-button (extends p-button with MJ variants)            │
│  • mj-data-grid (extends p-table with MJ functionality)     │
│  • mj-dialog (extends p-dialog with MJ behaviors)           │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Base UI Library (PrimeNG)                         │
│  (Themed to MJ design language)                             │
│  • Buttons, inputs, dropdowns, tables, dialogs              │
│  • All using --mj-* tokens via theme override               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: MJ Design Tokens                                  │
│  • Colors, spacing, typography, shadows, borders            │
│  • Dark/light mode definitions                              │
│  • Single source of truth                                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Tokens are the foundation**: Everything builds on `--mj-*` CSS custom properties
2. **Library is themed, not adopted**: PrimeNG uses MJ tokens, not the other way around
3. **Extensions add value**: Wrappers add MJ-specific functionality without reinventing base components
4. **Custom components follow patterns**: Even fully custom components use tokens and shared patterns

---

## Token Strategy

### Use `--mj-*` Tokens as the Source of Truth

**Map the UI library's tokens TO your tokens, not the other way around.**

```
┌─────────────────────────────────────────┐
│  --mj-* tokens (MJ controls these)      │  ← Source of truth
└─────────────────────────────────────────┘
           │                    │
           ▼                    ▼
┌─────────────────┐   ┌─────────────────┐
│ PrimeNG theme   │   │ Custom MJ       │
│ --p-* → --mj-*  │   │ components      │
└─────────────────┘   └─────────────────┘
```

### Why MJ Tokens Over Library Tokens?

1. **Library-agnostic**: If we switch libraries, custom components don't change
2. **Semantic naming**: Token names reflect MJ's domain language
3. **Single control point**: Design changes happen in one place
4. **Future-proof**: Not locked to any library's token structure

### Token Categories

```scss
// _tokens.scss

:root {
  // ============================================
  // COLOR TOKENS
  // ============================================

  // Brand colors
  --mj-color-primary: #0076b6;
  --mj-color-primary-hover: #005a8c;
  --mj-color-primary-active: #004a73;
  --mj-color-on-primary: #ffffff;

  // Background colors
  --mj-bg-page: #f8fafc;
  --mj-bg-surface: #ffffff;
  --mj-bg-elevated: #ffffff;
  --mj-bg-overlay: rgba(0, 0, 0, 0.5);

  // Text colors
  --mj-text-primary: #1e293b;
  --mj-text-secondary: #64748b;
  --mj-text-disabled: #94a3b8;
  --mj-text-inverse: #ffffff;

  // Border colors
  --mj-border-default: #e2e8f0;
  --mj-border-strong: #cbd5e1;
  --mj-border-focus: var(--mj-color-primary);

  // Status colors
  --mj-color-success: #22c55e;
  --mj-color-warning: #f59e0b;
  --mj-color-error: #ef4444;
  --mj-color-info: #3b82f6;

  // ============================================
  // SPACING TOKENS (4px base)
  // ============================================
  --mj-space-1: 4px;
  --mj-space-2: 8px;
  --mj-space-3: 12px;
  --mj-space-4: 16px;
  --mj-space-5: 20px;
  --mj-space-6: 24px;
  --mj-space-8: 32px;
  --mj-space-10: 40px;
  --mj-space-12: 48px;
  --mj-space-16: 64px;

  // ============================================
  // TYPOGRAPHY TOKENS
  // ============================================
  --mj-font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --mj-font-family-mono: 'JetBrains Mono', monospace;

  --mj-font-size-xs: 12px;
  --mj-font-size-sm: 14px;
  --mj-font-size-base: 16px;
  --mj-font-size-lg: 18px;
  --mj-font-size-xl: 20px;
  --mj-font-size-2xl: 24px;
  --mj-font-size-3xl: 30px;

  --mj-font-weight-normal: 400;
  --mj-font-weight-medium: 500;
  --mj-font-weight-semibold: 600;
  --mj-font-weight-bold: 700;

  --mj-line-height-tight: 1.25;
  --mj-line-height-normal: 1.5;
  --mj-line-height-relaxed: 1.75;

  // ============================================
  // BORDER RADIUS TOKENS
  // ============================================
  --mj-radius-none: 0;
  --mj-radius-sm: 4px;
  --mj-radius-md: 6px;
  --mj-radius-lg: 8px;
  --mj-radius-xl: 12px;
  --mj-radius-full: 9999px;

  // ============================================
  // SHADOW TOKENS
  // ============================================
  --mj-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --mj-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --mj-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --mj-shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);

  // ============================================
  // TRANSITION TOKENS
  // ============================================
  --mj-transition-fast: 150ms ease;
  --mj-transition-base: 200ms ease;
  --mj-transition-slow: 300ms ease;

  // ============================================
  // Z-INDEX TOKENS
  // ============================================
  --mj-z-dropdown: 100;
  --mj-z-sticky: 200;
  --mj-z-overlay: 300;
  --mj-z-modal: 400;
  --mj-z-popover: 500;
  --mj-z-tooltip: 600;
  --mj-z-toast: 700;
}

// ============================================
// DARK MODE
// ============================================
[data-theme="dark"] {
  // Background colors
  --mj-bg-page: #0f172a;
  --mj-bg-surface: #1e293b;
  --mj-bg-elevated: #334155;
  --mj-bg-overlay: rgba(0, 0, 0, 0.7);

  // Text colors
  --mj-text-primary: #f1f5f9;
  --mj-text-secondary: #94a3b8;
  --mj-text-disabled: #64748b;

  // Border colors
  --mj-border-default: #334155;
  --mj-border-strong: #475569;

  // Shadows (darker in dark mode)
  --mj-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --mj-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --mj-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}
```

### PrimeNG Token Mapping

```scss
// _primeng-theme.scss - Bridges PrimeNG to MJ tokens

:root {
  // Surface colors
  --p-surface-ground: var(--mj-bg-page);
  --p-surface-section: var(--mj-bg-surface);
  --p-surface-card: var(--mj-bg-elevated);
  --p-surface-overlay: var(--mj-bg-overlay);

  // Text colors
  --p-text-color: var(--mj-text-primary);
  --p-text-muted-color: var(--mj-text-secondary);

  // Primary colors
  --p-primary-color: var(--mj-color-primary);
  --p-primary-contrast-color: var(--mj-color-on-primary);
  --p-primary-hover-color: var(--mj-color-primary-hover);
  --p-primary-active-color: var(--mj-color-primary-active);

  // Border & radius
  --p-border-radius: var(--mj-radius-md);
  --p-content-border-color: var(--mj-border-default);

  // Spacing
  --p-inline-spacing: var(--mj-space-3);
  --p-content-padding: var(--mj-space-4);

  // Focus
  --p-focus-ring-color: var(--mj-border-focus);
}

// Dark mode automatically works because --mj-* values change
// No additional PrimeNG mappings needed for dark mode
```

---

## Component Patterns

### Pattern 1: Direct Use (Themed Library Component)

Use PrimeNG components directly—theming makes them look like MJ:

```html
<!-- Just use the library component - theming handles the look -->
<button pButton label="Save" severity="primary"></button>
<button pButton label="Cancel" severity="secondary"></button>

<p-dropdown [options]="options" [(ngModel)]="selected"></p-dropdown>

<p-inputtext [(ngModel)]="value" placeholder="Enter text..."></p-inputtext>
```

**When to use**: Simple, standard UI elements with no MJ-specific behavior needed.

### Pattern 2: Extended Component (Wrapper)

Wrap a library component to add MJ-specific functionality:

```typescript
// mj-entity-picker.component.ts
@Component({
  selector: 'mj-entity-picker',
  template: `
    <p-autoComplete
      [suggestions]="filteredEntities"
      [field]="displayField"
      [dropdown]="true"
      (completeMethod)="searchEntities($event)"
      (onSelect)="onEntitySelected($event)">

      <!-- Custom item template with MJ entity info -->
      <ng-template let-entity pTemplate="item">
        <div class="mj-entity-picker__item">
          <i [class]="entity.Icon"></i>
          <div class="mj-entity-picker__item-content">
            <span class="mj-entity-picker__name">{{ entity.Name }}</span>
            <span class="mj-entity-picker__description">{{ entity.Description }}</span>
          </div>
        </div>
      </ng-template>
    </p-autoComplete>
  `,
  styles: [`
    .mj-entity-picker__item {
      display: flex;
      align-items: center;
      gap: var(--mj-space-3);
      padding: var(--mj-space-2);
    }
    .mj-entity-picker__name {
      font-weight: var(--mj-font-weight-medium);
      color: var(--mj-text-primary);
    }
    .mj-entity-picker__description {
      font-size: var(--mj-font-size-sm);
      color: var(--mj-text-secondary);
    }
  `]
})
export class MJEntityPickerComponent {
  @Input() EntityName: string;
  @Input() Filter: string;
  @Output() EntitySelected = new EventEmitter<BaseEntity>();

  // MJ-specific: uses RunView, handles permissions, caches results
  async searchEntities(event: AutoCompleteCompleteEvent) {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: this.EntityName,
      ExtraFilter: `Name LIKE '%${event.query}%'`,
      ResultType: 'simple',
      MaxRows: 50
    });
    this.filteredEntities = result.Results;
  }
}
```

**When to use**: You need library component behavior but with MJ-specific additions (custom templates, RunView integration, entity handling).

### Pattern 3: Composition (Custom Component Using Library Primitives)

Build a custom component using library components as building blocks:

```typescript
// mj-query-builder.component.ts
@Component({
  selector: 'mj-query-builder',
  template: `
    <div class="mj-query-builder">
      <!-- Toolbar uses library components -->
      <div class="mj-query-builder__toolbar">
        <p-dropdown
          [options]="entities"
          [(ngModel)]="selectedEntity"
          (onChange)="onEntityChange($event)"
          placeholder="Select Entity">
        </p-dropdown>
        <p-button icon="pi pi-play" label="Run" (click)="runQuery()"></p-button>
        <p-button icon="pi pi-save" label="Save" severity="secondary" (click)="saveQuery()"></p-button>
      </div>

      <!-- Custom query canvas - fully MJ-specific -->
      <div class="mj-query-builder__canvas">
        <mj-query-node
          *ngFor="let node of queryNodes"
          [node]="node"
          (connect)="onNodeConnect($event)"
          (remove)="onNodeRemove($event)">
        </mj-query-node>
      </div>

      <!-- Filter builder uses library inputs with custom logic -->
      <div class="mj-query-builder__filters">
        <div *ngFor="let filter of filters; let i = index" class="mj-query-builder__filter-row">
          <p-dropdown [options]="fieldOptions" [(ngModel)]="filter.field"></p-dropdown>
          <p-dropdown [options]="operatorOptions" [(ngModel)]="filter.operator"></p-dropdown>
          <mj-dynamic-value-input [filter]="filter"></mj-dynamic-value-input>
          <p-button icon="pi pi-trash" severity="danger" (click)="removeFilter(i)"></p-button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .mj-query-builder {
      display: flex;
      flex-direction: column;
      gap: var(--mj-space-4);
      padding: var(--mj-space-4);
      background: var(--mj-bg-surface);
      border-radius: var(--mj-radius-lg);
      border: 1px solid var(--mj-border-default);
    }
    .mj-query-builder__toolbar {
      display: flex;
      gap: var(--mj-space-3);
      padding-bottom: var(--mj-space-4);
      border-bottom: 1px solid var(--mj-border-default);
    }
    .mj-query-builder__filter-row {
      display: flex;
      gap: var(--mj-space-2);
      align-items: center;
    }
  `]
})
export class MJQueryBuilderComponent {
  // 100% custom logic - the library components are just UI primitives
}
```

**When to use**: Complex MJ-specific components where library components handle inputs/buttons but the overall behavior is custom.

### Pattern 4: Headless (Behavior from CDK, UI from MJ)

Use Angular CDK for accessibility and behavior, build UI yourself:

```typescript
// mj-collapsible-section.component.ts
import { CdkAccordionItem } from '@angular/cdk/accordion';

@Component({
  selector: 'mj-collapsible-section',
  template: `
    <div class="mj-collapsible">
      <!-- CDK handles: keyboard nav, ARIA, expand/collapse state -->
      <button
        cdkAccordionItem
        #accordionItem="cdkAccordionItem"
        class="mj-collapsible__header"
        [class.mj-collapsible__header--expanded]="accordionItem.expanded"
        (click)="accordionItem.toggle()">
        <i class="fa-solid" [class]="icon"></i>
        <span class="mj-collapsible__title">{{ title }}</span>
        <span class="mj-collapsible__badge" *ngIf="count">{{ count }}</span>
        <i class="fa-solid fa-chevron-down mj-collapsible__chevron"></i>
      </button>

      <div
        class="mj-collapsible__content"
        [class.mj-collapsible__content--open]="accordionItem.expanded">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .mj-collapsible__header {
      display: flex;
      align-items: center;
      gap: var(--mj-space-3);
      width: 100%;
      padding: var(--mj-space-3) var(--mj-space-4);
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      cursor: pointer;
      transition: background var(--mj-transition-fast);
    }
    .mj-collapsible__header:hover {
      background: var(--mj-bg-elevated);
    }
    .mj-collapsible__chevron {
      margin-left: auto;
      transition: transform var(--mj-transition-fast);
    }
    .mj-collapsible__header--expanded .mj-collapsible__chevron {
      transform: rotate(180deg);
    }
    .mj-collapsible__content {
      display: none;
      padding: var(--mj-space-4);
    }
    .mj-collapsible__content--open {
      display: block;
    }
  `]
})
export class MJCollapsibleSectionComponent {
  @Input() title: string;
  @Input() icon: string;
  @Input() count: number;
}
```

**When to use**: Need accessibility/keyboard handling but want 100% custom visual design.

### Pattern 5: Pure Custom (Built from Scratch)

For truly unique components, build from scratch using only tokens:

```typescript
// mj-ai-chat.component.ts
@Component({
  selector: 'mj-ai-chat',
  template: `
    <div class="mj-chat">
      <div class="mj-chat__messages" #messagesContainer>
        <div
          *ngFor="let message of messages"
          class="mj-chat__message"
          [class.mj-chat__message--user]="message.role === 'user'"
          [class.mj-chat__message--assistant]="message.role === 'assistant'">
          <div class="mj-chat__avatar">
            <i [class]="message.role === 'user' ? 'fa-solid fa-user' : 'fa-solid fa-robot'"></i>
          </div>
          <div class="mj-chat__bubble">
            <div class="mj-chat__content" [innerHTML]="message.content | markdown"></div>
            <span class="mj-chat__time">{{ message.timestamp | date:'shortTime' }}</span>
          </div>
        </div>
      </div>

      <div class="mj-chat__input-area">
        <textarea
          class="mj-chat__textarea"
          [(ngModel)]="inputText"
          (keydown.enter)="onEnterKey($event)"
          placeholder="Type your message...">
        </textarea>
        <button class="mj-chat__send" (click)="sendMessage()" [disabled]="!inputText.trim()">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .mj-chat {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface);
      border-radius: var(--mj-radius-lg);
      border: 1px solid var(--mj-border-default);
      overflow: hidden;
    }
    .mj-chat__messages {
      flex: 1;
      overflow-y: auto;
      padding: var(--mj-space-4);
    }
    .mj-chat__message {
      display: flex;
      gap: var(--mj-space-3);
      margin-bottom: var(--mj-space-4);
    }
    .mj-chat__message--user {
      flex-direction: row-reverse;
    }
    .mj-chat__avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--mj-radius-full);
      background: var(--mj-bg-elevated);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--mj-text-secondary);
    }
    .mj-chat__bubble {
      max-width: 70%;
      padding: var(--mj-space-3) var(--mj-space-4);
      border-radius: var(--mj-radius-lg);
      background: var(--mj-bg-elevated);
    }
    .mj-chat__message--user .mj-chat__bubble {
      background: var(--mj-color-primary);
      color: var(--mj-color-on-primary);
    }
    .mj-chat__input-area {
      display: flex;
      gap: var(--mj-space-2);
      padding: var(--mj-space-4);
      border-top: 1px solid var(--mj-border-default);
    }
    .mj-chat__textarea {
      flex: 1;
      padding: var(--mj-space-3);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      font-family: var(--mj-font-family);
      resize: none;
    }
    .mj-chat__send {
      padding: var(--mj-space-3) var(--mj-space-4);
      background: var(--mj-color-primary);
      color: var(--mj-color-on-primary);
      border: none;
      border-radius: var(--mj-radius-md);
      cursor: pointer;
      transition: background var(--mj-transition-fast);
    }
    .mj-chat__send:hover:not(:disabled) {
      background: var(--mj-color-primary-hover);
    }
    .mj-chat__send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class MJAIChatComponent {
  // Completely custom MJ functionality
}
```

**When to use**: Truly unique MJ functionality that has no library equivalent.

---

## Information Architecture Patterns

Information Architecture (IA) ensures consistent user experiences across all MemberJunction views and applications. These patterns define how content is organized, how users navigate, and how interactions are structured.

### Page Layout Templates

#### Standard Page Structure

Every page should follow this consistent structure:

```
┌─────────────────────────────────────────────────────────────┐
│  Page Header                                                │
│  [Icon] Page Title                        [Primary Actions] │
│  Optional subtitle/breadcrumb                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Content Area                                               │
│  • Primary content fills available space                    │
│  • Scrollable when content exceeds viewport                 │
│  • Consistent padding using --mj-space-* tokens             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Optional Footer (actions, pagination, status)              │
└─────────────────────────────────────────────────────────────┘
```

#### Page Header Guidelines

- **Always present**: Every page has a header with title
- **Typography**: Use `--mj-font-size-2xl` or `--mj-font-size-3xl` for page titles
- **Icons**: Use Font Awesome icons to the left of titles for visual identification
- **Actions**: Primary actions positioned in the top-right
- **Spacing**: Consistent `--mj-space-4` to `--mj-space-6` below header

### Container Patterns

Choose the appropriate container type based on user task and context:

#### Modal/Dialog

**Use when**:
- User must make a decision before continuing
- Task requires focused attention
- Confirmation is needed for destructive actions
- Quick data entry that doesn't need reference to background

**Characteristics**:
- Blocks interaction with background content
- Centered on screen with overlay
- Has clear "close" affordance (X button or Cancel)
- Should be dismissable via Escape key

```html
<!-- Example structure -->
<p-dialog [header]="'Confirm Action'" [modal]="true">
  <div class="mj-dialog-content">
    <!-- Content -->
  </div>
  <div class="mj-dialog-footer">
    <button pButton label="Confirm" (click)="confirm()"></button>
    <button pButton label="Cancel" severity="secondary" (click)="cancel()"></button>
  </div>
</p-dialog>
```

#### Side Panel / Drawer

**Use when**:
- User needs to reference main content while working
- Detail view for selected item
- Editing context that relates to visible data
- Secondary information or filters

**Characteristics**:
- Slides in from edge (typically right)
- Main content remains visible but may be dimmed
- Can be resizable
- User can interact with both panel and background (optional)

#### Inline/Accordion

**Use when**:
- Progressive disclosure of details
- User doesn't need full attention on expanded content
- Content is part of a list or collection
- Toggling between sections frequently

**Characteristics**:
- Expands in place within the page flow
- Multiple sections can be open (optional)
- Minimal visual disruption
- Good for dense information displays

#### Full Page

**Use when**:
- Complex, multi-step workflows
- Content requires full screen real estate
- Task is a primary focus (not auxiliary)
- Deep navigation or sub-navigation needed

**Characteristics**:
- Replaces current view entirely
- Has its own navigation/breadcrumb back
- May have its own header and footer
- Used for major features (Record forms, Dashboards, Query Builder)

### Container Decision Tree

```
Is this a destructive action requiring confirmation?
├─ Yes → Modal/Dialog
└─ No
   Does the user need to reference the background content?
   ├─ Yes → Side Panel
   └─ No
      Is this a multi-step workflow or complex task?
      ├─ Yes → Full Page
      └─ No
         Is this progressive disclosure of existing content?
         ├─ Yes → Inline/Accordion
         └─ No → Modal/Dialog (default for focused tasks)
```

### Action Consistency

#### Button Ordering

**MemberJunction follows left-to-right priority ordering**:

```
[Primary Action] [Secondary Action] [Cancel/Close]
```

- **Primary actions** (Save, Submit, Confirm): Left-most position
- **Secondary actions** (Update, Apply): Middle position
- **Cancel/Dismiss actions**: Right-most position

This is documented in `CLAUDE.md` and applies to all dialogs, forms, and action groups.

#### Toolbar Placement

- **Page-level toolbars**: Top of content area, below page header
- **Sticky behavior**: Toolbars should stick to top on scroll for long content
- **Grouping**: Related actions grouped together with visual separation between groups
- **Overflow**: Use dropdown menu for secondary actions when space is limited

```html
<div class="mj-toolbar">
  <div class="mj-toolbar__primary">
    <button pButton label="New" icon="fa-solid fa-plus"></button>
    <button pButton label="Edit" icon="fa-solid fa-pen"></button>
  </div>
  <div class="mj-toolbar__secondary">
    <button pButton label="Export" icon="fa-solid fa-download" severity="secondary"></button>
    <button pButton label="More" icon="fa-solid fa-ellipsis" severity="secondary"></button>
  </div>
</div>
```

#### Contextual/Row Actions

- **Position**: Right side of row or in overflow menu
- **Visibility**: Show on hover or always visible for critical actions
- **Icons**: Use recognizable icons with tooltips
- **Destructive actions**: Visually distinct (use `--mj-color-error`) and may require confirmation

```html
<div class="mj-row-actions">
  <button pButton icon="fa-solid fa-pen" pTooltip="Edit" [text]="true"></button>
  <button pButton icon="fa-solid fa-copy" pTooltip="Duplicate" [text]="true"></button>
  <button pButton icon="fa-solid fa-trash" pTooltip="Delete" [text]="true" severity="danger"></button>
</div>
```

### Feedback Patterns

Consistent feedback helps users understand system state and the results of their actions.

#### Loading States

**Always use the standard `<mj-loading>` component** (per `CLAUDE.md`):

```html
<!-- Basic loading -->
<mj-loading></mj-loading>

<!-- With context -->
<mj-loading text="Loading records..."></mj-loading>

<!-- Size variants: small, medium, large, auto -->
<mj-loading size="medium" text="Please wait..."></mj-loading>
```

**When to show loading**:
- Any async operation taking > 200ms
- Data fetching, saving, or processing
- Navigation to new views with data dependencies

#### Empty States

Empty states should be informative and actionable:

```html
<div class="mj-empty-state">
  <i class="fa-solid fa-inbox mj-empty-state__icon"></i>
  <h3 class="mj-empty-state__title">No items found</h3>
  <p class="mj-empty-state__description">
    Get started by creating your first item.
  </p>
  <button pButton label="Create Item" icon="fa-solid fa-plus"></button>
</div>
```

**Guidelines**:
- Use relevant icon for context
- Clear, non-technical messaging
- Provide next action when possible
- Don't leave users in a dead end

#### Error States

**Inline validation** (form fields):
- Show immediately below the invalid field
- Use `--mj-color-error` for text and border
- Provide specific, actionable message

**Toast notifications** (async errors):
- Use for errors from background operations
- Position: top-right of viewport
- Auto-dismiss after appropriate time (longer for errors)
- Include action to retry when applicable

```typescript
// Using toast service
this.toastService.showError('Failed to save record. Please try again.');

// With action
this.toastService.showError('Connection lost', {
  action: { label: 'Retry', callback: () => this.reconnect() }
});
```

#### Success Confirmation

**Quick actions** (save, update, delete):
- Toast notification: brief, non-blocking
- Auto-dismiss after 3-5 seconds

**Significant changes** (major workflow completion, destructive actions):
- Dialog confirmation with summary
- May include next steps or related actions

```html
<!-- Toast for quick save -->
<p-toast></p-toast>
<!-- In component: this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Record updated successfully' }); -->

<!-- Dialog for significant action -->
<p-dialog [header]="'Export Complete'" [visible]="exportComplete">
  <p>Your data has been exported successfully.</p>
  <p>File: {{ exportFileName }}</p>
  <button pButton label="Download" icon="fa-solid fa-download" (click)="download()"></button>
  <button pButton label="Close" severity="secondary" (click)="close()"></button>
</p-dialog>
```

### IA Checklist for New Views

When creating new views or features, verify:

- [ ] Page has consistent header with title and appropriate actions
- [ ] Container type (modal/panel/inline/full page) matches the use case
- [ ] Button ordering follows left-to-right priority
- [ ] Loading states use `<mj-loading>` component
- [ ] Empty states are informative with clear next actions
- [ ] Error states provide specific, actionable feedback
- [ ] Success feedback is appropriate to action significance
- [ ] Toolbar actions are logically grouped
- [ ] Row/contextual actions are consistently positioned

---

## UI Library Integration

### Recommended Library: PrimeNG

**Why PrimeNG over alternatives:**

| Aspect | PrimeNG | Angular Material |
|--------|---------|------------------|
| License | MIT (free) | MIT (free) |
| Grid capability | Strong (p-table) | Basic (mat-table) |
| Component breadth | 90+ components | ~40 components |
| Theming | CSS variables, design tokens | SCSS mixins, more rigid |
| Dark mode | Built-in | Built-in |
| Unstyled mode | Yes (v17+) | No |
| Kendo feature parity | High | Medium |

### PrimeNG Unstyled Mode

PrimeNG v17+ offers **unstyled mode** where components have zero visual styling—just functionality and accessibility:

```typescript
// app.config.ts
import { providePrimeNG } from 'primeng/config';

export const appConfig: ApplicationConfig = {
  providers: [
    providePrimeNG({
      unstyled: true  // Components are functional but visually blank
    })
  ]
};
```

This means:
- Use PrimeNG for behavior/accessibility/functionality
- Apply 100% MJ styling via your own CSS
- Components look exactly like your design, not "like PrimeNG"

### Component Type Summary

| Component Type | Library Role | MJ Role | Example |
|----------------|--------------|---------|---------|
| Direct use | 100% | Theme only | Buttons, inputs |
| Extended | 60% | Wrap + extend | Entity picker, data grid |
| Composition | 30% | Custom container | Query builder |
| Headless | Behavior only | 100% UI | Collapsible sections |
| Pure custom | 0% | 100% | AI Chat |

---

## Migration Strategy

### Phase 1: Foundation

1. **Install PrimeNG alongside Kendo** (they can coexist)
2. **Create theme integration** mapping PrimeNG variables → MJ tokens
3. **Build component comparison guide** (Kendo → PrimeNG equivalents)
4. **Set up Storybook** for documentation

### Phase 2: Low-Risk Components

- Buttons, text inputs, checkboxes, radio buttons
- Dropdowns and select components
- Basic form elements

These are simpler to migrate and high-frequency.

### Phase 3: Dialogs & Windows

- Replace `kendo-dialog` → `p-dialog`
- Replace `kendo-window` → `p-dialog` with draggable
- This affects many features but is well-contained

### Phase 4: Data Grid

- Replace `kendo-grid` → `p-table`
- This is the most work due to API differences
- Consider creating `mj-data-grid` wrapper for common patterns
- Migrate one grid at a time

### Phase 5: Cleanup

- Remove Kendo packages from package.json
- Remove Kendo theme files
- Remove Kendo-specific CSS overrides

---

## Implementation Checklist

### Path 1: Token Consistency

- [ ] Audit components for hardcoded colors
- [ ] Audit components for hardcoded spacing
- [ ] Audit components for hardcoded typography
- [ ] Review `_tokens.scss` for completeness
- [ ] Add missing dark mode token values
- [ ] Create theme switcher component
- [ ] Add theme preference persistence (user settings)
- [ ] Apply `[data-theme="dark"]` to document root
- [ ] Test all major views in dark mode
- [ ] Fix ViewEncapsulation issues

### Path 2: Design System Redesign

- [ ] Finalize token system (add component-specific tokens if needed)
- [ ] Install PrimeNG
- [ ] Create `_primeng-theme.scss` mapping file
- [ ] Set up Storybook
- [ ] Create component mapping document (Kendo → PrimeNG)
- [ ] Build shared MJ component library:
  - [ ] `mj-card`
  - [ ] `mj-panel`
  - [ ] `mj-section-header`
  - [ ] `mj-data-grid`
  - [ ] `mj-dialog`
  - [ ] `mj-entity-picker`
- [ ] Document component patterns and guidelines
- [ ] Information Architecture patterns:
  - [ ] Document standard page layout template
  - [ ] Document modal vs side panel vs inline decision tree
  - [ ] Document action button placement rules
  - [ ] Document feedback pattern standards
  - [ ] Audit existing views for IA consistency violations
- [ ] Migrate Phase 2 components (forms/inputs)
- [ ] Migrate Phase 3 components (dialogs)
- [ ] Migrate Phase 4 components (grids)
- [ ] Remove Kendo dependencies
- [ ] Final dark mode testing

---

## References

- [PrimeNG Documentation](https://primeng.org/)
- [PrimeNG Theming](https://primeng.org/theming)
- [Angular CDK](https://material.angular.io/cdk/categories)
- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [Design Tokens W3C](https://www.w3.org/community/design-tokens/)
