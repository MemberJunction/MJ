# Skip Chat Component

An Angular component package for integrating the Skip AI assistant into MemberJunction applications. This package provides a complete chat interface and dynamic report rendering system for AI-driven conversations and data visualization.

## Features

- **Conversational AI Interface**: Full chat interface for Skip AI assistant
- **Dynamic Component Rendering**: Displays AI-generated UI components, charts, and data visualizations
- **Conversation Management**: Create, save, rename, and delete conversations
- **Message Controls**: Edit, delete, and rate messages
- **Inline Artifacts**: View and interact with AI-generated artifacts directly within messages
- **Welcome Experience**: Configurable welcome screen with suggested prompts
- **Sharing Capabilities**: Share conversations with other users or roles
- **Data Context Integration**: Link conversations with data contexts for contextual understanding
- **Entity Linking**: Associate conversations with specific entity records
- **Responsive Design**: Adapts to different screen sizes and layouts
- **Markdown Support**: Rich text formatting in messages
- **Suggested Questions/Answers**: AI-suggested follow-up questions and responses

## Installation

```bash
npm install @memberjunction/ng-skip-chat
```

## Usage

### Import the Module

```typescript
import { SkipChatModule } from '@memberjunction/ng-skip-chat';

@NgModule({
  imports: [
    SkipChatModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<!-- Basic Skip Chat integration -->
<skip-chat
  [Title]="'Ask Skip'"
  [ShowConversationList]="true"
  [SkipLogoURL]="'assets/Skip-Logo.png'"
  [SkipMarkOnlyLogoURL]="'assets/Skip-Icon.png'"
  (NavigateToMatchingReport)="handleReportNavigation($event)"
  (NewReportCreated)="handleNewReport($event)">
</skip-chat>
```

### Embedded in Entity Record

```html
<!-- Skip Chat embedded in an entity record view -->
<skip-chat
  [Title]="'Product Assistant'"
  [LinkedEntity]="'Products'"
  [LinkedEntityCompositeKey]="productKey"
  [ShowConversationList]="false"
  [IncludeLinkedConversationsInList]="true"
  [UpdateAppRoute]="false">
</skip-chat>
```

### TypeScript Component Example

```typescript
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CompositeKey } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Component({
  selector: 'app-analytics-dashboard',
  template: `
    <div class="dashboard-container">
      <div class="sidebar">
        <h3>Analytics Tools</h3>
        <ul class="nav-menu">
          <li><a (click)="showReports()">Reports</a></li>
          <li><a (click)="showDashboards()">Dashboards</a></li>
          <li><a (click)="showSettings()">Settings</a></li>
        </ul>
      </div>
      
      <div class="main-content">
        <skip-chat
          [Title]="'Analytics Assistant'"
          [SkipLogoURL]="'assets/analytics-logo.png'"
          [WelcomeQuestions]="customWelcomeQuestions"
          [ShowDataContextButton]="true"
          [ShowSharingButton]="true"
          (NavigateToMatchingReport)="navigateToReport($event)"
          (NewReportCreated)="handleNewReport($event)"
          (ConversationSelected)="onConversationSelected($event)">
        </skip-chat>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      display: flex;
      height: 100%;
    }
    .sidebar {
      width: 250px;
      background: #f5f5f5;
      padding: 20px;
    }
    .main-content {
      flex: 1;
      padding: 20px;
      overflow: hidden;
    }
  `]
})
export class AnalyticsDashboardComponent implements OnInit {
  customWelcomeQuestions: ChatWelcomeQuestion[] = [
    {
      topLine: 'Sales Analysis',
      bottomLine: 'Analyze sales trends by region',
      prompt: 'Can you analyze our sales data by region and show me the trends over the last year?'
    },
    {
      topLine: 'Customer Insights',
      bottomLine: 'Identify top customer segments',
      prompt: 'What are our most valuable customer segments and how are they performing?'
    },
    {
      topLine: 'Inventory Report',
      bottomLine: 'Check stock levels and reorder needs',
      prompt: 'Create a report showing inventory levels across warehouses and identify items that need to be reordered'
    },
    {
      topLine: 'Marketing ROI',
      bottomLine: 'Measure campaign effectiveness',
      prompt: 'Calculate the ROI for our recent marketing campaigns and recommend areas for improvement'
    }
  ];
  
  constructor(
    private router: Router,
    private notificationService: MJNotificationService
  ) {}
  
  ngOnInit() {
    // Any initialization code
  }
  
  navigateToReport(reportId: string) {
    this.router.navigate(['/reports', reportId]);
  }
  
  handleNewReport(reportId: string) {
    this.notificationService.CreateSimpleNotification(
      `New report created (ID: ${reportId})`,
      'success',
      3000
    );
  }
  
  onConversationSelected(conversationId: string) {
    console.log(`Conversation selected: ${conversationId}`);
  }
  
  showReports() {
    this.router.navigate(['/reports']);
  }
  
  showDashboards() {
    this.router.navigate(['/dashboards']);
  }
  
  showSettings() {
    this.router.navigate(['/settings']);
  }
}
```

## Inline Artifacts Support

Skip Chat provides an intuitive way to work with AI-generated artifacts directly within the conversation flow. Artifacts are standalone content pieces created during AI conversations, such as:

- Code snippets
- Data analyses and visualizations 
- Documents and reports
- SQL queries
- JSON data structures
- Markdown content
- Plain text notes

### Artifact Display Design

Artifacts are integrated directly into the conversation with a contextual, streamlined approach:

1. **Inline Indicators**: When a message has a linked artifact (as indicated by ArtifactID in the ConversationDetailEntity), a visual indicator/box appears within that message
   
2. **Split-Panel View**: Clicking on an artifact indicator dynamically splits the screen:
   - Left panel: Continues displaying the conversation messages
   - Right panel: Shows the selected artifact's content
   - Draggable splitter between panels for customizing the view ratio

3. **Artifact Creation Flow**: Skip can request artifact creation or versioning during analysis completion (SkipAPIAnalysisComplete)

### Artifact-Message Relationship

Each `ConversationDetailEntity` can have:
- `ArtifactID`: Links to the specific artifact created or referenced by this message
- `ArtifactVersionID`: Tracks which version of the artifact is associated with this message

### Artifact Components

The package includes specialized components for artifact handling:

- **SkipMessageArtifactIndicatorComponent**: Displays the artifact indicator within messages
- **SkipArtifactViewerComponent**: Renders artifact content in the right panel
- **SkipSplitPanelComponent**: Manages the split-panel layout with draggable divider

### Artifact Events

The Skip Chat components provide event emitters for artifact interactions:

```typescript
// Listen for artifact events
<skip-chat
  (ArtifactSelected)="handleArtifactSelected($event)"
  (ArtifactViewed)="handleArtifactViewed($event)">
</skip-chat>
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

## API Reference

### SkipChatComponent

The main component for the Skip chat interface.

#### Inputs

- `Title`: string - Title for the chat interface (default: 'Ask Skip')
- `ShowConversationList`: boolean - Whether to show the conversation list (default: true)
- `AllowNewConversations`: boolean - Whether to allow creating new conversations (default: true)
- `SkipLogoURL`: string - URL for the Skip logo
- `SkipMarkOnlyLogoURL`: string - URL for the Skip icon logo
- `UserImage`: string | Blob - Image for the user avatar
- `DefaultTextboxPlaceholder`: string - Placeholder text for the input field
- `ProcessingTextBoxPlaceholder`: string - Placeholder text during processing
- `Messages`: ConversationDetailEntity[] - Array of conversation messages
- `Conversations`: ConversationEntity[] - Array of available conversations
- `SelectedConversation`: ConversationEntity - Currently selected conversation
- `DataContextID`: string - ID of the data context
- `LinkedEntity`: string - Name of the linked entity
- `LinkedEntityCompositeKey`: CompositeKey - Key for the linked entity record
- `ShowDataContextButton`: boolean - Whether to show the data context button (default: true)
- `IncludeLinkedConversationsInList`: boolean - Whether to include linked conversations (default: false)
- `UpdateAppRoute`: boolean - Whether to update the browser URL (default: true)
- `ShowSkipLogoInConversationList`: boolean - Whether to show the Skip logo in the conversation list (default: false)
- `ShowSharingButton`: boolean - Whether to show the sharing button (default: true)
- `SharingExcludeRoleNames`: string[] - Role names to exclude from sharing
- `SharingExcludeEmails`: string[] - User emails to exclude from sharing
- `WelcomeQuestions`: ChatWelcomeQuestion[] - Array of welcome questions/prompts
  - Each ChatWelcomeQuestion has: `topLine` (main title), `bottomLine` (subtitle), `prompt` (actual message sent)
- `AutoLoad`: boolean - Whether to automatically load data (default: true)
- `VerboseLogging`: boolean - Whether to enable verbose logging (default: false)
- `EnableArtifactSplitView`: boolean - Whether to enable split-panel viewing for artifacts (default: true)
- `DefaultSplitRatio`: number - Default ratio for split panels when viewing artifacts (0-1, default: 0.6)

#### Outputs

- `NavigateToMatchingReport`: EventEmitter<string> - Emitted when a matching report is clicked
- `ConversationSelected`: EventEmitter<string> - Emitted when a conversation is selected
- `NewReportCreated`: EventEmitter<string> - Emitted when a new report is created
- `ArtifactSelected`: EventEmitter<SkipAPIArtifact> - Emitted when an artifact is selected
- `ArtifactViewed`: EventEmitter<SkipAPIArtifact> - Emitted when an artifact is viewed

#### Methods

- `Load(forceRefresh: boolean)`: Loads conversations and messages
- `Refresh()`: Refreshes data from the server
- `CreateNewConversation()`: Creates a new conversation
- `SelectConversation(conversation: ConversationEntity)`: Selects a conversation
- `sendPrompt(val: string)`: Sends a prompt to Skip AI
- `sendSkipMessage()`: Sends the current message in the input box
- `FlipEmbeddedConversationState()`: Toggles the inclusion of linked conversations
- `ViewArtifact(artifactId: string)`: Opens an artifact in the split panel view

### SkipSingleMessageComponent

Component for rendering a single message in the conversation.

#### Inputs

- `ConversationRecord`: ConversationEntity - The conversation this message belongs to
- `ConversationDetailRecord`: ConversationDetailEntity - The message details
- `ConversationUser`: UserInfo - User who owns the conversation
- `DataContext`: DataContext - Data context for the conversation
- `ConversationMessages`: ConversationDetailEntity[] - All messages in the conversation
- `ConversationProcessing`: boolean - Whether the conversation is processing
- `SkipMarkOnlyLogoURL`: string - URL for the Skip icon logo
- `UserImage`: string | Blob - Image for the user avatar
- `ShowMessageEditPanel`: boolean - Whether to show edit controls (default: true)
- `ShowMessageRating`: boolean - Whether to show message rating controls (default: true)

#### Outputs

- `SuggestedQuestionSelected`: EventEmitter<string> - Emitted when a suggested question is selected
- `SuggestedAnswerSelected`: EventEmitter<string> - Emitted when a suggested answer is selected
- `NavigateToMatchingReport`: EventEmitter<string> - Emitted when a matching report is clicked
- `NewReportCreated`: EventEmitter<string> - Emitted when a new report is created
- `EditMessageRequested`: EventEmitter<ConversationDetailEntity> - Emitted when message edit is requested
- `DeleteMessageRequested`: EventEmitter<ConversationDetailEntity> - Emitted when message delete is requested
- `ArtifactSelected`: EventEmitter<SkipAPIArtifact> - Emitted when an artifact indicator is selected

### SkipSplitPanelComponent

Component for managing the split-panel layout.

#### Inputs

- `SplitRatio`: number - Ratio for dividing the panels (0-1, default: 0.6)
- `MinLeftPanelWidth`: string - Minimum width for left panel (default: '30%')
- `MinRightPanelWidth`: string - Minimum width for right panel (default: '30%')
- `LeftPanelContent`: TemplateRef<any> - Template for left panel content
- `RightPanelContent`: TemplateRef<any> - Template for right panel content

#### Outputs

- `SplitRatioChanged`: EventEmitter<number> - Emitted when split ratio changes via drag

### Dynamic Report Components

The package includes several components for rendering dynamic reports:

- `SkipDynamicReportWrapperComponent`: Main wrapper for reports
- `SkipDynamicLinearReportComponent`: For linear report layouts
- `SkipDynamicChartComponent`: For chart visualizations
- `SkipDynamicGridComponent`: For data grid displays
- `SkipDynamicHTMLReportComponent`: For HTML formatted reports
- `SkipArtifactsCounterComponent`: For displaying artifact count badges

### Utility Classes

#### DrillDownInfo

A utility class for managing drill-down operations within reports.

```typescript
import { DrillDownInfo } from '@memberjunction/ng-skip-chat';

const drillDown = new DrillDownInfo('Customers', 'Country = "USA"');
drillDown.BaseFilter = 'Active = 1'; // Optional base filter

// Get parameters for UserViewGrid
const gridParams = drillDown.UserViewGridParams;
// Returns: { EntityName: 'Customers', ExtraFilter: '(Country = "USA") AND (Active = 1)' }
```

#### SkipConversationReportCache

A singleton cache manager for conversation reports to minimize network requests.

```typescript
import { SkipConversationReportCache } from '@memberjunction/ng-skip-chat';

// Get reports for a conversation (cached after first load)
const reports = await SkipConversationReportCache.Instance.GetConversationReports(
  conversationId,
  provider, // optional IRunViewProvider
  forceRefresh // optional boolean to force reload
);

// Add a new report to cache
SkipConversationReportCache.Instance.AddConversationReport(conversationId, reportEntity);

// Update existing report in cache
SkipConversationReportCache.Instance.UpdateConversationReport(conversationId, reportEntity);

// Remove report from cache
SkipConversationReportCache.Instance.RemoveConversationReport(conversationId, reportId);
```

## Conversation Flow

1. **Initialization**: Load existing conversations or create a new one
2. **User Input**: User enters a message or selects a suggested prompt
3. **AI Processing**: Skip processes the request and generates a response
4. **Artifact Creation**: Skip can generate artifacts during response processing
5. **Artifact Viewing**: Users can view artifacts in the split-panel interface
6. **Report Generation**: For data analysis requests, Skip generates dynamic reports
7. **Follow-up**: Skip suggests follow-up questions and provides interaction with the data

## Styling

The component includes extensive CSS styling that can be customized to match your application's design. Key CSS classes include:

- `.skip-chat-container`: Main container for the entire component
- `.conversation-list`: Styles for the conversation list panel
- `.chat-messages`: Container for message display
- `.skip-message`: Individual message styling
- `.artifact-indicator`: Styling for artifact indicators in messages
- `.split-panel`: Split panel container styling
- `.welcome-screen`: Welcome screen with suggested prompts

## Module Configuration

When importing the SkipChatModule, ensure your application includes:

1. **Font Awesome**: Required for icons throughout the component
2. **Angular CDK**: Required for overlay functionality
3. **Kendo UI Theme**: Required for Kendo components (grid, dialogs, etc.)

```typescript
// In your app.module.ts or feature module
import { SkipChatModule } from '@memberjunction/ng-skip-chat';
import { MarkdownModule } from '@memberjunction/ng-markdown';

@NgModule({
  imports: [
    SkipChatModule,
    MarkdownModule, // Already included in SkipChatModule but may be needed at app level
    // ... other imports
  ]
})
export class AppModule { }
```

## Build and Deployment Notes

- This package is built using Angular's ng-packagr
- Ensure all peer dependencies are installed at the correct versions
- The package uses TypeScript strict mode
- All Kendo UI components must have a valid license for production use

## Dependencies

- `@memberjunction/core`: For metadata and entity access
- `@memberjunction/core-entities`: For conversation and data context entities
- `@memberjunction/global`: For global utilities
- `@memberjunction/skip-types`: For Skip API response types
- `@memberjunction/data-context`: For data context management
- `@memberjunction/ng-notifications`: For notification services
- `@memberjunction/ng-resource-permissions`: For conversation sharing
- `@progress/kendo-angular-grid`: For grid components
- `@progress/kendo-angular-listview`: For conversation list
- `@progress/kendo-angular-dialog`: For dialog components
- `@memberjunction/ng-markdown`: For markdown rendering
- `plotly.js-dist-min`: For chart rendering
- `@angular/cdk`: For overlay functionality

## Version Compatibility

This package requires:
- Angular 21 or compatible version
- TypeScript 4.9 or higher
- Node.js 16 or higher

## License

This package is part of the MemberJunction framework. See the main repository for license information.