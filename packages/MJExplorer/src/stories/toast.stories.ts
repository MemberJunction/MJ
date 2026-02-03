import { Meta, StoryObj, moduleMetadata, applicationConfig } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations';
import { Component, importProvidersFrom } from '@angular/core';
import { ConversationsModule, ToastService } from '@memberjunction/ng-conversations';

// Helper component to trigger toasts
@Component({
  selector: 'toast-trigger',
  template: `
    <div style="display: flex; flex-wrap: wrap; gap: 12px;">
      <button
        (click)="showSuccess()"
        style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
        <i class="fa-solid fa-check-circle" style="margin-right: 8px;"></i>Show Success
      </button>
      <button
        (click)="showError()"
        style="padding: 10px 20px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
        <i class="fa-solid fa-times-circle" style="margin-right: 8px;"></i>Show Error
      </button>
      <button
        (click)="showWarning()"
        style="padding: 10px 20px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
        <i class="fa-solid fa-exclamation-triangle" style="margin-right: 8px;"></i>Show Warning
      </button>
      <button
        (click)="showInfo()"
        style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
        <i class="fa-solid fa-info-circle" style="margin-right: 8px;"></i>Show Info
      </button>
    </div>
  `,
  standalone: false
})
class ToastTriggerComponent {
  constructor(private toastService: ToastService) {}

  showSuccess(): void {
    this.toastService.success('Operation completed successfully!');
  }

  showError(): void {
    this.toastService.error('An error occurred while processing your request.');
  }

  showWarning(): void {
    this.toastService.warning('Please review this item before continuing.');
  }

  showInfo(): void {
    this.toastService.info('Here is some helpful information.');
  }
}

// Module to declare the trigger component
import { NgModule } from '@angular/core';
@NgModule({
  declarations: [ToastTriggerComponent],
  imports: [CommonModule, ConversationsModule],
  exports: [ToastTriggerComponent]
})
class ToastStoryModule {}

const meta: Meta = {
  title: 'Components/Toast',
  decorators: [
    applicationConfig({
      providers: [
        provideAnimations(),
        importProvidersFrom(ConversationsModule)
      ],
    }),
    moduleMetadata({
      imports: [CommonModule, ConversationsModule, ToastStoryModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-toast\` component displays notification toasts with slide-in animations.

## Usage

\`\`\`typescript
import { ToastService } from '@memberjunction/ng-conversations';

constructor(private toastService: ToastService) {}

// Show different types
this.toastService.success('Operation completed!');
this.toastService.error('An error occurred', 5000);  // 5 second duration
this.toastService.warning('Please review');
this.toastService.info('Information message');

// Dismiss programmatically
const id = this.toastService.info('Message');
this.toastService.dismiss(id);
this.toastService.clear();  // Clear all
\`\`\`

## Module Import

\`\`\`typescript
import { ConversationsModule } from '@memberjunction/ng-conversations';
\`\`\`

## Toast Types
- **success**: Green left border, checkmark icon (3s default duration)
- **error**: Red left border, X icon (5s default duration)
- **warning**: Amber left border, triangle icon (4s default duration)
- **info**: Blue left border, info icon (3s default duration)

## Features
- Slide-in animation from right (300ms ease-out)
- Slide-out animation on dismiss (200ms ease-in)
- Auto-dismiss with configurable duration
- Manual dismiss via close button
- Fixed position (top-right)
- Backdrop blur effect
- Responsive mobile layout
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Interactive demo
export const Interactive: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #333;">Click buttons to trigger toasts</h3>
        <toast-trigger></toast-trigger>
        <mj-toast></mj-toast>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Interactive demo - click the buttons to see toast notifications appear in the top-right corner.',
      },
    },
  },
};

// Static preview of all types
export const AllTypes: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px;">
        <div style="display: flex; flex-direction: column; gap: 12px; max-width: 400px;">
          <!-- Success Toast Mock -->
          <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 8px;
            border-left: 4px solid #10b981;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          ">
            <i class="fa-solid fa-circle-check" style="color: #10b981; font-size: 20px;"></i>
            <span style="flex: 1; font-size: 14px; color: #1f2937;">Operation completed successfully!</span>
            <button style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Error Toast Mock -->
          <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 8px;
            border-left: 4px solid #ef4444;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          ">
            <i class="fa-solid fa-circle-xmark" style="color: #ef4444; font-size: 20px;"></i>
            <span style="flex: 1; font-size: 14px; color: #1f2937;">An error occurred while processing.</span>
            <button style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Warning Toast Mock -->
          <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 8px;
            border-left: 4px solid #f59e0b;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          ">
            <i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b; font-size: 20px;"></i>
            <span style="flex: 1; font-size: 14px; color: #1f2937;">Please review this item before continuing.</span>
            <button style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Info Toast Mock -->
          <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          ">
            <i class="fa-solid fa-circle-info" style="color: #3b82f6; font-size: 20px;"></i>
            <span style="flex: 1; font-size: 14px; color: #1f2937;">Here is some helpful information.</span>
            <button style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Static preview of all four toast types showing their distinct colors and icons.',
      },
    },
  },
};

// Color and icon reference
export const ColorReference: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px;">
        <table style="width: 100%; max-width: 600px; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 12px;">Type</th>
              <th style="text-align: left; padding: 12px;">Color</th>
              <th style="text-align: left; padding: 12px;">Icon</th>
              <th style="text-align: left; padding: 12px;">Default Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">success</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #10b981; border-radius: 4px;"></span>
                  #10b981
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> fa-circle-check</td>
              <td style="padding: 12px;">3 seconds</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">error</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #ef4444; border-radius: 4px;"></span>
                  #ef4444
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i> fa-circle-xmark</td>
              <td style="padding: 12px;">5 seconds</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">warning</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #f59e0b; border-radius: 4px;"></span>
                  #f59e0b
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i> fa-triangle-exclamation</td>
              <td style="padding: 12px;">4 seconds</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 500;">info</td>
              <td style="padding: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                  <span style="width: 16px; height: 16px; background: #3b82f6; border-radius: 4px;"></span>
                  #3b82f6
                </span>
              </td>
              <td style="padding: 12px;"><i class="fa-solid fa-circle-info" style="color: #3b82f6;"></i> fa-circle-info</td>
              <td style="padding: 12px;">3 seconds</td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Reference table showing the color, icon, and default duration for each toast type.',
      },
    },
  },
};

// Animation description
export const AnimationDetails: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px; max-width: 600px;">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #333;">Animation Behavior</h3>

        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="padding: 16px; background: #f3f4f6; border-radius: 8px;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #374151;">
              <i class="fa-solid fa-arrow-right" style="margin-right: 8px; color: #10b981;"></i>
              Enter Animation (slideIn)
            </h4>
            <ul style="margin: 0; padding-left: 24px; color: #6b7280; font-size: 13px;">
              <li>Slides in from right (translateX: 100% → 0)</li>
              <li>Fades in (opacity: 0 → 1)</li>
              <li>Duration: 300ms with ease-out timing</li>
            </ul>
          </div>

          <div style="padding: 16px; background: #f3f4f6; border-radius: 8px;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #374151;">
              <i class="fa-solid fa-arrow-left" style="margin-right: 8px; color: #ef4444;"></i>
              Leave Animation (slideOut)
            </h4>
            <ul style="margin: 0; padding-left: 24px; color: #6b7280; font-size: 13px;">
              <li>Slides out to right (translateX: 0 → 100%)</li>
              <li>Fades out (opacity: 1 → 0)</li>
              <li>Duration: 200ms with ease-in timing</li>
            </ul>
          </div>

          <div style="padding: 16px; background: #f3f4f6; border-radius: 8px;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #374151;">
              <i class="fa-solid fa-location-dot" style="margin-right: 8px; color: #3b82f6;"></i>
              Positioning
            </h4>
            <ul style="margin: 0; padding-left: 24px; color: #6b7280; font-size: 13px;">
              <li>Fixed position: top-right corner</li>
              <li>Offset: 20px from top and right edges</li>
              <li>Z-index: 10000</li>
              <li>Stacked vertically with 12px gap</li>
            </ul>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Documentation of the toast animation behavior and positioning.',
      },
    },
  },
};

// Usage examples
export const UsageExamples: Story = {
  render: () => ({
    template: `
      <div style="padding: 20px; max-width: 700px;">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #333;">Code Examples</h3>

        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="padding: 16px; background: #1e293b; border-radius: 8px; overflow-x: auto;">
            <pre style="margin: 0; color: #e2e8f0; font-size: 13px; font-family: 'JetBrains Mono', monospace;"><code>// Basic usage
this.toastService.success('Record saved successfully');
this.toastService.error('Failed to save record');
this.toastService.warning('Unsaved changes will be lost');
this.toastService.info('Tip: Press Ctrl+S to save');</code></pre>
          </div>

          <div style="padding: 16px; background: #1e293b; border-radius: 8px; overflow-x: auto;">
            <pre style="margin: 0; color: #e2e8f0; font-size: 13px; font-family: 'JetBrains Mono', monospace;"><code>// Custom duration (in milliseconds)
this.toastService.success('Quick message', 1500);  // 1.5 seconds
this.toastService.error('Critical error', 10000);  // 10 seconds</code></pre>
          </div>

          <div style="padding: 16px; background: #1e293b; border-radius: 8px; overflow-x: auto;">
            <pre style="margin: 0; color: #e2e8f0; font-size: 13px; font-family: 'JetBrains Mono', monospace;"><code>// Programmatic dismiss
const toastId = this.toastService.info('Processing...');

// Later, dismiss specific toast
this.toastService.dismiss(toastId);

// Or clear all toasts
this.toastService.clear();</code></pre>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Code examples showing common toast usage patterns.',
      },
    },
  },
};
