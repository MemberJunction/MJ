import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

const meta: Meta = {
  title: 'Components/Loading',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, SharedGenericModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-loading\` component displays an animated MemberJunction logo with optional text.
It's used throughout the application to indicate loading states.

## Usage

\`\`\`html
<mj-loading></mj-loading>
<mj-loading text="Loading data..."></mj-loading>
<mj-loading [showText]="false"></mj-loading>
\`\`\`

## Module Import

\`\`\`typescript
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
\`\`\`
        `,
      },
    },
  },
  argTypes: {
    text: {
      control: 'text',
      description: 'Text to display below the loading animation',
      defaultValue: 'Loading...',
    },
    showText: {
      control: 'boolean',
      description: 'Whether to show the text below the logo',
      defaultValue: true,
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large', 'auto'],
      description: 'Size preset for quick sizing',
      defaultValue: 'auto',
    },
    animation: {
      control: 'select',
      options: ['pulse', 'spin', 'bounce', 'pulse-spin'],
      description: 'Animation type for the logo',
      defaultValue: 'pulse',
    },
    animationDuration: {
      control: { type: 'range', min: 0.5, max: 5, step: 0.1 },
      description: 'Animation duration in seconds (for pulse animation)',
      defaultValue: 1.5,
    },
    textColor: {
      control: 'color',
      description: 'CSS color for the loading text',
      defaultValue: '#757575',
    },
    logoColor: {
      control: 'color',
      description: 'CSS color for the logo',
      defaultValue: '#264FAF',
    },
    logoGradient: {
      control: 'object',
      description: 'Gradient configuration for logo fill',
    },
  },
};

export default meta;
type Story = StoryObj;

// Default story - shows the standard loading state
export const Default: Story = {
  args: {
    text: 'Loading...',
    showText: true,
    size: 'auto',
    animation: 'pulse',
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="width: 200px; height: 150px;">
        <mj-loading
          [text]="text"
          [showText]="showText"
          [size]="size"
          [animation]="animation"
          [animationDuration]="animationDuration"
          [textColor]="textColor"
          [logoColor]="logoColor"
          [logoGradient]="logoGradient">
        </mj-loading>
      </div>
    `,
  }),
};

// Small size variant
export const Small: Story = {
  args: {
    text: 'Loading...',
    showText: true,
    size: 'small',
    animation: 'pulse',
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <mj-loading [text]="text" [showText]="showText" [size]="size" [animation]="animation"></mj-loading>
      </div>
    `,
  }),
};

// Medium size variant
export const Medium: Story = {
  args: {
    text: 'Loading...',
    showText: true,
    size: 'medium',
    animation: 'pulse',
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <mj-loading [text]="text" [showText]="showText" [size]="size" [animation]="animation"></mj-loading>
      </div>
    `,
  }),
};

// Large size variant
export const Large: Story = {
  args: {
    text: 'Loading...',
    showText: true,
    size: 'large',
    animation: 'pulse',
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <mj-loading [text]="text" [showText]="showText" [size]="size" [animation]="animation"></mj-loading>
      </div>
    `,
  }),
};

// All sizes comparison
export const SizeComparison: Story = {
  render: () => ({
    template: `
      <div style="display: flex; align-items: flex-end; gap: 48px;">
        <div style="text-align: center;">
          <mj-loading size="small" text="Small"></mj-loading>
        </div>
        <div style="text-align: center;">
          <mj-loading size="medium" text="Medium"></mj-loading>
        </div>
        <div style="text-align: center;">
          <mj-loading size="large" text="Large"></mj-loading>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Comparison of all available size presets: small (40x22px), medium (80x45px), and large (120x67px).',
      },
    },
  },
};

// No text variant
export const NoText: Story = {
  args: {
    showText: false,
    size: 'medium',
    animation: 'pulse',
  },
  render: (args) => ({
    props: args,
    template: `
      <mj-loading [showText]="showText" [size]="size" [animation]="animation"></mj-loading>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Loading indicator without text - just the animated logo.',
      },
    },
  },
};

// Spin animation
export const SpinAnimation: Story = {
  args: {
    text: 'Processing...',
    showText: true,
    size: 'medium',
    animation: 'spin',
  },
  render: (args) => ({
    props: args,
    template: `
      <mj-loading [text]="text" [showText]="showText" [size]="size" [animation]="animation"></mj-loading>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Continuous rotation animation - good for longer processing tasks.',
      },
    },
  },
};

// Bounce animation
export const BounceAnimation: Story = {
  args: {
    text: 'Bouncing...',
    showText: true,
    size: 'medium',
    animation: 'bounce',
  },
  render: (args) => ({
    props: args,
    template: `
      <mj-loading [text]="text" [showText]="showText" [size]="size" [animation]="animation"></mj-loading>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Playful bounce animation.',
      },
    },
  },
};

// Pulse-spin animation
export const PulseSpinAnimation: Story = {
  args: {
    text: 'Working...',
    showText: true,
    size: 'medium',
    animation: 'pulse-spin',
  },
  render: (args) => ({
    props: args,
    template: `
      <mj-loading [text]="text" [showText]="showText" [size]="size" [animation]="animation"></mj-loading>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Combination of pulse and slow spin - subtle and professional.',
      },
    },
  },
};

// All animations comparison
export const AnimationComparison: Story = {
  render: () => ({
    template: `
      <div style="display: flex; gap: 48px;">
        <div style="text-align: center;">
          <mj-loading size="medium" animation="pulse" text="Pulse"></mj-loading>
        </div>
        <div style="text-align: center;">
          <mj-loading size="medium" animation="spin" text="Spin"></mj-loading>
        </div>
        <div style="text-align: center;">
          <mj-loading size="medium" animation="bounce" text="Bounce"></mj-loading>
        </div>
        <div style="text-align: center;">
          <mj-loading size="medium" animation="pulse-spin" text="Pulse-Spin"></mj-loading>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Comparison of all available animation types.',
      },
    },
  },
};

// Custom colors
export const CustomColors: Story = {
  args: {
    text: 'Loading...',
    showText: true,
    size: 'medium',
    animation: 'pulse',
    logoColor: '#4CAF50',
    textColor: '#4CAF50',
  },
  render: (args) => ({
    props: args,
    template: `
      <mj-loading
        [text]="text"
        [showText]="showText"
        [size]="size"
        [animation]="animation"
        [logoColor]="logoColor"
        [textColor]="textColor">
      </mj-loading>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Custom logo and text colors for themed contexts.',
      },
    },
  },
};

// Gradient example
export const GradientLogo: Story = {
  args: {
    text: 'Loading...',
    showText: true,
    size: 'large',
    animation: 'pulse',
    logoGradient: {
      startColor: '#264FAF',
      endColor: '#00BCD4',
      angle: 45,
    },
  },
  render: (args) => ({
    props: args,
    template: `
      <mj-loading
        [text]="text"
        [showText]="showText"
        [size]="size"
        [animation]="animation"
        [logoGradient]="logoGradient">
      </mj-loading>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Logo with gradient fill for special occasions or themed experiences.',
      },
    },
  },
};

// Fast animation
export const FastAnimation: Story = {
  args: {
    text: 'Hurry!',
    showText: true,
    size: 'medium',
    animation: 'pulse',
    animationDuration: 0.5,
  },
  render: (args) => ({
    props: args,
    template: `
      <mj-loading
        [text]="text"
        [showText]="showText"
        [size]="size"
        [animation]="animation"
        [animationDuration]="animationDuration">
      </mj-loading>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Faster animation duration (0.5s) - creates more urgency.',
      },
    },
  },
};

// In a card context
export const InCard: Story = {
  render: () => ({
    template: `
      <div style="
        width: 300px;
        height: 200px;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        background: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      ">
        <mj-loading text="Loading dashboard..."></mj-loading>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Loading indicator inside a card-style container.',
      },
    },
  },
};

// Dark background
export const OnDarkBackground: Story = {
  args: {
    text: 'Loading...',
    showText: true,
    size: 'medium',
    animation: 'pulse',
    logoColor: '#ffffff',
    textColor: '#ffffff',
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="
        width: 200px;
        height: 150px;
        background: #1a1a2e;
        border-radius: 8px;
        padding: 16px;
      ">
        <mj-loading
          [text]="text"
          [showText]="showText"
          [size]="size"
          [animation]="animation"
          [logoColor]="logoColor"
          [textColor]="textColor">
        </mj-loading>
      </div>
    `,
  }),
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story: 'White logo and text for dark backgrounds.',
      },
    },
  },
};
