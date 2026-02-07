# @memberjunction/ng-action-gallery

A beautiful, filterable gallery component for browsing and selecting actions in MemberJunction applications.

## Overview

The Action Gallery provides an exceptional user experience for discovering, browsing, and selecting actions. It features both grid and list views, category navigation, and powerful search capabilities.

## Features

- 🎨 Beautiful grid and list view modes
- 🌳 Hierarchical category navigation with counts
- 🔍 Real-time search filtering
- ✅ Single and multi-selection support
- 📇 Expandable action cards with details
- ⚡ Quick test integration
- 🎯 TypeScript support with full type safety
- 🌓 Light and dark theme support

## Installation

```bash
npm install @memberjunction/ng-action-gallery
```

## Usage

### Module Import

```typescript
import { ActionGalleryModule } from '@memberjunction/ng-action-gallery';

@NgModule({
  imports: [
    ActionGalleryModule,
    // ... other imports
  ]
})
export class YourModule { }
```

### Component Usage

#### Standalone Gallery

```html
<mj-action-gallery 
  [config]="galleryConfig"
  [preSelectedActions]="selectedIds"
  (actionSelected)="onActionSelected($event)"
  (actionsSelected)="onActionsSelected($event)"
  (actionTestRequested)="onTestRequested($event)">
</mj-action-gallery>
```

```typescript
galleryConfig: ActionGalleryConfig = {
  selectionMode: true,
  multiSelect: true,
  showCategories: true,
  showSearch: true,
  defaultView: 'grid',
  gridColumns: 3,
  enableQuickTest: true,
  theme: 'light'
};

selectedIds = ['action-id-1', 'action-id-2'];

onActionSelected(action: ActionEntity) {
  console.log('Selected action:', action);
}

onActionsSelected(actions: ActionEntity[]) {
  console.log('Selected actions:', actions);
}
```

#### Dialog Mode

```typescript
import { ActionGalleryDialogService } from '@memberjunction/ng-action-gallery';

constructor(private actionGallery: ActionGalleryDialogService) {}

// Single selection
selectSingleAction() {
  this.actionGallery.openForSingleSelection({
    title: 'Select an Action',
    showCategories: true,
    enableQuickTest: true
  }).subscribe(action => {
    if (action) {
      console.log('Selected:', action);
    }
  });
}

// Multi-selection
selectMultipleActions() {
  this.actionGallery.openForMultiSelection({
    title: 'Select Actions',
    preSelectedActions: ['id1', 'id2'],
    showCategories: true,
    submitButtonText: 'Add Selected Actions'
  }).subscribe(actions => {
    console.log('Selected actions:', actions);
  });
}

// Browse only (no selection)
browseActions() {
  this.actionGallery.openForBrowsing({
    title: 'Action Browser',
    enableQuickTest: true
  });
}
```

## Configuration

### ActionGalleryConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| selectionMode | `boolean` | `false` | Enable selection mode |
| multiSelect | `boolean` | `false` | Allow multiple selections |
| showCategories | `boolean` | `true` | Show category sidebar |
| showSearch | `boolean` | `true` | Show search bar |
| defaultView | `'grid' \| 'list'` | `'grid'` | Default view mode |
| gridColumns | `number` | `3` | Number of grid columns |
| enableQuickTest | `boolean` | `true` | Show test buttons |
| theme | `'light' \| 'dark'` | `'light'` | Visual theme |

### ActionGalleryDialogConfig

Extends `ActionGalleryConfig` with:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| title | `string` | `'Select Actions'` | Dialog title |
| width | `number` | `1200` | Dialog width |
| height | `number` | `800` | Dialog height |
| submitButtonText | `string` | `'Select'` | Submit button text |
| cancelButtonText | `string` | `'Cancel'` | Cancel button text |
| preSelectedActions | `string[]` | `[]` | Pre-selected action IDs |

## Features in Detail

### Category Navigation

The gallery displays a hierarchical category tree on the left side:
- Shows action counts per category
- Supports nested categories
- Collapsible/expandable nodes
- "All Actions" and "Uncategorized" special categories

### Action Cards

Each action is displayed as an expandable card showing:
- Action name and icon
- Category badge
- Description
- Quick test button (if enabled)
- Expanded details:
  - Parameters with types and required status
  - Result codes with descriptions

### Search and Filtering

Real-time search across:
- Action names
- Descriptions
- Categories

### View Modes

**Grid View**: Visual cards in a responsive grid layout
**List View**: Compact table format for scanning many actions

## Styling

The component uses CSS custom properties for theming:

```scss
:root {
  --gallery-primary: #007bff;
  --gallery-hover: #0056b3;
  --gallery-selected: #e3f2fd;
  --gallery-background: #ffffff;
  --gallery-text: #212529;
  --gallery-border: #dee2e6;
}
```

## Integration with AI Test Harness

The Action Gallery integrates seamlessly with the AI Test Harness:

```typescript
// In gallery configuration
enableQuickTest: true

// Handle test requests
onTestRequested(action: ActionEntity) {
  this.testHarness.openForAction(action.ID).subscribe(result => {
    console.log('Test result:', result);
  });
}
```

## Performance

- Lazy loads action details on expansion
- Debounced search for smooth filtering
- Virtual scrolling ready for large datasets
- Efficient category tree rendering

## Dependencies

- Angular 21+
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/ng-ai-test-harness
- Kendo UI for Angular

## License

ISC

## Contributing

Contributions are welcome! Please submit pull requests to the MemberJunction repository.

## Support

For issues and questions, please use the MemberJunction GitHub repository.