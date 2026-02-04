import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';

// Mock data for the grid
interface MockRow {
  id: number;
  name: string;
  email: string;
  department: string;
  status: string;
  salary: number;
  startDate: string;
  performance: number;
}

function generateMockData(count: number): MockRow[] {
  const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
  const statuses = ['Active', 'On Leave', 'Terminated'];
  const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    email: `user${i + 1}@example.com`,
    department: departments[i % departments.length],
    status: statuses[i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0],
    salary: 50000 + Math.floor(Math.random() * 100000),
    startDate: `202${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    performance: Math.floor(Math.random() * 40) + 60,
  }));
}

// Generate different sized datasets
const smallDataset = generateMockData(5);
const mediumDataset = generateMockData(20);
const largeDataset = generateMockData(100);

// Product data for variety
interface ProductRow {
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  rating: number;
  lastUpdated: string;
}

const productData: ProductRow[] = [
  { sku: 'PRD-001', name: 'Wireless Mouse', category: 'Electronics', price: 29.99, stock: 150, rating: 4.5, lastUpdated: '2025-01-15' },
  { sku: 'PRD-002', name: 'USB-C Hub', category: 'Electronics', price: 49.99, stock: 75, rating: 4.2, lastUpdated: '2025-01-14' },
  { sku: 'PRD-003', name: 'Mechanical Keyboard', category: 'Electronics', price: 129.99, stock: 45, rating: 4.8, lastUpdated: '2025-01-13' },
  { sku: 'PRD-004', name: 'Monitor Stand', category: 'Furniture', price: 79.99, stock: 30, rating: 4.0, lastUpdated: '2025-01-12' },
  { sku: 'PRD-005', name: 'Desk Lamp', category: 'Furniture', price: 34.99, stock: 100, rating: 4.3, lastUpdated: '2025-01-11' },
  { sku: 'PRD-006', name: 'Webcam HD', category: 'Electronics', price: 89.99, stock: 60, rating: 4.6, lastUpdated: '2025-01-10' },
  { sku: 'PRD-007', name: 'Headphone Stand', category: 'Accessories', price: 24.99, stock: 200, rating: 4.1, lastUpdated: '2025-01-09' },
  { sku: 'PRD-008', name: 'Cable Management Kit', category: 'Accessories', price: 19.99, stock: 250, rating: 3.9, lastUpdated: '2025-01-08' },
];

const meta: Meta = {
  title: 'Components/QueryDataGrid',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, QueryViewerModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-query-data-grid\` component displays tabular data using AG Grid with support for selection, sorting, filtering, and custom styling.

## Usage

\`\`\`html
<mj-query-data-grid
  [Data]="queryResults"
  [SelectionMode]="'multiple'"
  [ShowToolbar]="true"
  (RowSelected)="onRowSelect($event)">
</mj-query-data-grid>
\`\`\`

## Module Import

\`\`\`typescript
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';
\`\`\`

## Features
- Auto-generated columns from data
- Single, multiple, or checkbox selection
- Sortable and filterable columns
- Optional toolbar
- Visual configuration for styling
- Loading state indicator
- Empty state handling
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default grid with data
export const Default: Story = {
  render: () => ({
    props: {
      data: mediumDataset,
      onRowSelect: (row: MockRow) => console.log('Row selected:', row),
    },
    template: `
      <div style="width: 900px; height: 500px;">
        <mj-query-data-grid
          [Data]="data"
          [ShowToolbar]="true"
          (RowSelected)="onRowSelect($event)">
        </mj-query-data-grid>
      </div>
    `,
  }),
};

// With row selection
export const WithSelection: Story = {
  render: () => ({
    props: {
      data: mediumDataset.slice(0, 10),
      selectedRows: [] as MockRow[],
      onSelectionChange: (rows: MockRow[]) => {
        console.log('Selected:', rows.length, 'rows');
      },
    },
    template: `
      <div style="width: 900px;">
        <div style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px;">
          <span style="color: #374151; font-weight: 500;">
            Click rows to select (hold Ctrl/Cmd for multi-select)
          </span>
        </div>
        <div style="height: 400px;">
          <mj-query-data-grid
            [Data]="data"
            [SelectionMode]="'multiple'"
            [ShowToolbar]="true"
            (SelectionChanged)="onSelectionChange($event)">
          </mj-query-data-grid>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Enable row selection with `[SelectionMode]="\'multiple\'"`. Click rows to select, use Ctrl/Cmd for multi-select.',
      },
    },
  },
};

// Checkbox selection
export const CheckboxSelection: Story = {
  render: () => ({
    props: {
      data: productData,
      selectedCount: 0,
      onSelectionChange: (rows: ProductRow[]) => {
        console.log('Selected:', rows.length);
      },
    },
    template: `
      <div style="width: 900px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; color: #374151;">Product Inventory</h3>
          <span style="color: #6b7280;">Use checkboxes to select rows</span>
        </div>
        <div style="height: 400px;">
          <mj-query-data-grid
            [Data]="data"
            [SelectionMode]="'checkbox'"
            [ShowToolbar]="true"
            (SelectionChanged)="onSelectionChange($event)">
          </mj-query-data-grid>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Checkbox selection mode adds a checkbox column for explicit row selection. Use the header checkbox to select/deselect all.',
      },
    },
  },
};

// Custom visual configuration
export const CustomVisuals: Story = {
  render: () => ({
    props: {
      data: smallDataset,
      visualConfig: {
        headerBackgroundColor: '#4f46e5',
        headerTextColor: '#ffffff',
        rowAlternateColor: '#f8fafc',
        rowHoverColor: '#e0e7ff',
        fontSize: 14,
        rowHeight: 48,
      },
    },
    template: `
      <div style="width: 900px; height: 350px;">
        <mj-query-data-grid
          [Data]="data"
          [ShowToolbar]="true"
          [VisualConfig]="visualConfig">
        </mj-query-data-grid>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Customize the grid appearance with `[VisualConfig]` including header colors, row colors, font size, and row height.',
      },
    },
  },
};

// Loading state
export const Loading: Story = {
  render: () => ({
    props: {
      data: [] as MockRow[],
    },
    template: `
      <div style="width: 900px; height: 400px;">
        <mj-query-data-grid
          [Data]="data"
          [ShowToolbar]="true"
          [IsLoading]="true">
        </mj-query-data-grid>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Set `[IsLoading]="true"` while fetching data. The grid shows a loading indicator.',
      },
    },
  },
};

// Empty state
export const Empty: Story = {
  render: () => ({
    props: {
      data: [] as MockRow[],
    },
    template: `
      <div style="width: 900px; height: 400px;">
        <mj-query-data-grid
          [Data]="data"
          [ShowToolbar]="true"
          [IsLoading]="false">
        </mj-query-data-grid>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When data is empty and not loading, the grid displays an empty state message.',
      },
    },
  },
};

// Many columns
export const ManyColumns: Story = {
  render: () => {
    // Generate data with many columns
    const wideData = mediumDataset.slice(0, 10).map((row, i) => ({
      ...row,
      phone: `+1-555-${String(1000 + i).padStart(4, '0')}`,
      address: `${100 + i} Main Street`,
      city: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][i % 5],
      state: ['NY', 'CA', 'IL', 'TX', 'AZ'][i % 5],
      zipCode: String(10000 + i * 111),
      country: 'USA',
      manager: `Manager ${i % 3 + 1}`,
      team: `Team ${String.fromCharCode(65 + (i % 5))}`,
      officeLocation: ['Building A', 'Building B', 'Remote'][i % 3],
      employeeType: ['Full-time', 'Part-time', 'Contractor'][i % 3],
    }));

    return {
      props: {
        data: wideData,
      },
      template: `
        <div style="width: 100%; height: 450px;">
          <h3 style="margin: 0 0 16px 0; color: #374151;">Wide Table with Many Columns</h3>
          <mj-query-data-grid
            [Data]="data"
            [ShowToolbar]="true">
          </mj-query-data-grid>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'The grid handles many columns with horizontal scrolling. Columns can be resized and reordered.',
      },
    },
  },
};

// Large dataset
export const LargeDataset: Story = {
  render: () => ({
    props: {
      data: largeDataset,
    },
    template: `
      <div style="width: 900px; height: 500px;">
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: #374151;">Employee Directory</h3>
          <span style="color: #6b7280; font-size: 14px;">{{ data.length }} records</span>
        </div>
        <mj-query-data-grid
          [Data]="data"
          [ShowToolbar]="true">
        </mj-query-data-grid>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The grid efficiently handles large datasets with virtual scrolling. Only visible rows are rendered.',
      },
    },
  },
};

// Without toolbar
export const WithoutToolbar: Story = {
  render: () => ({
    props: {
      data: productData,
    },
    template: `
      <div style="width: 800px; height: 350px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">Compact Grid (No Toolbar)</h3>
        <mj-query-data-grid
          [Data]="data"
          [ShowToolbar]="false">
        </mj-query-data-grid>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Set `[ShowToolbar]="false"` for a cleaner, more compact grid when toolbar features aren\'t needed.',
      },
    },
  },
};

// Single selection
export const SingleSelection: Story = {
  render: () => ({
    props: {
      data: productData,
      selectedProduct: null as ProductRow | null,
      onSelect: (rows: ProductRow[]) => {
        console.log('Selected:', rows.length > 0 ? rows[0] : null);
      },
    },
    template: `
      <div style="display: flex; gap: 24px; width: 1000px;">
        <div style="flex: 1; height: 400px;">
          <mj-query-data-grid
            [Data]="data"
            [SelectionMode]="'single'"
            [ShowToolbar]="true"
            (SelectionChanged)="onSelect($event)">
          </mj-query-data-grid>
        </div>
        <div style="width: 250px; padding: 16px; background: #f8fafc; border-radius: 8px; height: fit-content;">
          <h4 style="margin: 0 0 12px 0; color: #374151;">Selected Product</h4>
          <p style="margin: 0; color: #9ca3af; font-size: 14px;">Click a row to select and see details here</p>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Single selection mode allows selecting one row at a time. Useful for master-detail views.',
      },
    },
  },
};
