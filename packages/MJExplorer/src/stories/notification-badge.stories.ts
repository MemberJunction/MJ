import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ConversationsModule } from '@memberjunction/ng-conversations';

const meta: Meta = {
  title: 'Components/NotificationBadge',
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
The \`mj-notification-badge\` component displays notification badges with various styles and animations.
It supports count, dot, pulse, and new badge types with priority-based coloring.

## Usage

\`\`\`html
<mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 5 }"></mj-notification-badge>
<mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'urgent' }"></mj-notification-badge>
\`\`\`

## Module Import

\`\`\`typescript
import { ConversationsModule } from '@memberjunction/ng-conversations';
\`\`\`

## Badge Types
- **count**: Displays a numeric count (e.g., "5", "99+")
- **dot**: Small circular indicator
- **pulse**: Animated pulsing badge with optional count
- **new**: Green "NEW" label

## Priority Levels
- **low/normal**: Blue (default)
- **high**: Orange
- **urgent**: Red with shake animation
        `,
      },
    },
  },
  argTypes: {
    show: {
      control: 'boolean',
      description: 'Whether to show the badge',
      defaultValue: true,
    },
    type: {
      control: 'select',
      options: ['count', 'dot', 'pulse', 'new'],
      description: 'Badge display type',
      defaultValue: 'count',
    },
    count: {
      control: { type: 'number', min: 0, max: 150 },
      description: 'Count to display (for count and pulse types)',
      defaultValue: 5,
    },
    priority: {
      control: 'select',
      options: ['low', 'normal', 'high', 'urgent'],
      description: 'Priority level affects badge color',
      defaultValue: 'normal',
    },
    animate: {
      control: 'boolean',
      description: 'Whether to animate the badge on appear',
      defaultValue: true,
    },
  },
};

export default meta;
type Story = StoryObj;

// Default count badge
export const Default: Story = {
  args: {
    show: true,
    type: 'count',
    count: 5,
    priority: 'normal',
    animate: true,
  },
  render: (args) => ({
    props: {
      badgeConfig: {
        show: args['show'],
        type: args['type'],
        count: args['count'],
        priority: args['priority'],
        animate: args['animate'],
      },
    },
    template: `
      <div style="padding: 20px;">
        <mj-notification-badge [badgeConfig]="badgeConfig"></mj-notification-badge>
      </div>
    `,
  }),
};

// Count badge variants
export const CountBadge: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 24px; align-items: center;">
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 3 }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Normal</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 12, priority: 'high' }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">High</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 99, priority: 'urgent' }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Urgent</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 150 }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">99+ overflow</div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Count badges display numeric values. Counts over 99 show as "99+". Colors change based on priority.',
      },
    },
  },
};

// Dot badge variants
export const DotBadge: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 32px; align-items: center;">
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot' }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Normal</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'high' }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">High</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'urgent' }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Urgent</div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Dot badges are simple circular indicators without numbers. Useful for presence or unread status.',
      },
    },
  },
};

// Pulse badge with animated rings
export const PulseBadge: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 48px; align-items: center;">
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse' }"></mj-notification-badge>
          <div style="margin-top: 12px; font-size: 12px; color: #666;">No count</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', count: 3 }"></mj-notification-badge>
          <div style="margin-top: 12px; font-size: 12px; color: #666;">With count</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', count: 5, priority: 'high' }"></mj-notification-badge>
          <div style="margin-top: 12px; font-size: 12px; color: #666;">High priority</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', count: 7, priority: 'urgent' }"></mj-notification-badge>
          <div style="margin-top: 12px; font-size: 12px; color: #666;">Urgent</div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Pulse badges have animated expanding rings to draw attention. Great for real-time notifications.',
      },
    },
  },
};

// New badge
export const NewBadge: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 32px; align-items: center;">
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'new' }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Static</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'new', animate: true }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Animated</div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'New badges display a green "NEW" label with gradient background. Perfect for highlighting new features or items.',
      },
    },
  },
};

// Animation showcase
export const AnimationShowcase: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Pop-in Animation</h4>
          <div style="display: flex; gap: 24px;">
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 5, animate: true }"></mj-notification-badge>
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', animate: true }"></mj-notification-badge>
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'new', animate: true }"></mj-notification-badge>
          </div>
        </div>
        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Urgent Shake Animation</h4>
          <div style="display: flex; gap: 24px;">
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 5, priority: 'urgent', animate: true }"></mj-notification-badge>
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'urgent', animate: true }"></mj-notification-badge>
          </div>
        </div>
        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Continuous Pulse Animation</h4>
          <div style="display: flex; gap: 48px;">
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', count: 3 }"></mj-notification-badge>
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', priority: 'urgent' }"></mj-notification-badge>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Various animation effects: pop-in on appear, shake for urgent priority, and continuous pulse rings.',
      },
    },
  },
};

// All badge types comparison
export const AllTypesComparison: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 48px; align-items: flex-end;">
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 5 }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Count</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot' }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Dot</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', count: 3 }"></mj-notification-badge>
          <div style="margin-top: 12px; font-size: 12px; color: #666;">Pulse</div>
        </div>
        <div style="text-align: center;">
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'new' }"></mj-notification-badge>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">New</div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Side-by-side comparison of all four badge types.',
      },
    },
  },
};

// In context - with a button
export const InContext: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 32px;">
        <div style="position: relative; display: inline-block;">
          <button style="
            padding: 10px 16px;
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
          ">
            <i class="fa fa-bell" style="margin-right: 6px;"></i>
            Notifications
          </button>
          <div style="position: absolute; top: -6px; right: -6px;">
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 12 }"></mj-notification-badge>
          </div>
        </div>

        <div style="position: relative; display: inline-block;">
          <button style="
            padding: 10px 16px;
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
          ">
            <i class="fa fa-envelope" style="margin-right: 6px;"></i>
            Messages
          </button>
          <div style="position: absolute; top: -4px; right: -4px;">
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'high' }"></mj-notification-badge>
          </div>
        </div>

        <div style="position: relative; display: inline-block;">
          <button style="
            padding: 10px 16px;
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
          ">
            <i class="fa fa-cog" style="margin-right: 6px;"></i>
            Settings
          </button>
          <div style="position: absolute; top: -6px; right: -10px;">
            <mj-notification-badge [badgeConfig]="{ show: true, type: 'new' }"></mj-notification-badge>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Badges positioned on buttons as they would appear in a real UI.',
      },
    },
  },
};

// Priority colors
export const PriorityColors: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; gap: 24px; align-items: center;">
          <span style="width: 80px; font-size: 13px; color: #666;">Low:</span>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 5, priority: 'low' }"></mj-notification-badge>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'low' }"></mj-notification-badge>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', priority: 'low' }"></mj-notification-badge>
        </div>
        <div style="display: flex; gap: 24px; align-items: center;">
          <span style="width: 80px; font-size: 13px; color: #666;">Normal:</span>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 5, priority: 'normal' }"></mj-notification-badge>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'normal' }"></mj-notification-badge>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', priority: 'normal' }"></mj-notification-badge>
        </div>
        <div style="display: flex; gap: 24px; align-items: center;">
          <span style="width: 80px; font-size: 13px; color: #666;">High:</span>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 5, priority: 'high' }"></mj-notification-badge>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'high' }"></mj-notification-badge>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', priority: 'high' }"></mj-notification-badge>
        </div>
        <div style="display: flex; gap: 24px; align-items: center;">
          <span style="width: 80px; font-size: 13px; color: #666;">Urgent:</span>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'count', count: 5, priority: 'urgent' }"></mj-notification-badge>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'dot', priority: 'urgent' }"></mj-notification-badge>
          <mj-notification-badge [badgeConfig]="{ show: true, type: 'pulse', priority: 'urgent' }"></mj-notification-badge>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All badge types shown with each priority level. Low/Normal = Blue, High = Orange, Urgent = Red.',
      },
    },
  },
};
