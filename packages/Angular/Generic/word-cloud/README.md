# @memberjunction/ng-word-cloud

A reusable, SVG-based word cloud component for Angular. Renders weighted text items in a spiral or rectangular layout with collision detection. Supports multiple color modes using MJ design tokens, optional entry animation, and click/hover interaction.

## Installation

```bash
npm install @memberjunction/ng-word-cloud
```

## Usage

The component is standalone and can be imported directly:

```typescript
import { MJWordCloudComponent } from '@memberjunction/ng-word-cloud';

@Component({
    imports: [MJWordCloudComponent],
    template: `
        <mj-word-cloud
            [Items]="Words"
            [MaxFontSize]="56"
            ColorMode="categorical"
            (ItemClick)="OnWordClick($event)">
        </mj-word-cloud>
    `
})
export class MyComponent {
    Words: WordCloudItem[] = [
        { Text: 'Machine Learning', Weight: 1.0 },
        { Text: 'Data Science', Weight: 0.8, Category: 'analytics' },
        { Text: 'Neural Networks', Weight: 0.6, Category: 'ai' },
    ];

    OnWordClick(event: WordCloudItemEvent): void {
        console.log('Clicked:', event.Item.Text);
    }
}
```

## Component API

### Selector

`mj-word-cloud`

### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `Items` | `WordCloudItem[]` | `[]` | Data items to display in the cloud |
| `MinFontSize` | `number` | `12` | Minimum font size in pixels for the lowest-weighted item |
| `MaxFontSize` | `number` | `48` | Maximum font size in pixels for the highest-weighted item |
| `Layout` | `'spiral' \| 'rectangular'` | `'spiral'` | Layout algorithm for word placement |
| `ColorMode` | `'brand' \| 'categorical' \| 'weight-gradient'` | `'brand'` | How colors are assigned to words (see Color Modes below) |
| `Interactive` | `boolean` | `true` | Whether words are clickable and hoverable |
| `MaxItems` | `number` | `100` | Maximum number of items to display (heaviest items are kept) |
| `Animate` | `boolean` | `true` | Whether to animate words in with a staggered fade |

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `ItemClick` | `EventEmitter<WordCloudItemEvent>` | Emitted when a word is clicked |
| `ItemHover` | `EventEmitter<WordCloudItemEvent>` | Emitted when the pointer enters a word |
| `ItemLeave` | `EventEmitter<WordCloudItemEvent>` | Emitted when the pointer leaves a word |

## Types

### WordCloudItem

```typescript
interface WordCloudItem {
    Text: string;                           // Display text
    Weight: number;                         // Importance (0.0 - 1.0), determines font size
    Category?: string;                      // Optional category for color grouping
    Metadata?: Record<string, unknown>;     // Optional metadata passed through events
}
```

### WordCloudItemEvent

```typescript
interface WordCloudItemEvent {
    Item: WordCloudItem;    // The item that was interacted with
    Event: MouseEvent;      // The original DOM event
}
```

## Color Modes

### `brand`

All words use `--mj-brand-primary`. Opacity varies with weight (range 0.4--1.0), giving higher-weighted words more visual prominence.

### `categorical`

Words with the same `Category` share a color from a fixed palette of MJ design tokens: `--mj-brand-primary`, `--mj-status-success`, `--mj-status-warning`, `--mj-status-error`, `--mj-status-info`, and others. Words without a `Category` each get their own color.

### `weight-gradient`

Interpolates between `--mj-text-muted` (low weight) and `--mj-brand-primary` (high weight) using `color-mix()`. Provides a smooth gradient that adapts to both light and dark themes.

## Rendering Approach

The component renders entirely in SVG using an `<svg>` element with a computed `viewBox` and `preserveAspectRatio="xMidYMid meet"` so the cloud scales to fill its container.

### Layout Algorithm

1. Items are sorted by weight (heaviest first) and trimmed to `MaxItems`.
2. For each item, the engine computes a font size by linear interpolation between `MinFontSize` and `MaxFontSize` based on weight.
3. Roughly 20% of words are rotated 90 degrees for visual variety (deterministic based on index).
4. The engine generates candidate positions using the selected algorithm:
   - **Spiral** -- Archimedean spiral expanding from the center.
   - **Rectangular** -- concentric rectangular rings expanding from the center.
5. For each candidate position, an axis-aligned bounding box is computed (accounting for rotation) and tested against all previously placed items.
6. The first non-colliding position is accepted. If no position is found after 500 attempts, the word is skipped.
7. The overall SVG `viewBox` is computed to fit all placed items with 20px padding.

Text width is estimated using an average character width ratio of 0.6x the font size (no DOM measurement required), making the layout engine fully deterministic and SSR-compatible.

## Design Token Compliance

All colors use MJ semantic design tokens exclusively. No hardcoded hex values are used in the component's styles or color logic. The component adapts automatically to light and dark themes via the `--mj-*` CSS custom properties.

Tokens used:

- `--mj-brand-primary`, `--mj-brand-primary-hover` -- brand color mode
- `--mj-status-success`, `--mj-status-warning`, `--mj-status-error`, `--mj-status-info` -- categorical palette
- `--mj-text-muted` -- weight-gradient low end
- `--mj-font-family` -- inherited font family

## Change Detection

The component uses `ChangeDetectionStrategy.OnPush` for performance. The layout is recomputed whenever any `@Input` changes (via `ngOnChanges`).
