import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { TestingModule } from '@memberjunction/ng-testing';

interface ScoreIndicatorStoryArgs {
  score: number;
  showBar: boolean;
  showIcon: boolean;
  decimals: number;
}

const meta: Meta<ScoreIndicatorStoryArgs> = {
  title: 'Components/ScoreIndicator',
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
The \`app-score-indicator\` component displays a numeric score (0-1) with visual feedback.

## Usage

\`\`\`html
<app-score-indicator [score]="0.95" [showBar]="true" [showIcon]="true"></app-score-indicator>
\`\`\`

## Module Import

\`\`\`typescript
import { TestingModule } from '@memberjunction/ng-testing';
\`\`\`

## Score Tiers
- **Excellent** (0.90+): Green with star icon
- **Good** (0.80-0.89): Light green with check icon
- **Fair** (0.60-0.79): Yellow with minus icon
- **Poor** (0.40-0.59): Orange with exclamation icon
- **Fail** (<0.40): Red with X icon
        `,
      },
    },
  },
  argTypes: {
    score: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
      description: 'The score value (0-1)',
    },
    showBar: {
      control: 'boolean',
      description: 'Whether to display the progress bar',
      defaultValue: true,
    },
    showIcon: {
      control: 'boolean',
      description: 'Whether to display the status icon',
      defaultValue: true,
    },
    decimals: {
      control: { type: 'number', min: 0, max: 6 },
      description: 'Number of decimal places to display',
      defaultValue: 4,
    },
  },
};

export default meta;
type Story = StoryObj<ScoreIndicatorStoryArgs>;

// Default
export const Default: Story = {
  args: {
    score: 0.95,
    showBar: true,
    showIcon: true,
    decimals: 4,
  },
  render: (args) => ({
    props: args,
    template: `
      <app-score-indicator
        [score]="${args.score}"
        [showBar]="${args.showBar}"
        [showIcon]="${args.showIcon}"
        [decimals]="${args.decimals}">
      </app-score-indicator>
    `,
  }),
};

// All score tiers
export const AllScoreTiers: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div class="story-row">
          <span class="story-label story-label-md">Excellent:</span>
          <app-score-indicator [score]="0.95"></app-score-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-md">Good:</span>
          <app-score-indicator [score]="0.85"></app-score-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-md">Fair:</span>
          <app-score-indicator [score]="0.70"></app-score-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-md">Poor:</span>
          <app-score-indicator [score]="0.50"></app-score-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-md">Fail:</span>
          <app-score-indicator [score]="0.25"></app-score-indicator>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All five score tiers with their corresponding colors, icons, and visual bars.',
      },
    },
  },
};

// Without bar
export const WithoutBar: Story = {
  render: () => ({
    template: `
      <div class="story-container story-grid">
        <app-score-indicator [score]="0.95" [showBar]="false"></app-score-indicator>
        <app-score-indicator [score]="0.85" [showBar]="false"></app-score-indicator>
        <app-score-indicator [score]="0.70" [showBar]="false"></app-score-indicator>
        <app-score-indicator [score]="0.50" [showBar]="false"></app-score-indicator>
        <app-score-indicator [score]="0.25" [showBar]="false"></app-score-indicator>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Score indicators displayed without the progress bar for a more compact view.',
      },
    },
  },
};

// Without icon
export const WithoutIcon: Story = {
  render: () => ({
    template: `
      <div class="story-container story-grid">
        <app-score-indicator [score]="0.95" [showIcon]="false"></app-score-indicator>
        <app-score-indicator [score]="0.85" [showIcon]="false"></app-score-indicator>
        <app-score-indicator [score]="0.70" [showIcon]="false"></app-score-indicator>
        <app-score-indicator [score]="0.50" [showIcon]="false"></app-score-indicator>
        <app-score-indicator [score]="0.25" [showIcon]="false"></app-score-indicator>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Score indicators displayed without icons, showing only the bar and numeric value.',
      },
    },
  },
};

// Different decimal places
export const DecimalPrecision: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column story-gap-md">
        <div class="story-row">
          <span class="story-label story-label-sm">0 decimals:</span>
          <app-score-indicator [score]="0.8567" [decimals]="0"></app-score-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-sm">2 decimals:</span>
          <app-score-indicator [score]="0.8567" [decimals]="2"></app-score-indicator>
        </div>
        <div class="story-row">
          <span class="story-label story-label-sm">4 decimals:</span>
          <app-score-indicator [score]="0.8567" [decimals]="4"></app-score-indicator>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The decimals input controls the precision of the displayed score.',
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
              <th class="pad-x">Test Case</th>
              <th class="pad-x">Score</th>
              <th class="pad-x">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pad-x">Response Accuracy Test</td>
              <td class="pad-x"><app-score-indicator [score]="0.9823" [decimals]="2"></app-score-indicator></td>
              <td class="pad-x story-text-success">Passed</td>
            </tr>
            <tr>
              <td class="pad-x">Format Validation</td>
              <td class="pad-x"><app-score-indicator [score]="0.8456" [decimals]="2"></app-score-indicator></td>
              <td class="pad-x story-text-success">Passed</td>
            </tr>
            <tr>
              <td class="pad-x">Edge Case Handling</td>
              <td class="pad-x"><app-score-indicator [score]="0.6234" [decimals]="2"></app-score-indicator></td>
              <td class="pad-x story-text-warning">Warning</td>
            </tr>
            <tr>
              <td class="pad-x">Performance Benchmark</td>
              <td class="pad-x"><app-score-indicator [score]="0.4821" [decimals]="2"></app-score-indicator></td>
              <td class="pad-x" style="color: #ff9800;">Review</td>
            </tr>
            <tr>
              <td class="pad-x">Safety Compliance</td>
              <td class="pad-x"><app-score-indicator [score]="0.2145" [decimals]="2"></app-score-indicator></td>
              <td class="pad-x story-text-danger">Failed</td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Score indicators in a typical test results table context.',
      },
    },
  },
};

// Color reference
export const ColorReference: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <table class="story-table story-max-width-lg">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Range</th>
              <th>Color</th>
              <th>Icon</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="label">Excellent</td>
              <td>0.90 - 1.00</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-success"></span>
                  Green
                </span>
              </td>
              <td><i class="fa-solid fa-star story-text-success"></i> Star</td>
              <td><app-score-indicator [score]="0.95" [decimals]="2"></app-score-indicator></td>
            </tr>
            <tr>
              <td class="label">Good</td>
              <td>0.80 - 0.89</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-success-light"></span>
                  Light Green
                </span>
              </td>
              <td><i class="fa-solid fa-check" style="color: #8bc34a;"></i> Check</td>
              <td><app-score-indicator [score]="0.85" [decimals]="2"></app-score-indicator></td>
            </tr>
            <tr>
              <td class="label">Fair</td>
              <td>0.60 - 0.79</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-warning"></span>
                  Yellow
                </span>
              </td>
              <td><i class="fa-solid fa-minus story-text-warning"></i> Minus</td>
              <td><app-score-indicator [score]="0.70" [decimals]="2"></app-score-indicator></td>
            </tr>
            <tr>
              <td class="label">Poor</td>
              <td>0.40 - 0.59</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-orange"></span>
                  Orange
                </span>
              </td>
              <td><i class="fa-solid fa-exclamation" style="color: #ff9800;"></i> Exclamation</td>
              <td><app-score-indicator [score]="0.50" [decimals]="2"></app-score-indicator></td>
            </tr>
            <tr>
              <td class="label">Fail</td>
              <td>0.00 - 0.39</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-danger"></span>
                  Red
                </span>
              </td>
              <td><i class="fa-solid fa-times story-text-danger"></i> X</td>
              <td><app-score-indicator [score]="0.25" [decimals]="2"></app-score-indicator></td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Reference table showing the color, icon, and visual preview for each score tier.',
      },
    },
  },
};

// Minimal view
export const MinimalView: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div>
          <h4 class="story-heading">Full Display</h4>
          <div class="story-grid">
            <app-score-indicator [score]="0.95" [showBar]="true" [showIcon]="true"></app-score-indicator>
            <app-score-indicator [score]="0.70" [showBar]="true" [showIcon]="true"></app-score-indicator>
            <app-score-indicator [score]="0.25" [showBar]="true" [showIcon]="true"></app-score-indicator>
          </div>
        </div>
        <div>
          <h4 class="story-heading">Compact (No Bar)</h4>
          <div class="story-grid">
            <app-score-indicator [score]="0.95" [showBar]="false" [showIcon]="true"></app-score-indicator>
            <app-score-indicator [score]="0.70" [showBar]="false" [showIcon]="true"></app-score-indicator>
            <app-score-indicator [score]="0.25" [showBar]="false" [showIcon]="true"></app-score-indicator>
          </div>
        </div>
        <div>
          <h4 class="story-heading">Minimal (Value Only)</h4>
          <div class="story-grid">
            <app-score-indicator [score]="0.95" [showBar]="false" [showIcon]="false"></app-score-indicator>
            <app-score-indicator [score]="0.70" [showBar]="false" [showIcon]="false"></app-score-indicator>
            <app-score-indicator [score]="0.25" [showBar]="false" [showIcon]="false"></app-score-indicator>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Different display configurations from full to minimal.',
      },
    },
  },
};
