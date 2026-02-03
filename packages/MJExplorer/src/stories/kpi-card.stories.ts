import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { KPICardComponent } from '@memberjunction/ng-dashboards';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Define interface locally since it's not exported from the package
interface KPICardData {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    period: string;
  };
  loading?: boolean;
}

interface KPICardStoryArgs {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  trendDirection: 'up' | 'down' | 'stable' | 'none';
  trendPercentage: number;
  trendPeriod: string;
  loading: boolean;
}

const meta: Meta<KPICardStoryArgs> = {
  title: 'Components/KPICard',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, SharedGenericModule],
      declarations: [KPICardComponent],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`app-kpi-card\` component displays key performance indicator metrics in a card format with optional trend indicators.

## Usage

\`\`\`html
<app-kpi-card [data]="kpiData"></app-kpi-card>
\`\`\`

\`\`\`typescript
const kpiData: KPICardData = {
  title: 'Total Revenue',
  value: 125000,
  subtitle: 'This month',
  icon: 'fa-dollar-sign',
  color: 'success',
  trend: {
    direction: 'up',
    percentage: 12.5,
    period: 'vs last month'
  }
};
\`\`\`

## Module Import

\`\`\`typescript
import { DashboardsModule } from '@memberjunction/ng-dashboards';
\`\`\`

## Color Themes
- **primary**: Indigo/purple (#6366f1)
- **success**: Green (#10b981)
- **warning**: Amber (#f59e0b)
- **danger**: Red (#ef4444)
- **info**: Purple (#8b5cf6)

## Features
- Automatic number formatting (K, M suffixes for large numbers)
- Optional trend indicator with direction arrow
- Loading state with mj-loading spinner
- Hover animation with elevation effect
- Colored left border and icon background
        `,
      },
    },
  },
  argTypes: {
    title: {
      control: 'text',
      description: 'Card title displayed in header',
    },
    value: {
      control: 'text',
      description: 'Main value (number or string)',
    },
    subtitle: {
      control: 'text',
      description: 'Optional subtitle below value',
    },
    icon: {
      control: 'text',
      description: 'Font Awesome icon class (without fa-solid prefix)',
    },
    color: {
      control: 'select',
      options: ['primary', 'success', 'warning', 'danger', 'info'],
      description: 'Color theme',
    },
    trendDirection: {
      control: 'select',
      options: ['up', 'down', 'stable', 'none'],
      description: 'Trend direction',
    },
    trendPercentage: {
      control: { type: 'number', min: 0, max: 100 },
      description: 'Trend percentage',
    },
    trendPeriod: {
      control: 'text',
      description: 'Trend comparison period',
    },
    loading: {
      control: 'boolean',
      description: 'Show loading state',
    },
  },
};

export default meta;
type Story = StoryObj<KPICardStoryArgs>;

// Helper to build KPICardData from args
function buildData(args: KPICardStoryArgs): KPICardData {
  const data: KPICardData = {
    title: args.title,
    value: args.value,
    subtitle: args.subtitle || undefined,
    icon: args.icon,
    color: args.color,
    loading: args.loading,
  };
  if (args.trendDirection !== 'none') {
    data.trend = {
      direction: args.trendDirection as 'up' | 'down' | 'stable',
      percentage: args.trendPercentage,
      period: args.trendPeriod,
    };
  }
  return data;
}

// Default
export const Default: Story = {
  args: {
    title: 'Total Users',
    value: 12500,
    subtitle: 'Active accounts',
    icon: 'fa-users',
    color: 'primary',
    trendDirection: 'up',
    trendPercentage: 8.5,
    trendPeriod: 'vs last month',
    loading: false,
  },
  render: (args) => ({
    props: { data: buildData(args) },
    template: `
      <div style="width: 280px;">
        <app-kpi-card [data]="data"></app-kpi-card>
      </div>
    `,
  }),
};

// All color variations
export const ColorVariations: Story = {
  render: () => ({
    template: `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 20px; max-width: 900px;">
        <app-kpi-card [data]="{
          title: 'Primary',
          value: 1234,
          subtitle: 'Primary color',
          icon: 'fa-chart-line',
          color: 'primary'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Success',
          value: 5678,
          subtitle: 'Success color',
          icon: 'fa-check-circle',
          color: 'success'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Warning',
          value: 42,
          subtitle: 'Warning color',
          icon: 'fa-exclamation-triangle',
          color: 'warning'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Danger',
          value: 7,
          subtitle: 'Danger color',
          icon: 'fa-times-circle',
          color: 'danger'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Info',
          value: 999,
          subtitle: 'Info color',
          icon: 'fa-info-circle',
          color: 'info'
        }"></app-kpi-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All five color themes with matching icons.',
      },
    },
  },
};

// Trend indicators
export const TrendIndicators: Story = {
  render: () => ({
    template: `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 20px; max-width: 900px;">
        <app-kpi-card [data]="{
          title: 'Revenue',
          value: 125000,
          subtitle: 'This month',
          icon: 'fa-dollar-sign',
          color: 'success',
          trend: { direction: 'up', percentage: 12.5, period: 'vs last month' }
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Churn Rate',
          value: '2.4%',
          subtitle: 'Monthly average',
          icon: 'fa-user-minus',
          color: 'danger',
          trend: { direction: 'down', percentage: 8.2, period: 'vs last month' }
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Conversion',
          value: '3.2%',
          subtitle: 'Visitor to signup',
          icon: 'fa-percentage',
          color: 'primary',
          trend: { direction: 'stable', percentage: 0.1, period: 'vs last month' }
        }"></app-kpi-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Cards with up, down, and stable trend indicators.',
      },
    },
  },
};

// Number formatting
export const NumberFormatting: Story = {
  render: () => ({
    template: `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px; max-width: 1000px;">
        <app-kpi-card [data]="{
          title: 'Small Number',
          value: 42,
          icon: 'fa-hashtag',
          color: 'primary'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Thousands',
          value: 8500,
          subtitle: 'Displays as 8.5K',
          icon: 'fa-arrow-up',
          color: 'success'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Millions',
          value: 2500000,
          subtitle: 'Displays as 2.5M',
          icon: 'fa-chart-bar',
          color: 'info'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Decimal',
          value: 98.76,
          subtitle: 'Shows 2 decimals',
          icon: 'fa-percentage',
          color: 'warning'
        }"></app-kpi-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Automatic number formatting: small numbers as-is, thousands as K, millions as M, decimals to 2 places.',
      },
    },
  },
};

// Loading state
export const LoadingState: Story = {
  render: () => ({
    template: `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 20px; max-width: 600px;">
        <app-kpi-card [data]="{
          title: 'Loading Data',
          value: 0,
          icon: 'fa-spinner',
          color: 'primary',
          loading: true
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Data Loaded',
          value: 12345,
          subtitle: 'Ready',
          icon: 'fa-check',
          color: 'success',
          loading: false
        }"></app-kpi-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Loading state shows the mj-loading spinner instead of the value.',
      },
    },
  },
};

// Dashboard layout example
export const DashboardLayout: Story = {
  render: () => ({
    template: `
      <div style="padding: 24px; background: #f8fafc; border-radius: 12px;">
        <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #1e293b;">AI Dashboard Overview</h3>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
          <app-kpi-card [data]="{
            title: 'Total Prompts',
            value: 1247,
            subtitle: 'Active prompts',
            icon: 'fa-message',
            color: 'primary',
            trend: { direction: 'up', percentage: 15.3, period: 'this week' }
          }"></app-kpi-card>

          <app-kpi-card [data]="{
            title: 'Executions',
            value: 48500,
            subtitle: 'Last 24 hours',
            icon: 'fa-bolt',
            color: 'success',
            trend: { direction: 'up', percentage: 8.7, period: 'vs yesterday' }
          }"></app-kpi-card>

          <app-kpi-card [data]="{
            title: 'Error Rate',
            value: '0.8%',
            subtitle: 'API failures',
            icon: 'fa-exclamation-circle',
            color: 'warning',
            trend: { direction: 'down', percentage: 2.1, period: 'improving' }
          }"></app-kpi-card>

          <app-kpi-card [data]="{
            title: 'Avg Latency',
            value: '245ms',
            subtitle: 'Response time',
            icon: 'fa-clock',
            color: 'info',
            trend: { direction: 'stable', percentage: 0.5, period: 'stable' }
          }"></app-kpi-card>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Example dashboard layout with multiple KPI cards in a grid.',
      },
    },
  },
};

// Icon examples
export const IconExamples: Story = {
  render: () => ({
    template: `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px; max-width: 1000px;">
        <app-kpi-card [data]="{
          title: 'Users',
          value: 5420,
          icon: 'fa-users',
          color: 'primary'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Revenue',
          value: 84200,
          icon: 'fa-dollar-sign',
          color: 'success'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Orders',
          value: 1893,
          icon: 'fa-shopping-cart',
          color: 'info'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Messages',
          value: 342,
          icon: 'fa-envelope',
          color: 'warning'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'AI Models',
          value: 12,
          icon: 'fa-robot',
          color: 'primary'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'API Calls',
          value: 2500000,
          icon: 'fa-server',
          color: 'success'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Storage',
          value: '1.2TB',
          icon: 'fa-database',
          color: 'info'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Alerts',
          value: 3,
          icon: 'fa-bell',
          color: 'danger'
        }"></app-kpi-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Various Font Awesome icons appropriate for different KPI types.',
      },
    },
  },
};

// Without subtitle or trend
export const MinimalCard: Story = {
  render: () => ({
    template: `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 20px; max-width: 700px;">
        <app-kpi-card [data]="{
          title: 'Simple Count',
          value: 42,
          icon: 'fa-hashtag',
          color: 'primary'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'With Subtitle',
          value: 128,
          subtitle: 'Active items',
          icon: 'fa-list',
          color: 'success'
        }"></app-kpi-card>

        <app-kpi-card [data]="{
          title: 'Full Card',
          value: 256,
          subtitle: 'Total records',
          icon: 'fa-database',
          color: 'info',
          trend: { direction: 'up', percentage: 5.2, period: 'this week' }
        }"></app-kpi-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Cards with varying levels of detail - minimal, with subtitle, and full with trend.',
      },
    },
  },
};
