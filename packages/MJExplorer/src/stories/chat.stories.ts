import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ChatModule, ChatMessage, ChatWelcomeQuestion } from '@memberjunction/ng-chat';

// Helper to create chat messages
function createMessage(
  message: string,
  senderType: 'user' | 'ai',
  senderName?: string
): ChatMessage {
  return new ChatMessage(
    message,
    senderName || (senderType === 'user' ? 'You' : 'Assistant'),
    senderType
  );
}

// Helper to create welcome questions
function createWelcomeQuestion(topLine: string, bottomLine: string, prompt: string): ChatWelcomeQuestion {
  const q = new ChatWelcomeQuestion();
  q.topLine = topLine;
  q.bottomLine = bottomLine;
  q.prompt = prompt;
  return q;
}

const meta: Meta = {
  title: 'Components/Chat',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, ChatModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-chat\` component provides a chat interface for AI conversations with support for messages, welcome prompts, and loading states.

## Usage

\`\`\`html
<mj-chat
  [Messages]="messages"
  [WelcomeQuestions]="welcomeQuestions"
  [AllowSend]="true"
  [ShowWaitingIndicator]="false"
  (MessageAdded)="onMessageAdded($event)">
</mj-chat>
\`\`\`

## Module Import

\`\`\`typescript
import { ChatModule, ChatMessage, ChatWelcomeQuestion } from '@memberjunction/ng-chat';
\`\`\`

## Features
- User and AI message display
- Welcome message and suggested questions
- Message input with send button
- Loading/waiting indicator
- Disable send when processing
- Custom placeholder text
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default empty chat
export const Default: Story = {
  render: () => ({
    props: {
      messages: [] as ChatMessage[],
      onMessageAdded: (message: ChatMessage) => console.log('Message added:', message),
    },
    template: `
      <div style="width: 600px; height: 500px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <mj-chat
          [Messages]="messages"
          [InitialMessage]="'Hello! I\\'m your AI assistant. How can I help you today?'"
          [AllowSend]="true"
          (MessageAdded)="onMessageAdded($event)">
        </mj-chat>
      </div>
    `,
  }),
};

// With message history
export const WithMessages: Story = {
  render: () => {
    const messages = [
      createMessage('Can you help me understand how to use the API?', 'user', 'You'),
      createMessage(
        'Of course! The API provides several endpoints for managing your data. Here are the main ones:\n\n' +
        '1. **GET /api/users** - Retrieve a list of users\n' +
        '2. **POST /api/users** - Create a new user\n' +
        '3. **PUT /api/users/:id** - Update an existing user\n' +
        '4. **DELETE /api/users/:id** - Delete a user\n\n' +
        'Would you like me to explain any of these in more detail?',
        'ai',
        'Assistant'
      ),
      createMessage('Yes, can you show me an example of the POST request?', 'user', 'You'),
      createMessage(
        'Here\'s an example of creating a new user with a POST request:\n\n' +
        '```javascript\nconst response = await fetch(\'/api/users\', {\n' +
        '  method: \'POST\',\n' +
        '  headers: {\n' +
        '    \'Content-Type\': \'application/json\',\n' +
        '    \'Authorization\': \'Bearer YOUR_TOKEN\'\n' +
        '  },\n' +
        '  body: JSON.stringify({\n' +
        '    name: \'John Doe\',\n' +
        '    email: \'john@example.com\',\n' +
        '    role: \'user\'\n' +
        '  })\n' +
        '});\n```\n\n' +
        'The response will include the created user with their assigned ID.',
        'ai',
        'Assistant'
      ),
    ];

    return {
      props: {
        messages,
        onMessageAdded: (message: ChatMessage) => console.log('Message added:', message),
      },
      template: `
        <div style="width: 650px; height: 600px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <mj-chat
            [Messages]="messages"
            [AllowSend]="true"
            (MessageAdded)="onMessageAdded($event)">
          </mj-chat>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Chat with existing message history showing a conversation between user and AI assistant. Messages support markdown formatting.',
      },
    },
  },
};

// With welcome questions
export const WelcomeQuestions: Story = {
  render: () => {
    const welcomeQuestions = [
      createWelcomeQuestion('How do I', 'get started?', 'How do I get started with the platform?'),
      createWelcomeQuestion('What integrations', 'are available?', 'What integrations are available?'),
      createWelcomeQuestion('Help me', 'write a query', 'Can you help me write a database query?'),
      createWelcomeQuestion('Show me', 'best practices', 'Show me best practices for data modeling'),
    ];

    return {
      props: {
        messages: [] as ChatMessage[],
        welcomeQuestions,
        onMessageAdded: (message: ChatMessage) => console.log('Message added:', message),
      },
      template: `
        <div style="width: 650px; height: 550px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <mj-chat
            [Messages]="messages"
            [InitialMessage]="'Welcome! I\\'m here to help you get the most out of MemberJunction. Choose a topic below or ask me anything.'"
            [WelcomeQuestions]="welcomeQuestions"
            [AllowSend]="true"
            (MessageAdded)="onMessageAdded($event)">
          </mj-chat>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Welcome questions provide suggested prompts for users to get started. Each question has a top line, bottom line, and full prompt text.',
      },
    },
  },
};

// Waiting/loading state
export const WaitingState: Story = {
  render: () => {
    const messages = [
      createMessage('Can you analyze this dataset and provide insights?', 'user', 'You'),
    ];

    return {
      props: {
        messages,
      },
      template: `
        <div style="width: 600px; height: 500px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <mj-chat
            [Messages]="messages"
            [AllowSend]="false"
            [ShowWaitingIndicator]="true">
          </mj-chat>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'When `[ShowWaitingIndicator]="true"`, a loading animation shows that the AI is processing. Send is disabled during this time.',
      },
    },
  },
};

// Disabled send
export const DisabledSend: Story = {
  render: () => {
    const messages = [
      createMessage('I need help with a complex task.', 'user', 'You'),
      createMessage('I\'d be happy to help! However, your session has expired. Please log in again to continue.', 'ai', 'Assistant'),
    ];

    return {
      props: {
        messages,
      },
      template: `
        <div style="width: 600px; height: 500px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <mj-chat
            [Messages]="messages"
            [AllowSend]="false"
            [Placeholder]="'Session expired. Please log in to continue.'">
          </mj-chat>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'The send button can be disabled with `[AllowSend]="false"`. Useful for rate limiting, session expiry, or read-only views.',
      },
    },
  },
};

// Long conversation
export const LongConversation: Story = {
  render: () => {
    const topics = [
      { q: 'What is MemberJunction?', a: 'MemberJunction is a powerful open-source platform for building enterprise applications. It provides a metadata-driven architecture that makes it easy to create, manage, and extend business applications.' },
      { q: 'How does the entity system work?', a: 'The entity system is at the core of MemberJunction. Each entity represents a business object (like Users, Orders, Products) and is defined through metadata. This metadata drives automatic code generation, validation, and UI creation.' },
      { q: 'Can I customize the generated code?', a: 'Yes! While MemberJunction generates base classes and components automatically, you can extend them with custom logic. Use the @RegisterClass decorator to override generated forms and add your own business logic.' },
      { q: 'What about permissions?', a: 'MemberJunction has a comprehensive role-based permission system. You can define permissions at the entity level, field level, and even record level. Permissions are checked automatically in the generated API and UI.' },
      { q: 'How do I deploy my application?', a: 'Deployment options include Docker containers, Azure App Service, AWS, or traditional hosting. The API server is a Node.js application, and the Explorer UI is an Angular application that can be served from any static hosting.' },
    ];

    const messages: ChatMessage[] = [];
    topics.forEach((topic) => {
      messages.push(createMessage(topic.q, 'user', 'You'));
      messages.push(createMessage(topic.a, 'ai', 'Assistant'));
    });

    return {
      props: {
        messages,
        onMessageAdded: (message: ChatMessage) => console.log('Message added:', message),
      },
      template: `
        <div style="width: 650px; height: 600px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <mj-chat
            [Messages]="messages"
            [AllowSend]="true"
            (MessageAdded)="onMessageAdded($event)">
          </mj-chat>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Long conversations scroll smoothly. The most recent messages are visible by default.',
      },
    },
  },
};

// Custom placeholder
export const CustomPlaceholder: Story = {
  render: () => ({
    props: {
      messages: [] as ChatMessage[],
      onMessageAdded: (message: ChatMessage) => console.log('Message added:', message),
    },
    template: `
      <div style="width: 600px; height: 450px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <mj-chat
          [Messages]="messages"
          [InitialMessage]="'I\\'m your SQL assistant. Describe the data you need and I\\'ll help you write the query.'"
          [AllowSend]="true"
          [Placeholder]="'Describe the data you want to retrieve...'"
          (MessageAdded)="onMessageAdded($event)">
        </mj-chat>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Customize the input placeholder text to guide users on what kind of input is expected.',
      },
    },
  },
};

// Code-heavy conversation
export const CodeConversation: Story = {
  render: () => {
    const messages = [
      createMessage('Show me how to create a custom action in MemberJunction', 'user'),
      createMessage(
        'Here\'s how to create a custom action:\n\n' +
        '```typescript\nimport { BaseAction, ActionParam, RunActionResult } from \'@memberjunction/actions\';\nimport { RegisterClass } from \'@memberjunction/global\';\n\n' +
        '@RegisterClass(BaseAction, \'My Custom Action\')\n' +
        'export class MyCustomAction extends BaseAction {\n' +
        '  // Define parameters\n' +
        '  @ActionParam({ type: \'string\', required: true })\n' +
        '  inputData: string;\n\n' +
        '  async Run(): Promise<RunActionResult> {\n' +
        '    // Your custom logic here\n' +
        '    const result = await this.processData(this.inputData);\n' +
        '    \n' +
        '    return {\n' +
        '      Success: true,\n' +
        '      Message: \'Action completed successfully\',\n' +
        '      ResultData: result\n' +
        '    };\n' +
        '  }\n' +
        '}\n```\n\n' +
        'Key points:\n' +
        '- Extend `BaseAction` and use `@RegisterClass` decorator\n' +
        '- Define parameters with `@ActionParam` decorator\n' +
        '- Implement the `Run()` method with your logic\n' +
        '- Return a `RunActionResult` object',
        'ai'
      ),
    ];

    return {
      props: {
        messages,
        onMessageAdded: (message: ChatMessage) => console.log('Message added:', message),
      },
      template: `
        <div style="width: 700px; height: 600px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <mj-chat
            [Messages]="messages"
            [AllowSend]="true"
            (MessageAdded)="onMessageAdded($event)">
          </mj-chat>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'AI responses can include code blocks with syntax highlighting for technical conversations.',
      },
    },
  },
};
