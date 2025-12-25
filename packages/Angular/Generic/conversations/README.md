# @memberjunction/ng-conversations

Angular package for conversation, collection, and artifact management built on MemberJunction.

## Status: Foundation Complete ✅

This package provides the core infrastructure for building Slack-style conversation interfaces with artifacts and collections. The initial implementation includes:

### ✅ Completed

#### Core Services
- **ConversationDataService** - CRUD operations for conversations with reactive state
- **MessageDataService** - Message management with caching
- **ArtifactDataService** - Artifact and version management
- **ProjectDataService** - Project organization
- **CollectionDataService** - Collection and artifact organization
- **ConversationStateService** - Reactive state management for conversations
- **ArtifactStateService** - Reactive state management for artifacts

#### Components
- **MessageItemComponent** - Individual message display with dynamic rendering
- **MessageListComponent** - Efficient message list using ViewContainerRef.createComponent()

#### Models
- TypeScript interfaces for all state management types
- Union types for navigation tabs, layouts, and view modes

### 🎯 Key Features

1. **Performance Optimized**
   - Uses dynamic component creation (ViewContainerRef.createComponent) instead of Angular template binding
   - Follows the proven pattern from @memberjunction/ng-skip-chat
   - Dramatically reduces render cycles and improves performance

2. **MJ Entity Integration**
   - All services use Metadata.GetEntityObject() pattern
   - RunView for efficient data loading
   - Proper type safety with generic methods

3. **Reactive State Management**
   - RxJS BehaviorSubjects for all state
   - Derived observables using combineLatest
   - shareReplay(1) for efficient caching

4. **Proper User Context**
   - All server-side operations include contextUser parameter
   - Follows MJ security patterns

### 📦 Installation

This package is part of the MemberJunction monorepo. It's installed via npm workspaces:

```bash
# From repo root
npm install
```

### 🔧 Usage Example

```typescript
import {
  ConversationDataService,
  MessageDataService,
  ConversationStateService,
  MessageListComponent
} from '@memberjunction/ng-conversations';

// In your component
constructor(
  private conversationData: ConversationDataService,
  private conversationState: ConversationStateService,
  private currentUser: UserInfo
) {}

async ngOnInit() {
  // Load conversations
  const conversations = await this.conversationData.loadConversations(
    environmentId,
    this.currentUser
  );

  // Set active conversation
  this.conversationState.setActiveConversation(conversations[0].ID);

  // Subscribe to state changes
  this.conversationState.activeConversation$.subscribe(conv => {
    console.log('Active conversation changed:', conv);
  });
}
```

### 📁 Package Structure

```
src/
├── lib/
│   ├── components/
│   │   └── message/                  # Message display components
│   │       ├── message-item.component.ts
│   │       ├── message-item.component.html
│   │       ├── message-item.component.css
│   │       ├── message-list.component.ts
│   │       ├── message-list.component.html
│   │       └── message-list.component.css
│   ├── services/
│   │   ├── conversation-data.service.ts      # Conversation CRUD
│   │   ├── message-data.service.ts           # Message CRUD
│   │   ├── artifact-data.service.ts          # Artifact & versions
│   │   ├── project-data.service.ts           # Project management
│   │   ├── collection-data.service.ts        # Collections
│   │   ├── conversation-state.service.ts     # Conversation state
│   │   └── artifact-state.service.ts         # Artifact state
│   ├── models/
│   │   └── conversation-state.model.ts       # TypeScript interfaces
│   └── conversations.module.ts
└── public-api.ts
```

### 🚀 Next Steps

To complete the full implementation as per the prototype:

1. **Layout Components**
   - ConversationWorkspaceComponent (3-column layout)
   - ConversationNavigationComponent (top nav bar)
   - ConversationSidebarComponent (left sidebar with tabs)

2. **Conversation Components**
   - ConversationListComponent (with grouping/filtering)
   - ConversationItemComponent (list item with badges)
   - ConversationChatAreaComponent (main chat interface)
   - MessageInputComponent (rich text input)

3. **Artifact Components**
   - ArtifactPanelComponent (right panel)
   - ArtifactViewerComponent (type-specific rendering)
   - ArtifactEditorComponent (edit mode)
   - ArtifactVersionHistoryComponent (version timeline)
   - ArtifactShareModalComponent (sharing UI)

4. **Collection Components**
   - CollectionTreeComponent (hierarchical tree)
   - CollectionViewComponent (grid/list view)
   - CollectionModalComponent (management UI)

5. **Project & Task Components**
   - ProjectListComponent
   - ProjectSelectorComponent
   - TaskListComponent
   - TaskItemComponent
   - AgentProcessPanelComponent (floating panel)

6. **Explorer Integration**
   - Add `/chat` route to explorer-core
   - Create wrapper components
   - Integrate with Explorer navigation

### 🧪 Testing

```bash
# Compile the package
cd packages/Angular/Generic/conversations
npm run build

# Run from repo root
npm run build:conversations
```

### 📝 Notes

- **No Commits**: This code has NOT been committed. Review required before committing.
- **Dynamic Rendering**: The message components use ViewContainerRef.createComponent() to avoid Angular binding overhead - this is CRITICAL for performance.
- **Type Safety**: All services use proper MJ entity types and generic methods.
- **Caching**: Message data is cached per conversation to minimize database hits.

### 🔗 Dependencies

- @memberjunction/core ^2.101.0
- @memberjunction/core-entities ^2.101.0
- @memberjunction/global ^2.101.0
- @memberjunction/graphql-dataprovider ^2.101.0
- @memberjunction/ng-base-types ^2.101.0
- @progress/kendo-angular-* ^16.2.0
- @angular/* ^18.0.2
- @memberjunction/ng-markdown ^2.125.0
- marked ^9.1.6

### 📚 References

- Implementation Plan: See comprehensive plan created during initial analysis
- Prototype: `/v3_conversations/slack-style-agent-chat-v22.html`
- Entity Schema: `/v3_conversations/schema.sql`
- Skip Chat Pattern: `packages/Angular/Generic/skip-chat/`

---

**Built with MemberJunction** | Version 2.101.0