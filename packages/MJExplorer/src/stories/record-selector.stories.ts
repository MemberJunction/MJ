import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { RecordSelectorModule } from '@memberjunction/ng-record-selector';

// Mock record interface
interface MockRecord {
  ID: string;
  Name: string;
  Description?: string;
  Icon?: string;
  Status?: string;
  Category?: string;
}

// Helper to create mock records
function createMockRecords(prefix: string, count: number): MockRecord[] {
  const categories = ['Marketing', 'Engineering', 'Sales', 'Support', 'HR'];
  const statuses = ['Active', 'Inactive', 'Pending'];

  return Array.from({ length: count }, (_, i) => ({
    ID: `${prefix}-${i + 1}`,
    Name: `${prefix} Item ${i + 1}`,
    Description: `Description for ${prefix} item ${i + 1}`,
    Icon: i % 3 === 0 ? 'fa-solid fa-star' : i % 3 === 1 ? 'fa-solid fa-folder' : 'fa-solid fa-file',
    Status: statuses[i % statuses.length],
    Category: categories[i % categories.length],
  }));
}

const meta: Meta = {
  title: 'Components/RecordSelector',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, RecordSelectorModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-record-selector\` component provides a dual-list interface for selecting records from an available pool.

## Usage

\`\`\`html
<mj-record-selector
  [AvailableRecords]="availableRecords"
  [SelectedRecords]="selectedRecords"
  [DisplayField]="'Name'"
  (SelectionChanged)="onSelectionChange($event)">
</mj-record-selector>
\`\`\`

## Module Import

\`\`\`typescript
import { RecordSelectorModule } from '@memberjunction/ng-record-selector';
\`\`\`

## Features
- Dual-list picker (Available / Selected)
- Move items between lists
- Move all items at once
- Optional icons per record
- Toolbar customization
- Keyboard support for selection
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default record selector
export const Default: Story = {
  render: () => ({
    props: {
      availableRecords: createMockRecords('Available', 8),
      selectedRecords: [] as MockRecord[],
      onSelectionChange: (records: MockRecord[]) => console.log('Selection changed:', records),
    },
    template: `
      <div style="width: 700px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">Select Team Members</h3>
        <mj-record-selector
          [AvailableRecords]="availableRecords"
          [SelectedRecords]="selectedRecords"
          [DisplayField]="'Name'"
          (SelectionChanged)="onSelectionChange($event)">
        </mj-record-selector>
      </div>
    `,
  }),
};

// With icons
export const WithIcons: Story = {
  render: () => ({
    props: {
      availableRecords: [
        { ID: '1', Name: 'Dashboard', Icon: 'fa-solid fa-gauge-high' },
        { ID: '2', Name: 'Analytics', Icon: 'fa-solid fa-chart-line' },
        { ID: '3', Name: 'Reports', Icon: 'fa-solid fa-file-lines' },
        { ID: '4', Name: 'Users', Icon: 'fa-solid fa-users' },
        { ID: '5', Name: 'Settings', Icon: 'fa-solid fa-gear' },
        { ID: '6', Name: 'Notifications', Icon: 'fa-solid fa-bell' },
        { ID: '7', Name: 'Calendar', Icon: 'fa-solid fa-calendar' },
        { ID: '8', Name: 'Messages', Icon: 'fa-solid fa-envelope' },
      ] as MockRecord[],
      selectedRecords: [] as MockRecord[],
    },
    template: `
      <div style="width: 700px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">Configure Menu Items</h3>
        <mj-record-selector
          [AvailableRecords]="availableRecords"
          [SelectedRecords]="selectedRecords"
          [DisplayField]="'Name'"
          [DisplayIconField]="'Icon'">
        </mj-record-selector>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Use `[DisplayIconField]` to show icons next to each record name.',
      },
    },
  },
};

// Pre-selected records
export const PreSelected: Story = {
  render: () => {
    const allRecords = createMockRecords('Permission', 10);

    return {
      props: {
        availableRecords: allRecords.slice(4),
        selectedRecords: allRecords.slice(0, 4),
        onSelectionChange: (records: MockRecord[]) => console.log('Selection:', records.map(r => r.Name)),
      },
      template: `
        <div style="width: 700px;">
          <h3 style="margin: 0 0 16px 0; color: #374151;">User Permissions</h3>
          <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
            The user already has 4 permissions assigned.
          </p>
          <mj-record-selector
            [AvailableRecords]="availableRecords"
            [SelectedRecords]="selectedRecords"
            [DisplayField]="'Name'"
            (SelectionChanged)="onSelectionChange($event)">
          </mj-record-selector>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Records can be pre-selected by passing them in `[SelectedRecords]`.',
      },
    },
  },
};

// Empty state
export const Empty: Story = {
  render: () => ({
    props: {
      availableRecords: [] as MockRecord[],
      selectedRecords: [] as MockRecord[],
    },
    template: `
      <div style="width: 700px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">Select Records</h3>
        <mj-record-selector
          [AvailableRecords]="availableRecords"
          [SelectedRecords]="selectedRecords"
          [DisplayField]="'Name'">
        </mj-record-selector>
        <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 14px; text-align: center;">
          No records available for selection.
        </p>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When no records are available, both lists appear empty.',
      },
    },
  },
};

// Many records
export const ManyRecords: Story = {
  render: () => ({
    props: {
      availableRecords: createMockRecords('Record', 50),
      selectedRecords: [] as MockRecord[],
    },
    template: `
      <div style="width: 700px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">Select from Large Dataset</h3>
        <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
          50 records available. Lists scroll when content exceeds the visible area.
        </p>
        <mj-record-selector
          [AvailableRecords]="availableRecords"
          [SelectedRecords]="selectedRecords"
          [DisplayField]="'Name'">
        </mj-record-selector>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The component handles large datasets with scrollable lists.',
      },
    },
  },
};

// Role assignment example
export const RoleAssignment: Story = {
  render: () => ({
    props: {
      availableRoles: [
        { ID: 'r1', Name: 'Viewer', Icon: 'fa-solid fa-eye', Description: 'Can view content' },
        { ID: 'r2', Name: 'Contributor', Icon: 'fa-solid fa-pen', Description: 'Can create content' },
        { ID: 'r3', Name: 'Editor', Icon: 'fa-solid fa-edit', Description: 'Can edit any content' },
        { ID: 'r4', Name: 'Moderator', Icon: 'fa-solid fa-shield', Description: 'Can moderate users' },
        { ID: 'r5', Name: 'Admin', Icon: 'fa-solid fa-user-shield', Description: 'Full access' },
      ] as MockRecord[],
      selectedRoles: [
        { ID: 'r1', Name: 'Viewer', Icon: 'fa-solid fa-eye', Description: 'Can view content' },
      ] as MockRecord[],
    },
    template: `
      <div style="width: 700px;">
        <div style="margin-bottom: 16px;">
          <h3 style="margin: 0 0 4px 0; color: #374151;">Assign Roles to User</h3>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Select the roles this user should have access to.
          </p>
        </div>
        <mj-record-selector
          [AvailableRecords]="availableRoles"
          [SelectedRecords]="selectedRoles"
          [DisplayField]="'Name'"
          [DisplayIconField]="'Icon'">
        </mj-record-selector>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'A practical example showing role assignment with icons representing different access levels.',
      },
    },
  },
};

// Category selection
export const CategorySelection: Story = {
  render: () => ({
    props: {
      availableCategories: [
        { ID: 'c1', Name: 'Technology', Icon: 'fa-solid fa-microchip' },
        { ID: 'c2', Name: 'Business', Icon: 'fa-solid fa-briefcase' },
        { ID: 'c3', Name: 'Science', Icon: 'fa-solid fa-flask' },
        { ID: 'c4', Name: 'Health', Icon: 'fa-solid fa-heart-pulse' },
        { ID: 'c5', Name: 'Finance', Icon: 'fa-solid fa-chart-pie' },
        { ID: 'c6', Name: 'Education', Icon: 'fa-solid fa-graduation-cap' },
        { ID: 'c7', Name: 'Entertainment', Icon: 'fa-solid fa-film' },
        { ID: 'c8', Name: 'Sports', Icon: 'fa-solid fa-futbol' },
        { ID: 'c9', Name: 'Travel', Icon: 'fa-solid fa-plane' },
        { ID: 'c10', Name: 'Food', Icon: 'fa-solid fa-utensils' },
      ] as MockRecord[],
      selectedCategories: [
        { ID: 'c1', Name: 'Technology', Icon: 'fa-solid fa-microchip' },
        { ID: 'c3', Name: 'Science', Icon: 'fa-solid fa-flask' },
      ] as MockRecord[],
    },
    template: `
      <div style="width: 700px;">
        <div style="margin-bottom: 16px;">
          <h3 style="margin: 0 0 4px 0; color: #374151;">Newsletter Preferences</h3>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Choose the categories you want to receive updates about.
          </p>
        </div>
        <mj-record-selector
          [AvailableRecords]="availableCategories"
          [SelectedRecords]="selectedCategories"
          [DisplayField]="'Name'"
          [DisplayIconField]="'Icon'">
        </mj-record-selector>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Another practical example showing category/interest selection for newsletter preferences.',
      },
    },
  },
};

// All selected
export const AllSelected: Story = {
  render: () => {
    const records = createMockRecords('Item', 6);

    return {
      props: {
        availableRecords: [] as MockRecord[],
        selectedRecords: records,
      },
      template: `
        <div style="width: 700px;">
          <h3 style="margin: 0 0 16px 0; color: #374151;">All Items Selected</h3>
          <mj-record-selector
            [AvailableRecords]="availableRecords"
            [SelectedRecords]="selectedRecords"
            [DisplayField]="'Name'">
          </mj-record-selector>
          <p style="margin: 16px 0 0 0; color: #059669; font-size: 14px; text-align: center;">
            <i class="fa-solid fa-check-circle" style="margin-right: 6px;"></i>
            All 6 items have been selected.
          </p>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'When all records are selected, the available list is empty.',
      },
    },
  },
};
