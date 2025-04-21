# Skip Chat Component

An Angular component package for integrating the Skip AI assistant into MemberJunction applications. This package provides a complete chat interface and dynamic report rendering system for AI-driven conversations and data visualization.

## Features

- **Conversational AI Interface**: Full chat interface for Skip AI assistant
- **Dynamic Report Rendering**: Displays AI-generated reports, charts, and data visualizations
- **Conversation Management**: Create, save, rename, and delete conversations
- **Message Controls**: Edit, delete, and rate messages
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
import { ChatWelcomeQuestion } from '@memberjunction/ng-skip-chat';
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
- `AutoLoad`: boolean - Whether to automatically load data (default: true)
- `VerboseLogging`: boolean - Whether to enable verbose logging (default: false)

#### Outputs

- `NavigateToMatchingReport`: EventEmitter<string> - Emitted when a matching report is clicked
- `ConversationSelected`: EventEmitter<string> - Emitted when a conversation is selected
- `NewReportCreated`: EventEmitter<string> - Emitted when a new report is created

#### Methods

- `Load(forceRefresh: boolean)`: Loads conversations and messages
- `Refresh()`: Refreshes data from the server
- `CreateNewConversation()`: Creates a new conversation
- `SelectConversation(conversation: ConversationEntity)`: Selects a conversation
- `sendPrompt(val: string)`: Sends a prompt to Skip AI
- `sendSkipMessage()`: Sends the current message in the input box
- `FlipEmbeddedConversationState()`: Toggles the inclusion of linked conversations

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

### Dynamic Report Components

The package includes several components for rendering dynamic reports:

- `SkipDynamicReportWrapperComponent`: Main wrapper for reports
- `LinearReportComponent`: For linear report layouts
- `DynamicChartComponent`: For chart visualizations
- `DynamicGridComponent`: For data grid displays
- `DynamicHtmlReportComponent`: For HTML formatted reports

## Conversation Flow

1. **Initialization**: Load existing conversations or create a new one
2. **User Input**: User enters a message or selects a suggested prompt
3. **AI Processing**: Skip processes the request and generates a response
4. **Report Generation**: For data analysis requests, Skip generates dynamic reports
5. **Follow-up**: Skip suggests follow-up questions and provides interaction with the data

## Styling

The component includes extensive CSS styling that can be customized to match your application's design.

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
- `ngx-markdown`: For markdown rendering
- `plotly.js-dist-min`: For chart rendering