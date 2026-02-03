import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { TestingModule } from '@memberjunction/ng-testing';

interface ReviewStatusIndicatorStoryArgs {
  hasReview: boolean;
  reviewedCount: number;
  totalCount: number;
  mode: 'badge' | 'count' | 'progress';
  showText: boolean;
  showLabel: boolean;
}

const meta: Meta<ReviewStatusIndicatorStoryArgs> = {
  title: 'Components/ReviewStatusIndicator',
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
The \`app-review-status-indicator\` component displays review status in three different modes.

## Usage

\`\`\`html
<!-- Badge mode (single item) -->
<app-review-status-indicator [hasReview]="true" mode="badge"></app-review-status-indicator>

<!-- Count mode (aggregate) -->
<app-review-status-indicator [reviewedCount]="5" [totalCount]="10" mode="count"></app-review-status-indicator>

<!-- Progress mode (visual bar) -->
<app-review-status-indicator [reviewedCount]="7" [totalCount]="10" mode="progress"></app-review-status-indicator>
\`\`\`

## Module Import

\`\`\`typescript
import { TestingModule } from '@memberjunction/ng-testing';
\`\`\`

## Display Modes
- **Badge**: Single item reviewed/not-reviewed status
- **Count**: X/Y reviewed format with status icon
- **Progress**: Visual progress bar with count
        `,
      },
    },
  },
  argTypes: {
    hasReview: {
      control: 'boolean',
      description: 'Whether this single item has been reviewed (badge mode)',
    },
    reviewedCount: {
      control: { type: 'number', min: 0 },
      description: 'Count of reviewed items (count/progress modes)',
    },
    totalCount: {
      control: { type: 'number', min: 0 },
      description: 'Total count of items (count/progress modes)',
    },
    mode: {
      control: 'select',
      options: ['badge', 'count', 'progress'],
      description: 'Display mode',
    },
    showText: {
      control: 'boolean',
      description: 'Show text label in badge mode',
    },
    showLabel: {
      control: 'boolean',
      description: 'Show "reviewed" label in count mode',
    },
  },
};

export default meta;
type Story = StoryObj<ReviewStatusIndicatorStoryArgs>;

// Default badge mode
export const Default: Story = {
  args: {
    hasReview: true,
    mode: 'badge',
    showText: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <app-review-status-indicator
        [hasReview]="${args.hasReview}"
        mode="${args.mode}"
        [showText]="${args.showText}">
      </app-review-status-indicator>
    `,
  }),
};

// Badge mode variations
export const BadgeMode: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div class="story-row">
          <span class="story-label story-label-lg">Reviewed:</span>
          <app-review-status-indicator [hasReview]="true" mode="badge"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-lg">Needs Review:</span>
          <app-review-status-indicator [hasReview]="false" mode="badge"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-lg">Icon Only:</span>
          <app-review-status-indicator [hasReview]="true" mode="badge" [showText]="false"></app-review-status-indicator>
          <app-review-status-indicator [hasReview]="false" mode="badge" [showText]="false"></app-review-status-indicator>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Badge mode shows a single reviewed/not-reviewed status. Toggle showText for icon-only display.',
      },
    },
  },
};

// Count mode variations
export const CountMode: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div class="story-row">
          <span class="story-label story-label-xl">All Reviewed:</span>
          <app-review-status-indicator [reviewedCount]="10" [totalCount]="10" mode="count"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-xl">Partial:</span>
          <app-review-status-indicator [reviewedCount]="5" [totalCount]="10" mode="count"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-xl">None Reviewed:</span>
          <app-review-status-indicator [reviewedCount]="0" [totalCount]="10" mode="count"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-xl">With Label:</span>
          <app-review-status-indicator [reviewedCount]="7" [totalCount]="10" mode="count" [showLabel]="true"></app-review-status-indicator>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Count mode shows X/Y format with status-appropriate icons and colors. Use showLabel to append "reviewed" text.',
      },
    },
  },
};

// Progress mode variations
export const ProgressMode: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div class="story-row">
          <span class="story-label story-label-xl">Complete (100%):</span>
          <app-review-status-indicator [reviewedCount]="10" [totalCount]="10" mode="progress"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-xl">Most (80%):</span>
          <app-review-status-indicator [reviewedCount]="8" [totalCount]="10" mode="progress"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-xl">Half (50%):</span>
          <app-review-status-indicator [reviewedCount]="5" [totalCount]="10" mode="progress"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-xl">Low (20%):</span>
          <app-review-status-indicator [reviewedCount]="2" [totalCount]="10" mode="progress"></app-review-status-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-xl">None (0%):</span>
          <app-review-status-indicator [reviewedCount]="0" [totalCount]="10" mode="progress"></app-review-status-indicator>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Progress mode shows a visual progress bar with count display.',
      },
    },
  },
};

// All modes comparison
export const ModeComparison: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <table class="story-table">
          <thead>
            <tr>
              <th>State</th>
              <th>Badge</th>
              <th>Count</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="label">Complete</td>
              <td><app-review-status-indicator [hasReview]="true" mode="badge"></app-review-status-indicator></td>
              <td><app-review-status-indicator [reviewedCount]="10" [totalCount]="10" mode="count"></app-review-status-indicator></td>
              <td><app-review-status-indicator [reviewedCount]="10" [totalCount]="10" mode="progress"></app-review-status-indicator></td>
            </tr>
            <tr>
              <td class="label">Partial</td>
              <td>—</td>
              <td><app-review-status-indicator [reviewedCount]="5" [totalCount]="10" mode="count"></app-review-status-indicator></td>
              <td><app-review-status-indicator [reviewedCount]="5" [totalCount]="10" mode="progress"></app-review-status-indicator></td>
            </tr>
            <tr>
              <td class="label">None</td>
              <td><app-review-status-indicator [hasReview]="false" mode="badge"></app-review-status-indicator></td>
              <td><app-review-status-indicator [reviewedCount]="0" [totalCount]="10" mode="count"></app-review-status-indicator></td>
              <td><app-review-status-indicator [reviewedCount]="0" [totalCount]="10" mode="progress"></app-review-status-indicator></td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Comparison of all three display modes across different states.',
      },
    },
  },
};

// In table context
export const InTableContext: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <table class="story-table">
          <thead>
            <tr>
              <th class="pad-x">Test Suite</th>
              <th class="pad-x">Tests</th>
              <th class="pad-x">Review Progress</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pad-x">Authentication Suite</td>
              <td class="pad-x">24</td>
              <td class="pad-x">
                <app-review-status-indicator [reviewedCount]="24" [totalCount]="24" mode="progress"></app-review-status-indicator>
              </td>
            </tr>
            <tr>
              <td class="pad-x">API Validation Suite</td>
              <td class="pad-x">42</td>
              <td class="pad-x">
                <app-review-status-indicator [reviewedCount]="35" [totalCount]="42" mode="progress"></app-review-status-indicator>
              </td>
            </tr>
            <tr>
              <td class="pad-x">Edge Cases Suite</td>
              <td class="pad-x">18</td>
              <td class="pad-x">
                <app-review-status-indicator [reviewedCount]="8" [totalCount]="18" mode="progress"></app-review-status-indicator>
              </td>
            </tr>
            <tr>
              <td class="pad-x">Performance Suite</td>
              <td class="pad-x">15</td>
              <td class="pad-x">
                <app-review-status-indicator [reviewedCount]="0" [totalCount]="15" mode="progress"></app-review-status-indicator>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Review status indicators in a test suite table showing review progress.',
      },
    },
  },
};

// Dashboard cards
export const DashboardCards: Story = {
  render: () => ({
    template: `
      <div class="story-container story-grid">
        <div class="story-card-lg story-card-min-width">
          <div class="story-heading">
            Today's Reviews
          </div>
          <app-review-status-indicator
            [reviewedCount]="12"
            [totalCount]="15"
            mode="count"
            [showLabel]="true">
          </app-review-status-indicator>
        </div>

        <div class="story-card-lg story-card-min-width">
          <div class="story-heading">
            Weekly Progress
          </div>
          <app-review-status-indicator
            [reviewedCount]="67"
            [totalCount]="100"
            mode="progress">
          </app-review-status-indicator>
        </div>

        <div class="story-card-lg story-card-min-width">
          <div class="story-heading">
            Current Item
          </div>
          <app-review-status-indicator
            [hasReview]="true"
            mode="badge">
          </app-review-status-indicator>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Review status indicators used in dashboard card layouts.',
      },
    },
  },
};
