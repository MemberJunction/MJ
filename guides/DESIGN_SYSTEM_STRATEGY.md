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
7. [UI Library Integration](#ui-library-integration)
8. [Migration Strategy](#migration-strategy)
9. [Implementation Checklist](#implementation-checklist)

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
- Storybook documentation
- Systematic migration of custom components

**Deliverables**:
- Complete design system documentation
- PrimeNG integrated and themed
- Shared component library (`mj-card`, `mj-panel`, `mj-button`, etc.)
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
