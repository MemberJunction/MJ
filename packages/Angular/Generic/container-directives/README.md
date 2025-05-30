# @memberjunction/ng-container-directives

Angular directives for container management in MemberJunction applications, providing flexible and responsive layout utilities.

## Overview

This package provides two essential directives for managing container layouts in Angular applications:
- **mjContainer**: Exposes a ViewContainerRef for dynamic component loading
- **mjFillContainer**: Automatically resizes elements to fill their parent containers with intelligent context awareness

## Features

- `mjContainer` directive for view container management and dynamic component loading
- `mjFillContainer` directive for responsive filling of parent containers
- Automatic resizing on window resize events with dual debounce strategy
- Manual resize event handling via MJGlobal event system
- Customizable margin and dimension settings
- Smart context detection (automatically skips resizing in grids, hidden tabs, and elements with `mjSkipResize`)
- Efficient resize event handling with configurable debouncing
- Debug mode for troubleshooting resize behavior

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

The `mjContainer` directive exposes a ViewContainerRef for dynamic component loading. This is particularly useful when you need to programmatically create and insert components into the DOM.

```html
<div mjContainer></div>
```

In your component:

```typescript
import { Component, ViewChild, ViewContainerRef } from '@angular/core';
import { Container } from '@memberjunction/ng-container-directives';

@Component({
  selector: 'app-your-component',
  template: `<div mjContainer></div>`
})
export class YourComponent {
  @ViewChild(Container, { static: true }) container!: Container;
  
  ngOnInit() {
    // Access the ViewContainerRef for dynamic component creation
    const viewContainerRef: ViewContainerRef = this.container.viewContainerRef;
    
    // Example: Create a dynamic component
    // const componentRef = viewContainerRef.createComponent(YourDynamicComponent);
  }
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

## Dependencies

This package depends on:
- `@memberjunction/core` - Core MemberJunction utilities and logging
- `@memberjunction/global` - Global event system for manual resize triggers
- `rxjs` - For event handling and debouncing

Peer dependencies:
- `@angular/common` ^18.0.2
- `@angular/core` ^18.0.2
- `@angular/router` ^18.0.2

## Troubleshooting

### Element not resizing properly

- Check if any parent has `mjSkipResize` attribute
- Verify the element isn't within a grid (role="grid") or hidden tab
- Ensure parent elements have proper CSS display properties (must be 'block')
- Check z-index and overflow settings
- Verify parent visibility (elements with hidden or not displayed parents are skipped)

### Flickering during resize

- This is usually caused by cascading resize calculations
- Try applying `mjFillContainer` only where necessary
- Use CSS transitions for smoother visual changes
- Consider the dual debounce strategy (100ms during resize, 500ms after)

### Height calculation issues

- Ensure parent element has a defined height or position
- For full window height, apply directive to a root element
- Check for competing CSS that might override the directive's styles
- Note that padding is accounted for in calculations

## Advanced Controls

For debugging or special cases, there are static properties on the FillContainer class:

```typescript
import { FillContainer } from '@memberjunction/ng-container-directives';

// Disable resize globally (for all instances)
FillContainer.DisableResize = true;

// Enable resize debugging (logs to console)
FillContainer.OutputDebugInfo = true;
```

## API Reference

### Container Directive

```typescript
@Directive({
  selector: '[mjContainer]'
})
export class Container {
  constructor(public viewContainerRef: ViewContainerRef) { }
}
```

### FillContainer Directive

```typescript
@Directive({
  selector: '[mjFillContainer]'
})
export class FillContainer {
  @Input() fillWidth: boolean = true;
  @Input() fillHeight: boolean = true;
  @Input() rightMargin: number = 0;
  @Input() bottomMargin: number = 0;
  
  static DisableResize: boolean = false;
  static OutputDebugInfo: boolean = false;
}
```

## Contributing

When contributing to this package:
1. Follow the MemberJunction development guidelines
2. Ensure all TypeScript compiles without errors: `npm run build`
3. Update this README if adding new features or changing behavior
4. Add appropriate TSDoc comments to all public APIs