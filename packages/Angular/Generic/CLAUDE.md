# Angular Generic Packages — Development Rules

## Encapsulation Rule: No Router Imports

Components in `packages/Angular/Generic/` are reusable across **any** Angular application — MJ Explorer, custom apps, embedded widgets, etc. They **MUST NOT** depend on Angular Router.

### Prohibited Imports

```typescript
// ❌ NEVER import these in Generic components
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { NavigationEnd } from '@angular/router';
import { RouterModule } from '@angular/router';
import { Location } from '@angular/common';  // for navigation purposes
```

### How to Handle State That Comes From Routes

Use `@Input()` / `@Output()` / method contracts. The parent component (which lives in Explorer or a custom app) handles routing and passes state down.

```typescript
// ✅ CORRECT — Generic component receives state via Input
@Component({ ... })
export class MyGenericComponent {
    @Input() SelectedEntityName: string | null = null;
    @Input() IsVisible = true;
    @Output() EntitySelected = new EventEmitter<string>();
}
```

### Why This Rule Exists

- Generic components must work in apps that don't use Angular Router at all
- Different apps may use different routing strategies (hash, path, custom)
- Importing Router creates a hard dependency on `RouterModule` being configured
- MJ Explorer has `NavigationService` that wraps Router — Generic components should never bypass it

## Related Guides

- **[Navigation & Routing Guide](/guides/NAVIGATION_AND_ROUTING_GUIDE.md)** — How navigation, URL sync, and back/forward work in MJ Explorer. Explains why Generic components must not touch Router.
