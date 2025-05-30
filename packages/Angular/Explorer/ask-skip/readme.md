# @memberjunction/ng-ask-skip

The `@memberjunction/ng-ask-skip` library provides Angular components for integrating Skip AI assistant functionality into your MemberJunction applications. Skip is MemberJunction's AI assistant that enables natural language interaction with your data, including record analysis, report generation, and AI-powered insights.

## Features

- **AI Chat with Records**: Direct chat interface with Skip AI about specific entity records
- **Skip Button Integration**: Easy way to add Skip functionality to any view with route or window modes
- **Dynamic Reports**: Generate and display AI-powered reports with interactive charts and tables
- **Inline Artifacts**: View and interact with AI-generated artifacts directly within messages
- **Customizable Welcome Questions**: Configure context-aware suggested prompts for users
- **Window and Inline Modes**: Display Skip as a popup overlay or embedded in your UI
- **Conversation History**: Automatically saves and loads conversation history with full context
- **Resource Sharing**: Share conversations with other users through the MJ resource system
- **Data Context Integration**: Leverages MemberJunction's data context for comprehensive record analysis
- **Drill-Down Capabilities**: Navigate through related data with interactive drill-down functionality

## Installation

```bash
npm install @memberjunction/ng-ask-skip
```

## Requirements

- Angular 18.0.2 or higher
- Font Awesome 5+ (used for icons throughout the UI)
- MemberJunction core libraries (v2.43.0 or compatible)
- Kendo UI for Angular (v16.2.0)
- Plotly.js for chart visualization

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

Add a button that opens Skip in a popup overlay window:

```html
<mj-skip-button 
  action="window" 
  (click)="handleSkipButtonClicked($event)">
</mj-skip-button>
```

Navigation to a dedicated Skip page (routes to /askskip):

```html
<mj-skip-button 
  action="route" 
  (click)="handleSkipButtonClicked($event)">
</mj-skip-button>
```

Handle the button click:

```typescript
import { SkipClickedEvent } from '@memberjunction/ng-ask-skip';

handleSkipButtonClicked(event: SkipClickedEvent) {
  // Optionally cancel the default action
  // event.cancel = true;
  
  // Custom logic before/after Skip opens
  console.log('Skip button clicked');
  
  // The button automatically tracks open windows
  console.log('Open Skip windows:', SkipChatComponent.SkipChatWindowsCurrentlyVisible);
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

Display AI-generated reports with interactive tabs for different views:

```html
<mj-skip-dynamic-tabbed-report
  [ReportID]="reportId"
  [ShowDetailsTab]="true"
  [AllowDrillDown]="true">
</mj-skip-dynamic-tabbed-report>
```

The dynamic report component provides multiple tabs:
- **Chart Tab**: Interactive Plotly.js visualizations
- **HTML Tab**: Formatted HTML content
- **Table Tab**: Tabular data view with sorting and filtering
- **Drill-Down Tab**: Navigate to related data (when enabled)
- **Details Tab**: Additional report metadata (when enabled)

#### Working with Skip-Generated Reports

```typescript
// Handle report events
<mj-skip-dynamic-tabbed-report
  [SkipData]="skipReportData"
  [ConversationID]="conversationId"
  [ConversationName]="conversationName"
  [ConversationDetailID]="detailId"
  (reportCreated)="onReportCreated($event)">
</mj-skip-dynamic-tabbed-report>
```

## Available Components

| Component | Selector | Description |
|-----------|----------|-------------|
| SkipButtonComponent | `mj-skip-button` | Button that opens Skip via route navigation or overlay window |
| SkipWindowComponent | `mj-skip-window` | Skip chat displayed in a CDK overlay popup window |
| SkipChatWithRecordComponent | `mj-skip-chat-with-record` | Skip chat interface for analyzing a specific entity record |
| SkipChatWithRecordWindowComponent | `mj-skip-chat-with-record-window` | Skip chat for a record wrapped in a Kendo dialog window |
| SkipDynamicTabbedReportComponent | `skip-dynamic-tabbed-report` | Dynamic AI-generated report with chart, HTML, table, and drill-down tabs |
| DynamicReportDrillDownComponent | `mj-dynamic-report-drill-down` | Interactive drill-down component for exploring related data |
| UserViewGridWithAnalysisComponent | `mj-user-view-grid-with-analysis` | User view grid enhanced with Skip AI analysis capabilities |
| SkipChatWrapperComponent | `mj-skip-chat-wrapper` | Container wrapper for Skip chat with navigation and drill-down support |

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

## Building the Package

To build this package:

```bash
# From the package directory
npm run build

# Or from the repository root using turbo
turbo build --filter="@memberjunction/ng-ask-skip"
```

The compiled output will be in the `dist/` directory.

## Module Configuration

The module automatically configures Plotly.js for chart rendering:

```typescript
// Configured in module.ts
PlotlyViaCDNModule.setPlotlyVersion('latest');
PlotlyViaCDNModule.setPlotlyBundle(null); // Uses full bundle
```

## Dependencies

### Angular Dependencies
- @angular/common (18.0.2)
- @angular/core (18.0.2)
- @angular/forms (18.0.2)
- @angular/router (18.0.2)
- @angular/cdk (18.0.2)

### MemberJunction Dependencies
- @memberjunction/core (2.43.0)
- @memberjunction/core-entities (2.43.0)
- @memberjunction/global (2.43.0)
- @memberjunction/graphql-dataprovider (2.43.0)
- @memberjunction/skip-types (2.43.0)
- @memberjunction/ng-container-directives (2.43.0)
- @memberjunction/ng-chat (2.43.0)
- @memberjunction/ng-skip-chat (2.43.0)
- @memberjunction/ng-shared (2.43.0)
- @memberjunction/ng-data-context (2.43.0)
- @memberjunction/ng-user-view-grid (2.43.0)
- @memberjunction/ng-tabstrip (2.43.0)

### Third-Party Dependencies
- @progress/kendo-angular-grid (16.2.0)
- @progress/kendo-angular-listview (16.2.0)
- @progress/kendo-angular-notification (16.2.0)
- @progress/kendo-angular-dialog (16.2.0)
- @progress/kendo-angular-label (16.2.0)
- @progress/kendo-angular-layout (16.2.0)
- @progress/kendo-angular-filter (16.2.0)
- @progress/kendo-angular-indicators (16.2.0)
- angular-plotly.js (^5.2.2)
- plotly.js-dist-min (^2.3.4)
- ngx-markdown (18.0.0)
- tslib (^2.3.0)

## TypeScript Types and Interfaces

Key types used throughout the library:

```typescript
import { 
  SkipClickedEvent,
  // Component classes
  SkipButtonComponent,
  SkipWindowComponent,
  SkipChatWithRecordComponent,
  SkipChatWithRecordWindowComponent,
  SkipDynamicTabbedReportComponent,
  DynamicReportDrillDownComponent,
  UserViewGridWithAnalysisComponent,
  SkipChatWrapperComponent
} from '@memberjunction/ng-ask-skip';

// From related packages
import { ChatMessage, ChatWelcomeQuestion } from '@memberjunction/ng-chat';
import { SkipAPIChatWithRecordResponse, SkipAPIArtifact } from '@memberjunction/skip-types';
import { DrillDownInfo } from '@memberjunction/ng-skip-chat';
import { CompositeKey } from '@memberjunction/core';
```

## Integration with MemberJunction

This package integrates seamlessly with MemberJunction's entity system:

1. **Entity Context**: Skip automatically loads data context for the linked entity
2. **Conversation Persistence**: All conversations are saved to the Conversations and Conversation Details entities
3. **User Integration**: Conversations are automatically linked to the current MJ user
4. **Resource System**: Conversations can be shared as resources with other users
5. **Report Storage**: Generated reports can be saved to the Reports entity

## License

This package is part of the MemberJunction ecosystem and follows the same licensing terms.
