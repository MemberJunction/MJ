# MemberJunction Component Style Guide

This guide covers styling patterns, naming conventions, and best practices for building consistent UI components in MemberJunction Angular applications. For visual examples and interactive documentation, run Storybook in MJExplorer.

## Table of Contents

1. [Running Storybook](#running-storybook)
2. [Design Tokens](#design-tokens)
3. [Naming Conventions](#naming-conventions)
4. [Component File Organization](#component-file-organization)
5. [Styling Standards](#styling-standards)
6. [Common Components](#common-components)
7. [Accessibility Requirements](#accessibility-requirements)
8. [Adding New Storybook Stories](#adding-new-storybook-stories)

---

## Running Storybook

Storybook provides interactive documentation for MJ components. To run it:

```bash
# Navigate to MJExplorer
cd packages/MJExplorer

# Start Storybook (opens browser to localhost:6006)
npm run storybook

# Build static Storybook for deployment
npm run build-storybook
```

Storybook includes:
- **Design Tokens**: Color palettes, typography, spacing reference
- **Core Components**: LoadingComponent and other shared UI elements
- **Interactive Controls**: Test component variants and configurations

---

## Design Tokens

MJ uses CSS custom properties (variables) for consistent styling. Always use tokens instead of hardcoded values.

### Colors

```scss
// Brand colors
--mj-color-brand-500: #0076b6;  // MJ Blue - primary actions
--mj-color-brand-900: #092340;  // MJ Navy - dark accent
--mj-color-accent-400: #5cc0ed; // Skip Blue - highlights

// Semantic colors
--mj-bg-page: #f8fafc;          // Page backgrounds
--mj-bg-surface: #ffffff;       // Cards, panels
--mj-text-primary: #0f172a;     // Primary text
--mj-text-secondary: #475569;   // Secondary text
--mj-text-muted: #94a3b8;       // Disabled, placeholder

// Status colors
--mj-status-success: #22c55e;
--mj-status-warning: #f59e0b;
--mj-status-error: #ef4444;
--mj-status-info: #3b82f6;
```

### Typography

```scss
// Font families
--mj-font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--mj-font-family-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;

// Font sizes (rem based, 16px root)
--mj-text-xs: 0.75rem;   // 12px
--mj-text-sm: 0.875rem;  // 14px
--mj-text-base: 1rem;    // 16px
--mj-text-lg: 1.125rem;  // 18px
--mj-text-xl: 1.25rem;   // 20px
--mj-text-2xl: 1.5rem;   // 24px

// Font weights
--mj-font-normal: 400;
--mj-font-medium: 500;
--mj-font-semibold: 600;
--mj-font-bold: 700;
```

### Spacing

MJ uses a 4px base grid system. All spacing values are multiples of 4px.

```scss
--mj-space-1: 0.25rem;  // 4px
--mj-space-2: 0.5rem;   // 8px
--mj-space-3: 0.75rem;  // 12px
--mj-space-4: 1rem;     // 16px
--mj-space-6: 1.5rem;   // 24px
--mj-space-8: 2rem;     // 32px
```

### Border Radius

```scss
--mj-radius-sm: 4px;
--mj-radius-md: 8px;
--mj-radius-lg: 12px;
--mj-radius-xl: 16px;
--mj-radius-full: 9999px;
```

### Shadows

```scss
--mj-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--mj-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--mj-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
```

---

## Naming Conventions

### Class Member Naming (TypeScript)

MemberJunction uses **PascalCase for public members** and **camelCase for private/protected members**:

```typescript
export class MyComponent {
  // Public properties - PascalCase
  @Input() QueryID: string | null = null;
  @Input() AutoRun: boolean = false;
  @Output() EntityLinkClick = new EventEmitter<EntityLinkEvent>();
  public IsLoading: boolean = false;

  // Private/protected - camelCase
  private destroy$ = new Subject<void>();
  private _internalState: string = '';
  protected cdr: ChangeDetectorRef;

  // Public methods - PascalCase
  public LoadData(): void { }
  public GetSelectedRows(): Record<string, unknown>[] { }

  // Private/protected methods - camelCase
  private buildColumnDefs(): void { }
  protected applyVisualConfig(): void { }
}
```

### Acronyms in Names

Common acronyms (ID, URL, API, HTTP) should be **ALL CAPS**:

```typescript
// Correct
AgentID, ModelID, UserID
APIKey, APIURL
HTTPClient

// Wrong
AgentId, ApiKey, HttpClient
```

### CSS Class Naming

Use kebab-case with the `mj-` prefix for custom classes:

```scss
.mj-card { }
.mj-card-header { }
.mj-loading-container { }
.mj-button-primary { }
```

### File Naming

- Components: `component-name.component.ts`
- Modules: `module-name.module.ts`
- Stories: `component-name.stories.ts`
- Styles: `component-name.component.scss`

---

## Component File Organization

### Standard Component Structure

```
/my-component/
├── my-component.component.ts      # Component class
├── my-component.component.html    # Template
├── my-component.component.scss    # Styles
├── my-component.module.ts         # NgModule (required - no standalone)
└── index.ts                       # Public API exports
```

### Important: No Standalone Components

MemberJunction does NOT use standalone components. Always declare components in NgModules:

```typescript
// Correct - NgModule pattern
@NgModule({
  declarations: [MyComponent],
  imports: [CommonModule, SharedGenericModule],
  exports: [MyComponent]
})
export class MyComponentModule { }

// Wrong - standalone (forbidden)
@Component({
  standalone: true,  // Never use this
  imports: [...]
})
```

---

## Styling Standards

### Use Design Tokens

Always use CSS variables instead of hardcoded values:

```scss
// Correct
.mj-card {
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  padding: var(--mj-space-4);
  border-radius: var(--mj-radius-md);
  box-shadow: var(--mj-shadow-sm);
}

// Wrong - hardcoded values
.mj-card {
  background: #ffffff;
  color: #0f172a;
  padding: 16px;
  border-radius: 8px;
}
```

### Responsive Design

Use CSS Grid and Flexbox for layouts:

```scss
.mj-dashboard-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: var(--mj-space-4);
}

@media (max-width: 768px) {
  .mj-dashboard-layout {
    grid-template-columns: 1fr;
  }
}
```

### Button Styling

Use Kendo button directive (not element):

```html
<!-- Correct -->
<button kendoButton>Click me</button>
<button kendoButton themeColor="primary">Primary</button>

<!-- Wrong (deprecated) -->
<kendo-button>Click me</kendo-button>
```

### Dialog Button Placement

Confirm/Submit buttons go on the **LEFT**, Cancel on the **RIGHT**:

```html
<div class="dialog-actions">
  <button kendoButton themeColor="primary">Save</button>
  <button kendoButton>Cancel</button>
</div>
```

---

## Common Components

### Loading Indicator

Always use `<mj-loading>` for loading states:

```html
<!-- Basic usage -->
<mj-loading></mj-loading>

<!-- With text -->
<mj-loading text="Loading data..."></mj-loading>

<!-- Size variants: small, medium, large, auto -->
<mj-loading size="medium"></mj-loading>

<!-- No text, just logo -->
<mj-loading [showText]="false"></mj-loading>
```

### Icons

Use Font Awesome icons:

```html
<i class="fa-solid fa-user"></i>
<i class="fa-regular fa-envelope"></i>
<i class="fa-brands fa-github"></i>
```

---

## Accessibility Requirements

### Keyboard Navigation

- All interactive elements must be focusable
- Provide visible focus indicators
- Support Tab navigation and Enter/Space activation

### ARIA Labels

```html
<!-- Buttons with icons only -->
<button kendoButton aria-label="Close dialog">
  <i class="fa-solid fa-xmark"></i>
</button>

<!-- Loading states -->
<mj-loading aria-label="Loading content" role="status"></mj-loading>
```

### Color Contrast

- Text must have minimum 4.5:1 contrast ratio
- Use status colors appropriately (error, warning, success)
- Don't rely on color alone to convey information

---

## Adding New Storybook Stories

### Basic Story Structure

Create a file at `packages/MJExplorer/src/stories/component-name.stories.ts`:

```typescript
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { MyComponent, MyModule } from '@memberjunction/ng-my-package';

const meta: Meta<MyComponent> = {
  title: 'Category/ComponentName',
  component: MyComponent,
  decorators: [
    moduleMetadata({
      imports: [MyModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',  // or 'fullscreen', 'padded'
  },
  argTypes: {
    // Define controls for @Input() properties
    inputProperty: {
      control: 'text',
      description: 'Description of the property',
    },
    sizeOption: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<MyComponent>;

// Default story
export const Default: Story = {
  args: {
    inputProperty: 'default value',
  },
};

// Variant stories
export const Large: Story = {
  args: {
    ...Default.args,
    sizeOption: 'large',
  },
};
```

### Story Categories

Organize stories by category:
- `Core/` - Fundamental UI components (Loading, Button patterns)
- `Forms/` - Form elements and inputs
- `Layout/` - Layout components (Cards, Panels)
- `Data/` - Data display components (Tables, Charts)
- `Design System/` - Design token documentation

### MDX Documentation

For design documentation, use MDX files:

```mdx
import { Meta, ColorPalette, ColorItem } from '@storybook/blocks';

<Meta title="Design System/Colors" />

# Color Palette

<ColorPalette>
  <ColorItem
    title="Brand Primary"
    subtitle="--mj-color-brand-500"
    colors={{ 'MJ Blue': '#0076b6' }}
  />
</ColorPalette>
```

### Testing Stories

After adding a story:

1. Run `npm run storybook` in packages/MJExplorer
2. Navigate to your story in the sidebar
3. Verify the component renders correctly
4. Test all control variations
5. Check the "Docs" tab for autodocs

---

## Quick Reference

| Element | Standard |
|---------|----------|
| Public property | PascalCase |
| Private property | camelCase |
| CSS class | kebab-case with `mj-` prefix |
| Acronyms (ID, URL) | ALL CAPS |
| Loading indicator | `<mj-loading>` |
| Button element | `<button kendoButton>` |
| Dialog buttons | Confirm LEFT, Cancel RIGHT |
| Hardcoded colors | Never - use tokens |
| Standalone components | Never - use NgModules |

For dashboard-specific patterns, see [DASHBOARD_BEST_PRACTICES.md](./DASHBOARD_BEST_PRACTICES.md).
