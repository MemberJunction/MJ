import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ChipModule } from '@progress/kendo-angular-buttons';

/**
 * This story demonstrates the simple action item pattern used in the Actions Overview page.
 * It's not a standalone component - it's rendered inline in templates throughout the app.
 *
 * Pattern: Icon + Name/Description + Status Badge
 */

interface SimpleAction {
  ID: string;
  Name: string;
  Description: string | null;
  Status: 'Active' | 'Pending' | 'Disabled';
  Type: 'Generated' | 'Custom';
  IconClass: string | null;
}

function createAction(overrides: Partial<SimpleAction> = {}): SimpleAction {
  return {
    ID: 'action-' + Math.random().toString(36).substr(2, 9),
    Name: 'Sample Action',
    Description: 'This is a sample action description',
    Status: 'Active',
    Type: 'Custom',
    IconClass: null,
    ...overrides
  };
}

function getActionIcon(action: SimpleAction): string {
  if (action.IconClass) return action.IconClass;
  return action.Type === 'Generated' ? 'fa-solid fa-robot' : 'fa-solid fa-code';
}

function getStatusColor(status: string): 'success' | 'warning' | 'error' {
  switch (status) {
    case 'Active': return 'success';
    case 'Pending': return 'warning';
    case 'Disabled': return 'error';
    default: return 'success';
  }
}

const meta: Meta = {
  title: 'Patterns/ActionItemSimple',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, ChipModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
This is the simple action item pattern used in the **Actions Overview** page's "Recent Actions" panel.

## Pattern Structure
\`\`\`
[Icon] [Name        ] [Status Badge]
       [Description ]
\`\`\`

## Not a Component
This is an **inline template pattern**, not a reusable component. It's used directly in templates like:

\`\`\`html
<div class="action-item" (click)="openAction(action)">
  <div class="action-icon">
    <i [class]="getActionIcon(action)"></i>
  </div>
  <div class="action-info">
    <div class="action-name">{{ action.Name }}</div>
    <div class="action-description">{{ action.Description }}</div>
  </div>
  <div class="action-status">
    <kendo-chip [themeColor]="getStatusColor(action.Status)" [size]="'small'">
      {{ action.Status }}
    </kendo-chip>
  </div>
</div>
\`\`\`

## Properties Used
- \`Name\` - Action name
- \`Description\` - Optional description text
- \`Status\` - 'Active' | 'Pending' | 'Disabled'
- \`Type\` - 'Generated' | 'Custom' (determines default icon)
- \`IconClass\` - Optional custom icon override
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Single item
export const Default: Story = {
  render: () => ({
    props: {
      action: createAction({
        Name: 'Send Welcome Email',
        Description: 'Sends a welcome email to new users with onboarding info',
        Status: 'Active',
        IconClass: 'fa-solid fa-envelope',
      }),
      getActionIcon,
      getStatusColor,
    },
    template: `
      <div style="
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        cursor: pointer;
        max-width: 500px;
      " class="action-item">
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4f46e5;
          flex-shrink: 0;
        ">
          <i [class]="getActionIcon(action)"></i>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            {{ action.Name }}
          </div>
          <div style="font-size: 13px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            {{ action.Description || 'No description' }}
          </div>
        </div>
        <kendo-chip [themeColor]="getStatusColor(action.Status)" [size]="'small'">
          {{ action.Status }}
        </kendo-chip>
      </div>
    `,
  }),
};

// All statuses
export const StatusVariations: Story = {
  render: () => ({
    props: {
      actions: [
        createAction({ Name: 'Process Payment', Description: 'Handles payment transactions', Status: 'Active', IconClass: 'fa-solid fa-credit-card' }),
        createAction({ Name: 'Generate Report', Description: 'Creates analytics reports', Status: 'Pending', IconClass: 'fa-solid fa-chart-bar' }),
        createAction({ Name: 'Legacy Import', Description: 'Old data import (deprecated)', Status: 'Disabled', IconClass: 'fa-solid fa-file-import' }),
      ],
      getActionIcon,
      getStatusColor,
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 8px; max-width: 500px;">
        @for (action of actions; track action.ID) {
          <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            cursor: pointer;
          ">
            <div style="
              width: 36px;
              height: 36px;
              border-radius: 8px;
              background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #4f46e5;
              flex-shrink: 0;
            ">
              <i [class]="getActionIcon(action)"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 500; color: #1e293b;">{{ action.Name }}</div>
              <div style="font-size: 13px; color: #64748b;">{{ action.Description }}</div>
            </div>
            <kendo-chip [themeColor]="getStatusColor(action.Status)" [size]="'small'">
              {{ action.Status }}
            </kendo-chip>
          </div>
        }
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The three status states: Active (green), Pending (yellow), Disabled (red).',
      },
    },
  },
};

// AI vs Custom icons
export const TypeIcons: Story = {
  render: () => ({
    props: {
      actions: [
        createAction({ Name: 'Custom Action', Description: 'Manually coded action', Type: 'Custom', IconClass: null }),
        createAction({ Name: 'AI Generated Action', Description: 'Created by AI', Type: 'Generated', IconClass: null }),
        createAction({ Name: 'With Custom Icon', Description: 'Has explicit IconClass', Type: 'Custom', IconClass: 'fa-solid fa-bolt' }),
      ],
      getActionIcon,
      getStatusColor,
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 8px; max-width: 500px;">
        @for (action of actions; track action.ID) {
          <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          ">
            <div style="
              width: 36px;
              height: 36px;
              border-radius: 8px;
              background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #4f46e5;
              flex-shrink: 0;
            ">
              <i [class]="getActionIcon(action)"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 500; color: #1e293b;">{{ action.Name }}</div>
              <div style="font-size: 13px; color: #64748b;">{{ action.Description }}</div>
            </div>
            <kendo-chip [themeColor]="getStatusColor(action.Status)" [size]="'small'">
              {{ action.Status }}
            </kendo-chip>
          </div>
        }
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Icon is determined by: 1) `IconClass` if set, 2) robot icon for AI Generated, 3) code icon for Custom.',
      },
    },
  },
};

// Recent Actions panel mockup
export const RecentActionsPanel: Story = {
  render: () => ({
    props: {
      actions: [
        createAction({ Name: 'Send Welcome Email', Description: 'Sends onboarding email to new users', Status: 'Active', IconClass: 'fa-solid fa-envelope' }),
        createAction({ Name: 'Process Payment', Description: 'Handles Stripe payment processing', Status: 'Active', IconClass: 'fa-solid fa-credit-card' }),
        createAction({ Name: 'AI Document Summary', Description: 'Generates document summaries using GPT', Status: 'Active', Type: 'Generated' }),
        createAction({ Name: 'Sync Inventory', Description: 'Syncs with warehouse management system', Status: 'Pending', IconClass: 'fa-solid fa-boxes-stacked' }),
        createAction({ Name: 'Generate Monthly Report', Description: 'Creates analytics reports', Status: 'Active', IconClass: 'fa-solid fa-chart-bar' }),
        createAction({ Name: 'Legacy Data Import', Description: 'Imports from old system', Status: 'Disabled', IconClass: 'fa-solid fa-file-import' }),
      ],
      getActionIcon,
      getStatusColor,
    },
    template: `
      <div style="
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        overflow: hidden;
        max-width: 500px;
      ">
        <!-- Panel Header -->
        <div style="
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
          background: #f8fafc;
        ">
          <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-clock" style="color: #64748b;"></i>
            Recent Actions
          </h3>
        </div>

        <!-- Action List -->
        <div style="padding: 8px;">
          @for (action of actions; track action.ID) {
            <div style="
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 10px 12px;
              border-radius: 8px;
              cursor: pointer;
              transition: background 0.15s;
            " onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
              <div style="
                width: 32px;
                height: 32px;
                border-radius: 6px;
                background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #4f46e5;
                font-size: 13px;
                flex-shrink: 0;
              ">
                <i [class]="getActionIcon(action)"></i>
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  {{ action.Name }}
                </div>
                <div style="font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  {{ action.Description || 'No description' }}
                </div>
              </div>
              <kendo-chip [themeColor]="getStatusColor(action.Status)" [size]="'small'">
                {{ action.Status }}
              </kendo-chip>
            </div>
          }
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'This matches the "Recent Actions" panel in the Actions Overview page.',
      },
    },
  },
};

// No description
export const NoDescription: Story = {
  render: () => ({
    props: {
      action: createAction({
        Name: 'Quick Task',
        Description: null,
        Status: 'Active',
        IconClass: 'fa-solid fa-bolt',
      }),
      getActionIcon,
      getStatusColor,
    },
    template: `
      <div style="
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        max-width: 400px;
      ">
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4f46e5;
        ">
          <i [class]="getActionIcon(action)"></i>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 500; color: #1e293b;">{{ action.Name }}</div>
          <div style="font-size: 13px; color: #94a3b8; font-style: italic;">{{ action.Description || 'No description' }}</div>
        </div>
        <kendo-chip [themeColor]="getStatusColor(action.Status)" [size]="'small'">
          {{ action.Status }}
        </kendo-chip>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When Description is null, shows "No description" in italics.',
      },
    },
  },
};
