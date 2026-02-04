import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { NgTreesModule } from '@memberjunction/ng-trees';
import { FormsModule } from '@angular/forms';

const meta: Meta = {
  title: 'Components/Tree',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, NgTreesModule, FormsModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-tree\` and \`mj-tree-dropdown\` components display hierarchical data in a tree structure with support for selection, icons, and search.

## Usage

\`\`\`html
<mj-tree
  [BranchConfig]="branchConfig"
  [LeafConfig]="leafConfig"
  [SelectionMode]="'single'"
  (NodeClick)="onNodeClick($event)"
  (NodeSelected)="onNodeSelected($event)">
</mj-tree>
\`\`\`

## Module Import

\`\`\`typescript
import { NgTreesModule } from '@memberjunction/ng-trees';
\`\`\`

## Features
- Hierarchical tree structure
- Single or multiple selection
- Branch and leaf node configuration
- Custom icons per node
- Search/filter functionality
- Tree dropdown variant
- Expand/collapse all
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Mock node interface
interface MockNode {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  childCount?: number;
}

// Helper to create branch config
function createBranchConfig(nodes: MockNode[]) {
  return {
    EntityName: '',
    DataSource: nodes,
    AutoLoad: false,
    ParentField: 'parentId',
    DisplayField: 'name',
    IdField: 'id',
    IconField: 'icon',
    ChildCountField: 'childCount',
  };
}

// Helper to create leaf config
function createLeafConfig(nodes: MockNode[]) {
  return {
    EntityName: '',
    DataSource: nodes,
    AutoLoad: false,
    ParentField: 'parentId',
    DisplayField: 'name',
    IdField: 'id',
    IconField: 'icon',
  };
}

// Sample hierarchical data
const departmentData: MockNode[] = [
  { id: '1', name: 'Engineering', parentId: null, icon: 'fa-solid fa-code', childCount: 3 },
  { id: '2', name: 'Frontend', parentId: '1', icon: 'fa-brands fa-react', childCount: 0 },
  { id: '3', name: 'Backend', parentId: '1', icon: 'fa-solid fa-server', childCount: 0 },
  { id: '4', name: 'DevOps', parentId: '1', icon: 'fa-solid fa-cloud', childCount: 0 },
  { id: '5', name: 'Design', parentId: null, icon: 'fa-solid fa-palette', childCount: 2 },
  { id: '6', name: 'UI/UX', parentId: '5', icon: 'fa-solid fa-pencil', childCount: 0 },
  { id: '7', name: 'Branding', parentId: '5', icon: 'fa-solid fa-star', childCount: 0 },
  { id: '8', name: 'Marketing', parentId: null, icon: 'fa-solid fa-bullhorn', childCount: 2 },
  { id: '9', name: 'Digital', parentId: '8', icon: 'fa-solid fa-globe', childCount: 0 },
  { id: '10', name: 'Content', parentId: '8', icon: 'fa-solid fa-pen', childCount: 0 },
];

// Separate branches and leaves
const branches = departmentData.filter(d => (d.childCount ?? 0) > 0);
const leaves = departmentData.filter(d => (d.childCount ?? 0) === 0);

// Default tree
export const Default: Story = {
  render: () => ({
    props: {
      branchConfig: createBranchConfig(branches),
      leafConfig: createLeafConfig(leaves),
      onNodeClick: (node: MockNode) => console.log('Node clicked:', node),
      onNodeSelected: (nodes: MockNode[]) => console.log('Nodes selected:', nodes),
    },
    template: `
      <div style="width: 300px; border: 1px solid #e0e0e0; border-radius: 8px; background: white;">
        <div style="padding: 12px 16px; border-bottom: 1px solid #e0e0e0; font-weight: 600; color: #374151;">
          Organization Structure
        </div>
        <div style="padding: 12px;">
          <mj-tree
            [BranchConfig]="branchConfig"
            [LeafConfig]="leafConfig"
            [SelectionMode]="'single'"
            [ShowIcons]="true"
            (NodeClick)="onNodeClick($event)"
            (NodeSelected)="onNodeSelected($event)">
          </mj-tree>
        </div>
      </div>
    `,
  }),
};

// File system tree
export const FileSystem: Story = {
  render: () => {
    const folderData: MockNode[] = [
      { id: 'src', name: 'src', parentId: null, icon: 'fa-solid fa-folder', childCount: 3 },
      { id: 'components', name: 'components', parentId: 'src', icon: 'fa-solid fa-folder', childCount: 3 },
      { id: 'services', name: 'services', parentId: 'src', icon: 'fa-solid fa-folder', childCount: 2 },
      { id: 'utils', name: 'utils', parentId: 'src', icon: 'fa-solid fa-folder', childCount: 2 },
      { id: 'assets', name: 'assets', parentId: null, icon: 'fa-solid fa-folder', childCount: 2 },
      { id: 'images', name: 'images', parentId: 'assets', icon: 'fa-solid fa-folder', childCount: 0 },
      { id: 'styles', name: 'styles', parentId: 'assets', icon: 'fa-solid fa-folder', childCount: 0 },
    ];

    const fileData: MockNode[] = [
      { id: 'f1', name: 'App.tsx', parentId: 'src', icon: 'fa-brands fa-react' },
      { id: 'f2', name: 'Button.tsx', parentId: 'components', icon: 'fa-brands fa-react' },
      { id: 'f3', name: 'Modal.tsx', parentId: 'components', icon: 'fa-brands fa-react' },
      { id: 'f4', name: 'Card.tsx', parentId: 'components', icon: 'fa-brands fa-react' },
      { id: 'f5', name: 'api.service.ts', parentId: 'services', icon: 'fa-solid fa-file-code' },
      { id: 'f6', name: 'auth.service.ts', parentId: 'services', icon: 'fa-solid fa-file-code' },
      { id: 'f7', name: 'helpers.ts', parentId: 'utils', icon: 'fa-solid fa-file-code' },
      { id: 'f8', name: 'constants.ts', parentId: 'utils', icon: 'fa-solid fa-file-code' },
      { id: 'f9', name: 'logo.png', parentId: 'images', icon: 'fa-solid fa-image' },
      { id: 'f10', name: 'main.css', parentId: 'styles', icon: 'fa-brands fa-css3-alt' },
    ];

    return {
      props: {
        branchConfig: createBranchConfig(folderData),
        leafConfig: createLeafConfig(fileData),
      },
      template: `
        <div style="width: 300px; border: 1px solid #e0e0e0; border-radius: 8px; background: white;">
          <div style="padding: 12px 16px; border-bottom: 1px solid #e0e0e0; font-weight: 600; color: #374151;">
            <i class="fa-solid fa-folder-tree" style="margin-right: 8px;"></i>
            Project Files
          </div>
          <div style="padding: 12px; max-height: 400px; overflow: auto;">
            <mj-tree
              [BranchConfig]="branchConfig"
              [LeafConfig]="leafConfig"
              [SelectionMode]="'single'"
              [ShowIcons]="true">
            </mj-tree>
          </div>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'A file system tree showing folders and files with appropriate icons. Demonstrates nested hierarchy with multiple levels.',
      },
    },
  },
};

// Multiple selection
export const MultipleSelection: Story = {
  render: () => ({
    props: {
      branchConfig: createBranchConfig(branches),
      leafConfig: createLeafConfig(leaves),
      selectedNodes: [] as MockNode[],
      onNodeSelected: (nodes: MockNode[]) => {
        console.log('Selected:', nodes);
      },
    },
    template: `
      <div style="display: flex; gap: 20px;">
        <div style="width: 300px; border: 1px solid #e0e0e0; border-radius: 8px; background: white;">
          <div style="padding: 12px 16px; border-bottom: 1px solid #e0e0e0; font-weight: 600; color: #374151;">
            Select Departments
          </div>
          <div style="padding: 12px;">
            <mj-tree
              [BranchConfig]="branchConfig"
              [LeafConfig]="leafConfig"
              [SelectionMode]="'multiple'"
              [ShowIcons]="true"
              (NodeSelected)="onNodeSelected($event)">
            </mj-tree>
          </div>
        </div>
        <div style="width: 200px;">
          <div style="font-weight: 600; color: #374151; margin-bottom: 8px;">Hold Ctrl/Cmd to multi-select</div>
          <div style="font-size: 14px; color: #6b7280;">
            Click nodes in the tree while holding Ctrl or Cmd to select multiple items.
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Multiple selection mode allows selecting multiple nodes. Hold Ctrl/Cmd to add to selection.',
      },
    },
  },
};

// Tree with search
export const WithSearch: Story = {
  render: () => ({
    props: {
      branchConfig: createBranchConfig(branches),
      leafConfig: createLeafConfig(leaves),
      searchText: '',
    },
    template: `
      <div style="width: 300px; border: 1px solid #e0e0e0; border-radius: 8px; background: white;">
        <div style="padding: 12px 16px; border-bottom: 1px solid #e0e0e0;">
          <div style="position: relative;">
            <i class="fa-solid fa-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af;"></i>
            <input
              type="text"
              [(ngModel)]="searchText"
              placeholder="Search..."
              style="width: 100%; padding: 8px 12px 8px 32px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 14px;">
          </div>
        </div>
        <div style="padding: 12px; max-height: 350px; overflow: auto;">
          <mj-tree
            [BranchConfig]="branchConfig"
            [LeafConfig]="leafConfig"
            [SelectionMode]="'single'"
            [ShowIcons]="true"
            [SearchText]="searchText">
          </mj-tree>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The tree can be filtered by search text. Matching nodes are highlighted and non-matching branches auto-expand if they contain matches.',
      },
    },
  },
};

// Tree dropdown
export const TreeDropdown: Story = {
  render: () => ({
    props: {
      branchConfig: createBranchConfig(branches),
      leafConfig: createLeafConfig(leaves),
      selectedValue: null as MockNode | null,
      onSelect: (node: MockNode) => {
        console.log('Selected:', node);
      },
    },
    template: `
      <div style="width: 300px;">
        <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">
          Select Department
        </label>
        <mj-tree-dropdown
          [BranchConfig]="branchConfig"
          [LeafConfig]="leafConfig"
          [SelectionMode]="'single'"
          [ShowIcons]="true"
          placeholder="Choose a department..."
          (NodeSelected)="onSelect($event)">
        </mj-tree-dropdown>
        <p style="margin-top: 12px; font-size: 14px; color: #6b7280;">
          Click to open the dropdown and select from the tree.
        </p>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The tree dropdown variant displays the tree in a dropdown popup. Useful when space is limited.',
      },
    },
  },
};

// Custom icons tree
export const CustomIcons: Story = {
  render: () => {
    const statusBranches: MockNode[] = [
      { id: 's1', name: 'Active Projects', parentId: null, icon: 'fa-solid fa-circle-check', childCount: 2 },
      { id: 's4', name: 'Pending Review', parentId: null, icon: 'fa-solid fa-clock', childCount: 2 },
      { id: 's7', name: 'Archived', parentId: null, icon: 'fa-solid fa-archive', childCount: 2 },
    ];

    const statusLeaves: MockNode[] = [
      { id: 's2', name: 'Project Alpha', parentId: 's1', icon: 'fa-solid fa-rocket' },
      { id: 's3', name: 'Project Beta', parentId: 's1', icon: 'fa-solid fa-flask' },
      { id: 's5', name: 'Feature Request A', parentId: 's4', icon: 'fa-solid fa-lightbulb' },
      { id: 's6', name: 'Bug Fix B', parentId: 's4', icon: 'fa-solid fa-bug' },
      { id: 's8', name: 'Legacy System', parentId: 's7', icon: 'fa-solid fa-box' },
      { id: 's9', name: 'Old Reports', parentId: 's7', icon: 'fa-solid fa-file-alt' },
    ];

    return {
      props: {
        branchConfig: createBranchConfig(statusBranches),
        leafConfig: createLeafConfig(statusLeaves),
      },
      template: `
        <div style="width: 280px; border: 1px solid #e0e0e0; border-radius: 8px; background: white;">
          <div style="padding: 12px 16px; border-bottom: 1px solid #e0e0e0; font-weight: 600; color: #374151;">
            <i class="fa-solid fa-diagram-project" style="margin-right: 8px;"></i>
            Project Status
          </div>
          <div style="padding: 12px;">
            <mj-tree
              [BranchConfig]="branchConfig"
              [LeafConfig]="leafConfig"
              [SelectionMode]="'single'"
              [ShowIcons]="true">
            </mj-tree>
          </div>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Each node can have a custom icon specified via the IconField in the config. This example shows various Font Awesome icons representing different statuses.',
      },
    },
  },
};

// Flat list (no nesting)
export const FlatList: Story = {
  render: () => {
    const flatItems: MockNode[] = [
      { id: '1', name: 'Dashboard', parentId: null, icon: 'fa-solid fa-gauge-high', childCount: 0 },
      { id: '2', name: 'Analytics', parentId: null, icon: 'fa-solid fa-chart-line', childCount: 0 },
      { id: '3', name: 'Reports', parentId: null, icon: 'fa-solid fa-file-lines', childCount: 0 },
      { id: '4', name: 'Users', parentId: null, icon: 'fa-solid fa-users', childCount: 0 },
      { id: '5', name: 'Settings', parentId: null, icon: 'fa-solid fa-gear', childCount: 0 },
    ];

    return {
      props: {
        leafConfig: createLeafConfig(flatItems),
        branchConfig: createBranchConfig([]),
      },
      template: `
        <div style="width: 250px; border: 1px solid #e0e0e0; border-radius: 8px; background: white;">
          <div style="padding: 12px 16px; border-bottom: 1px solid #e0e0e0; font-weight: 600; color: #374151;">
            Navigation
          </div>
          <div style="padding: 8px;">
            <mj-tree
              [BranchConfig]="branchConfig"
              [LeafConfig]="leafConfig"
              [SelectionMode]="'single'"
              [ShowIcons]="true">
            </mj-tree>
          </div>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'The tree can also display a flat list of items without nesting. All items are leaves with no parent.',
      },
    },
  },
};
