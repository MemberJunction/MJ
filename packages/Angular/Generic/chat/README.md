# @memberjunction/ng-chat

A reusable Angular component library for building chat interfaces in MemberJunction applications. This package provides a flexible chat component that can be used for AI-assisted conversations, chatbots, or peer-to-peer chat applications.

## Overview

The `@memberjunction/ng-chat` package provides a feature-rich chat component with built-in support for:
- User and AI message rendering with distinct styling
- Markdown formatting in messages
- Welcome screen with suggested prompts
- Real-time message handling
- Responsive design with auto-scrolling
- Loading indicators for async operations

## Features

- **Flexible Message System**: Display both user and AI messages with appropriate styling and avatars
- **Markdown Support**: Full markdown rendering support for rich text messages
- **Welcome Screen**: Customizable welcome screen with up to 4 suggested questions/prompts
- **Smart Scrolling**: Automatic scroll-to-bottom with manual scroll detection
- **Loading States**: Built-in loading indicator for async operations (e.g., AI responses)
- **Responsive Design**: Mobile-friendly design that adapts to different screen sizes
- **Auto-Resizing Input**: Text area automatically expands as users type longer messages
- **Clear Conversation**: Confirmation dialog for clearing conversation history
- **Customizable Avatars**: Support for custom AI avatar images
- **Keyboard Support**: Send messages with Enter key (Shift+Enter for new lines)

## Installation

```bash
npm install @memberjunction/ng-chat
```

### Peer Dependencies

This package requires the following peer dependencies:
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2

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

### Complete Example with AI Integration

```typescript
import { Component, ViewChild } from '@angular/core';
import { ChatComponent, ChatMessage, ChatWelcomeQuestion } from '@memberjunction/ng-chat';

@Component({
  selector: 'app-ai-assistant',
  template: `
    <mj-chat
      #chatComponent
      [AIImageURL]="'assets/bot-avatar.png'"
      [AILargeImageURL]="'assets/bot-large.png'"
      [InitialMessage]="'Hi! I'm your AI assistant. How can I help you today?'"
      [WelcomeQuestions]="welcomeQuestions"
      [Placeholder]="'Ask me anything...'"
      [ClearAllMessagesPrompt]="'Are you sure you want to clear this conversation?'"
      (MessageAdded)="handleNewMessage($event)"
      (ClearChatRequested)="handleClearChat()">
    </mj-chat>
  `
})
export class AIAssistantComponent {
  @ViewChild('chatComponent') chatComponent!: ChatComponent;
  
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
    // Clear any conversation state in your service
    this.conversationHistory = [];
    this.chatComponent.ClearAllMessages();
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
      // Show error message to user
      this.chatComponent.SendMessage(
        'Sorry, I encountered an error processing your request.', 
        'Assistant', 
        'ai', 
        null
      );
    } 
    finally {
      // End loading state
      this.chatComponent.ShowWaitingIndicator = false;
    }
  }
}
```

### Programmatic Message Sending

```typescript
// Send a user message programmatically
this.chatComponent.SendUserMessage('Hello, AI!');

// Send an AI message
this.chatComponent.SendMessage(
  'Hello! How can I assist you today?',
  'Assistant',
  'ai',
  messageId // optional ID for tracking
);

// Send a message without triggering the MessageAdded event
this.chatComponent.SendMessage(
  'System message',
  'System',
  'ai',
  null,
  false // fireEvent = false
);
```

## API Reference

### Component Selector
`<mj-chat></mj-chat>`

### Inputs

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `InitialMessage` | `string` | `''` | Initial message shown when chat is empty |
| `Messages` | `ChatMessage[]` | `[]` | Array of messages to display |
| `AIImageURL` | `string` | `''` | URL for the AI's avatar image (24px max width) |
| `AILargeImageURL` | `string` | `''` | URL for the AI's large avatar on welcome screen |
| `WelcomeQuestions` | `ChatWelcomeQuestion[]` | `[]` | Array of up to 4 welcome prompts |
| `ClearAllMessagesPrompt` | `string` | `'Are you sure you want to clear all messages?'` | Confirmation dialog text |
| `AllowSend` | `boolean` | `true` | Enable/disable message sending |
| `Placeholder` | `string` | `'Type a message...'` | Input field placeholder text |
| `ShowWaitingIndicator` | `boolean` | `false` | Show/hide loading spinner |

### Outputs

| Event | Type | Description |
|-------|------|-------------|
| `MessageAdded` | `EventEmitter<ChatMessage>` | Emitted when a new message is added to the chat |
| `ClearChatRequested` | `EventEmitter<void>` | Emitted when user confirms clearing the chat |

### Public Methods

#### `SendCurrentMessage(): void`
Sends the current message in the input field. Automatically clears the input after sending.

#### `SendMessage(message: string, senderName: string, senderType: 'user' | 'ai', id: any, fireEvent: boolean = true): void`
Adds a message to the chat programmatically.

**Parameters:**
- `message`: The message text (supports markdown)
- `senderName`: Display name of the sender
- `senderType`: Either 'user' or 'ai' for styling
- `id`: Optional ID for message tracking
- `fireEvent`: Whether to emit the MessageAdded event

#### `SendUserMessage(message: string): void`
Convenience method to send a user message. Automatically sets senderName to 'User' and senderType to 'user'.

#### `ClearAllMessages(): void`
Clears all messages from the chat and resets to initial state.

#### `HandleClearChat(): void`
Shows the confirmation dialog for clearing chat. This emits the ClearChatRequested event when confirmed.

### Classes

#### ChatMessage

```typescript
export class ChatMessage {
  public message: string;         // The message content (supports markdown)
  public senderName: string;      // Display name of sender
  public senderType: 'user' | 'ai'; // Type for styling purposes
  public id?: any;                // Optional ID for tracking

  constructor(
    message: string, 
    senderName: string, 
    senderType: 'user' | 'ai', 
    id: any = null
  );
}
```

#### ChatWelcomeQuestion

```typescript
export class ChatWelcomeQuestion {
  public topLine: string = "";     // Main text of the suggestion
  public bottomLine: string = "";  // Supporting text/description
  public prompt: string = "";      // The actual prompt to send when clicked
}
```

## Styling

The component provides several CSS classes for customization:

- `.chat-message-wrap`: Container for each message
- `.chat-message`: The message content container
- `.chat-message-ai`: Additional class for AI messages
- `.chat-message-image`: Avatar/icon container
- `.chat-input-container`: Input area container
- `.chat-welcome-container`: Welcome screen container

You can override these styles in your global styles or component styles:

```css
/* Example: Customize AI message background */
::ng-deep .chat-message-ai {
  background-color: #f0f4f8;
  border-left: 3px solid #3182ce;
}

/* Example: Customize user avatar */
::ng-deep .chat-message-wrap:has(.chat-message:not(.chat-message-ai)) .chat-message-image {
  color: #48bb78;
}
```

## Dependencies

### Runtime Dependencies
- `@memberjunction/core`: Core MemberJunction utilities
- `@memberjunction/ng-container-directives`: Container directive utilities
- `@progress/kendo-angular-indicators`: Loading spinner component
- `@progress/kendo-angular-buttons`: Button components
- `@progress/kendo-angular-dialog`: Dialog component for confirmations
- `ngx-markdown`: Markdown rendering support
- `tslib`: TypeScript runtime helpers

### Integration with MemberJunction

This component integrates seamlessly with other MemberJunction packages:

- Use with `@memberjunction/ai` for AI-powered conversations
- Combine with `@memberjunction/core-entities` for entity-aware chat
- Integrate with MemberJunction's authentication for user context

## Build and Development

This package uses Angular's library build system. To build the package:

```bash
# From the package directory
npm run build

# From the repository root
turbo build --filter="@memberjunction/ng-chat"
```

The built files will be output to the `dist/` directory.

## Advanced Usage

### Custom Message Rendering

While the component handles markdown rendering by default, you can extend functionality by processing messages before sending:

```typescript
// Pre-process messages with custom formatting
const formattedMessage = this.formatMessage(userInput);
this.chatComponent.SendUserMessage(formattedMessage);

// Add metadata to messages using the id field
this.chatComponent.SendMessage(
  response,
  'Assistant',
  'ai',
  { timestamp: Date.now(), tokens: 150, model: 'gpt-4' }
);
```

### Maintaining Conversation History

```typescript
// Store conversation for persistence
private saveConversation() {
  const messages = this.chatComponent.Messages;
  localStorage.setItem('chat-history', JSON.stringify(messages));
}

// Restore previous conversation
private loadConversation() {
  const saved = localStorage.getItem('chat-history');
  if (saved) {
    const messages = JSON.parse(saved) as ChatMessage[];
    messages.forEach(msg => {
      this.chatComponent.SendMessage(
        msg.message,
        msg.senderName,
        msg.senderType,
        msg.id,
        false // Don't fire events when restoring
      );
    });
  }
}
```

## Notes

- The component automatically focuses the input field after operations
- Messages support full markdown syntax including code blocks, lists, and links
- The welcome screen is only shown when there are no messages
- Default icons use Font Awesome (fa-robot for AI, fa-user for users)
- The component uses Angular's ChangeDetectorRef for optimal performance