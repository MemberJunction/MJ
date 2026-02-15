# Future Form Improvements - UX Enhancement Plan

> **Created:** January 2025
> **Status:** Planning
> **Priority:** High
> **Scope:** Generated Forms in MemberJunction Angular Applications

---

## Executive Summary

This document outlines a comprehensive plan to improve the user experience of MemberJunction's auto-generated entity forms. The improvements span responsive design, visual hierarchy, information density, and smart metadata-driven features.

### Key Goals
1. **Mobile-first responsive design** - Forms that work beautifully on all screen sizes
2. **Visual hierarchy** - Important information surfaces immediately
3. **Reduced cognitive load** - Smart grouping and hiding of less-relevant sections
4. **Customizable density** - Power users can see more, casual users see less
5. **Metadata-driven** - Improvements leverage existing entity metadata where possible

---

## Current State Analysis

### What's Working Well
- CSS Grid with `auto-fit` and `minmax()` provides decent responsive column stacking
- Collapsible panels with smooth animations
- Search filtering with highlighting
- Panel width toggle feature (full-width mode)
- Related entity visual distinction (blue border)
- Section state persistence via `FormStateService`

### Key Problems Identified

| Issue | Mobile Impact | Desktop Impact |
|-------|---------------|----------------|
| Fixed 240px label width | Takes ~50% of narrow screens | Wastes space on wide screens |
| No stacked label/value on mobile | Poor readability | N/A |
| Fixed 550px panel minmax | Breaks below 550px viewport | Could be wider |
| No density/compact mode | Too much padding on mobile | Wasted vertical space |
| Generic section ordering | Important fields buried | Same issue |
| No quick summary/header card | Must scroll to see key data | Same issue |
| Related entities overwhelming | 60+ sections in some forms | Same but manageable |
| Full-width mode doesn't optimize content | Single column still | Wasted horizontal space |

---

## Implementation Phases

### Phase 1: CSS-Only Improvements (Low Risk)

**Scope:** Pure CSS/SCSS changes with no metadata or CodeGen modifications.

**Estimated Effort:** 1-2 days

#### 1.1 Mobile-First Field Layout

**Current State:**
- Labels are always 240px fixed width
- On mobile, this creates cramped value areas
- Label and value always side-by-side

**Target State:**
- Mobile (<768px): Labels stacked above values
- Tablet+ (>=768px): Side-by-side with flexible label width

**Files to Modify:**
- `packages/Angular/Explorer/base-forms/src/lib/base-field-component.css`

**Implementation:**

```css
/* Mobile: Stacked layout */
.record-form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 16px;
    padding: 0;
}

.record-form-row label {
    width: 100%;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0;
}

.record-form-row > :nth-child(2) {
    font-size: 15px;
    color: #1f2937;
}

/* Tablet and larger: Side-by-side with flexible width */
@media (min-width: 768px) {
    .record-form-row {
        display: grid;
        grid-template-columns: minmax(120px, 200px) 1fr;
        gap: 16px;
        align-items: start;
        margin-bottom: 12px;
        padding-top: 5px;
        padding-bottom: 5px;
    }

    .record-form-row label {
        font-size: 14px;
        text-transform: none;
        letter-spacing: normal;
        color: inherit;
        align-self: start;
    }

    .record-form-row > :nth-child(2) {
        font-size: 14px;
    }
}
```

#### 1.2 Improved Panel Breakpoints

**Current State:**
- `minmax(550px, 1fr)` at 1200px+ - too aggressive
- Panels can't fit on narrower tablets
- Single column below 1200px

**Target State:**
- Mobile: Single column, tighter padding
- Tablet (768px+): 2 columns with smaller minmax
- Desktop (1200px+): 2-3 columns
- Ultra-wide (1800px+): 3+ columns

**Files to Modify:**
- `packages/Angular/Explorer/form-toolbar/src/lib/record-form-container.component.css`

**Implementation:**

```css
/* Base: Mobile single column */
.form-panels-container {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 12px;
    background-color: #F5F6FA;
}

/* Tablet: 2 columns if space allows */
@media (min-width: 768px) {
    .form-panels-container {
        grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        gap: 20px;
        padding: 16px;
    }
}

/* Desktop: More generous sizing */
@media (min-width: 1200px) {
    .form-panels-container {
        grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
        padding: 20px;
    }
}

/* Ultra-wide: Tighter minmax for more columns */
@media (min-width: 1800px) {
    .form-panels-container {
        grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
    }
}
```

#### 1.3 Condensed Mobile Headers

**Current State:**
- Collapsible headers have generous padding (20px 24px)
- Width control button visible on mobile (not useful)
- Large icon and text sizes

**Target State:**
- Tighter mobile headers
- Hide width control on mobile
- Smaller icons and text on mobile

**Files to Modify:**
- `packages/Angular/Explorer/base-forms/src/lib/collapsible-panel.component.ts` (inline styles)

**Implementation:**

```css
@media (max-width: 767px) {
    .collapsible-header {
        padding: 14px 16px;
        gap: 8px;
    }

    .collapsible-title i {
        font-size: 16px;
    }

    .collapsible-title h3 {
        font-size: 15px;
    }

    .panel-width-controls {
        display: none;
    }

    .form-body {
        padding: 16px;
    }
}
```

#### 1.4 Touch-Friendly Targets

**Current State:**
- Collapse icons and buttons are small (padding: 4px)
- Difficult to tap on touch devices

**Target State:**
- Minimum 44x44px touch targets on touch devices

**Implementation:**

```css
@media (pointer: coarse) {
    .collapse-icon {
        padding: 12px;
        margin: -8px;
    }

    .width-control-btn {
        min-width: 44px;
        min-height: 44px;
        padding: 10px;
    }

    .collapsible-header {
        min-height: 56px;
    }
}
```

#### 1.5 Full-Width Multi-Column Content

**Current State:**
- Full-width panels just span the grid
- Content is still single-column list of fields
- Wasted horizontal space

**Target State:**
- Full-width panels arrange fields in multiple columns
- Better use of horizontal space

**Files to Modify:**
- `packages/Angular/Explorer/base-forms/src/lib/collapsible-panel.component.ts` (inline styles)

**Implementation:**

```css
:host(.panel-full-width) .form-body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px 24px;
}

/* Ensure fields don't break across columns awkwardly */
:host(.panel-full-width) .form-body > * {
    break-inside: avoid;
}
```

#### 1.6 Density Mode Toggle

**Current State:**
- No way to adjust information density
- Fixed padding throughout

**Target State:**
- Toggle between "Comfortable" (default) and "Compact" modes
- Stored in user preferences via `FormStateService`

**Files to Modify:**
- `packages/Angular/Explorer/base-forms/src/lib/form-section-controls.component.ts`
- `packages/Angular/Explorer/base-forms/src/lib/collapsible-panel.component.ts`
- `packages/Angular/Explorer/form-toolbar/src/lib/record-form-container.component.css`

**Implementation:**

Add toggle to FormSectionControlsComponent:
```html
<button class="density-toggle"
        (click)="toggleDensity()"
        [title]="densityMode === 'compact' ? 'Switch to comfortable' : 'Switch to compact'">
    <i [class]="densityMode === 'compact' ? 'fa fa-expand' : 'fa fa-compress'"></i>
</button>
```

CSS classes:
```css
/* Compact density mode */
.form-panels-container.density-compact {
    gap: 12px;
    padding: 12px;
}

.density-compact .collapsible-header {
    padding: 12px 16px;
}

.density-compact .collapsible-title h3 {
    font-size: 15px;
}

.density-compact .form-body {
    padding: 12px 16px;
}

.density-compact .record-form-row {
    margin-bottom: 6px;
    padding: 2px 0;
}

.density-compact .record-form-row label {
    font-size: 12px;
}
```

---

### Phase 2: Runtime Enhancements (Medium Risk)

**Scope:** TypeScript/Angular changes without CodeGen modifications.

**Estimated Effort:** 2-3 days

#### 2.1 Hide Empty Related Sections Toggle

**Current State:**
- All related entity sections show regardless of record count
- Badge shows "0" for empty sections
- User must manually collapse each

**Target State:**
- Toggle to hide sections with 0 records
- Persisted in user preferences

**Files to Modify:**
- `packages/Angular/Explorer/base-forms/src/lib/form-section-controls.component.ts`
- `packages/Angular/Explorer/base-forms/src/lib/collapsible-panel.component.ts`
- `packages/Angular/Explorer/base-forms/src/lib/base-form-component.ts`

**Implementation:**

Add to CollapsiblePanelComponent:
```typescript
@Input() hideWhenEmpty: boolean = false;

@HostBinding('class.empty-section-hidden')
get shouldHideWhenEmpty(): boolean {
    return this.hideWhenEmpty &&
           this.variant === 'related-entity' &&
           this.badgeCount === 0;
}
```

Add toggle to FormSectionControlsComponent:
```html
<label class="toggle-label">
    <input type="checkbox"
           [(ngModel)]="hideEmptyRelatedSections"
           (ngModelChange)="onHideEmptyChange($event)">
    <span>Hide empty sections</span>
</label>
```

CSS:
```css
:host(.empty-section-hidden) {
    display: none !important;
}
```

#### 2.2 Related Entity Quick Filters

**Current State:**
- Must scroll through all related entity sections
- No way to quickly find specific related entity

**Target State:**
- Quick filter/search for related entity sections
- Jump-to navigation for related entities

**Implementation:**

Add quick nav dropdown:
```html
<div class="related-entity-nav" *ngIf="relatedEntitySections.length > 5">
    <kendo-dropdownlist
        [data]="relatedEntitySections"
        textField="name"
        valueField="key"
        [valuePrimitive]="true"
        placeholder="Jump to related entity..."
        (valueChange)="scrollToSection($event)">
    </kendo-dropdownlist>
</div>
```

#### 2.3 Section Pinning

**Current State:**
- Section order is fixed by CodeGen
- Important sections may be far down the list

**Target State:**
- Users can "pin" sections to always appear first
- Pinned state persisted per entity type

**Implementation:**

Add pin button to CollapsiblePanelComponent:
```html
<button class="pin-btn"
        [class.pinned]="isPinned"
        (click)="togglePin($event)"
        title="Pin this section to top">
    <i class="fa fa-thumbtack"></i>
</button>
```

Store in FormStateService:
```typescript
interface FormState {
    // ... existing
    pinnedSections: string[];
}
```

Reorder sections in template based on pinned state.

---

### Phase 3: CodeGen Enhancements (Higher Risk)

**Scope:** Modifications to form generation templates and logic.

**Estimated Effort:** 3-5 days

#### 3.1 Hero Card Generation

**Current State:**
- `GeneratedFormSection = 'Top'` creates a regular collapsible panel
- No visual distinction for key identifying fields
- Important information buried in sections

**Target State:**
- "Top" section renders as a hero card with special styling
- Key fields displayed prominently with entity icon
- Optional avatar/image support

**Metadata Leveraged:**
- `EntityFieldInfo.GeneratedFormSection = 'Top'`
- `EntityFieldInfo.IsNameField`
- `EntityFieldInfo.DefaultInView`
- `EntityFieldInfo.Sequence` (lower = more important)
- `EntityInfo.Icon`
- `EntityInfo.PreferredCommunicationField`

**Files to Modify:**
- `packages/CodeGenLib/src/angular-codegen.ts`
- New component: `packages/Angular/Explorer/base-forms/src/lib/hero-card.component.ts`

**Template Generation:**

```typescript
// In generateSingleEntityHTMLForAngular()
const heroFields = entity.Fields.filter(f =>
    f.IncludeInGeneratedForm &&
    (f.GeneratedFormSectionType === GeneratedFormSectionType.Top ||
     f.IsNameField ||
     (f.DefaultInView && f.Sequence !== null && f.Sequence < 5))
).sort((a, b) => (a.Sequence || 999) - (b.Sequence || 999))
.slice(0, 6);

if (heroFields.length > 0) {
    // Generate hero card instead of collapsible panel
    html += `
    <mj-hero-card slot="before-panels"
        [record]="record"
        [fields]="['${heroFields.map(f => f.CodeName).join("', '")}']"
        icon="${entity.Icon || 'fa fa-file'}"
        [EditMode]="EditMode">
    </mj-hero-card>`;
}
```

**Hero Card Component:**

```typescript
@Component({
    selector: 'mj-hero-card',
    template: `
        <div class="hero-card">
            <div class="hero-icon">
                <i [class]="icon"></i>
            </div>
            <div class="hero-content">
                <h2 class="hero-title">{{ getPrimaryValue() }}</h2>
                <p class="hero-subtitle" *ngIf="getSecondaryValue()">
                    {{ getSecondaryValue() }}
                </p>
                <div class="hero-fields">
                    <div class="hero-field" *ngFor="let field of displayFields">
                        <span class="hero-field-label">{{ field.label }}</span>
                        <span class="hero-field-value">{{ field.value }}</span>
                    </div>
                </div>
            </div>
            <div class="hero-actions" *ngIf="EditMode">
                <!-- Quick action buttons -->
            </div>
        </div>
    `
})
export class HeroCardComponent {
    @Input() record: BaseEntity;
    @Input() fields: string[];
    @Input() icon: string;
    @Input() EditMode: boolean;
}
```

#### 3.2 Smart Field Categorization

**Current State:**
- `EntityFieldInfo.Category` exists but often empty
- Fields default to "Details" section
- Manual categorization required

**Target State:**
- Auto-categorize fields based on name patterns
- AI-assisted categorization (extend AdvancedGeneration)
- Consistent categories across entities

**Heuristic Categorization:**

```typescript
// In CodeGenLib
function inferFieldCategory(field: EntityFieldInfo): string {
    const name = field.Name.toLowerCase();
    const displayName = (field.DisplayName || '').toLowerCase();
    const combined = `${name} ${displayName}`;

    // Contact Information
    if (/email|phone|mobile|fax|address|city|state|zip|postal|country/.test(combined)) {
        return 'Contact Information';
    }

    // Personal Details
    if (/first.?name|last.?name|middle|prefix|suffix|title|salutation|nickname/.test(combined)) {
        return 'Personal Details';
    }

    // Professional Profile
    if (/company|organization|employer|job|position|department|industry|profession/.test(combined)) {
        return 'Professional Profile';
    }

    // Location
    if (/location|region|territory|branch|office|site/.test(combined)) {
        return 'Location';
    }

    // Financial
    if (/price|cost|amount|total|subtotal|tax|discount|balance|payment|invoice|revenue/.test(combined)) {
        return 'Financial';
    }

    // Dates & Times
    if (/date|time|created|updated|modified|expires|deadline|scheduled|start|end/.test(combined)) {
        return 'Dates & Times';
    }

    // Status & State
    if (/status|state|active|enabled|disabled|approved|pending|complete/.test(combined)) {
        return 'Status';
    }

    // System fields
    if (/^__mj_|^id$|guid|uuid/.test(name)) {
        return 'System Metadata';
    }

    // Description/Notes
    if (/description|notes|comment|remark|detail|summary|bio/.test(combined)) {
        return 'Description';
    }

    return 'Details';
}
```

#### 3.3 Related Entity Grouping

**Current State:**
- All related entities shown as flat list
- Can be 70+ sections for complex entities
- No logical grouping

**Target State:**
- Related entities grouped by category
- Collapsible group headers
- Configurable via EntitySetting

**EntitySetting Schema:**

```json
{
    "Name": "RelatedEntityGroups",
    "Value": {
        "Content & Reports": ["Reports", "Dashboards", "Templates", "Lists", "User Views"],
        "AI & Automation": ["AI Agents", "AI Agent Runs", "Scheduled Jobs", "Actions"],
        "Security & Access": ["User Roles", "Permissions", "Access Control Rules"],
        "Activity & Audit": ["Audit Logs", "Record Changes", "User Record Logs"],
        "Communication": ["Conversations", "Notifications", "Communication Runs"]
    }
}
```

**CodeGen Implementation:**

```typescript
// In generateRelatedEntityTabs()
const groupSetting = entity.Settings.find(s => s.Name === 'RelatedEntityGroups');
let groups: Record<string, string[]> = {};

if (groupSetting?.Value) {
    groups = JSON.parse(groupSetting.Value);
} else {
    // Default grouping heuristics
    groups = inferRelatedEntityGroups(relatedEntities);
}

// Generate grouped accordion structure
for (const [groupName, entityNames] of Object.entries(groups)) {
    const groupEntities = relatedEntities.filter(re =>
        entityNames.some(name => re.RelatedEntity.includes(name))
    );

    if (groupEntities.length > 0) {
        html += generateRelatedEntityGroup(groupName, groupEntities);
    }
}
```

#### 3.4 Field Importance Indicators

**Current State:**
- All fields look the same visually
- No indication of required vs optional
- No visual hierarchy

**Target State:**
- Visual indicators for required fields
- Subtle emphasis for high-priority fields
- De-emphasis for system/computed fields

**Importance Calculation:**

```typescript
function calculateFieldImportance(field: EntityFieldInfo): 'high' | 'medium' | 'low' {
    let score = 0;

    if (field.IsNameField) score += 10;
    if (field.IsPrimaryKey) score += 8;
    if (!field.AllowsNull && !field.HasDefaultValue) score += 5; // Required
    if (field.DefaultInView) score += 5;
    if (field.Sequence !== null && field.Sequence < 10) score += 4;
    if (field.IncludeInUserSearchAPI) score += 2;

    // Negative indicators
    if (field.IsSpecialDateField) score -= 5;
    if (field.IsVirtual) score -= 2;
    if (field.Name.startsWith('__mj_')) score -= 10;

    if (score >= 10) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
}
```

**Generated HTML:**

```html
<mj-form-field
    [record]="record"
    FieldName="Name"
    [importance]="'high'"
    [required]="true"
    ...
></mj-form-field>
```

**CSS:**

```css
/* High importance fields */
.record-form-row.importance-high label {
    color: #1f2937;
    font-weight: 600;
}

.record-form-row.importance-high label::after {
    content: '';
    display: inline-block;
    width: 4px;
    height: 4px;
    background: #667eea;
    border-radius: 50%;
    margin-left: 6px;
    vertical-align: middle;
}

/* Required field indicator */
.record-form-row.required label::before {
    content: '*';
    color: #ef4444;
    margin-right: 4px;
}

/* Low importance (system) fields */
.record-form-row.importance-low {
    opacity: 0.7;
}

.record-form-row.importance-low label {
    font-size: 12px;
    color: #9ca3af;
}
```

---

### Phase 4: Advanced Features (Future)

**Scope:** Larger architectural enhancements.

**Estimated Effort:** 1-2 weeks

#### 4.1 Skeleton Loading States

**Problem:** Sections show nothing while loading data.

**Solution:** Add skeleton placeholders during load.

```html
<div class="skeleton-form" *ngIf="loading">
    <div class="skeleton-field" *ngFor="let i of [1,2,3,4,5]">
        <div class="skeleton-label"></div>
        <div class="skeleton-value"></div>
    </div>
</div>
```

#### 4.2 Quick Navigation Sidebar

**Problem:** Forms with many sections require scrolling to navigate.

**Solution:** Mini-nav sidebar for section jumping.

```html
<div class="section-nav" *ngIf="sections.length > 6">
    <div class="nav-item"
         *ngFor="let section of sections"
         [class.active]="isInViewport(section)"
         (click)="scrollToSection(section)">
        <i [class]="section.icon"></i>
        <span>{{ section.name }}</span>
        <span class="badge" *ngIf="section.badgeCount">{{ section.badgeCount }}</span>
    </div>
</div>
```

#### 4.3 Inline Editing Mode

**Problem:** Must toggle entire form to edit mode.

**Solution:** Allow inline editing of individual fields.

#### 4.4 Smart Defaults from Related Records

**Problem:** Creating new records requires manual field population.

**Solution:** Pre-populate fields based on context (parent record, user defaults).

#### 4.5 Conditional Field Visibility

**Problem:** All fields show regardless of context.

**Solution:** Show/hide fields based on other field values (e.g., show "Other" text field when dropdown = "Other").

---

## Metadata Schema Extensions (Optional)

These are optional schema additions that could enhance the system but are not required for most improvements.

### EntityField Extensions

```sql
-- Field importance/priority (alternative to calculating from existing fields)
ALTER TABLE __mj.EntityField ADD Importance NVARCHAR(10) NULL; -- 'high', 'medium', 'low'

-- Hero card inclusion
ALTER TABLE __mj.EntityField ADD IncludeInHeroCard BIT NOT NULL DEFAULT 0;

-- Mobile-specific display name (shorter)
ALTER TABLE __mj.EntityField ADD MobileDisplayName NVARCHAR(50) NULL;
```

### EntitySetting Keys

| Setting Name | Purpose | Example Value |
|--------------|---------|---------------|
| `FieldCategoryIcons` | Icons per category | `{"Contact": "fa-address-card", ...}` |
| `FieldCategoryOrder` | Category display order | `["Identity", "Contact", "Details"]` |
| `RelatedEntityGroups` | Group related entities | `{"Content": ["Reports", "Lists"]}` |
| `HeroCardFields` | Override hero card fields | `["Name", "Email", "Status"]` |
| `FormDensityDefault` | Default density mode | `"comfortable"` or `"compact"` |
| `FullWidthColumnCount` | Columns in full-width mode | `3` |

---

## File Reference

### Phase 1 Files (CSS Only)
- `packages/Angular/Explorer/base-forms/src/lib/base-field-component.css`
- `packages/Angular/Explorer/form-toolbar/src/lib/record-form-container.component.css`
- `packages/Angular/Explorer/base-forms/src/lib/collapsible-panel.component.ts` (inline styles)

### Phase 2 Files (Runtime)
- `packages/Angular/Explorer/base-forms/src/lib/form-section-controls.component.ts`
- `packages/Angular/Explorer/base-forms/src/lib/collapsible-panel.component.ts`
- `packages/Angular/Explorer/base-forms/src/lib/base-form-component.ts`
- `packages/Angular/Explorer/base-forms/src/lib/form-state.service.ts`

### Phase 3 Files (CodeGen)
- `packages/CodeGenLib/src/angular-codegen.ts`
- `packages/CodeGenLib/src/Misc/util.ts`
- New: `packages/Angular/Explorer/base-forms/src/lib/hero-card.component.ts`

### Core Metadata Files (Reference)
- `packages/MJCore/src/generic/entityInfo.ts` - EntityInfo, EntityFieldInfo classes
- `packages/MJCoreEntities/src/generated/entity_subclasses.ts` - Generated entity classes

---

## Testing Strategy

### Phase 1 Testing
1. Test on multiple viewport sizes (320px, 768px, 1024px, 1440px, 1920px)
2. Test touch interactions on mobile devices
3. Verify no visual regressions on existing forms
4. Test with entities having many fields (Users, Entities)
5. Test with entities having few fields

### Phase 2 Testing
1. Test hide empty sections with various entity types
2. Verify persistence of preferences
3. Test quick nav with 50+ related entities
4. Test pinning/unpinning sections

### Phase 3 Testing
1. Run CodeGen and verify generated forms
2. Test hero card with various entity configurations
3. Verify category inference accuracy
4. Test related entity grouping with complex entities

---

## Rollout Plan

1. **Phase 1** - Immediate (low risk CSS changes)
2. **Phase 2** - After Phase 1 stabilizes (1-2 weeks)
3. **Phase 3** - Next major release cycle
4. **Phase 4** - Future roadmap items

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Mobile usability score | ~60% | 90%+ |
| Time to find key information | High | Low |
| Related section scroll distance | 70+ sections | Max 10 visible |
| Touch target size | < 44px | >= 44px |
| Forms working < 768px | Partial | Full |

---

## Open Questions

1. Should density preference be global or per-entity?
2. Should hero card be opt-in via metadata or automatic for all entities?
3. How to handle custom forms that override generated forms?
4. Should category inference run on every CodeGen or only when Category is null?
5. Migration strategy for existing category assignments?

---

## References

- [EntityInfo Class](packages/MJCore/src/generic/entityInfo.ts)
- [Angular CodeGen](packages/CodeGenLib/src/angular-codegen.ts)
- [Base Form Component](packages/Angular/Explorer/base-forms/src/lib/base-form-component.ts)
- [Collapsible Panel](packages/Angular/Explorer/base-forms/src/lib/collapsible-panel.component.ts)
- [Form Container CSS](packages/Angular/Explorer/form-toolbar/src/lib/record-form-container.component.css)
