import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { TestingModule } from '@memberjunction/ng-testing';
import { EvaluationModeToggleComponent } from '@memberjunction/ng-testing';
import { EvaluationPreferencesService } from '@memberjunction/ng-testing';
import { MockEvaluationPreferencesService } from './.storybook-mocks';

const meta: Meta<EvaluationModeToggleComponent> = {
  title: 'Components/EvaluationModeToggle',
  component: EvaluationModeToggleComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, TestingModule],
      providers: [
        // Replace real service with mock
        { provide: EvaluationPreferencesService, useClass: MockEvaluationPreferencesService }
      ],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`app-evaluation-mode-toggle\` component provides toggle buttons for selecting which evaluation metrics to display.

## Usage

\`\`\`html
<app-evaluation-mode-toggle></app-evaluation-mode-toggle>
\`\`\`

## Module Import

\`\`\`typescript
import { TestingModule } from '@memberjunction/ng-testing';
\`\`\`

## Evaluation Metrics
- **Status**: Execution status (Passed, Failed, Error, Timeout)
- **Human**: Human evaluation ratings (1-10 scale)
- **Auto**: Automated evaluation scores (0-100%)

## Behavior
- At least one metric must always be enabled
- Warning hint appears briefly when attempting to disable all
- Preferences are persisted via EvaluationPreferencesService
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<EvaluationModeToggleComponent>;

// Default state
export const Default: Story = {
  render: () => ({
    template: `<app-evaluation-mode-toggle></app-evaluation-mode-toggle>`,
  }),
};

// All enabled state - need to set via service in a wrapper
export const AllEnabled: Story = {
  render: () => ({
    template: `
      <div>
        <div class="story-caption-sm" style="margin-bottom: 8px;">All metrics enabled:</div>
        <app-evaluation-mode-toggle></app-evaluation-mode-toggle>
        <div class="story-text-muted" style="margin-top: 8px; font-size: 11px;">
          Click buttons to toggle each metric
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All three evaluation metrics can be enabled. Try clicking buttons to toggle them.',
      },
    },
  },
};

// In header context
export const InHeaderContext: Story = {
  render: () => ({
    template: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        width: 600px;
      ">
        <div style="font-size: 16px; font-weight: 600; color: #1f2937;">
          Test Results Dashboard
        </div>
        <app-evaluation-mode-toggle></app-evaluation-mode-toggle>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Toggle component used in a page header for filtering test results.',
      },
    },
  },
};

// In filter panel
export const InFilterPanel: Story = {
  render: () => ({
    template: `
      <div style="
        padding: 16px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        width: 320px;
      ">
        <div style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 16px;">
          <i class="fa-solid fa-filter" style="margin-right: 8px;"></i>
          Display Filters
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">Evaluation Metrics</div>
          <app-evaluation-mode-toggle></app-evaluation-mode-toggle>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 16px;">
          <div style="font-size: 12px; color: #6b7280;">Additional filters would appear here</div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Toggle component used within a filter panel.',
      },
    },
  },
};

// Interactive demo
export const InteractiveDemo: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px;">
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #1f2937;">Interactive Demo</h3>
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            Click the buttons to toggle metrics. Try disabling all to see the warning hint!
          </p>
        </div>

        <div style="
          padding: 20px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        ">
          <app-evaluation-mode-toggle></app-evaluation-mode-toggle>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Interactive demo - click buttons to see the toggle behavior. Try disabling all three to see the warning.',
      },
    },
  },
};

// Button anatomy
export const ButtonAnatomy: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <table class="story-table story-width-lg">
          <thead>
            <tr>
              <th>Button</th>
              <th>Icon</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <button style="
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 12px;
                  border: none;
                  border-radius: 6px;
                  background: #3b82f6;
                  color: white;
                  font-size: 12px;
                  font-weight: 500;
                  cursor: pointer;
                ">
                  <i class="fa-solid fa-circle-check"></i>
                  <span>Status</span>
                </button>
              </td>
              <td><i class="fa-solid fa-circle-check story-text-info"></i></td>
              <td>Execution status: Passed, Failed, Error, Timeout</td>
            </tr>
            <tr>
              <td>
                <button style="
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 12px;
                  border: none;
                  border-radius: 6px;
                  background: #3b82f6;
                  color: white;
                  font-size: 12px;
                  font-weight: 500;
                  cursor: pointer;
                ">
                  <i class="fa-solid fa-user"></i>
                  <span>Human</span>
                </button>
              </td>
              <td><i class="fa-solid fa-user story-text-info"></i></td>
              <td>Human evaluation ratings on a 1-10 scale</td>
            </tr>
            <tr>
              <td>
                <button style="
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 12px;
                  border: none;
                  border-radius: 6px;
                  background: #3b82f6;
                  color: white;
                  font-size: 12px;
                  font-weight: 500;
                  cursor: pointer;
                ">
                  <i class="fa-solid fa-robot"></i>
                  <span>Auto</span>
                </button>
              </td>
              <td><i class="fa-solid fa-robot story-text-info"></i></td>
              <td>Automated evaluation scores (0-100%)</td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Reference showing each button with its icon and description.',
      },
    },
  },
};
