import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ConversationsModule } from '@memberjunction/ng-conversations';

/**
 * ActionableCommand interface matching @memberjunction/ai-core-plus
 * Used for typing story args
 */
interface ActionableCommandArgs {
  type: string;
  label: string;
  icon?: string;
  data?: Record<string, unknown>;
}

interface ActionableCommandsStoryArgs {
  commands: ActionableCommandArgs[];
  disabled: boolean;
  isLastMessage: boolean;
  isConversationOwner: boolean;
}

const meta: Meta<ActionableCommandsStoryArgs> = {
  title: 'Components/ActionableCommands',
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
The \`mj-actionable-commands\` component displays action buttons that users can trigger after an agent completes a task.

## Usage

\`\`\`html
<mj-actionable-commands
  [commands]="commands"
  [disabled]="false"
  [isLastMessage]="true"
  [isConversationOwner]="true"
  (commandExecuted)="onCommandExecuted($event)">
</mj-actionable-commands>
\`\`\`

## Module Import

\`\`\`typescript
import { ConversationsModule } from '@memberjunction/ng-conversations';
\`\`\`

## Visibility Rules
The component only displays when ALL conditions are met:
- \`isLastMessage\` is true (only show on the latest message)
- \`isConversationOwner\` is true (only owner can execute actions)
- \`commands\` array has at least one command

## Button Themes
- **open:resource** → Primary (blue)
- **open:url** → Info (cyan)
- **other** → Base (neutral)
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<ActionableCommandsStoryArgs>;

// Default with multiple commands
export const Default: Story = {
  args: {
    commands: [
      { type: 'open:resource', label: 'View Report', icon: 'fa-chart-bar' },
      { type: 'open:url', label: 'Open Dashboard', icon: 'fa-external-link-alt' },
      { type: 'action', label: 'Download PDF', icon: 'fa-file-pdf' }
    ],
    isLastMessage: true,
    isConversationOwner: true,
    disabled: false
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="story-max-width-md">
        <mj-actionable-commands
          [commands]="commands"
          [disabled]="disabled"
          [isLastMessage]="isLastMessage"
          [isConversationOwner]="isConversationOwner">
        </mj-actionable-commands>
      </div>
    `,
  }),
};

// Different command types
export const CommandTypes: Story = {
  render: () => ({
    template: `
      <div class="story-column story-max-width-md">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">open:resource (Primary theme):</div>
          <mj-actionable-commands
            [commands]="[{ type: 'open:resource', label: 'View Entity', icon: 'fa-database' }]"
            [isLastMessage]="true"
            [isConversationOwner]="true">
          </mj-actionable-commands>
        </div>

        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">open:url (Info theme):</div>
          <mj-actionable-commands
            [commands]="[{ type: 'open:url', label: 'Open External Link', icon: 'fa-external-link-alt' }]"
            [isLastMessage]="true"
            [isConversationOwner]="true">
          </mj-actionable-commands>
        </div>

        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Custom action (Base theme):</div>
          <mj-actionable-commands
            [commands]="[{ type: 'custom', label: 'Run Action', icon: 'fa-play' }]"
            [isLastMessage]="true"
            [isConversationOwner]="true">
          </mj-actionable-commands>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Different command types with their corresponding button themes.',
      },
    },
  },
};

// Disabled state
export const DisabledState: Story = {
  render: () => ({
    props: {
      commands: [
        { type: 'open:resource', label: 'View Report', icon: 'fa-chart-bar' },
        { type: 'action', label: 'Download', icon: 'fa-download' }
      ]
    },
    template: `
      <div class="story-column story-max-width-md">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Enabled:</div>
          <mj-actionable-commands
            [commands]="commands"
            [disabled]="false"
            [isLastMessage]="true"
            [isConversationOwner]="true">
          </mj-actionable-commands>
        </div>

        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Disabled:</div>
          <mj-actionable-commands
            [commands]="commands"
            [disabled]="true"
            [isLastMessage]="true"
            [isConversationOwner]="true">
          </mj-actionable-commands>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Commands can be disabled while still visible.',
      },
    },
  },
};

// Visibility conditions
export const VisibilityConditions: Story = {
  render: () => ({
    props: {
      commands: [
        { type: 'open:resource', label: 'View Report', icon: 'fa-chart-bar' }
      ]
    },
    template: `
      <div class="story-column story-max-width-md">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">✅ Visible (isLastMessage=true, isConversationOwner=true):</div>
          <div class="story-card-lg">
            <mj-actionable-commands
              [commands]="commands"
              [isLastMessage]="true"
              [isConversationOwner]="true">
            </mj-actionable-commands>
          </div>
        </div>

        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">❌ Hidden (isLastMessage=false):</div>
          <div class="story-placeholder">
            <mj-actionable-commands
              [commands]="commands"
              [isLastMessage]="false"
              [isConversationOwner]="true">
            </mj-actionable-commands>
            <div class="story-text-muted story-text-center">Component hidden</div>
          </div>
        </div>

        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">❌ Hidden (isConversationOwner=false):</div>
          <div class="story-placeholder">
            <mj-actionable-commands
              [commands]="commands"
              [isLastMessage]="true"
              [isConversationOwner]="false">
            </mj-actionable-commands>
            <div class="story-text-muted story-text-center">Component hidden</div>
          </div>
        </div>

        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">❌ Hidden (empty commands):</div>
          <div class="story-placeholder">
            <mj-actionable-commands
              [commands]="[]"
              [isLastMessage]="true"
              [isConversationOwner]="true">
            </mj-actionable-commands>
            <div class="story-text-muted story-text-center">Component hidden</div>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The component only renders when all visibility conditions are met.',
      },
    },
  },
};

// In message context
export const InMessageContext: Story = {
  render: () => ({
    props: {
      commands: [
        { type: 'open:resource', label: 'View Analysis', icon: 'fa-chart-line' },
        { type: 'open:url', label: 'Open Source Data', icon: 'fa-external-link-alt' },
        { type: 'action', label: 'Export Results', icon: 'fa-download' }
      ]
    },
    template: `
      <div style="width: 600px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <!-- Message header -->
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8b5cf6, #6366f1);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 14px;
          ">
            <i class="fas fa-robot"></i>
          </div>
          <div>
            <div style="font-size: 14px; font-weight: 600; color: #1f2937;">Data Analysis Agent</div>
            <div style="font-size: 12px; color: #6b7280;">Just now</div>
          </div>
        </div>

        <!-- Message content -->
        <div style="padding-left: 48px;">
          <div style="font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 8px;">
            I've completed the analysis of your sales data. The results show a 15% increase in Q4 compared to Q3.
            Here are some key insights:
          </div>
          <ul style="font-size: 14px; color: #374151; line-height: 1.6; margin: 0 0 16px 0; padding-left: 20px;">
            <li>Total revenue: $1.2M</li>
            <li>Top performing region: Northeast</li>
            <li>Growth rate: 15.3%</li>
          </ul>

          <!-- Actionable commands -->
          <mj-actionable-commands
            [commands]="commands"
            [isLastMessage]="true"
            [isConversationOwner]="true">
          </mj-actionable-commands>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Actionable commands shown in context at the end of an agent message.',
      },
    },
  },
};

// Various icon examples
export const IconExamples: Story = {
  render: () => ({
    props: {
      commands: [
        { type: 'action', label: 'Download', icon: 'fa-download' },
        { type: 'action', label: 'Share', icon: 'fa-share' },
        { type: 'action', label: 'Print', icon: 'fa-print' },
        { type: 'action', label: 'Email', icon: 'fa-envelope' },
        { type: 'open:resource', label: 'View Details', icon: 'fa-eye' },
        { type: 'open:url', label: 'Open Link', icon: 'fa-external-link-alt' }
      ]
    },
    template: `
      <div class="story-width-lg">
        <mj-actionable-commands
          [commands]="commands"
          [isLastMessage]="true"
          [isConversationOwner]="true">
        </mj-actionable-commands>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Various Font Awesome icons can be used with commands.',
      },
    },
  },
};

// Without icons
export const WithoutIcons: Story = {
  render: () => ({
    props: {
      commands: [
        { type: 'open:resource', label: 'View Report' },
        { type: 'open:url', label: 'Open Dashboard' },
        { type: 'action', label: 'Export Data' }
      ]
    },
    template: `
      <div class="story-max-width-md">
        <mj-actionable-commands
          [commands]="commands"
          [isLastMessage]="true"
          [isConversationOwner]="true">
        </mj-actionable-commands>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Commands can be displayed without icons for a simpler look.',
      },
    },
  },
};
