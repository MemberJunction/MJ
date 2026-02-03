import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { TestingModule } from '@memberjunction/ng-testing';

interface EvaluationBadgeStoryArgs {
  executionStatus: string;
  originalStatus: string;
  autoScore: number | null;
  passedChecks: number | null;
  failedChecks: number | null;
  totalChecks: number | null;
  humanRating: number | null;
  humanIsCorrect: boolean | null;
  hasHumanFeedback: boolean;
  mode: 'compact' | 'expanded' | 'inline';
  showExecution: boolean;
  showHuman: boolean;
  showAuto: boolean;
}

const meta: Meta<EvaluationBadgeStoryArgs> = {
  title: 'Components/EvaluationBadge',
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
The \`app-evaluation-badge\` component displays test evaluation metrics including execution status, human ratings, and automated scores.

## Usage

\`\`\`html
<app-evaluation-badge
  [executionStatus]="'Completed'"
  [autoScore]="0.85"
  [humanRating]="8"
  [hasHumanFeedback]="true"
  [mode]="'compact'"
></app-evaluation-badge>
\`\`\`

## Module Import

\`\`\`typescript
import { TestingModule } from '@memberjunction/ng-testing';
\`\`\`

## Display Modes
- **compact**: Inline display for tables/lists - icons only with minimal text
- **expanded**: Detailed view with labels, progress bars, and full metrics
- **inline**: Single primary value display based on preference priority

## Preferences
Control which metrics to display:
- \`showExecution\`: Show execution status (Passed/Failed/Running etc.)
- \`showHuman\`: Show human feedback ratings (1-10 scale)
- \`showAuto\`: Show automated oracle scores (0-100%)
        `,
      },
    },
  },
  argTypes: {
    executionStatus: {
      control: 'select',
      options: ['Completed', 'Passed', 'Failed', 'Error', 'Timeout', 'Running', 'Pending', 'Skipped'],
      description: 'Test execution status',
    },
    autoScore: {
      control: { type: 'number', min: 0, max: 1, step: 0.05 },
      description: 'Automated score (0-1 scale)',
    },
    humanRating: {
      control: { type: 'number', min: 1, max: 10, step: 1 },
      description: 'Human rating (1-10 scale)',
    },
    hasHumanFeedback: {
      control: 'boolean',
      description: 'Whether human feedback exists',
    },
    mode: {
      control: 'select',
      options: ['compact', 'expanded', 'inline'],
      description: 'Display mode',
    },
  },
};

export default meta;
type Story = StoryObj<EvaluationBadgeStoryArgs>;

// Default compact view
export const Default: Story = {
  args: {
    executionStatus: 'Completed',
    originalStatus: 'Passed',
    autoScore: 0.85,
    humanRating: 8,
    hasHumanFeedback: true,
    mode: 'compact',
    showExecution: true,
    showHuman: true,
    showAuto: true,
  },
  render: (args) => ({
    props: {
      ...args,
      preferences: {
        showExecution: args.showExecution,
        showHuman: args.showHuman,
        showAuto: args.showAuto,
      },
    },
    template: `
      <app-evaluation-badge
        [executionStatus]="'${args.executionStatus}'"
        [originalStatus]="'${args.originalStatus}'"
        [autoScore]="${args.autoScore}"
        [humanRating]="${args.humanRating}"
        [hasHumanFeedback]="${args.hasHumanFeedback}"
        [preferences]="preferences"
        [mode]="'${args.mode}'"
      ></app-evaluation-badge>
    `,
  }),
};

// Compact mode examples
export const CompactMode: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 120px; font-size: 13px; color: #666;">High scores:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.95"
            [humanRating]="9"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 120px; font-size: 13px; color: #666;">Medium scores:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.65"
            [humanRating]="6"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 120px; font-size: 13px; color: #666;">Low scores:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Failed"
            [autoScore]="0.35"
            [humanRating]="3"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 120px; font-size: 13px; color: #666;">No feedback:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.75"
            [hasHumanFeedback]="false"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Compact mode is ideal for tables and lists. Shows icons only with minimal text.',
      },
    },
  },
};

// Expanded mode examples
export const ExpandedMode: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px; padding: 20px;">
        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">High Quality Result</h4>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.92"
            [passedChecks]="18"
            [failedChecks]="2"
            [totalChecks]="20"
            [humanRating]="9"
            [humanIsCorrect]="true"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="expanded"
          ></app-evaluation-badge>
        </div>

        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Medium Quality Result</h4>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.65"
            [passedChecks]="13"
            [failedChecks]="7"
            [totalChecks]="20"
            [humanRating]="6"
            [humanIsCorrect]="true"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="expanded"
          ></app-evaluation-badge>
        </div>

        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Low Quality Result</h4>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Failed"
            [autoScore]="0.28"
            [passedChecks]="5"
            [failedChecks]="15"
            [totalChecks]="20"
            [humanRating]="3"
            [humanIsCorrect]="false"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="expanded"
          ></app-evaluation-badge>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Expanded mode shows full details including progress bars, star ratings, and check counts.',
      },
    },
  },
};

// Inline mode examples
export const InlineMode: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 150px; font-size: 13px; color: #666;">Human priority:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [humanRating]="8"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="inline"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 150px; font-size: 13px; color: #666;">Auto priority:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [hasHumanFeedback]="false"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="inline"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 150px; font-size: 13px; color: #666;">Execution only:</span>
          <app-evaluation-badge
            executionStatus="Passed"
            originalStatus="Passed"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="inline"
          ></app-evaluation-badge>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Inline mode shows a single primary value based on preference priority: Human > Auto > Execution.',
      },
    },
  },
};

// Execution status variations
export const ExecutionStatuses: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 12px; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Passed:</span>
          <app-evaluation-badge
            executionStatus="Passed"
            originalStatus="Passed"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Failed:</span>
          <app-evaluation-badge
            executionStatus="Failed"
            originalStatus="Failed"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Error:</span>
          <app-evaluation-badge
            executionStatus="Error"
            originalStatus="Error"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Timeout:</span>
          <app-evaluation-badge
            executionStatus="Timeout"
            originalStatus="Timeout"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Running:</span>
          <app-evaluation-badge
            executionStatus="Running"
            originalStatus="Running"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Pending:</span>
          <app-evaluation-badge
            executionStatus="Pending"
            originalStatus="Pending"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 80px; font-size: 13px; color: #666;">Skipped:</span>
          <app-evaluation-badge
            executionStatus="Skipped"
            originalStatus="Skipped"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All execution status types with their corresponding colors and icons.',
      },
    },
  },
};

// Preference combinations
export const PreferenceCombinations: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 200px; font-size: 13px; color: #666;">All metrics:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [humanRating]="8"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 200px; font-size: 13px; color: #666;">Execution + Human:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [humanRating]="8"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 200px; font-size: 13px; color: #666;">Execution + Auto:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [humanRating]="8"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: true }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 200px; font-size: 13px; color: #666;">Human + Auto:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [humanRating]="8"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: false, showHuman: true, showAuto: true }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="width: 200px; font-size: 13px; color: #666;">Execution only:</span>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [humanRating]="8"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"
            mode="compact"
          ></app-evaluation-badge>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Different preference combinations control which metrics are displayed.',
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
              <th style="text-align: left; padding: 12px 16px; color: #374151;">Evaluation</th>
              <th style="text-align: left; padding: 12px 16px; color: #374151;">Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">User Registration Flow</td>
              <td style="padding: 12px 16px;">
                <app-evaluation-badge
                  executionStatus="Completed"
                  originalStatus="Passed"
                  [autoScore]="0.95"
                  [humanRating]="9"
                  [hasHumanFeedback]="true"
                  [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
                  mode="compact"
                ></app-evaluation-badge>
              </td>
              <td style="padding: 12px 16px;">2.3s</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Payment Processing</td>
              <td style="padding: 12px 16px;">
                <app-evaluation-badge
                  executionStatus="Completed"
                  originalStatus="Passed"
                  [autoScore]="0.72"
                  [humanRating]="7"
                  [hasHumanFeedback]="true"
                  [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
                  mode="compact"
                ></app-evaluation-badge>
              </td>
              <td style="padding: 12px 16px;">4.1s</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Email Notification</td>
              <td style="padding: 12px 16px;">
                <app-evaluation-badge
                  executionStatus="Completed"
                  originalStatus="Failed"
                  [autoScore]="0.35"
                  [humanRating]="3"
                  [hasHumanFeedback]="true"
                  [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
                  mode="compact"
                ></app-evaluation-badge>
              </td>
              <td style="padding: 12px 16px;">1.8s</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Search Functionality</td>
              <td style="padding: 12px 16px;">
                <app-evaluation-badge
                  executionStatus="Running"
                  originalStatus="Running"
                  [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
                  mode="compact"
                ></app-evaluation-badge>
              </td>
              <td style="padding: 12px 16px;">—</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 16px;">Data Export</td>
              <td style="padding: 12px 16px;">
                <app-evaluation-badge
                  executionStatus="Completed"
                  originalStatus="Passed"
                  [autoScore]="0.88"
                  [hasHumanFeedback]="false"
                  [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
                  mode="compact"
                ></app-evaluation-badge>
              </td>
              <td style="padding: 12px 16px;">5.6s</td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Evaluation badges in a typical test results table showing various states.',
      },
    },
  },
};

// Mode comparison
export const ModeComparison: Story = {
  render: () => ({
    template: `
      <div style="display: flex; flex-direction: column; gap: 32px; padding: 20px;">
        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Compact Mode</h4>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [passedChecks]="17"
            [failedChecks]="3"
            [totalChecks]="20"
            [humanRating]="8"
            [humanIsCorrect]="true"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="compact"
          ></app-evaluation-badge>
        </div>

        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Expanded Mode</h4>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [passedChecks]="17"
            [failedChecks]="3"
            [totalChecks]="20"
            [humanRating]="8"
            [humanIsCorrect]="true"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="expanded"
          ></app-evaluation-badge>
        </div>

        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">Inline Mode</h4>
          <app-evaluation-badge
            executionStatus="Completed"
            originalStatus="Passed"
            [autoScore]="0.85"
            [passedChecks]="17"
            [failedChecks]="3"
            [totalChecks]="20"
            [humanRating]="8"
            [humanIsCorrect]="true"
            [hasHumanFeedback]="true"
            [preferences]="{ showExecution: true, showHuman: true, showAuto: true }"
            mode="inline"
          ></app-evaluation-badge>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Side-by-side comparison of all three display modes with the same data.',
      },
    },
  },
};
