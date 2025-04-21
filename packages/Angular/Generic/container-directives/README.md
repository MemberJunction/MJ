# @memberjunction/ng-container-directives

Angular directives for container management in MemberJunction applications, providing flexible and responsive layout utilities.

## Features

- `mjContainer` directive for view container management
- `mjFillContainer` directive for responsive filling of parent containers
- Automatic resizing on window resize events
- Manual resize event handling
- Customizable margin and dimension settings

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

## Advanced Controls

For debugging or special cases, there are static properties on the FillContainer class:

```typescript
import { FillContainer } from '@memberjunction/ng-container-directives';

// Disable resize globally (for all instances)
FillContainer.DisableResize = true;

// Enable resize debugging
FillContainer.OutputDebugInfo = true;
```