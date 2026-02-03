import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';

interface PillStoryArgs {
  value: string;
  color: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | null;
}

const meta: Meta<PillStoryArgs> = {
  title: 'Components/Pill',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, EntityViewerModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-pill\` component displays semantic status badges with automatic color detection based on value.

## Usage

\`\`\`html
<!-- Auto-color based on value -->
<mj-pill [value]="record.Status"></mj-pill>

<!-- Force specific color -->
<mj-pill [value]="'Custom'" [color]="'info'"></mj-pill>
\`\`\`

## Module Import

\`\`\`typescript
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
\`\`\`

## Auto-Color Detection

The pill automatically detects colors based on semantic value patterns:
- **Success (green)**: active, approved, complete, enabled, yes, true, verified, published, done
- **Danger (red)**: failed, error, rejected, expired, inactive, disabled, no, false, cancelled, blocked
- **Warning (amber)**: pending, waiting, review, in progress, processing, draft, queued, on hold
- **Info (blue)**: new, info, update, created, modified, changed, low, minor
- **Neutral (gray)**: Default fallback for unrecognized values
        `,
      },
    },
  },
  argTypes: {
    value: {
      control: 'text',
      description: 'The value to display in the pill',
    },
    color: {
      control: 'select',
      options: [null, 'success', 'warning', 'danger', 'info', 'neutral'],
      description: 'Force a specific color (overrides auto-detection)',
    },
  },
};

export default meta;
type Story = StoryObj<PillStoryArgs>;

// Default with auto-color
export const Default: Story = {
  args: {
    value: 'Active',
    color: null,
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="padding: 20px;">
        <mj-pill [value]="'${args.value}'" [color]="color"></mj-pill>
      </div>
    `,
  }),
};

// Success states
export const SuccessStates: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px;">
        <mj-pill value="Active"></mj-pill>
        <mj-pill value="Approved"></mj-pill>
        <mj-pill value="Complete"></mj-pill>
        <mj-pill value="Completed"></mj-pill>
        <mj-pill value="Success"></mj-pill>
        <mj-pill value="Enabled"></mj-pill>
        <mj-pill value="Yes"></mj-pill>
        <mj-pill value="True"></mj-pill>
        <mj-pill value="Verified"></mj-pill>
        <mj-pill value="Published"></mj-pill>
        <mj-pill value="Done"></mj-pill>
        <mj-pill value="Resolved"></mj-pill>
        <mj-pill value="Paid"></mj-pill>
        <mj-pill value="Delivered"></mj-pill>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Values that auto-detect as success (green) - positive completion states.',
      },
    },
  },
};

// Danger states
export const DangerStates: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px;">
        <mj-pill value="Failed"></mj-pill>
        <mj-pill value="Error"></mj-pill>
        <mj-pill value="Rejected"></mj-pill>
        <mj-pill value="Expired"></mj-pill>
        <mj-pill value="Inactive"></mj-pill>
        <mj-pill value="Disabled"></mj-pill>
        <mj-pill value="No"></mj-pill>
        <mj-pill value="False"></mj-pill>
        <mj-pill value="Cancelled"></mj-pill>
        <mj-pill value="Blocked"></mj-pill>
        <mj-pill value="Suspended"></mj-pill>
        <mj-pill value="Deleted"></mj-pill>
        <mj-pill value="Critical"></mj-pill>
        <mj-pill value="Urgent"></mj-pill>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Values that auto-detect as danger (red) - error and negative states.',
      },
    },
  },
};

// Warning states
export const WarningStates: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px;">
        <mj-pill value="Pending"></mj-pill>
        <mj-pill value="Waiting"></mj-pill>
        <mj-pill value="Review"></mj-pill>
        <mj-pill value="In Progress"></mj-pill>
        <mj-pill value="Processing"></mj-pill>
        <mj-pill value="Draft"></mj-pill>
        <mj-pill value="Scheduled"></mj-pill>
        <mj-pill value="Queued"></mj-pill>
        <mj-pill value="On Hold"></mj-pill>
        <mj-pill value="Paused"></mj-pill>
        <mj-pill value="Partial"></mj-pill>
        <mj-pill value="Incomplete"></mj-pill>
        <mj-pill value="Warning"></mj-pill>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Values that auto-detect as warning (amber) - in-progress and attention states.',
      },
    },
  },
};

// Info states
export const InfoStates: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px;">
        <mj-pill value="New"></mj-pill>
        <mj-pill value="Info"></mj-pill>
        <mj-pill value="Information"></mj-pill>
        <mj-pill value="Note"></mj-pill>
        <mj-pill value="Update"></mj-pill>
        <mj-pill value="Updated"></mj-pill>
        <mj-pill value="Created"></mj-pill>
        <mj-pill value="Modified"></mj-pill>
        <mj-pill value="Changed"></mj-pill>
        <mj-pill value="Low"></mj-pill>
        <mj-pill value="Minor"></mj-pill>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Values that auto-detect as info (blue) - informational and low-priority states.',
      },
    },
  },
};

// Neutral states
export const NeutralStates: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px;">
        <mj-pill value="Unknown"></mj-pill>
        <mj-pill value="Other"></mj-pill>
        <mj-pill value="N/A"></mj-pill>
        <mj-pill value="Default"></mj-pill>
        <mj-pill value="Standard"></mj-pill>
        <mj-pill value="Custom Value"></mj-pill>
        <mj-pill value="Category A"></mj-pill>
        <mj-pill value="Type 1"></mj-pill>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Values that fall back to neutral (gray) - unrecognized or generic labels.',
      },
    },
  },
};

// Forced colors
export const ForcedColors: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px;">
        <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
          <mj-pill value="Custom" color="success"></mj-pill>
          <span style="font-size: 11px; color: #666;">Forced Success</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
          <mj-pill value="Custom" color="warning"></mj-pill>
          <span style="font-size: 11px; color: #666;">Forced Warning</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
          <mj-pill value="Custom" color="danger"></mj-pill>
          <span style="font-size: 11px; color: #666;">Forced Danger</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
          <mj-pill value="Custom" color="info"></mj-pill>
          <span style="font-size: 11px; color: #666;">Forced Info</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
          <mj-pill value="Custom" color="neutral"></mj-pill>
          <span style="font-size: 11px; color: #666;">Forced Neutral</span>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Override auto-detection by forcing a specific color with the `color` input.',
      },
    },
  },
};

// All colors comparison
export const AllColorsComparison: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px;">
        <div style="display: flex; gap: 16px; align-items: center;">
          <span style="width: 80px; font-size: 13px; font-weight: 500; color: #333;">Success:</span>
          <mj-pill value="Active"></mj-pill>
          <mj-pill value="Complete"></mj-pill>
          <mj-pill value="Verified"></mj-pill>
        </div>
        <div style="display: flex; gap: 16px; align-items: center;">
          <span style="width: 80px; font-size: 13px; font-weight: 500; color: #333;">Warning:</span>
          <mj-pill value="Pending"></mj-pill>
          <mj-pill value="In Progress"></mj-pill>
          <mj-pill value="Draft"></mj-pill>
        </div>
        <div style="display: flex; gap: 16px; align-items: center;">
          <span style="width: 80px; font-size: 13px; font-weight: 500; color: #333;">Danger:</span>
          <mj-pill value="Failed"></mj-pill>
          <mj-pill value="Error"></mj-pill>
          <mj-pill value="Blocked"></mj-pill>
        </div>
        <div style="display: flex; gap: 16px; align-items: center;">
          <span style="width: 80px; font-size: 13px; font-weight: 500; color: #333;">Info:</span>
          <mj-pill value="New"></mj-pill>
          <mj-pill value="Updated"></mj-pill>
          <mj-pill value="Modified"></mj-pill>
        </div>
        <div style="display: flex; gap: 16px; align-items: center;">
          <span style="width: 80px; font-size: 13px; font-weight: 500; color: #333;">Neutral:</span>
          <mj-pill value="Unknown"></mj-pill>
          <mj-pill value="Other"></mj-pill>
          <mj-pill value="N/A"></mj-pill>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Side-by-side comparison of all five color categories.',
      },
    },
  },
};

// In table context
export const InTableContext: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 12px 16px; color: #374151;">Name</th>
              <th style="text-align: left; padding: 12px 16px; color: #374151;">Status</th>
              <th style="text-align: left; padding: 12px 16px; color: #374151;">Type</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">John Doe</td>
              <td style="padding: 12px 16px;"><mj-pill value="Active"></mj-pill></td>
              <td style="padding: 12px 16px;"><mj-pill value="Admin" color="info"></mj-pill></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Jane Smith</td>
              <td style="padding: 12px 16px;"><mj-pill value="Pending"></mj-pill></td>
              <td style="padding: 12px 16px;"><mj-pill value="User" color="neutral"></mj-pill></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Bob Johnson</td>
              <td style="padding: 12px 16px;"><mj-pill value="Inactive"></mj-pill></td>
              <td style="padding: 12px 16px;"><mj-pill value="Guest" color="neutral"></mj-pill></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Alice Brown</td>
              <td style="padding: 12px 16px;"><mj-pill value="Verified"></mj-pill></td>
              <td style="padding: 12px 16px;"><mj-pill value="Moderator" color="warning"></mj-pill></td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Pills used in a table context for displaying status and type columns.',
      },
    },
  },
};

// Underscore and hyphen handling
export const UnderscoreHyphenHandling: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px;">
        <mj-pill value="in_progress"></mj-pill>
        <mj-pill value="in-progress"></mj-pill>
        <mj-pill value="ON_HOLD"></mj-pill>
        <mj-pill value="on-hold"></mj-pill>
        <mj-pill value="in_review"></mj-pill>
        <mj-pill value="in-review"></mj-pill>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The pill component normalizes underscores and hyphens to spaces for color detection. Values like "in_progress" and "in-progress" both detect as warning.',
      },
    },
  },
};
