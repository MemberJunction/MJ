# Collapsible Panel Forms - Implementation Proposal

## Executive Summary

Transform MemberJunction's auto-generated Angular forms from tab-based layouts to modern collapsible panel layouts inspired by the EventAbstractSubmission demo forms. This will improve form usability, reduce cognitive load, and leverage the entity field categories we're now intelligently generating with AI.

## Current State Analysis

### Existing Tab-Based Approach
The current Angular form generator creates:
- **Tab navigation** with `<mj-tab>` components
- **Section components** for each category (e.g., `PersonalInformationComponent`, `DetailsComponent`)
- **Separate component files** for each section in `sections/` subdirectories
- **Generic styling** with limited visual hierarchy

### Demo Forms Pattern (EventAbstractSubmission)
The demo forms use:
- **Collapsible panels** with smooth expand/collapse animations
- **Visual hierarchy** through card-based design with gradient headers
- **State management** via `sectionsExpanded` object
- **Inline templates** (no separate section components)
- **Rich styling** with distinct categories (basic, AI-special, metadata, etc.)
- **Icon-driven navigation** with FontAwesome icons
- **Smart defaults** (important sections expanded, metadata collapsed)

## Proposed Architecture

### 1. Form Structure Changes

#### From Tabs To Collapsible Panels
**Current:**
```html
<mj-tab-strip>
    <mj-tab Name="Personal Information">...</mj-tab>
    <mj-tab-body>
        <mj-form-section Entity="..." Section="personal-information">
        </mj-form-section>
    </mj-tab-body>
</mj-tab-strip>
```

**Proposed:**
```html
<div class="form-card collapsible-card">
  <div class="collapsible-header" (click)="toggleSection('personalInformation')"
       role="button" tabindex="0">
    <div class="collapsible-title">
      <i class="fa fa-user"></i>
      <h3>Personal Information</h3>
    </div>
    <div class="collapse-icon">
      <i [class]="sectionsExpanded.personalInformation ? 'fa fa-chevron-up' : 'fa fa-chevron-down'"></i>
    </div>
  </div>

  <div class="collapsible-body" [class.collapsed]="!sectionsExpanded.personalInformation">
    <div class="form-body">
      <!-- Fields inline here, no separate component -->
      <mj-form-field [record]="record" FieldName="FirstName" ...></mj-form-field>
      <mj-form-field [record]="record" FieldName="LastName" ...></mj-form-field>
    </div>
  </div>
</div>
```

### 2. Generator Changes

#### Key Modifications to `angular-codegen.ts`

**A. Remove Section Component Generation**
- **Current**: Generates separate section components in `sections/` folder
- **Proposed**: Generate all fields inline in main form template
- **Benefit**: Simpler architecture, faster rendering, easier to style

**B. Generate Collapsible Panel HTML**
```typescript
protected generateCategoryPanel(
    entity: EntityInfo,
    category: string,
    fields: EntityFieldInfo[],
    isExpanded: boolean = false
): string {
    const icon = this.getIconForCategory(category);
    const sectionKey = this.camelCase(category);

    return `
    <!-- ${category} Section -->
    <div class="form-card collapsible-card">
      <div class="collapsible-header" (click)="toggleSection('${sectionKey}')"
           role="button" tabindex="0">
        <div class="collapsible-title">
          <i class="${icon}"></i>
          <h3>${category}</h3>
        </div>
        <div class="collapse-icon">
          <i [class]="sectionsExpanded.${sectionKey} ? 'fa fa-chevron-up' : 'fa fa-chevron-down'"></i>
        </div>
      </div>

      <div class="collapsible-body" [class.collapsed]="!sectionsExpanded.${sectionKey}">
        <div class="form-body">
${this.generateFieldsHTML(fields)}
        </div>
      </div>
    </div>`;
}
```

**C. Category-to-Icon Mapping**
```typescript
protected getIconForCategory(category: string): string {
    const iconMap: Record<string, string> = {
        // Personal/Identity
        'personal information': 'fa fa-user',
        'contact information': 'fa fa-address-card',
        'identification': 'fa fa-id-card',

        // Business
        'professional information': 'fa fa-briefcase',
        'organization': 'fa fa-building',
        'job details': 'fa fa-user-tie',

        // Financial
        'billing address': 'fa fa-file-invoice-dollar',
        'shipping address': 'fa fa-truck',
        'pricing and charges': 'fa fa-dollar-sign',
        'payment information': 'fa fa-credit-card',

        // Social/Web
        'social media & web': 'fa fa-share-alt',
        'social media': 'fa fa-hashtag',

        // Dates/Time
        'dates and timeline': 'fa fa-calendar-alt',
        'dates & deadlines': 'fa fa-clock',

        // Content
        'submission content': 'fa fa-file-text',
        'description': 'fa fa-align-left',

        // Technical
        'system metadata': 'fa fa-database',
        'metadata': 'fa fa-info-circle',
        'technical details': 'fa fa-cog',

        // AI/Analysis
        'ai evaluation': 'fa fa-robot',
        'ai research dossier': 'fa fa-user-secret',

        // Default
        'default': 'fa fa-info-circle'
    };

    return iconMap[category.trim().toLowerCase()] || iconMap['default'];
}
```

**D. Generate Section State Object**
```typescript
protected generateSectionsExpandedObject(categories: string[]): string {
    const entries = categories.map((cat, index) => {
        const key = this.camelCase(cat);
        // Expand first 2-3 categories by default
        const expanded = index < 2 ? 'true' : 'false';
        return `    ${key}: ${expanded}`;
    });

    // Always collapse metadata by default
    if (!categories.find(c => c.toLowerCase().includes('metadata'))) {
        entries.push(`    metadata: false`);
    }

    return `public sectionsExpanded = {\n${entries.join(',\n')}\n  };`;
}
```

**E. TypeScript Component Template**
```typescript
protected generateSingleEntityTypeScriptForAngular(
    entity: EntityInfo,
    categories: string[]
): string {
    const sectionsExpandedCode = this.generateSectionsExpandedObject(categories);

    return `import { Component, ChangeDetectorRef, ElementRef } from '@angular/core';
import { ${entity.ClassName}Entity } from '${this.getImportPath(entity)}';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'mj-${entity.ClassName.toLowerCase()}-form',
  templateUrl: './${entity.ClassName.toLowerCase()}.form.component.html',
  styleUrls: ['./shared-form-styles.css', './${entity.ClassName.toLowerCase()}.form.component.css']
})
@RegisterClass(BaseFormComponent, '${entity.Name}')
export class ${entity.ClassName}FormComponent extends BaseFormComponent {
  public record!: ${entity.ClassName}Entity;

  // Collapsible section state
  ${sectionsExpandedCode}

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  public toggleSection(section: keyof typeof this.sectionsExpanded): void {
    this.sectionsExpanded[section] = !this.sectionsExpanded[section];
  }
}

export function Load${entity.ClassName}FormComponent() {
  // Tree-shaking prevention
}`;
}
```

### 3. HTML Generation Logic

#### Main Form Structure
```typescript
protected async generateSingleEntityHTMLForAngular(
    entity: EntityInfo,
    contextUser: UserInfo
): Promise<string> {
    const categories = this.extractCategories(entity);
    let html = `<div class="record-form-container">
  <form *ngIf="record" class="record-form" #form="ngForm">
    <mj-form-toolbar [form]="this"></mj-form-toolbar>

    <!-- Header Card -->
    ${this.generateHeaderCard(entity)}

`;

    // Generate panel for each category
    for (const category of categories) {
        const fields = this.getFieldsForCategory(entity, category);
        const isExpanded = categories.indexOf(category) < 2; // First 2 expanded
        html += this.generateCategoryPanel(entity, category, fields, isExpanded);
        html += '\n\n';
    }

    // Always add metadata panel if entity has ID
    html += this.generateMetadataPanel(entity);

    html += `  </form>
</div>`;

    return html;
}
```

#### Extract Categories from Entity
```typescript
protected extractCategories(entity: EntityInfo): string[] {
    const categories = new Set<string>();

    // Get all unique categories from fields
    for (const field of entity.Fields) {
        if (field.IncludeInGeneratedForm && field.Category) {
            categories.add(field.Category);
        }
    }

    // Sort categories - put important ones first
    const sorted = Array.from(categories).sort((a, b) => {
        const priority = this.getCategoryPriority(a) - this.getCategoryPriority(b);
        return priority !== 0 ? priority : a.localeCompare(b);
    });

    return sorted;
}

protected getCategoryPriority(category: string): number {
    const cat = category.toLowerCase();

    // Lower number = higher priority (shows first)
    if (cat.includes('basic') || cat.includes('personal')) return 1;
    if (cat.includes('professional') || cat.includes('contact')) return 2;
    if (cat.includes('ai') || cat.includes('evaluation')) return 3;
    if (cat.includes('dates') || cat.includes('timeline')) return 4;
    if (cat.includes('metadata') || cat.includes('system')) return 99;

    return 50; // Middle priority for everything else
}
```

### 4. Styling System

#### Generate Shared Styles
Create `/shared/form-styles.css` that all forms reference:

```typescript
protected generateSharedFormStyles(): string {
    return `/* MemberJunction Generated Form Styles */

.record-form-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.record-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.form-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.form-header h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #ffffff;
}

/* Collapsible Sections */
.collapsible-card {
  overflow: hidden;
}

.collapsible-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
  border-bottom: 2px solid #e5e7eb;
  cursor: pointer;
  user-select: none;
  transition: all 0.3s ease;
}

.collapsible-header:hover {
  background: linear-gradient(135deg, #f3f4f6 0%, #f9fafb 100%);
  border-bottom-color: #667eea;
}

.collapsible-title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.collapsible-title i {
  font-size: 20px;
  color: #667eea;
}

.collapsible-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.collapse-icon {
  color: #6b7280;
  transition: transform 0.3s ease;
}

.collapsible-body {
  max-height: 2000px;
  overflow: hidden;
  transition: max-height 0.4s ease, padding 0.4s ease, opacity 0.3s ease;
  opacity: 1;
}

.collapsible-body.collapsed {
  max-height: 0;
  padding: 0;
  opacity: 0;
}

.form-body {
  padding: 24px;
}

.form-section {
  margin-bottom: 32px;
}

.form-section:last-child {
  margin-bottom: 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.form-label.required::after {
  content: " *";
  color: #dc2626;
}

/* Metadata Card - Always Collapsed by Default */
.metadata-card {
  border-color: #d1d5db;
}

.metadata-card .collapsible-header {
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
}

.metadata-card .collapsible-title i {
  color: #9ca3af;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metadata-label {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metadata-value {
  font-size: 14px;
  color: #1f2937;
}

/* Loading State */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 768px) {
  .record-form-container {
    padding: 12px;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}`;
}
```

### 5. Implementation Benefits

#### User Experience
- **Reduced Cognitive Load**: Users see one section at a time
- **Faster Navigation**: Click to expand vs. tab switching
- **Visual Hierarchy**: Cards and icons create clear structure
- **Mobile-Friendly**: Panels stack naturally on mobile
- **Progressive Disclosure**: Hide complexity until needed

#### Developer Experience
- **Simpler Architecture**: No separate section components
- **Easier Styling**: Single CSS file per form
- **Better Performance**: Less component overhead
- **Easier Debugging**: All code in one template
- **AI-Powered Categories**: Leverage our Form Layout Generation feature

#### Code Quality
- **Less Code**: Eliminate ~60% of component files
- **Better Maintainability**: One place to update forms
- **Consistent UX**: Shared styles across all forms
- **Type Safety**: `sectionsExpanded` object is strongly typed

### 6. Migration Strategy

#### Phase 1: Generator Updates
1. Update `generateSingleEntityHTMLForAngular()` to use panels
2. Update `generateSingleEntityTypeScriptForAngular()` with toggle logic
3. Add icon mapping and category prioritization
4. Generate shared form styles

#### Phase 2: Base Class Updates
1. Add `toggleSection()` to `BaseFormComponent` (optional - can stay in generated code)
2. No breaking changes needed

#### Phase 3: Testing
1. Generate forms for test entities
2. Verify all field types render correctly
3. Test collapse/expand animations
4. Mobile responsiveness testing
5. Accessibility audit (keyboard navigation, screen readers)

#### Phase 4: Rollout
1. Enable for new entities first
2. Add config flag: `useCollapsiblePanels: boolean`
3. Gradual migration of existing forms
4. Deprecate old tab-based approach

### 7. Configuration Options

Add to `mj.config.cjs`:

```javascript
module.exports = {
  angular: {
    formGeneration: {
      // Use collapsible panels instead of tabs
      useCollapsiblePanels: true,

      // How many panels to expand by default
      defaultExpandedPanels: 2,

      // Always collapse metadata
      collapseMetadataByDefault: true,

      // Custom icon mappings
      categoryIcons: {
        'Custom Category': 'fa fa-custom-icon'
      },

      // Category priority overrides
      categoryPriority: {
        'Important Category': 1
      }
    }
  }
};
```

### 8. Example Generated Output

For an entity with categories: "Personal Information", "Professional Information", "Social Media & Web", "System Metadata"

**Generated HTML** (~200 lines instead of ~400 with sections):
```html
<div class="record-form-container">
  <form *ngIf="record" class="record-form" #form="ngForm">
    <mj-form-toolbar [form]="this"></mj-form-toolbar>

    <!-- Personal Information Section -->
    <div class="form-card collapsible-card">
      <div class="collapsible-header" (click)="toggleSection('personalInformation')"
           role="button" tabindex="0">
        <div class="collapsible-title">
          <i class="fa fa-user"></i>
          <h3>Personal Information</h3>
        </div>
        <div class="collapse-icon">
          <i [class]="sectionsExpanded.personalInformation ? 'fa fa-chevron-up' : 'fa fa-chevron-down'"></i>
        </div>
      </div>

      <div class="collapsible-body" [class.collapsed]="!sectionsExpanded.personalInformation">
        <div class="form-body">
          <mj-form-field [record]="record" FieldName="FirstName" Type="textbox" ...></mj-form-field>
          <mj-form-field [record]="record" FieldName="LastName" Type="textbox" ...></mj-form-field>
          <mj-form-field [record]="record" FieldName="Email" Type="textbox" ...></mj-form-field>
        </div>
      </div>
    </div>

    <!-- Professional Information Section -->
    <div class="form-card collapsible-card">
      ...
    </div>

    <!-- System Metadata Section -->
    <div class="form-card collapsible-card metadata-card" *ngIf="record.ID">
      ...
    </div>
  </form>
</div>
```

**Generated TypeScript** (~100 lines instead of ~50 + multiple section files):
```typescript
@Component({
  selector: 'mj-contact-form',
  templateUrl: './contact.form.component.html',
  styleUrls: ['../shared/form-styles.css', './contact.form.component.css']
})
@RegisterClass(BaseFormComponent, 'Contacts')
export class ContactFormComponent extends BaseFormComponent {
  public record!: ContactEntity;

  public sectionsExpanded = {
    personalInformation: true,
    professionalInformation: true,
    socialMediaWeb: false,
    systemMetadata: false
  };

  public toggleSection(section: keyof typeof this.sectionsExpanded): void {
    this.sectionsExpanded[section] = !this.sectionsExpanded[section];
  }
}
```

### 9. Accessibility Considerations

- `role="button"` and `tabindex="0"` on collapsible headers
- Keyboard navigation support (Enter/Space to toggle)
- ARIA labels for screen readers
- Focus management when panels expand/collapse
- High contrast mode support
- Semantic HTML structure

### 10. Next Steps

1. **Review & Approve** this proposal
2. **Prototype** a single entity form with collapsible panels
3. **User Testing** with the prototype
4. **Implement** generator changes
5. **Test** with various entity types
6. **Document** the new pattern
7. **Roll out** gradually with feature flag

## Summary

This proposal transforms MJ's auto-generated forms from a complex tab-based system with multiple component files into a streamlined collapsible panel system that's:
- **Simpler** - fewer files, less code
- **Better UX** - progressive disclosure, visual hierarchy
- **More Maintainable** - one template, shared styles
- **AI-Powered** - leverages our Form Layout Generation feature
- **Modern** - matches contemporary design patterns

The implementation is backward-compatible through configuration flags and requires no changes to BaseFormComponent or existing custom forms.
