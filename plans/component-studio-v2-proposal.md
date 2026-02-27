# Component Studio v2 - Product Proposal

## Executive Summary

Transform Component Studio from a developer test bench into a **first-class AI-powered component development platform** - a "VS Code for MJ Components" where developers can create, iterate, test, and publish interactive components with AI as a co-pilot, backed by conversation-driven history and artifact versioning.

---

## Current State Assessment

### What Works
- Component browsing with filters, search, categories, favorites
- Import from file/text/artifact, export to file/artifact/clipboard
- Spec editor (JSON) and code editor (JS/React) with syntax highlighting
- Live React component preview via `mj-react-component`
- Error display with technical details

### Key Pain Points
1. **No AI integration** - Editing specs/code is 100% manual
2. **Import/Export is buried** - Dropdown menus are hard to discover; the UX isn't intuitive
3. **Splitter is wonky** - Nested horizontal Kendo splitters fight each other; the details pane collapse is jarring
4. **No guided creation flow** - Can't create a component from scratch within the Studio
5. **No conversation history** - Edits are in-memory only; no undo, no history, no reasoning trail
6. **Raw JSON editing** - Spec editing is a raw JSON blob - intimidating and error-prone
7. **No model selection** - No way for users to pick which AI model to use
8. **Monolithic component** - 1,480 lines of TS, everything in one file
9. **No collaboration** - No way to share work-in-progress or get feedback

---

## Proposed Architecture

### Layout: Three-Panel Design

```
+------------------+---------------------------+----------------------+
|                  |                           |                      |
|  Component       |     Preview / Canvas      |   AI Assistant       |
|  Browser         |                           |   (Chat Panel)       |
|                  |                           |                      |
|  - Search        |  +---------------------+  |  - Conversation      |
|  - Filters       |  |                     |  |  - Model selector    |
|  - Component     |  |  Live React         |  |  - Permission req.   |
|    cards         |  |  Component          |  |  - Spec suggestions  |
|  - "New" button  |  |  Preview            |  |  - Code generation   |
|                  |  |                     |  |  - Error diagnosis   |
|                  |  +---------------------+  |                      |
|                  |                           |                      |
|                  |  +---------------------+  |                      |
|                  |  |  Spec / Code /      |  |                      |
|                  |  |  Requirements /     |  |                      |
|                  |  |  Data tabs          |  |                      |
|                  |  +---------------------+  |                      |
|                  |                           |                      |
+------------------+---------------------------+----------------------+
     ~300px              flexible                    ~400px
                                              (collapsible right)
```

**Why three panels:**
- Left panel stays as the component browser (familiar)
- Center panel is the **workspace** - preview on top, structured editors below (vertical split)
- Right panel is the **AI Assistant** - always available, contextual, conversation-backed

The right AI panel can collapse to give more space to the workspace. The bottom editor section in the center uses **tabs** (not a second splitter) to switch between Spec, Code, Requirements, Data, and Design views.

### Panel 1: Component Browser (Left)

**Improvements over current:**
- **"+ New Component" button** at top - opens a creation wizard or starts an AI conversation
- **Component cards** - cleaner, denser layout with thumbnail previews (screenshot of last successful render, stored as base64)
- **Drag-and-drop reorder** for favorites
- **Context menu** on right-click: Duplicate, Export, Delete, View History
- **Status indicators** - green dot for running, amber for errors
- **Grouping toggle** - group by namespace/type or flat list

### Panel 2: Workspace (Center)

#### Top: Live Preview Canvas
- Full-width React component preview
- **Toolbar**: Run/Stop, Refresh, Viewport size selector (mobile/tablet/desktop), Dark/Light mode toggle, Screenshot capture
- **Error overlay** inline (not replacing the component) with "Ask AI to fix" button
- **Performance metrics** - render time, re-render count (dev tools style)

#### Bottom: Structured Editor Tabs

**Tab 1: Specification** (replaces raw JSON)
- **Visual Form Mode** (default): Structured form with fields for name, title, description, type, version, namespace
- **JSON Mode** (toggle): Raw JSON editor for power users
- Toggle button in tab header: "Form | JSON"
- Form fields use appropriate Kendo controls (dropdowns for type, text areas for descriptions)

**Tab 2: Functional Requirements**
- Markdown editor with preview toggle
- Content from `spec.functionalRequirements`
- AI can populate this from a natural language description

**Tab 3: Data Requirements**
- Visual entity/query browser
- Shows entities with their fields, filters, sort orders
- "Add Entity" / "Add Query" buttons
- Entity field selector with autocomplete from metadata
- Content from `spec.dataRequirements`

**Tab 4: Technical Design**
- Markdown editor with Mermaid diagram support
- Content from `spec.technicalDesign`
- AI can generate architecture diagrams

**Tab 5: Code**
- Main component code editor
- Dependency panel bar (existing pattern, keep it)
- **Diff view** toggle - show changes since last save
- **Run on save** option

**Tab 6: Dependencies**
- Visual dependency tree
- Add/remove/edit sub-component specs
- Each dependency is a mini-spec editor

### Panel 3: AI Assistant (Right)

This is the centerpiece innovation. A dedicated AI chat panel for component development.

#### Core Features

**Model Selector (top of panel):**
- Dropdown showing available AI models from the user's system
- Populated from `AI Models` entity, filtered by active status and user access
- Shows model name, provider, and cost indicator
- User can switch models mid-conversation
- Default: system's highest-priority model for the configured prompt

**Conversation Thread:**
- Full chat interface (messages, streaming responses)
- Messages rendered as markdown with syntax highlighting for code blocks
- Each component session creates a new `Conversation` entity (type: "ComponentStudio")
- All messages stored as `ConversationDetail` records
- Conversation history persists across sessions - reopen a component, see your history

**Permission-Based Actions (Claude Code pattern):**
When the AI wants to make changes, it proposes them and the user approves:

```
AI: "I'll update the functional requirements and modify the
     data requirements to add the 'Invoices' entity. Here's
     what I'll change:"

     [Spec Changes]
     - Add "Invoices" to dataRequirements.entities
     - Add fields: ID, Amount, Status, CreatedAt
     - Add filter: Status = 'Active'

     [Code Changes]
     - Add useEffect to fetch invoice data
     - Add InvoiceTable component

     [Apply Changes]  [Show Diff]  [Reject]
```

When user clicks "Apply Changes":
1. AI's proposed changes are merged into the spec
2. The preview auto-refreshes
3. The conversation records the change with reasoning
4. Working state is held in memory (no automatic version creation)

**Contextual Awareness:**
The AI always has access to:
- Current component spec (all layers)
- Current code
- Current errors (if any)
- Available entities and their fields (from metadata)
- Component type context (dashboard vs report vs form)
- Previous conversation history for this component

**Smart Prompts / Quick Actions:**
Buttons above the chat input for common operations:
- "Create from description" - describe what you want, AI builds the spec
- "Fix errors" - sends current errors to AI for diagnosis
- "Improve code" - AI reviews and suggests improvements
- "Add data source" - guided entity/query addition
- "Change styling" - AI modifies CSS/styling
- "Explain this component" - AI describes what the component does

**Error Integration:**
When a component throws an error:
1. Error details automatically appear in the chat as a system message
2. AI analyzes the error and suggests fixes
3. User can approve the fix with one click
4. Component re-renders automatically

---

## AI Architecture: Agent-Based

Create a `ComponentStudioAgent` using MJ's BaseAgent framework:

```
ComponentStudioAgent (LoopAgentType)
├── System Prompt: Component development expert
├── Child Prompts:
│   ├── SpecDesigner - Designs functional requirements
│   ├── DataArchitect - Configures data requirements
│   ├── CodeGenerator - Writes React component code
│   └── ErrorDiagnoser - Analyzes runtime errors
├── Actions Available:
│   ├── UpdateComponentSpec - Modifies spec layers
│   ├── RunComponent - Triggers preview refresh
│   ├── SearchEntities - Finds available entities/fields
│   └── ValidateSpec - Validates spec structure
└── Conversation: Stored in MJ conversation system
```

**Why Agent:**
- Agents support multi-turn conversations natively
- Agent runs are tracked with full audit trail (`AIAgentRun`, `AIAgentRunStep`)
- Agents can invoke actions (search entities, validate specs)
- Agents support sub-agent delegation (spec design vs code generation)
- LoopAgentType naturally fits the iterative conversation pattern
- Context compression handles long conversations automatically

**Agent Configuration (Database):**
- `AIAgent` record: "Component Studio Assistant"
- `AIAgentType`: LoopAgentType (iterative conversation)
- System prompt stored in `AIPrompt` entity
- Model selection via `AIPromptModel` configuration
- Actions registered via `AIAgentAction`

**System Prompt Strategy:**
The agent's system prompt should include:
1. Component spec schema documentation
2. Available React component patterns
3. MJ data access patterns (RunView, entity fields)
4. Styling best practices
5. Error diagnosis knowledge
6. Instructions to always propose changes before applying

---

## Versioning Model: Explicit User-Triggered (Git-Style)

Versions are **not** created automatically on every edit or AI change. Instead, versions work like git commits - the user explicitly decides when to snapshot.

### Working State vs. Saved Versions

**Working State (in-memory):**
- All edits (manual or AI-applied) modify the in-memory spec
- Preview updates live from working state
- No database writes until user saves
- "Unsaved changes" indicator in the UI (dot on Save button, asterisk in title)

**Explicit Save = New Version:**
- User clicks "Save Version" button (or Ctrl+S)
- Prompted for an optional version comment (like a commit message)
- Creates a new `ConversationArtifactVersion` with:
  - Full spec snapshot in `Content`
  - User's comment in `UserComments`
  - Auto-incremented version number
- Toast notification: "Saved as v5"

**Version History Panel:**
- Accessible from toolbar or tab
- Shows timeline of saved versions with:
  - Version number
  - Timestamp
  - User comment
  - "Restore" and "Diff" buttons
- Can diff any two versions side-by-side
- "Restore to v3" creates a NEW version (v6) with v3's content (non-destructive)

**Benefits over auto-versioning:**
- No version explosion from rapid iteration
- Each version has a meaningful comment/reason
- Matches developer mental model (git commit)
- Database stays clean
- User controls the history granularity

---

## Import/Export Redesign

### Current Problems
- Import/Export are dropdown menus in the header - easy to miss
- Three separate import dialogs with inconsistent UX
- Export to artifact dialog is complex and confusing

### Proposed Design

**Toolbar Integration:**
- Import/Export get dedicated toolbar buttons with clear icons
- Import: Single dialog with tabs (File | Artifact | Text | URL)
- Export: Single dialog with tabs (File | Artifact | Clipboard | Publish)

**Publish Flow (New):**
- "Publish" is distinct from "Export to Artifact"
- Publish updates the `MJ: Components` database record
- Includes version bump, changelog entry, and status update
- Requires confirmation with change summary

**Quick Save (Ctrl+S / Cmd+S):**
- Saves current state as a new artifact version
- Prompts for optional version comment
- Toast notification: "Saved as version 5"

### Full Version Export (New)

Export a complete component package as a directory structure:

```
MyComponent/
├── README.md                    # Master document
├── current/
│   └── spec.json                # Latest version spec
├── versions/
│   ├── v1/
│   │   ├── spec.json
│   │   └── metadata.json        # { version, timestamp, comment, author }
│   ├── v2/
│   │   ├── spec.json
│   │   └── metadata.json
│   └── v3/
│       ├── spec.json
│       └── metadata.json
└── conversation/
    └── history.json             # Full conversation history (optional)
```

**README.md contents:**
- Component name, description, type
- Current version info
- Version history table (version | date | author | comment)
- Data requirements summary (entities used, queries)
- Functional requirements (from spec)
- Technical design notes (from spec)
- Auto-generated from spec metadata

**Export options dialog:**
- Export current version only (single JSON file, like today)
- Export all versions (full directory as ZIP)
- Export specific versions (checkboxes)
- Include conversation history (checkbox)
- Include README (checkbox, default on)

**Import from directory:**
- Can import a previously exported directory/ZIP
- Restores all versions and optionally conversation history
- Useful for sharing components between environments or teams

---

## Create New Component Flow

### From Scratch (Manual)
1. Click "+ New Component" in browser panel
2. Choose component type (Dashboard, Report, Form, Chart, etc.)
3. Fill in basic info: name, description, namespace
4. Studio creates empty spec with template code
5. User edits spec/code manually or with AI assistance

### From Description (AI-Powered)
1. Click "+ New Component" → "Create with AI"
2. Text area: "Describe what you want this component to do"
3. AI generates:
   - Functional requirements
   - Data requirements (with real entity/field suggestions from metadata)
   - Technical design
   - Initial code
4. User reviews each layer, can ask AI to adjust
5. Component auto-runs in preview

### From Existing (Clone/Fork)
1. Right-click component → "Duplicate"
2. Creates copy with "(Copy)" suffix
3. Opens in editor for modification

---

## Technical Implementation Plan

### Phase 1: Foundation, UX Overhaul & AI Agent

**Refactor & Layout:**
- Refactor monolithic component into sub-components:
  - `ComponentBrowserComponent` (left panel)
  - `ComponentWorkspaceComponent` (center panel)
  - `ComponentPreviewComponent` (preview canvas)
  - `SpecEditorComponent` (structured spec editor with form/JSON toggle)
  - `CodeEditorPanelComponent` (code editing with sections)
  - `RequirementsEditorComponent` (markdown editor for requirements)
  - `DataRequirementsEditorComponent` (visual entity/query editor)
- Replace nested horizontal Kendo splitters with a proper three-panel layout
- Add structured spec editing (form mode alongside JSON mode)
- Add viewport size selector for preview
- Keyboard shortcuts (Ctrl+S save, Ctrl+R refresh)
- Add "+ New Component" creation flow (manual + AI-powered)
- Shared state service for cross-component communication

**AI Agent Integration:**
- Add right panel AI chat UI (`AIAssistantPanelComponent`)
- Model selector populated from `AI Models` entity
- Create `ComponentStudioAgent` (LoopAgentType) with:
  - System prompt for component development expertise
  - Child prompts for spec design, data architecture, code generation, error diagnosis
  - Actions for spec updates, entity search, validation
- Multi-turn conversational AI with context awareness
- Permission-based change application (propose → approve → apply)
- Conversation storage for history (Conversation + ConversationDetail entities)
- Error auto-diagnosis: errors appear in chat, AI suggests fixes
- Quick action buttons above chat input
- "Create from description" flow via agent

**Versioning:**
- Explicit user-triggered versioning (Save Version button + Ctrl+S)
- Version comment prompt on save
- Working state in-memory with unsaved changes indicator
- ConversationArtifact + ConversationArtifactVersion for persistence

### Phase 2: Import/Export, Version History & Polish

**Import/Export Overhaul:**
- Unified import dialog with tabs (File | Artifact | Text)
- Unified export dialog with tabs (File | Artifact | Clipboard)
- Full version export as directory/ZIP with README.md
- Export specific versions or all versions
- Include conversation history in export (optional)
- Import from exported directory/ZIP
- Publish workflow (Studio → MJ: Components database record)

**Version History:**
- Version history timeline panel
- Visual diff between any two versions
- Restore to previous version (creates new version)
- Version metadata display (timestamp, comment, author)

**Polish & Power Features:**
- Command palette (Ctrl+K / Cmd+K)
- Thumbnail previews for component cards (screenshot on successful render)
- Context menu on right-click (Duplicate, Export, Delete, View History)
- Performance metrics in preview (render time)
- Dark mode support for editors and preview
- Component templates/starters library

---

## Component Architecture (Post-Refactor)

```
ComponentStudioDashboardComponent (orchestrator)
├── ComponentBrowserComponent
│   ├── ComponentSearchComponent
│   ├── ComponentFilterPanelComponent
│   └── ComponentCardComponent (repeated)
├── ComponentWorkspaceComponent
│   ├── ComponentPreviewComponent
│   │   ├── PreviewToolbarComponent
│   │   ├── ReactPreviewContainerComponent
│   │   └── ErrorOverlayComponent
│   └── EditorTabsComponent
│       ├── SpecFormEditorComponent
│       ├── SpecJsonEditorComponent
│       ├── RequirementsEditorComponent
│       ├── DataRequirementsEditorComponent
│       ├── TechnicalDesignEditorComponent
│       ├── CodeEditorPanelComponent
│       └── DependenciesEditorComponent
├── AIAssistantPanelComponent
│   ├── ModelSelectorComponent
│   ├── ChatThreadComponent
│   ├── QuickActionsComponent
│   └── ChangeProposalComponent
└── Shared Services
    ├── ComponentStudioStateService (central state)
    ├── ComponentStudioAIService (AI integration)
    ├── ComponentVersionService (version management)
    └── ComponentImportExportService (I/O operations)
```

---

## Data Model Changes

### New/Modified Entities

**No new database tables required.** The existing entity model supports everything:

- `Conversation` (type: "ComponentStudio") - tracks sessions
- `ConversationDetail` - chat messages
- `ConversationArtifact` - component being edited
- `ConversationArtifactVersion` - version history (explicit, user-triggered)
- `AIAgent` - ComponentStudio agent definition (metadata record)
- `AIPrompt` - system prompts for the agent (metadata records)
- `AIAgentRun` / `AIAgentRunStep` - execution tracking (automatic)

### New Metadata Records (via mj-sync or migration)

1. **AIAgent**: "Component Studio Assistant"
   - Type: LoopAgentType
   - DefaultPrompt: (new prompt)
   - MaxMessages: 100
   - EnableContextCompression: true

2. **AIPrompt**: "Component Studio System Prompt"
   - Content: System prompt for component development assistance
   - Child prompts for specialized tasks

3. **AIPromptModel**: Configuration linking prompt to available models

---

## UX Principles

1. **AI is a co-pilot, not a replacement** - Users always approve changes before they're applied
2. **Progressive disclosure** - Simple form mode by default, JSON for power users
3. **Explicit versioning** - Versions are like git commits, user-triggered with comments, not automatic
4. **Keyboard-first** - Power users can do everything without touching the mouse
5. **Context is king** - AI always knows what you're working on and what went wrong
6. **Clean visual hierarchy** - Preview is the star, editors serve it, AI assists

---

## Success Metrics

- **Creation speed**: Time from "new component" to first successful render
- **Error resolution**: % of errors fixed with one AI suggestion
- **Adoption**: # of components created/edited through Studio vs. other methods
- **Session length**: Average productive session duration
- **Version frequency**: How often users save versions (meaningful snapshots)
