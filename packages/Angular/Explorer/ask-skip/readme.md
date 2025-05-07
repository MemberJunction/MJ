# @memberjunction/ng-ask-skip

The `@memberjunction/ng-ask-skip` library provides Angular components for integrating Skip AI assistant functionality into your MemberJunction applications. It allows users to chat with Skip about specific records, generate dynamic reports, access AI-powered insights, and work with AI-generated artifacts.

## Features

- **AI Chat with Records**: Direct chat interface with Skip AI about specific entity records
- **Skip Button Integration**: Easy way to add Skip functionality to any view
- **Dynamic Reports**: Generate and display AI-powered reports based on data analysis
- **Inline Artifacts**: View and interact with AI-generated artifacts directly within messages
- **Customizable Welcome Questions**: Configure suggested prompts for users
- **Window and Inline Modes**: Display Skip as a popup or embedded in your UI
- **Conversation History**: Automatically saves and loads conversation history
- **Resource Sharing**: Share conversations with other users

## Installation

```bash
npm install @memberjunction/ng-ask-skip
```

## Requirements

- Angular 18+
- Font Awesome 5+ (used for icons)
- MemberJunction core libraries

Add Font Awesome to your index.html:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
```

## Usage

Import the module in your application:

```typescript
import { AskSkipModule } from '@memberjunction/ng-ask-skip';

@NgModule({
  imports: [
    // ...
    AskSkipModule
  ]
})
export class YourModule { }
```

### Skip Button

Add a button that opens Skip in a popup window:

```html
<mj-skip-button 
  action="window" 
  (click)="handleSkipButtonClicked($event)">
</mj-skip-button>
```

Navigation to a dedicated Skip page:

```html
<mj-skip-button 
  action="route" 
  (click)="handleSkipButtonClicked($event)">
</mj-skip-button>
```

Handle the button click:

```typescript
handleSkipButtonClicked(event: SkipClickedEvent) {
  // Optionally cancel the default action
  // event.cancel = true;
  
  // Custom logic before/after Skip opens
  console.log('Skip button clicked');
}
```

### Skip Chat with Record

Chat with Skip about a specific entity record:

```html
<mj-skip-chat-with-record
  [LinkedEntityID]="entityId"
  [LinkedPrimaryKey]="recordPrimaryKey">
</mj-skip-chat-with-record>
```

With custom welcome questions:

```typescript
import { ChatWelcomeQuestion } from '@memberjunction/ng-chat';

@Component({...})
export class MyComponent {
  customWelcomeQuestions: ChatWelcomeQuestion[] = [
    {
      topLine: "Overview",
      bottomLine: "Give me a quick overview of this record",
      prompt: "Can you provide a brief overview of this record?"
    },
    {
      topLine: "Analysis",
      bottomLine: "Provide detailed analysis of this record",
      prompt: "I need a detailed analysis of this record"
    }
  ];
}
```

```html
<mj-skip-chat-with-record
  [LinkedEntityID]="entityId"
  [LinkedPrimaryKey]="recordPrimaryKey"
  [WelcomeQuestions]="customWelcomeQuestions">
</mj-skip-chat-with-record>
```

### Skip Chat in a Dialog Window

Open Skip chat for a record in a modal dialog:

```html
<mj-skip-chat-with-record-window
  [LinkedEntityID]="entityId"
  [LinkedPrimaryKey]="recordPrimaryKey"
  [Visible]="showSkipChat"
  (DialogClosed)="handleDialogClosed()">
</mj-skip-chat-with-record-window>
```

### Dynamic Report Components

Display AI-generated reports with tabs:

```html
<mj-skip-dynamic-tabbed-report
  [ReportID]="reportId">
</mj-skip-dynamic-tabbed-report>
```

## Available Components

| Component | Selector | Description |
|-----------|----------|-------------|
| SkipButtonComponent | `mj-skip-button` | Button that opens Skip |
| SkipWindowComponent | `mj-skip-window` | Skip chat in a popup window |
| SkipChatWithRecordComponent | `mj-skip-chat-with-record` | Skip chat for a specific record |
| SkipChatWithRecordWindowComponent | `mj-skip-chat-with-record-window` | Skip chat for a record in a modal dialog |
| SkipDynamicTabbedReportComponent | `mj-skip-dynamic-tabbed-report` | Dynamic report with tabs |
| DynamicReportDrillDownComponent | `mj-dynamic-report-drill-down` | Drill-down component for reports |
| UserViewGridWithAnalysisComponent | `mj-user-view-grid-with-analysis` | User view grid with Skip analysis |
| SkipChatWrapperComponent | `mj-skip-chat-wrapper` | Wrapper for Skip chat |

## Inline Artifacts Support

Ask Skip includes intelligent integration with AI-generated artifacts directly within the conversation interface. Artifacts are standalone content pieces created during AI conversations, such as:

- Code snippets
- Data analyses and visualizations
- Documents and reports
- SQL queries
- JSON data structures
- Markdown content
- Plain text notes

### Artifact Display Design

The artifacts integration follows an intuitive inline approach:

1. **Message-Linked Artifacts**: When a message has an associated artifact (identified by ArtifactID in the ConversationDetailEntity), a visual indicator appears within the message display.

2. **Split-Panel Viewing**: Clicking on an artifact indicator dynamically splits the conversation area:
   - Left panel: Continues displaying all conversation messages
   - Right panel: Shows the selected artifact's content
   - Draggable splitter between panels allows users to customize the view ratio

3. **Context-Aware Integration**: Artifacts remain in context with the conversation that created them

### Using Artifacts

Working with artifacts is straightforward:

1. **View Artifact**: Click on the artifact indicator within a message to open the split-panel view
2. **Resize Panels**: Drag the splitter to adjust the ratio between conversation and artifact content
3. **Close Artifact View**: Close the artifact panel to return to the full conversation view

### Artifact Events

Components provide event emitters for artifact interactions:

```typescript
// Listen for artifact events
<mj-skip-chat-with-record
  (ArtifactSelected)="handleArtifactSelected($event)"
  (ArtifactViewed)="handleArtifactViewed($event)">
</mj-skip-chat-with-record>
```

Handle artifact events in your component:

```typescript
import { SkipAPIArtifact } from '@memberjunction/skip-types';

@Component({...})
export class MyComponent {
  handleArtifactSelected(artifact: SkipAPIArtifact) {
    console.log(`Selected artifact: ${artifact.name}`);
    // Custom handling of artifact selection
  }
  
  handleArtifactViewed(artifact: SkipAPIArtifact) {
    console.log(`Viewing artifact: ${artifact.name}`);
    // Custom handling for artifact viewing
  }
}
```

### Configuration Options

Control artifact features with these input properties:

```html
<mj-skip-chat-with-record
  [EnableArtifactSplitView]="true"
  [DefaultSplitRatio]="0.6">
</mj-skip-chat-with-record>
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `EnableArtifactSplitView` | boolean | true | Enable/disable split-panel artifact viewing |
| `DefaultSplitRatio` | number | 0.6 | Default ratio for split panels (0-1) |

## Component Details

### SkipChatWithRecordComponent

#### Inputs
- `LinkedEntityID`: string - ID of the entity to chat about
- `LinkedPrimaryKey`: CompositeKey - Primary key of the record to chat about
- `WelcomeQuestions`: ChatWelcomeQuestion[] - Custom welcome questions
- `EnableArtifactSplitView`: boolean - Whether to enable split-panel artifact viewing (default: true)
- `DefaultSplitRatio`: number - Default ratio for split panels (0-1, default: 0.6)

#### Outputs
- `ArtifactSelected`: EventEmitter<SkipAPIArtifact> - Fires when an artifact is selected
- `ArtifactViewed`: EventEmitter<SkipAPIArtifact> - Fires when an artifact is viewed in the panel
- `NavigateToMatchingReport`: EventEmitter<string> - Fires when a report link is clicked
- `NewReportCreated`: EventEmitter<string> - Fires when a new report is created

#### Methods
- `HandleChatMessageAdded(message: ChatMessage)`: Processes new chat messages
- `HandleClearChat()`: Clears the conversation history
- `ViewArtifact(artifactId: string)`: Opens an artifact in the split-panel view

### SkipButtonComponent

#### Inputs
- `action`: 'route' | 'window' - Whether to navigate to a Skip page or open a popup

#### Outputs
- `click`: EventEmitter<SkipClickedEvent> - Fires when the button is clicked

### SkipChatWithRecordWindowComponent

#### Inputs
- `LinkedEntityID`: string - ID of the entity to chat about
- `LinkedPrimaryKey`: CompositeKey - Primary key of the record to chat about
- `DialogTitle`: string - Title for the dialog window
- `Visible`: boolean - Whether the dialog is visible
- `Width`: number - Width of the dialog
- `Height`: number - Height of the dialog
- `WelcomeQuestions`: ChatWelcomeQuestion[] - Custom welcome questions
- `EnableArtifactSplitView`: boolean - Whether to enable split-panel artifact viewing (default: true)
- `DefaultSplitRatio`: number - Default ratio for split panels (0-1, default: 0.6)

#### Outputs
- `DialogClosed`: EventEmitter<void> - Fires when the dialog is closed
- `ArtifactSelected`: EventEmitter<SkipAPIArtifact> - Fires when an artifact is selected
- `ArtifactViewed`: EventEmitter<SkipAPIArtifact> - Fires when an artifact is viewed

### SkipChatWrapperComponent

#### Inputs
- `EnableArtifactSplitView`: boolean - Whether to enable split-panel artifact viewing (default: true)
- `DefaultSplitRatio`: number - Default ratio for split panels (0-1, default: 0.6)

#### Outputs
- `NavigateToMatchingReport`: EventEmitter<string> - Fires when a report link is clicked
- `ConversationSelected`: EventEmitter<string> - Fires when a conversation is selected
- `DrillDownEvent`: EventEmitter<DrillDownInfo> - Fires when drill-down is requested
- `ArtifactSelected`: EventEmitter<SkipAPIArtifact> - Fires when an artifact is selected
- `ArtifactViewed`: EventEmitter<SkipAPIArtifact> - Fires when an artifact is viewed

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @angular/router
- @angular/cdk
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/graphql-dataprovider
- @memberjunction/ng-chat
- @memberjunction/ng-skip-chat
- @memberjunction/ng-shared
- @progress/kendo-angular-* packages
- angular-plotly.js
- ngx-markdown