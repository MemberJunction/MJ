# Chat Component

The Chat Component is a reusable Angular component designed for building chat interfaces in MemberJunction applications. It can be used for AI-assisted conversations or peer-to-peer chat applications.

## Features

- **Flexible Message System**: Display both user and AI messages with appropriate styling
- **Markdown Support**: Render chat messages with markdown formatting support
- **Welcome Screen**: Customizable welcome screen with suggested questions/prompts
- **Auto-Scrolling**: Keeps the conversation scrolled to the bottom with a scroll-to-bottom button
- **Loading Indicator**: Visual feedback during AI response generation
- **Responsive Design**: Adapts to different screen sizes
- **Auto-Resizing Input**: Text input automatically expands as the user types
- **Clear Conversation**: Option to clear the entire conversation history

## Installation

```bash
npm install @memberjunction/ng-chat
```

## Usage

### Import the Module

```typescript
import { ChatModule } from '@memberjunction/ng-chat';

@NgModule({
  imports: [
    ChatModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<mj-chat
  [AIImageURL]="'assets/bot-avatar.png'"
  [InitialMessage]="'How can I help you today?'"
  (MessageAdded)="handleNewMessage($event)"
  (ClearChatRequested)="handleClearChat()">
</mj-chat>
```

### Welcome Questions Example

```typescript
// Component
import { ChatWelcomeQuestion } from '@memberjunction/ng-chat';

@Component({
  selector: 'app-ai-assistant',
  template: `
    <mj-chat
      [AIImageURL]="'assets/bot-avatar.png'"
      [AILargeImageURL]="'assets/bot-large.png'"
      [WelcomeQuestions]="welcomeQuestions"
      (MessageAdded)="handleNewMessage($event)"
      (ClearChatRequested)="handleClearChat()">
    </mj-chat>
  `
})
export class AIAssistantComponent {
  welcomeQuestions: ChatWelcomeQuestion[] = [
    {
      topLine: 'Generate a report',
      bottomLine: 'Create a sales summary for Q2',
      prompt: 'Generate a sales report for Q2'
    },
    {
      topLine: 'Find information',
      bottomLine: 'Search for customer details',
      prompt: 'Find information about customer XYZ'
    },
    {
      topLine: 'Summarize data',
      bottomLine: 'Give me the key points from the data',
      prompt: 'Summarize the key metrics from my dashboard'
    },
    {
      topLine: 'Help with a task',
      bottomLine: 'Walk me through creating a new entity',
      prompt: 'Help me create a new entity in MemberJunction'
    }
  ];

  handleNewMessage(message: ChatMessage) {
    // Process the new message
    console.log('New message:', message);
    
    if (message.senderType === 'user') {
      // Send to AI service and handle response
      this.processUserMessage(message.message);
    }
  }

  handleClearChat() {
    // Implement chat clearing logic
    console.log('Chat cleared');
  }

  async processUserMessage(message: string) {
    // Set loading state
    this.chatComponent.ShowWaitingIndicator = true;
    
    try {
      // Call your AI or chat service
      const response = await this.aiService.getResponse(message);
      
      // Add AI response to chat
      this.chatComponent.SendMessage(
        response, 
        'Assistant', 
        'ai', 
        null
      );
    } 
    catch (error) {
      console.error('Error getting AI response:', error);
    } 
    finally {
      // End loading state
      this.chatComponent.ShowWaitingIndicator = false;
    }
  }
}
```

## API Reference

### Inputs

- `InitialMessage`: string - Initial message shown before any messages are added
- `Messages`: ChatMessage[] - Array of messages to display
- `AIImageURL`: string - URL for the AI's avatar image (small version)
- `AILargeImageURL`: string - URL for the AI's large avatar image (welcome screen)
- `WelcomeQuestions`: ChatWelcomeQuestion[] - Array of up to 4 welcome questions/prompts
- `ClearAllMessagesPrompt`: string - Confirmation message when clearing the chat
- `AllowSend`: boolean - Enable/disable sending messages
- `Placeholder`: string - Placeholder text for the input field
- `ShowWaitingIndicator`: boolean - Show/hide the loading spinner

### Outputs

- `MessageAdded`: EventEmitter<ChatMessage> - Fires when a new message is added
- `ClearChatRequested`: EventEmitter<void> - Fires when user confirms clearing the chat

### Classes

#### ChatMessage

```typescript
export class ChatMessage {
  public message: string;
  public senderName: string;
  public senderType: 'user' | 'ai';
  public id?: any;

  constructor(message: string, senderName: string, senderType: 'user' | 'ai', id: any = null);
}
```

#### ChatWelcomeQuestion

```typescript
export class ChatWelcomeQuestion {
  public topLine: string = "";
  public bottomLine: string = "";
  public prompt: string = "";
}
```

### Methods

- `SendCurrentMessage()`: Sends the current message in the input field
- `SendMessage(message, senderName, senderType, id, fireEvent)`: Sends a specified message
- `SendUserMessage(message)`: Convenience method to send a user message
- `ClearAllMessages()`: Clears all messages from the chat interface

## Styling

The component includes default styles that you can override using CSS. The component uses a clean and modern design with different styling for user and AI messages.

## Dependencies

- `ngx-markdown`: For rendering markdown in chat messages
- `@progress/kendo-angular-indicators`: For the loading spinner
- `@progress/kendo-angular-buttons`: For buttons
- `@progress/kendo-angular-dialog`: For the clear confirmation dialog