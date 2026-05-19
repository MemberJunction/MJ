# @memberjunction/ng-record-tags

Angular component for displaying and managing tags on MemberJunction entity records. Shows a slide-in panel with weighted tag pills and supports tag removal.

## Installation

```bash
npm install @memberjunction/ng-record-tags
```

## Usage

Import `RecordTagsModule` in your feature module:

```typescript
import { RecordTagsModule } from '@memberjunction/ng-record-tags';

@NgModule({
    imports: [RecordTagsModule]
})
export class MyModule { }
```

Then use the component in your template:

```html
<mj-record-tags
    [Record]="SelectedRecord"
    (PanelClosed)="OnTagsPanelClosed()">
</mj-record-tags>
```

## Component API

### Selector

`mj-record-tags`

### Inputs

| Input | Type | Description |
|-------|------|-------------|
| `Record` | `BaseEntity` | **Required.** The entity record whose tags should be displayed. The component reads `Record.EntityInfo.ID` and `Record.PrimaryKey.Values()` to query the `MJ: Tagged Items` entity. |

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `PanelClosed` | `EventEmitter<void>` | Emitted when the user closes the slide panel. Use this to toggle visibility in the parent component. |

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `TaggedItems` | `MJTaggedItemEntity[]` | The loaded tagged items, sorted by weight descending |
| `IsLoading` | `boolean` | True while tags are being loaded from the server |

### Public Methods

| Method | Description |
|--------|-------------|
| `LoadTags()` | Reloads tags from the database. Called automatically on init. |
| `RemoveTag(taggedItem)` | Deletes a tagged item and removes it from the local list. |
| `GetTagOpacity(weight)` | Returns opacity (0.3--1.0) for visual weight indication. |
| `GetTagFontSize(weight)` | Returns font size string (0.85rem--1.15rem) for weight indication. |

## Tag Loading

On initialization, the component queries `MJ: Tagged Items` filtered by the record's `EntityID` and `RecordID`. Results are loaded as entity objects (enabling the `Delete()` method for removal) and sorted by weight descending so the most relevant tags appear first.

## Weight Visualization

Tags are rendered as pills with two visual weight indicators:

1. **Opacity** -- higher-weighted tags are more opaque (range 0.3--1.0 via `GetTagOpacity()`).
2. **Font size** -- higher-weighted tags are slightly larger (range 0.85rem--1.15rem via `GetTagFontSize()`).

Tags with a weight less than 1.0 display a percentage badge (e.g., "85%") in a muted style.

## Tag Removal

Each tag pill includes a remove button (X icon). Clicking it calls `taggedItem.Delete()` on the entity object and removes it from the local `TaggedItems` array. The deletion is immediate and permanent.

## Empty State

When no tags exist for a record, the component displays an empty state with a tags icon and a message explaining that tags are applied through the Knowledge Hub autotagging pipeline.

## Panel Behavior

The component renders inside an `mj-slide-panel` with the following configuration:

- **Mode**: `slide` (slides in from the side)
- **Title**: "Tags"
- **Resizable**: Yes
- **MinWidthPx**: 350
- **MaxWidthRatio**: 0.5 (max 50% of viewport width)

When the panel is closed, the `PanelClosed` event is emitted for the parent to handle visibility toggling.

## Design Token Compliance

All colors use MJ semantic design tokens. No hardcoded hex values appear in the component styles. Key tokens used:

| Token | Usage |
|-------|-------|
| `--mj-text-primary` | Tag text |
| `--mj-text-secondary` | Tag count label |
| `--mj-text-muted` | Weight badge, hint text, empty state icon, remove button |
| `--mj-brand-primary` | Tag pill background tint and border tint (via `color-mix()`) |
| `--mj-bg-surface` | Tag pill background base |
| `--mj-bg-surface-sunken` | Weight badge background |
| `--mj-border-default` | Tag pill border base (mixed with brand) |
| `--mj-status-error` | Remove button hover state |

## Module Dependencies

`RecordTagsModule` imports:

- `CommonModule` (Angular)
- `VersionsModule` (`@memberjunction/ng-versions`)
- `SharedGenericModule` (`@memberjunction/ng-shared-generic`) -- provides `mj-slide-panel` and `mj-loading`
