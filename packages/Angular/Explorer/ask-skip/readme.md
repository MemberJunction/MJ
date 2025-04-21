# @memberjunction/ng-ask-skip

The `@memberjunction/ng-ask-skip` library provides Angular components for integrating Skip AI assistant functionality into your MemberJunction applications. It allows users to chat with Skip about specific records, generate dynamic reports, and access AI-powered insights.

## Features

- **AI Chat with Records**: Direct chat interface with Skip AI about specific entity records
- **Skip Button Integration**: Easy way to add Skip functionality to any view
- **Dynamic Reports**: Generate and display AI-powered reports based on data analysis
- **Customizable Welcome Questions**: Configure suggested prompts for users
- **Window and Inline Modes**: Display Skip as a popup or embedded in your UI
- **Conversation History**: Automatically saves and loads conversation history

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

## Component Details

### SkipChatWithRecordComponent

#### Inputs
- `LinkedEntityID`: string - ID of the entity to chat about
- `LinkedPrimaryKey`: CompositeKey - Primary key of the record to chat about
- `WelcomeQuestions`: ChatWelcomeQuestion[] - Custom welcome questions

#### Methods
- `HandleChatMessageAdded(message: ChatMessage)`: Processes new chat messages
- `HandleClearChat()`: Clears the conversation history

### SkipButtonComponent

#### Inputs
- `action`: 'route' | 'window' - Whether to navigate to a Skip page or open a popup

#### Outputs
- `click`: EventEmitter<SkipClickedEvent> - Fires when the button is clicked

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