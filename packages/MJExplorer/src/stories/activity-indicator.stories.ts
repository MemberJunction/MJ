import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ConversationsModule } from '@memberjunction/ng-conversations';

const meta: Meta = {
  title: 'Components/ActivityIndicator',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, ConversationsModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-activity-indicator\` component displays animated activity indicators for various states
like agent processing, typing, or general processing activities.

## Usage

\`\`\`html
<mj-activity-indicator [config]="{ show: true, type: 'agent', text: 'Agent thinking...' }"></mj-activity-indicator>
<mj-activity-indicator [config]="{ show: true, type: 'typing' }"></mj-activity-indicator>
\`\`\`

## Module Import

\`\`\`typescript
import { ConversationsModule } from '@memberjunction/ng-conversations';
\`\`\`

## Activity Types
- **agent**: Blue styling for AI agent activities
- **processing**: Orange/yellow styling for data processing
- **typing**: Gray styling for user typing indicators
        `,
      },
    },
  },
  argTypes: {
    show: {
      control: 'boolean',
      description: 'Whether to show the indicator',
      defaultValue: true,
    },
    type: {
      control: 'select',
      options: ['agent', 'processing', 'typing'],
      description: 'Type of activity indicator',
      defaultValue: 'agent',
    },
    text: {
      control: 'text',
      description: 'Optional text label to display',
      defaultValue: '',
    },
  },
};

export default meta;
type Story = StoryObj;

// Default agent activity
export const Default: Story = {
  args: {
    show: true,
    type: 'agent',
    text: 'Agent processing...',
  },
  render: (args) => ({
    props: {
      config: {
        show: args['show'],
        type: args['type'],
        text: args['text'],
      },
    },
    template: `
      <mj-activity-indicator [config]="config"></mj-activity-indicator>
    `,
  }),
};

// Agent activity indicator
export const AgentActivity: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <mj-activity-indicator [config]="{ show: true, type: 'agent', text: 'Agent thinking...' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'agent', text: 'Analyzing data...' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'agent', text: 'Generating response...' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'agent' }"></mj-activity-indicator>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Blue-themed indicators for AI agent activities. Optional text describes the current action.',
      },
    },
  },
};

// Processing activity indicator
export const ProcessingActivity: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <mj-activity-indicator [config]="{ show: true, type: 'processing', text: 'Loading records...' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'processing', text: 'Saving changes...' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'processing', text: 'Syncing data...' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'processing' }"></mj-activity-indicator>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Yellow/orange-themed indicators for data processing operations.',
      },
    },
  },
};

// Typing activity indicator
export const TypingActivity: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <mj-activity-indicator [config]="{ show: true, type: 'typing', text: 'User is typing...' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'typing', text: 'Someone is typing' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'typing' }"></mj-activity-indicator>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Gray-themed indicators for typing/input activities. Common in chat interfaces.',
      },
    },
  },
};

// All types comparison
export const AllTypesComparison: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 24px; align-items: center;">
        <div style="text-align: center;">
          <mj-activity-indicator [config]="{ show: true, type: 'agent', text: 'Agent' }"></mj-activity-indicator>
        </div>
        <div style="text-align: center;">
          <mj-activity-indicator [config]="{ show: true, type: 'processing', text: 'Processing' }"></mj-activity-indicator>
        </div>
        <div style="text-align: center;">
          <mj-activity-indicator [config]="{ show: true, type: 'typing', text: 'Typing' }"></mj-activity-indicator>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Side-by-side comparison of all three activity types showing their distinct color schemes.',
      },
    },
  },
};

// Without text (dots only)
export const DotsOnly: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 24px; align-items: center;">
        <mj-activity-indicator [config]="{ show: true, type: 'agent' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'processing' }"></mj-activity-indicator>
        <mj-activity-indicator [config]="{ show: true, type: 'typing' }"></mj-activity-indicator>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Activity indicators without text - just the animated dots. Compact option for tight spaces.',
      },
    },
  },
};

// In context - chat message
export const InChatContext: Story = {
  render: () => ({
    template: `
      <div style="
        background: #f9fafb;
        border-radius: 12px;
        padding: 16px;
        max-width: 400px;
      ">
        <div style="
          background: white;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 8px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        ">
          <div style="font-size: 13px; color: #374151;">
            Can you help me analyze this dataset?
          </div>
        </div>
        <div style="padding-left: 8px;">
          <mj-activity-indicator [config]="{ show: true, type: 'agent', text: 'Agent is thinking...' }"></mj-activity-indicator>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Activity indicator shown in a chat context, indicating the AI agent is preparing a response.',
      },
    },
  },
};

// Loading state context
export const InLoadingContext: Story = {
  render: () => ({
    template: `
      <div style="
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 24px;
        text-align: center;
        background: white;
        min-width: 300px;
      ">
        <div style="margin-bottom: 16px;">
          <mj-activity-indicator [config]="{ show: true, type: 'processing', text: 'Loading dashboard data...' }"></mj-activity-indicator>
        </div>
        <div style="font-size: 12px; color: #9ca3af;">
          Please wait while we fetch your data
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Activity indicator used in a card loading state.',
      },
    },
  },
};

// Animation detail view
export const AnimationDetail: Story = {
  render: () => ({
    template: `
      <div style="
        padding: 40px;
        background: #f3f4f6;
        border-radius: 12px;
      ">
        <div style="transform: scale(3); transform-origin: center;">
          <mj-activity-indicator [config]="{ show: true, type: 'agent' }"></mj-activity-indicator>
        </div>
        <div style="margin-top: 48px; text-align: center; font-size: 12px; color: #6b7280;">
          3x scale to show animation detail
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Enlarged view showing the cascading dot pulse animation in detail.',
      },
    },
  },
};
