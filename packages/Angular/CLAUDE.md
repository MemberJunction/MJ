# Angular Development Guidelines

## 🚨 CRITICAL: Multi-Provider Support — `@Input() Provider` Pattern 🚨

The browser is **not inherently single-provider**. A single Angular app may connect to multiple MJ servers in parallel (different `IMetadataProvider` instances), and even within one app a component tree can be embedded under a non-default provider. **Every Angular component that touches metadata, RunView, RunQuery, RunReport, or BaseEntity MUST accept an optional `Provider` input and thread it through.**

### The Convention

Extend `BaseAngularComponent` from `@memberjunction/ng-base-types` — it provides the standard input + accessors:

```typescript
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

@Component({ ... })
export class MyComponent extends BaseAngularComponent {
    // Inherits:
    //   @Input() Provider: IMetadataProvider | null = null;
    //   public get ProviderToUse(): IMetadataProvider          // → Provider ?? Metadata.Provider
    //   public get RunViewToUse(): IRunViewProvider
    //   public get RunQueryToUse(): IRunQueryProvider
    //   public get RunReportToUse(): IRunReportProvider
}
```

When the input is omitted, `ProviderToUse` falls back to `Metadata.Provider` (the global default), so **single-provider apps see no behavior change**. Multi-provider apps pass a specific provider down the tree.

### Threading the Provider Through MJ APIs

Every MJ API call has a way to scope itself to a non-default provider. **Use the scoped form, never the unscoped form.**

| Don't (assumes global) | Do (uses your provider) |
|---|---|
| `new RunView()` | `RunView.FromMetadataProvider(this.ProviderToUse)` |
| `new Metadata().GetEntityObject(...)` | `this.ProviderToUse.GetEntityObject(name, this.ProviderToUse.CurrentUser)` |
| `new Metadata().EntityByName(...)` | `this.ProviderToUse.EntityByName(name)` |
| `Engine.Instance.SomeMethod(...)` (singleton) | `Engine.GetProviderInstance(this.ProviderToUse, Engine).SomeMethod(...)` |
| Reading `Metadata.Provider.Roles` directly | Read `this.ProviderToUse.Roles` |

When loading entities for save/edit, pass the provider's `CurrentUser` so server-side audit/security uses the right session:

```typescript
const p = this.ProviderToUse;
const entity = await p.GetEntityObject<MyEntity>('My Entity', p.CurrentUser);
```

### Passing the Provider to Child Components

Always forward the input to children that also need it:

```html
<mj-data-context [Provider]="Provider"></mj-data-context>
<mj-resource-permissions [Provider]="Provider"></mj-resource-permissions>
```

Don't assume children will fall back to the global — they might, but you'd be silently splitting the tree across two providers, which causes hard-to-diagnose data inconsistencies.

### Reference Implementations (Correct Pattern)

- [BaseAngularComponent](Generic/base-types/src/base-angular-component.ts) — the base class itself
- [DataContextComponent](Generic/data-context/src/lib/ng-data-context.component.ts) — declares `Provider` input + `ProviderToUse` getter, uses `RunView.FromMetadataProvider(p)` for queries
- [DataContextDialogComponent](Generic/data-context/src/lib/ng-data-context-dialog.component.ts) — wrapper that forwards `[Provider]` to its child via template binding
- [ResourcePermissionsComponent](Generic/resource-permissions/src/lib/resource-permissions.component.ts) — extends `BaseAngularComponent`, threads `ProviderToUse` to `RunView.FromMetadataProvider`, `p.GetEntityObject(...)`, and `Engine.GetProviderInstance(...)`

### When `new Metadata()` IS Acceptable in Angular Code

- **Bootstrap** (e.g. `app.module.ts`, app initializers) where there genuinely is one global provider being set up.
- **Static utility helpers** that don't have a component context. Even then, prefer accepting the provider as a parameter.

### Migration Status

There is a known multi-provider migration in flight — many existing Angular components in `packages/Angular/**` still call `new Metadata()` / `new RunView()` blindly and inherit the global provider. These are documented in [/plans/multi-provider-threading.md](/plans/multi-provider-threading.md) and will be migrated together as part of phase 6 of that effort.

**For new components and any component you touch:** apply the pattern above. Don't add to the migration debt.

---

## 🚨 CRITICAL: Routing Rules 🚨

### Generic Components MUST NOT Import Router

Components in `packages/Angular/Generic/` are reusable across any Angular application (MJ Explorer, custom apps, embedded widgets). They **MUST NOT** import `Router`, `ActivatedRoute`, or any `@angular/router` types directly.

**Why:** Generic components must be framework-context-agnostic. Different apps may use different routing strategies, and importing Router creates a hard dependency on Angular's router module being configured.

**Instead:** Use `@Input()` properties to receive route-derived state from the parent:
```typescript
// ❌ BAD — Generic component using Router directly
import { Router } from '@angular/router';
export class MyGenericComponent {
    private router = inject(Router);
    private checkRoute() { /* router.url */ }
}

// ✅ GOOD — Generic component receives state via Input
export class MyGenericComponent {
    @Input() IsHidden = false;  // Parent sets based on route
}
```

### Explorer Components MUST Use NavigationService

Components in `packages/Angular/Explorer/` that need routing **MUST** use `NavigationService` from `@memberjunction/ng-explorer-core` — never `Router` directly. `NavigationService` encapsulates all routing logic for consistency and the ability to change routing strategy without touching individual components.

The only exception is `MJExplorerAppComponent` which subscribes to `Router.events` to drive top-level state like the chat overlay visibility.

---

## 🚨 NPM Workspace and Peer Dependencies (For Downstream Projects)

### Shared Singleton Services Pattern

MemberJunction Angular packages use **peer dependencies** for shared singleton services to ensure proper npm deduplication in workspace monorepos. This prevents the "No provider found for MJAuthBase" error caused by multiple copies of `@memberjunction/ng-auth-services` being installed in nested `node_modules` directories.

### Key Peer Dependencies

The following packages are declared as peer dependencies and must be provided by the consuming application:

- `@memberjunction/global` - Core MJ global utilities
- `@memberjunction/core` - Core MJ metadata and entity system
- `@memberjunction/ng-auth-services` - Authentication services (MJAuthBase)

### For Downstream Projects Using MJ Packages

If you're building an application that uses MJ Angular packages in an npm workspace monorepo, you **MUST** declare these packages as direct dependencies in your **root** `package.json`:

```json
{
  "dependencies": {
    "@memberjunction/global": "^4.2.0",
    "@memberjunction/core": "^4.2.0",
    "@memberjunction/ng-auth-services": "^4.2.0"
  }
}
```

This ensures npm hoists these packages to the root `node_modules` where all workspace packages can share them.

### Why This Matters

Without proper hoisting, npm may create nested copies:
```
node_modules/@memberjunction/ng-bootstrap/node_modules/@memberjunction/ng-auth-services
node_modules/@memberjunction/ng-explorer-core/node_modules/@memberjunction/ng-auth-services
```

This causes Angular's dependency injection to fail because the `MJAuthBase` token from `AuthServicesModule.forRoot()` comes from a different module instance than what `APP_INITIALIZER` tries to inject.

### Verification

Run `npm ls @memberjunction/ng-auth-services` to verify only one copy exists at the root level:
```bash
# GOOD - single copy at root
your-project@1.0.0
└── @memberjunction/ng-auth-services@4.2.0

# BAD - nested copies (will cause DI errors)
your-project@1.0.0
├─┬ @memberjunction/ng-bootstrap@4.2.0
│ └── @memberjunction/ng-auth-services@4.2.0
└─┬ @memberjunction/ng-explorer-core@4.2.0
  └── @memberjunction/ng-auth-services@4.2.0
```

---

## 📚 Dashboard Development Guide

**IMPORTANT**: When building dashboards in MemberJunction, always refer to the comprehensive guide at **[/guides/DASHBOARD_BEST_PRACTICES.md](/guides/DASHBOARD_BEST_PRACTICES.md)**.

This guide covers:
- Architecture patterns (no Angular data services - use MJ Engine classes)
- Naming conventions (PascalCase for public, camelCase for private)
- Navigation patterns within dashboards (left panel, not top nav)
- Getter/setter state management pattern
- User preferences via UserInfoEngine
- Data loading patterns with RunView and local caching
- Layout patterns using CSS Flexbox/Grid
- Permission checking patterns
- Creating new Engine classes for domain logic

**Read this guide before starting any dashboard work** to ensure consistency with established patterns.

---

## Angular Component & Module Strategy

See the root [CLAUDE.md](../../CLAUDE.md) rule #4 for the full policy. Summary:

- **Standalone components are allowed and preferred for new leaf components** (dialogs, panels, widgets, lazy-loaded routes)
- **NgModules are still used for feature modules** grouping many related components
- **Follow the existing pattern** in whichever package you're working in
- **Use `standalone: false` explicitly** for NgModule-declared components (Angular 21 defaults to standalone)
- **Use `@if`/`@for`/`@switch`** block syntax for all new templates (not `*ngIf`/`*ngFor`)
- **Use `inject()` function** for DI in new components (not constructor injection)

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

## 🚨 CRITICAL: Input Change Detection Pattern 🚨

### Use Setter Properties Instead of ngOnChanges/ngDoCheck

**NEVER use `ngOnChanges` or `ngDoCheck` for detecting @Input changes.** Instead, use getter/setter properties which are cleaner, more explicit, and more efficient.

#### Why Setters Are Better
- **Explicit Control**: You know exactly when and why code runs
- **Efficient**: Only runs when the specific property changes, not on every change detection cycle
- **Clean**: No need to check `SimpleChanges` objects or property names as strings
- **Type-Safe**: Full TypeScript support without string-based property lookups
- **Testable**: Easier to unit test individual property changes

#### ❌ DON'T: Use ngOnChanges
```typescript
// BAD: Using ngOnChanges
export class MyComponent implements OnChanges {
  @Input() conversationId: string | null = null;
  @Input() userId: string | null = null;

  ngOnChanges(changes: SimpleChanges) {
    // Messy: checking string property names, dealing with SimpleChanges objects
    if (changes['conversationId'] && !changes['conversationId'].firstChange) {
      this.onConversationChanged(changes['conversationId'].currentValue);
    }
    if (changes['userId']) {
      this.onUserChanged(changes['userId'].currentValue);
    }
  }
}
```

#### ✅ DO: Use Setter Properties
```typescript
// GOOD: Using setter properties
export class MyComponent implements OnInit, OnDestroy {
  private _conversationId: string | null = null;
  private _userId: string | null = null;
  private isInitialized = false;

  @Input()
  set conversationId(value: string | null) {
    if (value !== this._conversationId) {
      const oldValue = this._conversationId;
      this._conversationId = value;
      // Only react to changes after initialization, and when there was a previous value
      if (this.isInitialized && oldValue !== null) {
        this.onConversationChanged(value);
      }
    }
  }
  get conversationId(): string | null {
    return this._conversationId;
  }

  @Input()
  set userId(value: string | null) {
    if (value !== this._userId) {
      this._userId = value;
      if (this.isInitialized) {
        this.onUserChanged(value);
      }
    }
  }
  get userId(): string | null {
    return this._userId;
  }

  ngOnInit() {
    this.isInitialized = true;
    // Initial setup with current values...
  }
}
```

#### Key Pattern Details
1. **Private backing field**: Store the actual value in `_propertyName`
2. **Change detection in setter**: Compare new value with old before reacting
3. **Initialization flag**: Use `isInitialized` to avoid reacting during initial binding
4. **Old value tracking**: Store `oldValue` before updating if you need it for comparison
5. **Getter for access**: Always provide a getter for template and code access

## Component State Management Architecture

### Services for Shared Data, Components for Local State

**CRITICAL PATTERN**: Use services for shared/cached data and cross-component coordination, but components should manage their own selection state and local UI state through @Input/@Output.

#### Why This Pattern Matters
- **Multiple Instances**: Components can be instantiated multiple times - singleton services cause state collision
- **Encapsulation**: Parent components orchestrate state, children receive it via inputs
- **Predictability**: Data flows down (inputs), events flow up (outputs)
- **Testability**: Components are easier to test in isolation
- **Reusability**: Components work in any context when they don't depend on global state

#### ❌ DON'T: Use Singleton Services for Selection State
```typescript
// BAD: Service managing UI selection state
@Injectable({ providedIn: 'root' })
export class ConversationStateService {
  activeConversationId: string | null = null;  // Global state - breaks with multiple instances
  activeThreadId: string | null = null;
  isNewUnsavedConversation = false;
}

// Component directly reading from service
export class ChatAreaComponent {
  constructor(private conversationState: ConversationStateService) {}

  get conversation() {
    // Direct coupling to global state
    return this.conversationState.activeConversation;
  }
}
```

#### ✅ DO: Use Services for Data, Inputs for State
```typescript
// GOOD: Service for shared DATA only (caching, loading)
@Injectable({ providedIn: 'root' })
export class ConversationDataService {
  private conversationsCache = new Map<string, ConversationEntity>();

  async loadConversation(id: string): Promise<ConversationEntity> {
    // Handles caching, API calls, etc.
  }

  async saveConversation(conversation: ConversationEntity): Promise<boolean> {
    // Handles persistence
  }
}

// GOOD: Component receives state through inputs
export class ChatAreaComponent {
  @Input() conversationId: string | null = null;
  @Input() conversation: ConversationEntity | null = null;
  @Input() threadId: string | null = null;
  @Input() isNewConversation = false;

  @Output() conversationCreated = new EventEmitter<ConversationEntity>();
  @Output() threadOpened = new EventEmitter<string>();
  @Output() threadClosed = new EventEmitter<void>();

  constructor(private conversationData: ConversationDataService) {}

  async onMessageSent(message: string) {
    // Use data service for persistence
    const saved = await this.conversationData.saveConversation(this.conversation);
    // Emit events for parent to handle state changes
    this.conversationCreated.emit(newConversation);
  }
}

// GOOD: Parent component orchestrates state
export class WorkspaceComponent {
  selectedConversationId: string | null = null;
  selectedConversation: ConversationEntity | null = null;
  selectedThreadId: string | null = null;
  isNewUnsavedConversation = false;

  onConversationSelected(id: string) {
    this.selectedConversationId = id;
    // Load conversation, update state...
  }

  onConversationCreated(conversation: ConversationEntity) {
    this.selectedConversation = conversation;
    this.isNewUnsavedConversation = false;
  }
}
```

```html
<!-- Parent template passing state down -->
<mj-conversation-chat-area
  [conversationId]="selectedConversationId"
  [conversation]="selectedConversation"
  [threadId]="selectedThreadId"
  [isNewConversation]="isNewUnsavedConversation"
  (conversationCreated)="onConversationCreated($event)"
  (threadOpened)="onThreadOpened($event)"
  (threadClosed)="onThreadClosed()">
</mj-conversation-chat-area>
```

#### When to Use Services vs Inputs

| Use Services For | Use Inputs/Outputs For |
|-----------------|------------------------|
| Data caching (conversations, users) | Which item is currently selected |
| API communication | UI mode (editing, viewing, creating) |
| Cross-cutting concerns (auth, logging) | Component-specific configuration |
| Shared data that multiple components need | Parent-to-child state passing |
| Heavy computations that should be cached | Events that flow from child to parent |

#### Benefits of This Architecture
1. **No Race Conditions**: Each component instance has its own state via inputs
2. **Clear Data Flow**: Easy to trace where state comes from and how it changes
3. **Proper Encapsulation**: Components don't reach into global state
4. **Framework Alignment**: Works with Angular's change detection naturally
5. **Multiple Instance Support**: Same component can be used multiple times without conflict

## 🚨 CRITICAL: Creating Custom Entity Forms 🚨

### Overview
MemberJunction uses `@RegisterClass` to allow custom forms to override generated forms. When a user opens an entity record, the system looks for the highest-priority registered form for that entity.

### The Pattern: Extend the Generated Form

**CRITICAL**: To ensure your custom form takes priority over the generated form, you MUST:
1. **Extend the generated form class** (not `BaseFormComponent` directly)
2. **Use `@RegisterClass(BaseFormComponent, 'Entity Name')`** with the exact entity name
3. **Name your class with `Extended` suffix** (convention)

#### Why Extend the Generated Form?
The `@RegisterClass` system uses registration order to determine priority. Since:
- Generated forms are compiled first (they're in `generated/` folder)
- Custom forms import and extend generated forms (creating a dependency)
- The custom form registers AFTER the generated form it extends

This means the custom form automatically has higher priority and will be used instead of the generated form.

### ❌ DON'T: Extend BaseFormComponent Directly
```typescript
// BAD: Extending BaseFormComponent directly may not ensure priority
@RegisterClass(BaseFormComponent, 'Entities')
@Component({...})
export class EntityFormComponent extends BaseFormComponent {
    // This might not take priority over the generated form!
}
```

### ✅ DO: Extend the Generated Form
```typescript
// GOOD: Extend the generated form to ensure priority
import { EntityFormComponent } from '../../generated/Entities/Entity/entity.form.component';

@RegisterClass(BaseFormComponent, 'Entities')
@Component({
    selector: 'mj-entity-form',
    templateUrl: './entity-form.component.html',
    styleUrls: ['./entity-form.component.css']
})
export class EntityFormComponentExtended extends EntityFormComponent implements OnInit, OnDestroy {
    // Your custom implementation
    public record!: EntityEntity;  // Strongly typed record

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        // Your custom initialization
    }
}

export function LoadEntityFormComponentExtended() {
    // Prevents tree-shaking
}
```

### Complete Custom Form Checklist

1. **Create component files** in `core-entity-forms/src/lib/custom/YourEntity/`:
   - `your-entity-form.component.ts`
   - `your-entity-form.component.html`
   - `your-entity-form.component.css`

2. **Import the generated form**:
   ```typescript
   import { YourEntityFormComponent } from '../../generated/Entities/YourEntity/yourentity.form.component';
   ```

3. **Extend the generated form with RegisterClass**:
   ```typescript
   @RegisterClass(BaseFormComponent, 'Your Entity Name')  // Exact entity name from metadata
   @Component({...})
   export class YourEntityFormComponentExtended extends YourEntityFormComponent {
   ```

4. **Add tree-shaking prevention function**:
   ```typescript
   export function LoadYourEntityFormComponentExtended() {
       // Prevents tree-shaking
   }
   ```

5. **Register in custom-forms.module.ts**:
   ```typescript
   // Import
   import { YourEntityFormComponentExtended, LoadYourEntityFormComponentExtended } from "./YourEntity/your-entity-form.component";

   // Add to declarations and exports arrays
   declarations: [YourEntityFormComponentExtended, ...],
   exports: [YourEntityFormComponentExtended, ...],

   // Call loader in LoadCoreCustomForms()
   export function LoadCoreCustomForms() {
       LoadYourEntityFormComponentExtended();
       // ... other loaders
   }
   ```

### Finding Entity Names
Entity names for `@RegisterClass` must match exactly. Find them in:
- `/packages/MJCoreEntities/src/generated/entity_subclasses.ts` - look at `@RegisterClass` decorator JSDoc comments
- Example: `AIAgentEntity` → `"AI Agents"`, `EntityEntity` → `"Entities"`

### Existing Custom Forms (Examples)
Look at these for reference:
- `AIAgentFormComponentExtended` - extends `AIAgentFormComponent`
- `AIPromptFormComponentExtended` - extends `AIPromptFormComponent`
- `EntityFormComponentExtended` - extends `EntityFormComponent`
- `ActionFormComponentExtended` - extends `ActionFormComponent`
- `ContentSourceFormComponentExtended` - clean reference for the toolbar pattern below

### 🚨 Toolbar Pattern: Use `<mj-record-form-container>`, NOT `<mj-form-toolbar>` directly

For entity forms, **always wrap your content in `<mj-record-form-container>`** rather than dropping in `<mj-form-toolbar>` yourself. The container owns the toolbar AND the panels that the toolbar's buttons open (Record Changes, Add to List, Tags). A raw toolbar only emits events — if nothing wires them up, those features silently break (buttons appear but do nothing).

#### ✅ DO — wrap in the container
```html
@if (record) {
<mj-record-form-container [Record]="record" [FormComponent]="this"
    (Navigate)="OnFormNavigate($event)"
    (DeleteRequested)="OnDeleteRequested()"
    (FavoriteToggled)="OnFavoriteToggled()"
    (HistoryRequested)="OnHistoryRequested()"
    (ListManagementRequested)="OnListManagementRequested()">

    <!-- Your form content — panels, sections, etc. -->

</mj-record-form-container>
}
```

All five handlers (`OnFormNavigate`, `OnDeleteRequested`, `OnFavoriteToggled`, `OnHistoryRequested`, `OnListManagementRequested`) already exist on `BaseFormComponent` — you do not need to implement them.

#### ❌ DON'T — use the raw toolbar for entity forms
```html
<!-- History / Tags / Add-to-List buttons render but do nothing -->
<mj-form-toolbar [Form]="this"></mj-form-toolbar>
```

#### When it's OK to use `<mj-form-toolbar>` directly
Lightweight scenarios where you genuinely don't need Record Changes / Tags / Lists — for example a modal dialog, an embedded widget, or a purpose-built editor. For anything opened from the Explorer's entity-navigation path, use the container.

#### Reference
The canonical working example is `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ContentSources/content-source-form.component.html`. The generated forms under `core-entity-forms/src/lib/generated/` also all follow this pattern — your custom form should too.

---

## ClassFactory Registration Priority

The `@RegisterClass` decorator and `MJGlobal.ClassFactory` are the backbone of MemberJunction's runtime component discovery. Understanding how priority works is essential for custom forms, custom resource components, and entity class overrides.

### How Registrations Are Stored

ClassFactory stores all registrations in an **append-only array** — not a map. When multiple classes register for the same base class + key, **all registrations are kept**. Nothing is replaced or deduplicated.

### Priority Assignment

When `@RegisterClass` is called with the default priority of `0` (which is almost always), priority is **auto-incremented**:

```
Register(BaseEntity, UserEntity, "Users", priority=0)           → assigned priority 1
Register(BaseEntity, UserEntityCustom, "Users", priority=0)     → assigned priority 2
Register(BaseEntity, UserEntityCustomV2, "Users", priority=0)   → assigned priority 3
```

The logic: find the current max priority for this base class + key pair, then set `priority = max + 1`. This means **the last class to register automatically wins**.

### How GetRegistration Picks a Winner

When code calls `ClassFactory.GetRegistration(baseClass, key)`:

1. Filter all registrations matching `baseClass` + `key` (case-insensitive, whitespace-trimmed)
2. Find the highest priority number among matches
3. If multiple registrations share the highest priority, return the **last one registered** (array insertion order)

### Why Import Order Matters

Since decorators execute when their module is imported, and auto-priority increments based on registration order, **the order in which modules are imported determines which class wins**.

This is why the custom form pattern works:
1. The generated form's module is imported first (it's a dependency of the custom form)
2. Generated form registers → gets priority N
3. Custom form registers → gets priority N+1 (auto-incremented)
4. Custom form wins

And it's why manifests are imported in a specific order in `app.module.ts`:
1. `@memberjunction/ng-bootstrap-lite` imports first (framework classes)
2. Local supplemental manifest imports second (user custom classes)
3. User classes get higher auto-priorities, overriding framework defaults

### Explicit Priority

You can pass an explicit priority to `@RegisterClass`:

```typescript
@RegisterClass(BaseEntity, 'Users', 999)  // Explicit priority 999
export class UserEntityOverride extends UserEntity { }
```

If two registrations share the same explicit priority, a console warning is emitted and the **last registered** wins. Explicit priorities are rarely needed — auto-increment handles the vast majority of cases correctly.

### Implications for Lazy Loading

Before a lazy chunk loads, the ClassFactory has **no registration** for classes in that chunk — `GetRegistration()` returns `null`. After the dynamic `import()` pulls in the feature module, decorators execute, registrations appear, and a retry succeeds. No priority conflicts occur because the eager `ng-bootstrap-lite` manifest intentionally excludes lazy-loaded packages.

### Quick Reference

| Scenario | Winner |
|----------|--------|
| Different auto-assigned priorities | Highest number (last registered) |
| Same explicit priority | Last registered + console warning |
| No registration found | `CreateInstance` falls back to instantiating the base class directly |
| Lazy module not yet loaded | `GetRegistration` returns `null` → triggers lazy load → retry succeeds |