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

## This Rule Is Enforced, Not Just Documented

Packages here declare their layer in their own `package.json` and are checked by the gate:

```jsonc
{ "mjUILayer": "widgets" }     // L1 + L2 — see guides/UI_LAYERING_GUIDE.md
```

```bash
npm run check:standards        # from the repo root — every adopted standard
mj standards check --check ui-layers   # just this one
```

The check ships in [`@memberjunction/standards`](../../Standards/README.md); this repo's adoption
lives in `.mj-standards.json`.

Beyond Router, the `widgets` layer also bans `@memberjunction/ng-shared` (`SharedService`,
`BaseResourceComponent`, `NavigationService`) and global-provider construction
(`new RunView()` / `new Metadata()` — use `this.ProviderToUse`, per
[../CLAUDE.md](../CLAUDE.md)).

**Every package in this tree is declared and passing.** There is no "not looked at yet" state
left here — `mj standards check` covers all of `packages/Angular/**`, and the PR check runs
on every PR that touches it.

The one standing exception is marked in source with `mj-ui-layers-allow` and a reason:
`file-storage`'s `FileBrowserResource` is an Explorer surface sitting in this tree. Moving it is
the right fix but requires regenerating three CodeGen manifests, so it is tracked rather than
hand-edited.

**When you add a package here**, declare `"mjUILayer": "widgets"` in its `package.json` from the
first commit. A new Generic package without the field is the only way drift gets back in.

## Related Guides

- **[UI Layering Guide](../../../guides/UI_LAYERING_GUIDE.md)** — the four-layer model this rule is one boundary of, plus the `Before*`/`After*` event contract and the enforcement gate.
- **[Navigation & Routing Guide](../../../guides/NAVIGATION_AND_ROUTING_GUIDE.md)** — How navigation, URL sync, and back/forward work in MJ Explorer. Explains why Generic components must not touch Router.
