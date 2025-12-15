# Angular Development Guidelines

## 🚨 CRITICAL: NO STANDALONE COMPONENTS 🚨
- **NEVER create standalone Angular components** - ALL components MUST be part of NgModules
- **ALWAYS** use `@NgModule` with `declarations`, `imports`, and `exports`
- **Why**: Standalone components cause style encapsulation issues, ::ng-deep doesn't work properly, and they bypass Angular's module system
- When creating new components:
  - Create or add to an NgModule
  - Declare component in the module's `declarations` array
  - Import `CommonModule` and other required modules in the module's `imports` array
  - Export the component in the module's `exports` array if it needs to be used outside the module
- **Remove** `standalone: true` and `imports: [...]` from ALL `@Component` decorators
- This is **non-negotiable** - standalone components are strictly forbidden

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