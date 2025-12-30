# Entity Explorer UX Implementation Plan

## Overview

Transform the entity form from an edit-focused data entry screen into an exploration-focused entity intelligence hub. The entity becomes the center of a relationship universe with rich metadata visualization.

## Architecture

### Three-Zone Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER BAR: Entity Identity + Quick Actions + Breadcrumb Trail             │
├────────────────┬────────────────────────────────────────────────────────────┤
│   NAVIGATION   │                    MAIN CANVAS                             │
│     RAIL       │   [Primary Content Zone - varies by section]               │
│                │                                                            │
│  ○ Overview    │   ┌─────────────────────────────────────────────────────┐  │
│  ○ Fields      │   │  Section-specific content                           │  │
│  ○ Relations   │   │  - Overview: ERD + Stats                            │  │
│  ○ Permissions │   │  - Fields: Semantic grouping                        │  │
│  ○ Lineage     │   │  - Relations: Graph/List views                      │  │
│  ○ History     │   │  - Permissions: Access matrix                       │  │
│  ○ Settings    │   │  - etc.                                             │  │
│                │   └─────────────────────────────────────────────────────┘  │
│                │                                                            │
│                │   ┌─────────────────────────────────────────────────────┐  │
│                │   │  [Detail Panel - Slides in from right]              │  │
│                │   └─────────────────────────────────────────────────────┘  │
└────────────────┴────────────────────────────────────────────────────────────┘
```

## Component Structure

```
EntityAdmin/
├── entity-explorer/
│   ├── entity-explorer.component.ts|html|css     # Main container
│   ├── components/
│   │   ├── header/
│   │   │   └── entity-header.component.ts|html|css
│   │   ├── nav-rail/
│   │   │   └── nav-rail.component.ts|html|css
│   │   ├── sections/
│   │   │   ├── overview-section.component.ts|html|css
│   │   │   ├── fields-section.component.ts|html|css
│   │   │   ├── relationships-section.component.ts|html|css
│   │   │   ├── permissions-section.component.ts|html|css
│   │   │   ├── lineage-section.component.ts|html|css
│   │   │   ├── history-section.component.ts|html|css
│   │   │   └── settings-section.component.ts|html|css
│   │   └── panels/
│   │       ├── field-detail-panel.component.ts|html|css
│   │       └── relationship-detail-panel.component.ts|html|css
│   └── services/
│       └── entity-explorer.service.ts
```

## Implementation Phases

### Phase 1: Core Shell (entity-explorer.component)
- [x] Plan document created
- [ ] Three-zone layout with CSS Grid
- [ ] Entity loading from route/input
- [ ] Section state management
- [ ] Responsive breakpoints

### Phase 2: Header Bar (entity-header.component)
- [ ] Entity identity card (icon, name, status badge)
- [ ] Quick stats (fields, relationships, permissions, rows)
- [ ] Breadcrumb trail for drilling
- [ ] Quick actions dropdown

### Phase 3: Navigation Rail (nav-rail.component)
- [ ] Vertical icon navigation
- [ ] Section labels on hover
- [ ] Active section indicator
- [ ] Keyboard navigation (↑/↓)

### Phase 4: Overview Section
- [ ] ERD with focus mode (entity at center, depth=1)
- [ ] Statistics cards (fields, relations, security, data)
- [ ] Capabilities quick view
- [ ] Database info panel

### Phase 5: Fields Section
- [ ] Semantic field grouping logic
  - Primary Keys
  - Identity Fields (Name, Code, Description)
  - Foreign Keys (with related entity links)
  - Encrypted Fields
  - Value List Fields
  - Audit Fields (__mj_*)
  - Data Fields (by Category)
- [ ] Search/filter bar
- [ ] Group by dropdown (Type, Category, etc.)
- [ ] Click-to-expand field details

### Phase 6: Relationships Section
- [ ] Toggle between Graph/List views
- [ ] ERD with focusDepth=2
- [ ] Outgoing/Incoming relationship tables
- [ ] Relationship detail panel

### Phase 7: Permissions Section
- [ ] Permission matrix grid (roles × CRUD)
- [ ] RLS filter visualization
- [ ] API capabilities display
- [ ] Click for RLS details

### Phase 8: Lineage Section
- [ ] Data flow diagram (sources → entity → sinks)
- [ ] Entity Documents configuration
- [ ] Action bindings
- [ ] Communication types

### Phase 9: History Section
- [ ] Change tracking configuration display
- [ ] Schema change timeline
- [ ] Record change summary (if applicable)

### Phase 10: Settings Section
- [ ] Entity settings grid
- [ ] Stored procedures display
- [ ] Full-text search configuration
- [ ] Code generation info

### Phase 11: Detail Panels
- [ ] Field detail slide-in panel
- [ ] Relationship detail slide-in panel
- [ ] Contextual actions

### Phase 12: Integration
- [ ] Remove old entity-details.component
- [ ] Update module declarations
- [ ] Wire to dashboard
- [ ] State persistence

## Data Sources

All data comes from `EntityInfo` and related classes:
- `EntityInfo.Fields` → EntityFieldInfo[]
- `EntityInfo.RelatedEntities` → EntityRelationshipInfo[]
- `EntityInfo.Permissions` → EntityPermissionInfo[]
- `EntityInfo.Settings` → EntitySettingInfo[]
- Static properties and methods on EntityInfo

## Key UX Principles

1. **Progressive Disclosure**: Show summary first, details on demand
2. **Visual Hierarchy**: Clear grouping and typography
3. **Contextual Actions**: Right-click menus, hover actions
4. **Keyboard Navigation**: Full keyboard support
5. **State Persistence**: Remember expanded sections, scroll positions
6. **Responsive Design**: Adapt to different screen sizes
7. **Performance**: Lazy-load sections, virtual scrolling for large lists

## CSS Design Tokens

```css
:root {
  /* Layout */
  --nav-rail-width: 56px;
  --nav-rail-width-expanded: 200px;
  --header-height: 80px;
  --detail-panel-width: 400px;

  /* Colors - use existing MJ palette */
  --section-bg: #f8fafc;
  --card-bg: #ffffff;
  --border-color: #e2e8f0;
  --accent-color: #3b82f6;

  /* Typography */
  --heading-font: 600;
  --body-font: 400;
}
```

## Success Metrics

- All entity metadata visible and explorable
- Relationships clear at a glance via ERD
- Field grouping reduces cognitive load
- Permission matrix provides security overview
- Navigation takes <2 clicks to any section
- Fully keyboard accessible
