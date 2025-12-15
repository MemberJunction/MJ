# Product Requirements Document: MJ Timeline Component

**Version:** 2.0
**Date:** December 2, 2025
**Author:** MemberJunction Team
**Status:** Approved for Implementation

---

## Executive Summary

This document outlines the complete redesign of the `@memberjunction/ng-timeline` Angular component. The new implementation removes the Kendo UI dependency in favor of a custom HTML/CSS solution that provides superior flexibility, responsiveness, and extensibility while maintaining compatibility with both MemberJunction applications and standalone Angular projects.

---

## Table of Contents

1. [Goals & Objectives](#goals--objectives)
2. [Technical Requirements](#technical-requirements)
3. [Type System Design](#type-system-design)
4. [Event System Architecture](#event-system-architecture)
5. [Component API](#component-api)
6. [Visual Design Specifications](#visual-design-specifications)
7. [Responsive Behavior](#responsive-behavior)
8. [Accessibility Requirements](#accessibility-requirements)
9. [Implementation Tasks](#implementation-tasks)

---

## Goals & Objectives

### Primary Goals

1. **Remove Kendo Dependency**: Eliminate reliance on Kendo UI Timeline component due to stability issues
2. **Universal Compatibility**: Support both MemberJunction BaseEntity objects and plain JavaScript objects
3. **Mobile-First Design**: Fully responsive layout that works seamlessly on all device sizes
4. **Rich Event System**: Implement BeforeX/AfterX event pattern for maximum container control
5. **Virtual Scrolling**: Built-in support for large datasets with dynamic loading
6. **Time Segment Collapsing**: Allow users to collapse/expand time periods for focus

### Secondary Goals

1. **No External Dependencies**: Pure HTML/CSS/Angular implementation
2. **Excellent Documentation**: Comprehensive JSDoc and README with visual examples
3. **Theme Support**: CSS variables for easy theming including dark mode
4. **Accessibility**: WCAG 2.2 AA compliance with full keyboard navigation

---

## Technical Requirements

### Framework Compatibility

| Requirement | Specification |
|-------------|---------------|
| Angular Version | 18+ |
| TypeScript | 5.0+ |
| Browser Support | Chrome, Firefox, Safari, Edge (last 2 versions) |
| Mobile Support | iOS Safari, Android Chrome |

### Dependencies

**Required:**
- `@angular/core` (^18.0.0)
- `@angular/common` (^18.0.0)

**Optional (for MJ features):**
- `@memberjunction/core` - Only needed for BaseEntity support and RunView queries

### Package Configuration

```json
{
  "peerDependencies": {
    "@angular/core": "^18.0.0",
    "@angular/common": "^18.0.0"
  },
  "optionalDependencies": {
    "@memberjunction/core": "^2.0.0"
  }
}
```

---

## Type System Design

### Design Principles

1. **Generic with `any` default**: `TimelineGroup<T = any>` allows any object type
2. **Auto-detection**: Automatically detect BaseEntity vs plain objects for field access
3. **No required interfaces**: Plain objects work without implementing anything
4. **Type safety optional**: MJ users get full typing, others get flexibility

### Field Access Strategy

```typescript
/**
 * Internal helper to get field value from any record type.
 * Auto-detects BaseEntity (uses .Get()) vs plain objects (uses bracket notation).
 */
function getFieldValue(record: any, fieldName: string): unknown {
  if (record && typeof record.Get === 'function') {
    return record.Get(fieldName);  // BaseEntity
  }
  return record[fieldName];  // Plain object
}
```

### Core Types

#### TimelineGroup

```typescript
export class TimelineGroup<T = any> {
  // Data Source
  EntityName?: string;
  DataSourceType: 'array' | 'entity' = 'entity';
  Filter?: string;
  EntityObjects: T[] = [];
  OrderBy?: string;

  // Field Mappings
  TitleFieldName!: string;
  DateFieldName!: string;
  SubtitleFieldName?: string;
  DescriptionFieldName?: string;
  ImageFieldName?: string;
  IdFieldName?: string;  // Defaults to 'ID' or 'id'

  // Display
  DisplayIconMode: 'standard' | 'custom' = 'standard';
  DisplayIcon?: string;
  DisplayColorMode: 'auto' | 'manual' = 'auto';
  DisplayColor?: string;
  GroupLabel?: string;

  // Card Configuration
  CardConfig?: TimelineCardConfig;

  // Custom Functions
  SummaryFunction?: (record: T) => string;
  EventConfigFunction?: (record: T) => TimelineEventConfig;
}
```

#### TimelineCardConfig

```typescript
export interface TimelineCardConfig {
  // Header
  showIcon?: boolean;
  showDate?: boolean;
  showSubtitle?: boolean;
  dateFormat?: string;

  // Image
  imageField?: string;
  imagePosition?: 'left' | 'top' | 'none';
  imageSize?: 'small' | 'medium' | 'large';

  // Body
  descriptionField?: string;
  descriptionMaxLines?: number;
  allowHtmlDescription?: boolean;

  // Expansion
  collapsible?: boolean;
  defaultExpanded?: boolean;
  expandedFields?: TimelineDisplayField[];
  summaryFields?: TimelineDisplayField[];

  // Actions
  actions?: TimelineAction[];
  actionsOnHover?: boolean;

  // Styling
  cssClass?: string;
  minWidth?: string;
  maxWidth?: string;
}
```

#### TimelineDisplayField

```typescript
export interface TimelineDisplayField {
  fieldName: string;
  label?: string;
  icon?: string;
  format?: string;
  formatter?: (value: unknown) => string;
  hideLabel?: boolean;
  cssClass?: string;
}
```

#### TimelineAction

```typescript
export interface TimelineAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
  tooltip?: string;
  disabled?: boolean;
  cssClass?: string;
}
```

---

## Event System Architecture

### BeforeX/AfterX Pattern

All user interactions emit paired events:
- **BeforeX**: Emitted before action, includes `cancel: boolean` (default `false`)
- **AfterX**: Emitted after action completes, includes `success: boolean`

Setting `cancel = true` in a BeforeX handler prevents the default behavior.

### Event Interfaces

```typescript
// Base interfaces
export interface BeforeEventArgs {
  cancel: boolean;
}

export interface AfterEventArgs {
  success: boolean;
}

// Event-specific args extend these bases
export interface TimelineEventArgs<T = any> {
  event: MJTimelineEvent<T>;
  group: TimelineGroup<T>;
  index: number;
  domEvent?: Event;
}

export interface BeforeEventClickArgs<T = any>
  extends BeforeEventArgs, TimelineEventArgs<T> {}

export interface AfterEventClickArgs<T = any>
  extends AfterEventArgs, TimelineEventArgs<T> {}

// ... similar for Expand, Collapse, Hover, ActionClick, etc.
```

### Event List

| Before Event | After Event | Trigger |
|--------------|-------------|---------|
| `beforeEventClick` | `afterEventClick` | User clicks an event card |
| `beforeEventExpand` | `afterEventExpand` | Event card expands |
| `beforeEventCollapse` | `afterEventCollapse` | Event card collapses |
| `beforeEventHover` | `afterEventHover` | Mouse enter/leave on card |
| `beforeActionClick` | `afterActionClick` | Action button clicked |
| `beforeSegmentExpand` | `afterSegmentExpand` | Time segment expands |
| `beforeSegmentCollapse` | `afterSegmentCollapse` | Time segment collapses |
| `beforeLoad` | `afterLoad` | Data loading starts/completes |

---

## Component API

### Inputs

```typescript
// Data
@Input() groups: TimelineGroup<T>[] = [];
@Input() allowLoad: boolean = true;

// Layout
@Input() orientation: 'vertical' | 'horizontal' = 'vertical';
@Input() layout: 'single' | 'alternating' = 'single';
@Input() sortOrder: 'asc' | 'desc' = 'desc';
@Input() segmentGrouping: 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month';

// Card Defaults
@Input() defaultCardConfig: TimelineCardConfig;

// Virtual Scrolling
@Input() virtualScroll: VirtualScrollConfig;

// Segments
@Input() segmentsCollapsible: boolean = true;
@Input() segmentsDefaultExpanded: boolean = true;

// Empty/Loading States
@Input() emptyMessage: string = 'No events to display';
@Input() emptyIcon: string = 'fa-regular fa-calendar-xmark';
@Input() loadingMessage: string = 'Loading timeline...';

// Accessibility
@Input() ariaLabel: string = 'Timeline';
@Input() enableKeyboardNavigation: boolean = true;
```

### Outputs

```typescript
// Before events (with cancel support)
@Output() beforeEventClick: EventEmitter<BeforeEventClickArgs<T>>;
@Output() beforeEventExpand: EventEmitter<BeforeEventExpandArgs<T>>;
@Output() beforeEventCollapse: EventEmitter<BeforeEventCollapseArgs<T>>;
@Output() beforeEventHover: EventEmitter<BeforeEventHoverArgs<T>>;
@Output() beforeActionClick: EventEmitter<BeforeActionClickArgs<T>>;
@Output() beforeSegmentExpand: EventEmitter<BeforeSegmentExpandArgs>;
@Output() beforeSegmentCollapse: EventEmitter<BeforeSegmentCollapseArgs>;
@Output() beforeLoad: EventEmitter<BeforeLoadArgs>;

// After events
@Output() afterEventClick: EventEmitter<AfterEventClickArgs<T>>;
@Output() afterEventExpand: EventEmitter<AfterEventExpandArgs<T>>;
@Output() afterEventCollapse: EventEmitter<AfterEventCollapseArgs<T>>;
@Output() afterEventHover: EventEmitter<AfterEventHoverArgs<T>>;
@Output() afterActionClick: EventEmitter<AfterActionClickArgs<T>>;
@Output() afterSegmentExpand: EventEmitter<AfterSegmentExpandArgs>;
@Output() afterSegmentCollapse: EventEmitter<AfterSegmentCollapseArgs>;
@Output() afterLoad: EventEmitter<AfterLoadArgs>;
```

### Content Children (Optional Templates)

```typescript
@ContentChild('cardTemplate') cardTemplate?: TemplateRef<{event, group}>;
@ContentChild('headerTemplate') headerTemplate?: TemplateRef<{event}>;
@ContentChild('bodyTemplate') bodyTemplate?: TemplateRef<{event}>;
@ContentChild('actionsTemplate') actionsTemplate?: TemplateRef<{event, actions}>;
@ContentChild('segmentHeaderTemplate') segmentHeaderTemplate?: TemplateRef<{segment}>;
@ContentChild('emptyTemplate') emptyTemplate?: TemplateRef<void>;
@ContentChild('loadingTemplate') loadingTemplate?: TemplateRef<void>;
```

### Public Methods

```typescript
async refresh(): Promise<void>;
async loadMore(): Promise<void>;
expandAllEvents(): void;
collapseAllEvents(): void;
expandAllSegments(): void;
collapseAllSegments(): void;
expandEvent(eventId: string): void;
collapseEvent(eventId: string): void;
scrollToEvent(eventId: string, behavior?: ScrollBehavior): void;
scrollToDate(date: Date, behavior?: ScrollBehavior): void;
getEvent(eventId: string): MJTimelineEvent<T> | undefined;
getAllEvents(): MJTimelineEvent<T>[];
```

---

## Visual Design Specifications

### Card Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────┐                                                     │
│ │  IMAGE  │  [ICON]  TITLE                           [▼] [✕]    │ ← Header
│ │ (opt.)  │          Subtitle                                   │
│ └─────────┘          Dec 2, 2025 at 3:45 PM                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Description text goes here. This is the main content           │ ← Body
│  that displays when the card is expanded...                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [icon] Field1: Value    [icon] Field2: Value                   │ ← Detail Fields
│  [icon] Field3: Value    [icon] Field4: Value                   │   (expanded only)
├─────────────────────────────────────────────────────────────────┤
│                                   [Action1] [Action2] [Action3] │ ← Actions
└─────────────────────────────────────────────────────────────────┘
```

### Timeline Axis (Vertical)

```
●─── Date Label
│
│  ┌──────────────────────┐
│  │      Event Card      │
│  └──────────────────────┘
│
●─── Date Label
│
│  ┌──────────────────────┐
│  │      Event Card      │
│  └──────────────────────┘
│
```

### Timeline Axis (Alternating)

```
     ┌──────────────────┐
     │    Event Card    │────●─── Date
     └──────────────────┘    │
                             │
              Date ───●──────┤
                      │      │
                      └──────┼────┌──────────────────┐
                             │    │    Event Card    │
                             │    └──────────────────┘
```

### Time Segment Headers

```
▼ December 2025 (3 events) ────────────────────────────────
│
│  [events...]
│
► November 2025 (12 events) ─────────────────────────────── ← Collapsed
```

---

## Responsive Behavior

### Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Desktop | >1024px | Full layout, alternating supported, max card width |
| Tablet | 768-1024px | Single-side layout, reduced card width |
| Mobile | <768px | Stacked layout, full-width cards, simplified header |

### Mobile Adaptations

1. **Layout**: Always single-side (no alternating)
2. **Cards**: 100% width with padding
3. **Segment Headers**: Compact format (icon + count only when collapsed)
4. **Actions**: Touch-friendly sizing (min 44px touch targets)
5. **Horizontal Mode**: Swipe navigation enabled

---

## Accessibility Requirements

### WCAG 2.2 AA Compliance

1. **Keyboard Navigation**
   - Arrow keys to move between events
   - Enter/Space to expand/collapse
   - Escape to collapse
   - Tab to move between interactive elements

2. **Screen Reader Support**
   - ARIA labels on all interactive elements
   - Live regions for dynamic content
   - Proper heading hierarchy

3. **Focus Management**
   - Visible focus indicators
   - Focus trap in expanded cards
   - Return focus after collapse

4. **Color & Contrast**
   - 4.5:1 contrast ratio minimum
   - Not relying on color alone for information

---

## Implementation Tasks

### Phase 1: Foundation

- [ ] Create type definitions file (`types.ts`)
- [ ] Create event interfaces file (`events.ts`)
- [ ] Implement `TimelineGroup` class
- [ ] Implement field value accessor helper
- [ ] Set up module structure

### Phase 2: Core Component

- [ ] Create `TimelineComponent` skeleton
- [ ] Implement inputs and outputs
- [ ] Implement data loading logic (array mode)
- [ ] Implement data loading logic (entity mode - MJ)
- [ ] Implement event-to-segment grouping

### Phase 3: Rendering

- [ ] Create timeline axis template (vertical)
- [ ] Create card component/template
- [ ] Implement card header section
- [ ] Implement card body section
- [ ] Implement card detail fields section
- [ ] Implement card actions section
- [ ] Create segment header template
- [ ] Implement alternating layout

### Phase 4: Interactivity

- [ ] Implement expand/collapse for events
- [ ] Implement expand/collapse for segments
- [ ] Implement BeforeX/AfterX event emission
- [ ] Implement action button handling
- [ ] Implement hover events

### Phase 5: Virtual Scrolling

- [ ] Implement scroll container
- [ ] Implement intersection observer for load trigger
- [ ] Implement batch loading logic
- [ ] Implement loading indicator
- [ ] Implement scroll-to methods

### Phase 6: Styling

- [ ] Create CSS variables for theming
- [ ] Implement desktop styles
- [ ] Implement tablet responsive styles
- [ ] Implement mobile responsive styles
- [ ] Implement dark mode support
- [ ] Implement animations (expand/collapse)

### Phase 7: Accessibility

- [ ] Add ARIA attributes
- [ ] Implement keyboard navigation
- [ ] Add focus management
- [ ] Test with screen reader

### Phase 8: Templates & Customization

- [ ] Implement `cardTemplate` support
- [ ] Implement `headerTemplate` support
- [ ] Implement `bodyTemplate` support
- [ ] Implement `actionsTemplate` support
- [ ] Implement `segmentHeaderTemplate` support
- [ ] Implement `emptyTemplate` support
- [ ] Implement `loadingTemplate` support

### Phase 9: Documentation

- [ ] Write comprehensive JSDoc for all public APIs
- [ ] Create README.md with examples
- [ ] Add mermaid diagrams for architecture
- [ ] Add visual mockups to README
- [ ] Document CSS variables
- [ ] Create usage examples

### Phase 10: Finalization

- [ ] Update package.json dependencies
- [ ] Update public-api.ts exports
- [ ] Remove Kendo dependencies
- [ ] Build and verify compilation
- [ ] Update CHANGELOG.md

---

## Appendix: CSS Variables

```scss
:host {
  // Colors
  --mj-timeline-line-color: #e0e0e0;
  --mj-timeline-marker-color: #1976d2;
  --mj-timeline-marker-size: 12px;
  --mj-timeline-card-bg: #ffffff;
  --mj-timeline-card-border: #e0e0e0;
  --mj-timeline-card-shadow: 0 2px 8px rgba(0,0,0,0.1);
  --mj-timeline-card-radius: 8px;
  --mj-timeline-text-primary: #212121;
  --mj-timeline-text-secondary: #757575;
  --mj-timeline-date-color: #1976d2;

  // Sizing
  --mj-timeline-line-width: 2px;
  --mj-timeline-card-padding: 16px;
  --mj-timeline-card-max-width: 400px;
  --mj-timeline-card-gap: 16px;
  --mj-timeline-segment-gap: 24px;

  // Animation
  --mj-timeline-transition-duration: 0.3s;
  --mj-timeline-transition-easing: ease;
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-01-15 | MJ Team | Initial Kendo-based implementation |
| 2.0 | 2025-12-02 | MJ Team | Complete redesign, Kendo removal |
