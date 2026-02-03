import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { TestingModule } from '@memberjunction/ng-testing';

interface TestStatusBadgeStoryArgs {
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Pending' | 'Timeout';
  showIcon: boolean;
}

const meta: Meta<TestStatusBadgeStoryArgs> = {
  title: 'Components/TestStatusBadge',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, TestingModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`app-test-status-badge\` component displays test execution status with appropriate colors and icons.

## Usage

\`\`\`html
<app-test-status-badge [status]="'Passed'" [showIcon]="true"></app-test-status-badge>
\`\`\`

## Module Import

\`\`\`typescript
import { TestingModule } from '@memberjunction/ng-testing';
\`\`\`

## Status Types
- **Passed**: Green - Test completed successfully
- **Failed**: Red - Test assertions failed
- **Skipped**: Gray - Test was intentionally skipped
- **Error**: Orange - Test encountered an unexpected error
- **Running**: Blue with spinner - Test is currently executing
- **Pending**: Amber - Test is queued and waiting
- **Timeout**: Dark orange - Test exceeded time limit
        `,
      },
    },
  },
  argTypes: {
    status: {
      control: 'select',
      options: ['Passed', 'Failed', 'Skipped', 'Error', 'Running', 'Pending', 'Timeout'],
      description: 'The test execution status',
    },
    showIcon: {
      control: 'boolean',
      description: 'Whether to display the status icon',
      defaultValue: true,
    },
  },
};

export default meta;
type Story = StoryObj<TestStatusBadgeStoryArgs>;

// Default
export const Default: Story = {
  args: {
    status: 'Passed',
    showIcon: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <app-test-status-badge [status]="'${args.status}'" [showIcon]="${args.showIcon}"></app-test-status-badge>
    `,
  }),
};

// All statuses
export const AllStatuses: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 12px; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Passed:</span>
          <app-test-status-badge status="Passed"></app-test-status-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Failed:</span>
          <app-test-status-badge status="Failed"></app-test-status-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Skipped:</span>
          <app-test-status-badge status="Skipped"></app-test-status-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Error:</span>
          <app-test-status-badge status="Error"></app-test-status-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Running:</span>
          <app-test-status-badge status="Running"></app-test-status-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Pending:</span>
          <app-test-status-badge status="Pending"></app-test-status-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Timeout:</span>
          <app-test-status-badge status="Timeout"></app-test-status-badge>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All seven test status states with their corresponding colors and icons.',
      },
    },
  },
};

// Without icons
export const WithoutIcons: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px;">
        <app-test-status-badge status="Passed" [showIcon]="false"></app-test-status-badge>
        <app-test-status-badge status="Failed" [showIcon]="false"></app-test-status-badge>
        <app-test-status-badge status="Skipped" [showIcon]="false"></app-test-status-badge>
        <app-test-status-badge status="Error" [showIcon]="false"></app-test-status-badge>
        <app-test-status-badge status="Running" [showIcon]="false"></app-test-status-badge>
        <app-test-status-badge status="Pending" [showIcon]="false"></app-test-status-badge>
        <app-test-status-badge status="Timeout" [showIcon]="false"></app-test-status-badge>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Badges displayed without icons for a more compact view.',
      },
    },
  },
};

// Comparison (with and without icons)
export const IconComparison: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px;">
        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">With Icons</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 12px;">
            <app-test-status-badge status="Passed" [showIcon]="true"></app-test-status-badge>
            <app-test-status-badge status="Failed" [showIcon]="true"></app-test-status-badge>
            <app-test-status-badge status="Running" [showIcon]="true"></app-test-status-badge>
          </div>
        </div>
        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Without Icons</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 12px;">
            <app-test-status-badge status="Passed" [showIcon]="false"></app-test-status-badge>
            <app-test-status-badge status="Failed" [showIcon]="false"></app-test-status-badge>
            <app-test-status-badge status="Running" [showIcon]="false"></app-test-status-badge>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Comparison of badges with and without icons.',
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
              <th style="text-align: left; padding: 12px 16px; color: #374151;">Test Name</th>
              <th style="text-align: left; padding: 12px 16px; color: #374151;">Status</th>
              <th style="text-align: left; padding: 12px 16px; color: #374151;">Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">User Authentication Test</td>
              <td style="padding: 12px 16px;"><app-test-status-badge status="Passed"></app-test-status-badge></td>
              <td style="padding: 12px 16px;">1.2s</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">API Response Validation</td>
              <td style="padding: 12px 16px;"><app-test-status-badge status="Failed"></app-test-status-badge></td>
              <td style="padding: 12px 16px;">3.5s</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Database Connection Test</td>
              <td style="padding: 12px 16px;"><app-test-status-badge status="Running"></app-test-status-badge></td>
              <td style="padding: 12px 16px;">—</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Legacy System Integration</td>
              <td style="padding: 12px 16px;"><app-test-status-badge status="Skipped"></app-test-status-badge></td>
              <td style="padding: 12px 16px;">—</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Performance Benchmark</td>
              <td style="padding: 12px 16px;"><app-test-status-badge status="Timeout"></app-test-status-badge></td>
              <td style="padding: 12px 16px;">30.0s</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Memory Leak Detection</td>
              <td style="padding: 12px 16px;"><app-test-status-badge status="Error"></app-test-status-badge></td>
              <td style="padding: 12px 16px;">5.2s</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">UI Regression Suite</td>
              <td style="padding: 12px 16px;"><app-test-status-badge status="Pending"></app-test-status-badge></td>
              <td style="padding: 12px 16px;">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Test status badges displayed in a typical test results table.',
      },
    },
  },
};

// Color reference
export const ColorReference: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px;">
        <table style="width: 100%; max-width: 700px; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 12px;">Status</th>
              <th style="text-align: left; padding: 12px;">Color</th>
              <th style="text-align: left; padding: 12px;">Icon</th>
              <th style="text-align: left; padding: 12px;">Preview</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">Passed</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #4caf50; border-radius: 4px;"></span>
                  #4caf50
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-check-circle" style="color: #4caf50;"></i> fa-check-circle</td>
              <td style="padding: 12px;"><app-test-status-badge status="Passed"></app-test-status-badge></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">Failed</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #f44336; border-radius: 4px;"></span>
                  #f44336
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-times-circle" style="color: #f44336;"></i> fa-times-circle</td>
              <td style="padding: 12px;"><app-test-status-badge status="Failed"></app-test-status-badge></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">Skipped</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #9e9e9e; border-radius: 4px;"></span>
                  #9e9e9e
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-forward" style="color: #9e9e9e;"></i> fa-forward</td>
              <td style="padding: 12px;"><app-test-status-badge status="Skipped"></app-test-status-badge></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">Error</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #ff9800; border-radius: 4px;"></span>
                  #ff9800
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-exclamation-triangle" style="color: #ff9800;"></i> fa-exclamation-triangle</td>
              <td style="padding: 12px;"><app-test-status-badge status="Error"></app-test-status-badge></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">Running</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #2196f3; border-radius: 4px;"></span>
                  #2196f3
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-spinner fa-spin" style="color: #2196f3;"></i> fa-spinner (animated)</td>
              <td style="padding: 12px;"><app-test-status-badge status="Running"></app-test-status-badge></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">Pending</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #ffc107; border-radius: 4px;"></span>
                  #ffc107
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-clock" style="color: #ffc107;"></i> fa-clock</td>
              <td style="padding: 12px;"><app-test-status-badge status="Pending"></app-test-status-badge></td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">Timeout</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #e65100; border-radius: 4px;"></span>
                  #e65100
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-stopwatch" style="color: #e65100;"></i> fa-stopwatch</td>
              <td style="padding: 12px;"><app-test-status-badge status="Timeout"></app-test-status-badge></td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Reference table showing the color, icon, and visual preview for each status.',
      },
    },
  },
};

// Test summary dashboard
export const TestSummaryDashboard: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px;">
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <div style="
            flex: 1;
            min-width: 140px;
            padding: 16px;
            background: rgba(76, 175, 80, 0.1);
            border: 1px solid rgba(76, 175, 80, 0.2);
            border-radius: 8px;
            text-align: center;
          ">
            <div style="font-size: 28px; font-weight: 700; color: #4caf50; margin-bottom: 8px;">42</div>
            <app-test-status-badge status="Passed"></app-test-status-badge>
          </div>

          <div style="
            flex: 1;
            min-width: 140px;
            padding: 16px;
            background: rgba(244, 67, 54, 0.1);
            border: 1px solid rgba(244, 67, 54, 0.2);
            border-radius: 8px;
            text-align: center;
          ">
            <div style="font-size: 28px; font-weight: 700; color: #f44336; margin-bottom: 8px;">3</div>
            <app-test-status-badge status="Failed"></app-test-status-badge>
          </div>

          <div style="
            flex: 1;
            min-width: 140px;
            padding: 16px;
            background: rgba(33, 150, 243, 0.1);
            border: 1px solid rgba(33, 150, 243, 0.2);
            border-radius: 8px;
            text-align: center;
          ">
            <div style="font-size: 28px; font-weight: 700; color: #2196f3; margin-bottom: 8px;">2</div>
            <app-test-status-badge status="Running"></app-test-status-badge>
          </div>

          <div style="
            flex: 1;
            min-width: 140px;
            padding: 16px;
            background: rgba(158, 158, 158, 0.1);
            border: 1px solid rgba(158, 158, 158, 0.2);
            border-radius: 8px;
            text-align: center;
          ">
            <div style="font-size: 28px; font-weight: 700; color: #9e9e9e; margin-bottom: 8px;">5</div>
            <app-test-status-badge status="Skipped"></app-test-status-badge>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Example of test status badges used in a summary dashboard layout.',
      },
    },
  },
};
