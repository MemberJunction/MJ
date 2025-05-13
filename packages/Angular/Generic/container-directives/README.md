# @memberjunction/ng-container-directives

Angular directives for container management in MemberJunction applications, providing flexible and responsive layout utilities.

## Features

- `mjContainer` directive for view container management
- `mjFillContainer` directive for responsive filling of parent containers
- Automatic resizing on window resize events
- Manual resize event handling
- Customizable margin and dimension settings
- Smart context detection (skips resizing in grids, hidden tabs)
- Efficient resize event handling with debouncing

## Installation

```bash
npm install @memberjunction/ng-container-directives
```

## Usage

Import the module in your application:

```typescript
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

@NgModule({
  imports: [
    // ...
    ContainerDirectivesModule
  ]
})
export class YourModule { }
```

### mjContainer

Use the `mjContainer` directive to reference a ViewContainerRef for dynamic component loading:

```html
<div mjContainer></div>
```

In your component:

```typescript
import { Container } from '@memberjunction/ng-container-directives';

@Component({
  // ...
})
export class YourComponent {
  @ViewChild(Container, { static: true }) container!: Container;
  
  // Now you can use this.container.viewContainerRef for dynamic component creation
}
```

### mjFillContainer

Use the `mjFillContainer` directive to make an element fill its parent container:

```html
<!-- Basic usage (fills both width and height) -->
<div mjFillContainer>Content</div>

<!-- With custom settings -->
<div 
  mjFillContainer
  [fillWidth]="true"
  [fillHeight]="true"
  [rightMargin]="10"
  [bottomMargin]="20">
  Content with margins
</div>

<!-- Fill only width -->
<div 
  mjFillContainer
  [fillWidth]="true"
  [fillHeight]="false">
  Content that fills width only
</div>
```

### Skip Resize

If you need to prevent the resize behavior for certain elements:

```html
<!-- This element will not be resized by the directive -->
<div mjSkipResize>Content</div>
```

### Manual Resize Triggering

You can trigger manual resizing using the MemberJunction global events:

```typescript
import { MJGlobal, MJEventType } from '@memberjunction/global';

// Trigger resize
MJGlobal.Instance.RaiseEvent({
  event: MJEventType.ManualResizeRequest,
  args: null
});
```

## Configuration

The `mjFillContainer` directive has several configuration options:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| fillWidth | boolean | true | Whether to fill the parent's width |
| fillHeight | boolean | true | Whether to fill the parent's height |
| rightMargin | number | 0 | Right margin in pixels |
| bottomMargin | number | 0 | Bottom margin in pixels |

## How It Works

The `mjFillContainer` directive dynamically calculates and sets element dimensions based on its parent container:

1. **Parent container detection**: The directive identifies the nearest block-level parent element.

2. **Size calculation**: 
   - When `fillWidth` is true, it calculates the element's width based on its parent's width, accounting for the element's position within the parent and any `rightMargin`.
   - When `fillHeight` is true, it calculates height similarly, accounting for the `bottomMargin`.

3. **Event handling**: The directive listens for:
   - Window resize events (with two debounce times: 100ms during active resizing, 500ms after resizing completes)
   - Custom MJ application resize events via the MJGlobal event system

4. **Context-aware behavior**: The directive automatically skips resizing under certain conditions:
   - Elements with the `mjSkipResize` attribute (or any parent with this attribute)
   - Elements within a grid (role="grid")
   - Elements within hidden tabs (not currently active)
   - Elements with hidden or not displayed parents

## Common Use Cases

### When to Use `[fillHeight]="true" [fillWidth]="false"`

- Vertical scrollable areas where you want fixed width but dynamic height
- Content panels that should stretch to fill available vertical space
- Example: Sidebar navigation that fills vertical space but has fixed width

### When to Use `[fillHeight]="false" [fillWidth]="true"`

- Horizontal elements like headers or toolbars that span full width
- Fixed-height components that need to adapt to different screen widths
- Example: Form controls that adjust width but maintain consistent height

### When to Use Both (Default)

- Main content areas that should fill the entire available space
- Split panels or layouts that need to adapt to window resizing
- Example: Dashboards, content editors, or any primary workspace area

## Performance Optimization

- **Minimize unnecessary instances**: Only apply to containers that truly need dynamic sizing
- **Use `mjSkipResize` appropriately**: Apply to elements that don't need resizing
- **Consider debouncing**: The directive already implements debouncing, but be aware of performance impact with many instances

## Nested Containers

When nesting components with `mjFillContainer`:

1. The parent container should have the directive applied with appropriate settings
2. Child elements inherit the size constraints of their parents
3. Adjustments are calculated top-down, so parent resizing triggers child resizing
4. Example:

```html
<div mjFillContainer [fillHeight]="true" class="main-container">
  <div class="header" style="height: 60px;">Header</div>
  <div mjFillContainer [fillHeight]="true" class="content-area">
    <!-- This will fill the remaining height after the header -->
    Content
  </div>
</div>
```

## Troubleshooting

### Element not resizing properly

- Check if any parent has `mjSkipResize` attribute
- Verify the element isn't within a grid or hidden tab
- Ensure parent elements have proper CSS display properties
- Check z-index and overflow settings

### Flickering during resize

- This is usually caused by cascading resize calculations
- Try applying `mjFillContainer` only where necessary
- Use CSS transitions for smoother visual changes

### Height calculation issues

- Ensure parent element has a defined height or position
- For full window height, apply directive to a root element
- Check for competing CSS that might override the directive's styles

## Advanced Controls

For debugging or special cases, there are static properties on the FillContainer class:

```typescript
import { FillContainer } from '@memberjunction/ng-container-directives';

// Disable resize globally (for all instances)
FillContainer.DisableResize = true;

// Enable resize debugging
FillContainer.OutputDebugInfo = true;
```