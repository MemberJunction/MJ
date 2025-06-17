# Angular Development Guidelines

## Icon Libraries
- **PRIMARY ICON LIBRARY: Font Awesome** - Use Font Awesome icons throughout all Angular components
- **NEVER use Kendo icons** - Replace all Kendo icon references (k-icon, k-i-*) with Font Awesome equivalents
- Font Awesome classes: `fa-solid`, `fa-regular`, `fa-light`, `fa-brands`
- Use semantic icon names that clearly represent their function
- Examples:
  - Close button: `<i class="fa-solid fa-times"></i>` NOT `<span class="k-icon k-i-close"></span>`
  - Search: `<i class="fa-solid fa-search"></i>` NOT `<span class="k-icon k-i-search"></span>`
  - Settings: `<i class="fa-solid fa-cog"></i>` NOT `<span class="k-icon k-i-gear"></span>`

## Template Syntax
- **ALWAYS use modern Angular syntax**: Use `@if`, `@for`, `@switch` instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- **Track by functions**: Always include `track` in `@for` loops for performance
- **Avoid unnecessary ng-containers**: Don't wrap control flow directives in `<ng-container>` unless specifically needed for projection or complex logic

## Examples

### Conditional Rendering
```html
<!-- Preferred -->
@if (condition) {
  <div>Content</div>
}

<!-- Avoid -->
<div *ngIf="condition">Content</div>
```

### Loops
```html
<!-- Preferred -->
@for (item of items; track item.id; let i = $index) {
  <div>{{ item.name }}</div>
}

<!-- Avoid -->
<div *ngFor="let item of items; trackBy: trackByFn; let i = index">
  {{ item.name }}
</div>
```