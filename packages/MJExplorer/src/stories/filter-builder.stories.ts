import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { FilterBuilderModule, FilterFieldInfo, CompositeFilterDescriptor, FilterDescriptor } from '@memberjunction/ng-filter-builder';

// Sample field definitions
const sampleFields: FilterFieldInfo[] = [
  { name: 'name', displayName: 'Name', type: 'string' },
  { name: 'email', displayName: 'Email', type: 'string' },
  { name: 'status', displayName: 'Status', type: 'string', valueList: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: 'Pending', label: 'Pending' }] },
  { name: 'role', displayName: 'Role', type: 'string', valueList: [{ value: 'Admin', label: 'Admin' }, { value: 'User', label: 'User' }, { value: 'Guest', label: 'Guest' }, { value: 'Moderator', label: 'Moderator' }] },
  { name: 'age', displayName: 'Age', type: 'number' },
  { name: 'salary', displayName: 'Salary', type: 'number' },
  { name: 'createdAt', displayName: 'Created Date', type: 'date' },
  { name: 'lastLogin', displayName: 'Last Login', type: 'date' },
  { name: 'isVerified', displayName: 'Is Verified', type: 'boolean' },
  { name: 'hasSubscription', displayName: 'Has Subscription', type: 'boolean' },
];

// Order fields for different context
const orderFields: FilterFieldInfo[] = [
  { name: 'orderId', displayName: 'Order ID', type: 'string' },
  { name: 'customerName', displayName: 'Customer Name', type: 'string' },
  { name: 'status', displayName: 'Order Status', type: 'string', valueList: [{ value: 'Pending', label: 'Pending' }, { value: 'Processing', label: 'Processing' }, { value: 'Shipped', label: 'Shipped' }, { value: 'Delivered', label: 'Delivered' }, { value: 'Cancelled', label: 'Cancelled' }] },
  { name: 'total', displayName: 'Order Total', type: 'number' },
  { name: 'itemCount', displayName: 'Item Count', type: 'number' },
  { name: 'orderDate', displayName: 'Order Date', type: 'date' },
  { name: 'shippedDate', displayName: 'Shipped Date', type: 'date' },
  { name: 'isPriority', displayName: 'Priority Order', type: 'boolean' },
];

const meta: Meta = {
  title: 'Components/FilterBuilder',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FilterBuilderModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-filter-builder\` component provides a visual interface for building complex query filters with AND/OR logic.

## Usage

\`\`\`html
<mj-filter-builder
  [fields]="fieldDefinitions"
  [filter]="currentFilter"
  (filterChange)="onFilterChange($event)">
</mj-filter-builder>
\`\`\`

## Module Import

\`\`\`typescript
import { FilterBuilderModule, FilterFieldInfo } from '@memberjunction/ng-filter-builder';
\`\`\`

## Features
- Visual filter construction
- Support for AND/OR grouping
- Multiple data types (string, number, date, boolean)
- Various operators (equals, contains, greater than, etc.)
- Nested filter groups
- Pre-populated dropdown values
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default empty filter builder
export const Default: Story = {
  render: () => ({
    props: {
      fields: sampleFields,
      filter: null,
      onFilterChange: (filter: CompositeFilterDescriptor) => console.log('Filter changed:', JSON.stringify(filter, null, 2)),
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">User Filter</h3>
        <mj-filter-builder
          [fields]="fields"
          [filter]="filter"
          (filterChange)="onFilterChange($event)">
        </mj-filter-builder>
      </div>
    `,
  }),
};

// With existing filter
export const WithExistingFilter: Story = {
  render: () => {
    // Create a pre-populated filter
    const existingFilter: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [
        { field: 'status', operator: 'eq', value: 'Active' } as FilterDescriptor,
        { field: 'role', operator: 'eq', value: 'User' } as FilterDescriptor,
      ],
    };

    return {
      props: {
        fields: sampleFields,
        filter: existingFilter,
        onFilterChange: (filter: CompositeFilterDescriptor) => console.log('Filter changed:', filter),
      },
      template: `
        <div style="max-width: 800px;">
          <h3 style="margin: 0 0 16px 0; color: #374151;">Edit Existing Filter</h3>
          <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
            This filter shows active users with the "User" role.
          </p>
          <mj-filter-builder
            [fields]="fields"
            [filter]="filter"
            (filterChange)="onFilterChange($event)">
          </mj-filter-builder>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Pass an existing filter object to pre-populate the builder. Users can modify the existing conditions.',
      },
    },
  },
};

// Nested groups (complex filter)
export const NestedGroups: Story = {
  render: () => {
    const complexFilter: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [
        { field: 'isVerified', operator: 'eq', value: true } as FilterDescriptor,
        {
          logic: 'or',
          filters: [
            { field: 'role', operator: 'eq', value: 'Admin' } as FilterDescriptor,
            { field: 'role', operator: 'eq', value: 'Moderator' } as FilterDescriptor,
          ],
        } as CompositeFilterDescriptor,
      ],
    };

    return {
      props: {
        fields: sampleFields,
        filter: complexFilter,
        onFilterChange: (filter: CompositeFilterDescriptor) => console.log('Filter changed:', filter),
      },
      template: `
        <div style="max-width: 900px;">
          <h3 style="margin: 0 0 16px 0; color: #374151;">Complex Filter with Nested Groups</h3>
          <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
            Filter: Verified users who are either Admin OR Moderator
          </p>
          <mj-filter-builder
            [fields]="fields"
            [filter]="filter"
            (filterChange)="onFilterChange($event)">
          </mj-filter-builder>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Filters can have nested groups for complex AND/OR logic. Each group can contain conditions and sub-groups.',
      },
    },
  },
};

// All field types
export const AllFieldTypes: Story = {
  render: () => ({
    props: {
      fields: sampleFields,
      filter: null,
      onFilterChange: (filter: CompositeFilterDescriptor) => console.log('Filter:', filter),
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">Filter with All Data Types</h3>
        <div style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #374151;">Available field types:</div>
          <ul style="margin: 0; padding: 0 0 0 20px; color: #6b7280;">
            <li><strong>String:</strong> Name, Email (free text + operators like contains, starts with)</li>
            <li><strong>String with values:</strong> Status, Role (dropdown selection)</li>
            <li><strong>Number:</strong> Age, Salary (numeric comparisons)</li>
            <li><strong>Date:</strong> Created Date, Last Login (date pickers)</li>
            <li><strong>Boolean:</strong> Is Verified, Has Subscription (true/false toggle)</li>
          </ul>
        </div>
        <mj-filter-builder
          [fields]="fields"
          [filter]="filter"
          (filterChange)="onFilterChange($event)">
        </mj-filter-builder>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The filter builder supports various data types with appropriate input controls and operators for each.',
      },
    },
  },
};

// Read-only / Disabled
export const ReadOnly: Story = {
  render: () => {
    const readOnlyFilter: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [
        { field: 'status', operator: 'eq', value: 'Active' } as FilterDescriptor,
        { field: 'createdAt', operator: 'gt', value: '2024-01-01' } as FilterDescriptor,
        { field: 'hasSubscription', operator: 'eq', value: true } as FilterDescriptor,
      ],
    };

    return {
      props: {
        fields: sampleFields,
        filter: readOnlyFilter,
      },
      template: `
        <div style="max-width: 800px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <h3 style="margin: 0; color: #374151;">Saved Filter (Read-Only)</h3>
            <span style="background: #fef3c7; color: #92400e; font-size: 12px; padding: 2px 8px; border-radius: 4px;">
              <i class="fa-solid fa-lock" style="margin-right: 4px;"></i>
              View Only
            </span>
          </div>
          <mj-filter-builder
            [fields]="fields"
            [filter]="filter"
            [disabled]="true">
          </mj-filter-builder>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Set `[disabled]="true"` to make the filter builder read-only. Users can view but not modify the filter.',
      },
    },
  },
};

// Order filtering context
export const OrderFiltering: Story = {
  render: () => ({
    props: {
      fields: orderFields,
      filter: null,
      onFilterChange: (filter: CompositeFilterDescriptor) => console.log('Order filter:', filter),
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">
          <i class="fa-solid fa-shopping-cart" style="margin-right: 8px;"></i>
          Order Search Filters
        </h3>
        <mj-filter-builder
          [fields]="fields"
          [filter]="filter"
          (filterChange)="onFilterChange($event)">
        </mj-filter-builder>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The filter builder adapts to different contexts by accepting custom field definitions. This example shows order-related fields.',
      },
    },
  },
};

// With summary display
export const WithSummary: Story = {
  render: () => {
    const filter: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [
        { field: 'status', operator: 'eq', value: 'Active' } as FilterDescriptor,
        { field: 'age', operator: 'gt', value: 18 } as FilterDescriptor,
      ],
    };

    return {
      props: {
        fields: sampleFields,
        filter: filter,
        onFilterChange: (f: CompositeFilterDescriptor) => console.log('Filter:', f),
      },
      template: `
        <div style="max-width: 800px;">
          <h3 style="margin: 0 0 16px 0; color: #374151;">Filter with Summary</h3>
          <mj-filter-builder
            [fields]="fields"
            [filter]="filter"
            [showSummary]="true"
            (filterChange)="onFilterChange($event)">
          </mj-filter-builder>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Enable `[showSummary]="true"` to display a human-readable summary of the current filter.',
      },
    },
  },
};

// Multiple filter conditions
export const MultipleConditions: Story = {
  render: () => {
    const multiFilter: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [
        { field: 'status', operator: 'eq', value: 'Active' } as FilterDescriptor,
        { field: 'isVerified', operator: 'eq', value: true } as FilterDescriptor,
        { field: 'role', operator: 'neq', value: 'Guest' } as FilterDescriptor,
        { field: 'createdAt', operator: 'gt', value: '2024-01-01' } as FilterDescriptor,
        { field: 'age', operator: 'gte', value: 25 } as FilterDescriptor,
      ],
    };

    return {
      props: {
        fields: sampleFields,
        filter: multiFilter,
        onFilterChange: (filter: CompositeFilterDescriptor) => console.log('Filter:', filter),
      },
      template: `
        <div style="max-width: 900px;">
          <h3 style="margin: 0 0 16px 0; color: #374151;">Multiple Filter Conditions</h3>
          <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
            Find active, verified users (not guests) created after Jan 2024, aged 25+.
          </p>
          <mj-filter-builder
            [fields]="fields"
            [filter]="filter"
            (filterChange)="onFilterChange($event)">
          </mj-filter-builder>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Filters can include many conditions combined with AND or OR logic. The visual builder makes complex filters easy to understand.',
      },
    },
  },
};
