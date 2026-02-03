import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { ChipModule } from '@progress/kendo-angular-buttons';
import { ActionCardComponent } from '@memberjunction/ng-dashboards';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Mock the properties that ActionCard actually uses from ActionEntityExtended
interface MockAction {
  ID: string;
  Name: string;
  Description: string | null;
  Status: 'Active' | 'Pending' | 'Disabled';
  Type: 'Generated' | 'Custom';
  CategoryID: string | null;
  IconClass: string | null;
  CodeApprovalStatus: 'Approved' | 'Pending' | 'Rejected' | null;
  __mj_UpdatedAt: Date | null;
  Params: Array<{ Name: string; IsRequired: boolean }>;
}

// Mock category
interface MockCategory {
  ID: string;
  Name: string;
}

// Helper to create mock actions
function createMockAction(overrides: Partial<MockAction> = {}): MockAction {
  return {
    ID: 'action-' + Math.random().toString(36).substr(2, 9),
    Name: 'Sample Action',
    Description: 'This is a sample action description',
    Status: 'Active',
    Type: 'Custom',
    CategoryID: 'cat-1',
    IconClass: null,
    CodeApprovalStatus: null,
    __mj_UpdatedAt: new Date(Date.now() - 3600000), // 1 hour ago
    Params: [],
    ...overrides
  };
}

// Create categories map
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
  title: 'Components/ActionCard',
  component: ActionCardComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, ButtonsModule, ChipModule, SharedGenericModule],
      declarations: [ActionCardComponent],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-action-card\` component displays an action in a card format with status, category, and expandable execution statistics.

## Usage

\`\`\`html
<mj-action-card
  [Action]="action"
  [Categories]="categoriesMap"
  (ActionClick)="onActionClick($event)"
  (EditClick)="onEdit($event)"
  (RunClick)="onRun($event)">
</mj-action-card>
\`\`\`

## Module Import

\`\`\`typescript
import { DashboardsModule } from '@memberjunction/ng-dashboards';
\`\`\`

## Features
- Displays action name, description, status badge
- Shows category with click-to-filter
- AI-generated vs Custom type indicator
- Code approval status for generated actions
- Expandable section with execution statistics
- Run, Edit, and Stats action buttons
- Parameters preview in expanded view
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default active action
export const Default: Story = {
  render: () => ({
    props: {
      action: createMockAction({
        Name: 'Send Welcome Email',
        Description: 'Sends a welcome email to new users with onboarding instructions and helpful resources.',
        Status: 'Active',
        Type: 'Custom',
        Params: [
          { Name: 'recipientEmail', IsRequired: true },
          { Name: 'userName', IsRequired: true },
          { Name: 'templateId', IsRequired: false },
        ]
      }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="width: 380px;">
        <mj-action-card [Action]="action" [Categories]="categories"></mj-action-card>
      </div>
    `,
  }),
};

// Status variations
export const StatusVariations: Story = {
  render: () => ({
    props: {
      activeAction: createMockAction({
        Name: 'Process Payment',
        Description: 'Processes payment through the configured payment gateway.',
        Status: 'Active',
      }),
      pendingAction: createMockAction({
        Name: 'Generate Report',
        Description: 'Generates a monthly analytics report.',
        Status: 'Pending',
      }),
      disabledAction: createMockAction({
        Name: 'Legacy Export',
        Description: 'Exports data to legacy system (deprecated).',
        Status: 'Disabled',
      }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; width: 380px;">
        <mj-action-card [Action]="activeAction" [Categories]="categories"></mj-action-card>
        <mj-action-card [Action]="pendingAction" [Categories]="categories"></mj-action-card>
        <mj-action-card [Action]="disabledAction" [Categories]="categories"></mj-action-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Actions can be Active (green), Pending (yellow), or Disabled (red). The Run button is disabled for non-active actions.',
      },
    },
  },
};

// AI Generated vs Custom
export const ActionTypes: Story = {
  render: () => ({
    props: {
      customAction: createMockAction({
        Name: 'Sync Inventory',
        Description: 'Synchronizes inventory levels with the warehouse management system.',
        Type: 'Custom',
        IconClass: 'fa-solid fa-boxes-stacked',
      }),
      aiGeneratedApproved: createMockAction({
        Name: 'Summarize Document',
        Description: 'Uses AI to generate a summary of uploaded documents.',
        Type: 'Generated',
        CodeApprovalStatus: 'Approved',
      }),
      aiGeneratedPending: createMockAction({
        Name: 'Classify Support Ticket',
        Description: 'AI-powered ticket classification and routing.',
        Type: 'Generated',
        CodeApprovalStatus: 'Pending',
      }),
      aiGeneratedRejected: createMockAction({
        Name: 'Auto-Reply Generator',
        Description: 'Generates automatic email replies.',
        Type: 'Generated',
        CodeApprovalStatus: 'Rejected',
        Status: 'Disabled',
      }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; width: 400px;">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666; text-transform: uppercase;">Custom Action</h4>
        <mj-action-card [Action]="customAction" [Categories]="categories"></mj-action-card>

        <h4 style="margin: 16px 0 8px 0; font-size: 13px; color: #666; text-transform: uppercase;">AI Generated - Approved</h4>
        <mj-action-card [Action]="aiGeneratedApproved" [Categories]="categories"></mj-action-card>

        <h4 style="margin: 16px 0 8px 0; font-size: 13px; color: #666; text-transform: uppercase;">AI Generated - Pending Review</h4>
        <mj-action-card [Action]="aiGeneratedPending" [Categories]="categories"></mj-action-card>

        <h4 style="margin: 16px 0 8px 0; font-size: 13px; color: #666; text-transform: uppercase;">AI Generated - Rejected</h4>
        <mj-action-card [Action]="aiGeneratedRejected" [Categories]="categories"></mj-action-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Custom actions show a code icon. AI-generated actions show an AI badge and code approval status (Approved/Pending/Rejected).',
      },
    },
  },
};

// With parameters
export const WithParameters: Story = {
  render: () => ({
    props: {
      fewParams: createMockAction({
        Name: 'Send Notification',
        Description: 'Sends a push notification to specified users.',
        Params: [
          { Name: 'userId', IsRequired: true },
          { Name: 'message', IsRequired: true },
        ]
      }),
      manyParams: createMockAction({
        Name: 'Generate Invoice',
        Description: 'Creates a detailed invoice with line items and calculations.',
        Params: [
          { Name: 'customerId', IsRequired: true },
          { Name: 'orderId', IsRequired: true },
          { Name: 'currency', IsRequired: true },
          { Name: 'taxRate', IsRequired: false },
          { Name: 'discountCode', IsRequired: false },
          { Name: 'dueDate', IsRequired: false },
          { Name: 'notes', IsRequired: false },
        ]
      }),
      noParams: createMockAction({
        Name: 'Clear Cache',
        Description: 'Clears all cached data from the system.',
        Params: []
      }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; width: 400px;">
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666;">No Parameters</h4>
          <mj-action-card [Action]="noParams" [Categories]="categories"></mj-action-card>
        </div>
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Few Parameters (click stats to expand)</h4>
          <mj-action-card [Action]="fewParams" [Categories]="categories"></mj-action-card>
        </div>
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Many Parameters (shows +N more)</h4>
          <mj-action-card [Action]="manyParams" [Categories]="categories"></mj-action-card>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Click the chart icon to expand and see parameters. Required parameters show an asterisk (*). More than 4 parameters shows "+N more".',
      },
    },
  },
};

// Different categories
export const Categories: Story = {
  render: () => ({
    props: {
      emailAction: createMockAction({
        Name: 'Send Marketing Email',
        Description: 'Sends marketing campaigns to subscriber lists.',
        CategoryID: 'cat-1',
      }),
      dataAction: createMockAction({
        Name: 'ETL Pipeline',
        Description: 'Runs the daily ETL data transformation pipeline.',
        CategoryID: 'cat-2',
      }),
      integrationAction: createMockAction({
        Name: 'Salesforce Sync',
        Description: 'Synchronizes contacts with Salesforce CRM.',
        CategoryID: 'cat-3',
        IconClass: 'fa-brands fa-salesforce',
      }),
      automationAction: createMockAction({
        Name: 'Scheduled Backup',
        Description: 'Automated database backup to cloud storage.',
        CategoryID: 'cat-4',
        IconClass: 'fa-solid fa-clock',
      }),
      uncategorized: createMockAction({
        Name: 'Misc Utility',
        Description: 'A utility action without a category.',
        CategoryID: null,
      }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 12px; width: 380px;">
        <mj-action-card [Action]="emailAction" [Categories]="categories"></mj-action-card>
        <mj-action-card [Action]="dataAction" [Categories]="categories"></mj-action-card>
        <mj-action-card [Action]="integrationAction" [Categories]="categories"></mj-action-card>
        <mj-action-card [Action]="automationAction" [Categories]="categories"></mj-action-card>
        <mj-action-card [Action]="uncategorized" [Categories]="categories"></mj-action-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Actions display their category name. Click the category to filter. Actions without a category show "Uncategorized".',
      },
    },
  },
};

// Custom icons
export const CustomIcons: Story = {
  render: () => ({
    props: {
      actions: [
        createMockAction({ Name: 'Send Email', IconClass: 'fa-solid fa-envelope' }),
        createMockAction({ Name: 'Process Payment', IconClass: 'fa-solid fa-credit-card' }),
        createMockAction({ Name: 'Generate PDF', IconClass: 'fa-solid fa-file-pdf' }),
        createMockAction({ Name: 'Slack Notification', IconClass: 'fa-brands fa-slack' }),
        createMockAction({ Name: 'GitHub Webhook', IconClass: 'fa-brands fa-github' }),
        createMockAction({ Name: 'Database Query', IconClass: 'fa-solid fa-database' }),
      ],
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 700px;">
        @for (action of actions; track action.ID) {
          <mj-action-card [Action]="action" [Categories]="categories"></mj-action-card>
        }
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Actions can specify a custom icon via IconClass. Any Font Awesome icon works.',
      },
    },
  },
};

// Long content handling
export const LongContent: Story = {
  render: () => ({
    props: {
      longName: createMockAction({
        Name: 'This Is A Very Long Action Name That Should Be Truncated With Ellipsis',
        Description: 'Short description.',
      }),
      longDescription: createMockAction({
        Name: 'Data Transformer',
        Description: 'This action performs complex data transformations including normalization, validation, enrichment, and formatting. It supports multiple input formats (JSON, XML, CSV) and can output to various destinations including databases, file systems, and API endpoints. The transformation rules are fully configurable via a declarative schema.',
      }),
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; width: 380px;">
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Long Name (truncated with tooltip)</h4>
          <mj-action-card [Action]="longName" [Categories]="categories"></mj-action-card>
        </div>
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666;">Long Description (truncated)</h4>
          <mj-action-card [Action]="longDescription" [Categories]="categories"></mj-action-card>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Long names and descriptions are truncated with ellipsis. Hover to see full text in tooltip.',
      },
    },
  },
};

// Grid layout example
export const GridLayout: Story = {
  render: () => ({
    props: {
      actions: [
        createMockAction({ Name: 'Send Email', Description: 'Send transactional emails', IconClass: 'fa-solid fa-envelope', Status: 'Active' }),
        createMockAction({ Name: 'Process Order', Description: 'Process incoming orders', IconClass: 'fa-solid fa-shopping-cart', Status: 'Active' }),
        createMockAction({ Name: 'AI Summary', Description: 'Generate AI summaries', Type: 'Generated', CodeApprovalStatus: 'Approved', Status: 'Active' }),
        createMockAction({ Name: 'Sync CRM', Description: 'Sync with Salesforce', IconClass: 'fa-brands fa-salesforce', Status: 'Pending' }),
        createMockAction({ Name: 'Generate Report', Description: 'Create analytics reports', IconClass: 'fa-solid fa-chart-bar', Status: 'Active' }),
        createMockAction({ Name: 'Legacy Import', Description: 'Import from legacy system', IconClass: 'fa-solid fa-file-import', Status: 'Disabled' }),
      ],
      categories: createCategoriesMap(defaultCategories),
    },
    template: `
      <div style="padding: 20px; background: #f8fafc; border-radius: 12px;">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1e293b;">Actions Explorer</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; width: 700px;">
          @for (action of actions; track action.ID) {
            <mj-action-card [Action]="action" [Categories]="categories"></mj-action-card>
          }
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Example of action cards in a grid layout, similar to how they appear in the Actions Explorer dashboard.',
      },
    },
  },
};
