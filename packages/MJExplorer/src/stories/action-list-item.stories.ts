import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { ChipModule } from '@progress/kendo-angular-buttons';
import { ActionListItemComponent } from '@memberjunction/ng-dashboards';

// Mock the properties that ActionListItem actually uses
interface MockAction {
  ID: string;
  Name: string;
  Description: string | null;
  Status: 'Active' | 'Pending' | 'Disabled';
  Type: 'Generated' | 'Custom';
  CategoryID: string | null;
  IconClass: string | null;
  __mj_UpdatedAt: Date | null;
  Params: Array<{ Name: string }>;
}

interface MockCategory {
  ID: string;
  Name: string;
}

function createMockAction(overrides: Partial<MockAction> = {}): MockAction {
  return {
    ID: 'action-' + Math.random().toString(36).substr(2, 9),
    Name: 'Sample Action',
    Description: 'This is a sample action description',
    Status: 'Active',
    Type: 'Custom',
    CategoryID: 'cat-1',
    IconClass: null,
    __mj_UpdatedAt: new Date(Date.now() - 3600000),
    Params: [],
    ...overrides
  };
}

function createCategoriesMap(categories: MockCategory[]): Map<string, MockCategory> {
  const map = new Map<string, MockCategory>();
  categories.forEach(cat => map.set(cat.ID, cat));
  return map;
}

const defaultCategories: MockCategory[] = [
  { ID: 'cat-1', Name: 'Email & Communication' },
  { ID: 'cat-2', Name: 'Data Processing' },
  { ID: 'cat-3', Name: 'Integrations' },
  { ID: 'cat-4', Name: 'Automation' },
];

const meta: Meta = {
  title: 'Components/ActionListItem',
  component: ActionListItemComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, ButtonsModule, ChipModule],
      declarations: [ActionListItemComponent],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-action-list-item\` component displays an action in a horizontal list row format, ideal for dense data tables.

## Usage

\`\`\`html
<mj-action-list-item
  [Action]="action"
  [Categories]="categoriesMap"
  [IsCompact]="false"
  (ActionClick)="onSelect($event)"
  (RunClick)="onRun($event)">
</mj-action-list-item>
\`\`\`

## Module Import

\`\`\`typescript
import { DashboardsModule } from '@memberjunction/ng-dashboards';
\`\`\`

## Features
- Horizontal row layout for list/table views
- Compact mode for denser display
- Status chip with color coding
- Type badge (AI/Custom)
- Parameter count
- Last updated timestamp
- Run and Edit action buttons
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default
export const Default: Story = {
  render: () => ({
    props: {
      action: createMockAction({
        Name: 'Send Welcome Email',
        Description: 'Sends a welcome email to new users',
        Params: [{ Name: 'email' }, { Name: 'name' }, { Name: 'template' }]
      }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="width: 900px; background: white; border: 1px solid #e5e7eb; border-radius: 8px;">
        <mj-action-list-item [Action]="action" [Categories]="categories"></mj-action-list-item>
      </div>
    `,
  }),
};

// Compact vs Normal
export const CompactComparison: Story = {
  render: () => ({
    props: {
      action: createMockAction({
        Name: 'Process Payment',
        Description: 'Processes payment through the configured gateway',
        Params: [{ Name: 'amount' }, { Name: 'currency' }, { Name: 'customerId' }]
      }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px; width: 900px;">
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Normal Mode</h4>
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px;">
            <mj-action-list-item [Action]="action" [Categories]="categories" [IsCompact]="false"></mj-action-list-item>
          </div>
        </div>
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Compact Mode</h4>
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px;">
            <mj-action-list-item [Action]="action" [Categories]="categories" [IsCompact]="true"></mj-action-list-item>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Compact mode hides the description and some labels for denser display.',
      },
    },
  },
};

// Multiple items - list view
export const ListView: Story = {
  render: () => ({
    props: {
      actions: [
        createMockAction({ Name: 'Send Email', Description: 'Send transactional emails', Status: 'Active', IconClass: 'fa-solid fa-envelope', Params: [{ Name: 'to' }, { Name: 'subject' }] }),
        createMockAction({ Name: 'Process Order', Description: 'Process incoming orders', Status: 'Active', IconClass: 'fa-solid fa-shopping-cart', Params: [{ Name: 'orderId' }] }),
        createMockAction({ Name: 'AI Summarizer', Description: 'Generate AI summaries', Status: 'Active', Type: 'Generated', Params: [{ Name: 'text' }, { Name: 'maxLength' }] }),
        createMockAction({ Name: 'Sync CRM', Description: 'Sync with Salesforce', Status: 'Pending', IconClass: 'fa-brands fa-salesforce', CategoryID: 'cat-3' }),
        createMockAction({ Name: 'Generate Report', Description: 'Create analytics reports', Status: 'Active', IconClass: 'fa-solid fa-chart-bar', CategoryID: 'cat-2', Params: [{ Name: 'startDate' }, { Name: 'endDate' }, { Name: 'format' }, { Name: 'filters' }] }),
        createMockAction({ Name: 'Legacy Import', Description: 'Import from legacy system', Status: 'Disabled', IconClass: 'fa-solid fa-file-import', CategoryID: 'cat-2' }),
      ],
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="width: 950px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        @for (action of actions; track action.ID) {
          <mj-action-list-item [Action]="action" [Categories]="categories"></mj-action-list-item>
        }
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Multiple list items stacked vertically, showing various statuses and types.',
      },
    },
  },
};

// Compact list view
export const CompactListView: Story = {
  render: () => ({
    props: {
      actions: [
        createMockAction({ Name: 'Send Email', Status: 'Active', IconClass: 'fa-solid fa-envelope' }),
        createMockAction({ Name: 'Process Order', Status: 'Active', IconClass: 'fa-solid fa-shopping-cart' }),
        createMockAction({ Name: 'AI Summarizer', Status: 'Active', Type: 'Generated' }),
        createMockAction({ Name: 'Sync CRM', Status: 'Pending', IconClass: 'fa-brands fa-salesforce' }),
        createMockAction({ Name: 'Generate Report', Status: 'Active', IconClass: 'fa-solid fa-chart-bar' }),
        createMockAction({ Name: 'Legacy Import', Status: 'Disabled', IconClass: 'fa-solid fa-file-import' }),
        createMockAction({ Name: 'Slack Notify', Status: 'Active', IconClass: 'fa-brands fa-slack' }),
        createMockAction({ Name: 'Backup DB', Status: 'Active', IconClass: 'fa-solid fa-database' }),
      ],
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="width: 800px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        @for (action of actions; track action.ID) {
          <mj-action-list-item [Action]="action" [Categories]="categories" [IsCompact]="true"></mj-action-list-item>
        }
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Compact mode allows more items to be visible in the same space.',
      },
    },
  },
};

// Status variations
export const StatusVariations: Story = {
  render: () => ({
    props: {
      activeAction: createMockAction({ Name: 'Active Action', Status: 'Active' }),
      pendingAction: createMockAction({ Name: 'Pending Action', Status: 'Pending' }),
      disabledAction: createMockAction({ Name: 'Disabled Action', Status: 'Disabled' }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="width: 900px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <mj-action-list-item [Action]="activeAction" [Categories]="categories"></mj-action-list-item>
        <mj-action-list-item [Action]="pendingAction" [Categories]="categories"></mj-action-list-item>
        <mj-action-list-item [Action]="disabledAction" [Categories]="categories"></mj-action-list-item>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Status chip shows Active (green), Pending (yellow), or Disabled (red). Run button is disabled for non-active actions.',
      },
    },
  },
};

// Type variations
export const TypeVariations: Story = {
  render: () => ({
    props: {
      customAction: createMockAction({ Name: 'Custom Action', Type: 'Custom', Description: 'A manually coded action' }),
      aiAction: createMockAction({ Name: 'AI Generated Action', Type: 'Generated', Description: 'An AI-generated action' }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="width: 900px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <mj-action-list-item [Action]="customAction" [Categories]="categories"></mj-action-list-item>
        <mj-action-list-item [Action]="aiAction" [Categories]="categories"></mj-action-list-item>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Custom actions show a code icon, AI-generated actions show a robot icon with "AI" badge.',
      },
    },
  },
};

// With header row (table-like)
export const WithHeader: Story = {
  render: () => ({
    props: {
      actions: [
        createMockAction({ Name: 'Send Welcome Email', Description: 'Onboarding emails', Status: 'Active', IconClass: 'fa-solid fa-envelope', Params: [{ Name: 'email' }, { Name: 'name' }] }),
        createMockAction({ Name: 'Process Payment', Description: 'Payment processing', Status: 'Active', IconClass: 'fa-solid fa-credit-card', CategoryID: 'cat-2', Params: [{ Name: 'amount' }] }),
        createMockAction({ Name: 'Generate Summary', Description: 'AI document summaries', Status: 'Active', Type: 'Generated', Params: [{ Name: 'text' }] }),
        createMockAction({ Name: 'Sync Inventory', Description: 'Warehouse sync', Status: 'Pending', IconClass: 'fa-solid fa-boxes-stacked', CategoryID: 'cat-3' }),
      ],
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="width: 950px;">
        <!-- Header -->
        <div style="
          display: grid;
          grid-template-columns: 40px 1fr 140px 80px 70px 60px 80px 70px;
          gap: 12px;
          padding: 8px 16px;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
          border-radius: 8px 8px 0 0;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
        ">
          <div></div>
          <div>Name</div>
          <div>Category</div>
          <div>Status</div>
          <div>Type</div>
          <div>Params</div>
          <div>Updated</div>
          <div>Actions</div>
        </div>

        <!-- List items -->
        <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; overflow: hidden;">
          @for (action of actions; track action.ID) {
            <mj-action-list-item [Action]="action" [Categories]="categories"></mj-action-list-item>
          }
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'List items with a header row, creating a table-like appearance.',
      },
    },
  },
};

// Different parameter counts
export const ParameterCounts: Story = {
  render: () => ({
    props: {
      noParams: createMockAction({ Name: 'Clear Cache', Description: 'No parameters needed', Params: [] }),
      fewParams: createMockAction({ Name: 'Send Notification', Description: 'Basic notification', Params: [{ Name: 'userId' }, { Name: 'message' }] }),
      manyParams: createMockAction({ Name: 'Complex Import', Description: 'Many configuration options', Params: [{ Name: 'source' }, { Name: 'destination' }, { Name: 'format' }, { Name: 'mapping' }, { Name: 'validation' }, { Name: 'errorHandling' }, { Name: 'logging' }] }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="width: 900px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <mj-action-list-item [Action]="noParams" [Categories]="categories"></mj-action-list-item>
        <mj-action-list-item [Action]="fewParams" [Categories]="categories"></mj-action-list-item>
        <mj-action-list-item [Action]="manyParams" [Categories]="categories"></mj-action-list-item>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The params column shows the count of parameters. Hover to see the tooltip.',
      },
    },
  },
};
