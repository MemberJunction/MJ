import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

// Inline component since SharedSettingsModule may have dependencies
@Component({
  selector: 'story-settings-card',
  template: `
    <div class="settings-card" [class.expanded]="expanded">
      <div class="card-header" (click)="onToggle()" role="button" tabindex="0">
        <div class="card-icon">
          <i [class]="icon" aria-hidden="true"></i>
        </div>
        <h3 class="card-title">{{ title }}</h3>
        <button class="expand-button" type="button">
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
      </div>

      <div class="card-content" *ngIf="expanded">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .settings-card {
      background: white;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .settings-card:hover {
      border-color: #c7d2fe;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }

    .card-header {
      display: flex;
      align-items: center;
      padding: 16px 20px;
      cursor: pointer;
      user-select: none;
    }

    .card-header:hover {
      background: #f9fafb;
    }

    .card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 16px;
      color: #4f46e5;
      font-size: 16px;
    }

    .card-title {
      flex: 1;
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
    }

    .expand-button {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      color: #64748b;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .expand-button:hover {
      background: #f1f5f9;
      color: #334155;
    }

    .settings-card.expanded .expand-button i {
      transform: rotate(180deg);
    }

    .card-content {
      padding: 0 20px 20px 76px;
      border-top: 1px solid #f1f5f9;
      animation: slideDown 0.2s ease;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `],
  standalone: false
})
class StorySettingsCardComponent {
  title = '';
  icon = '';
  expanded = false;

  onToggle(): void {
    this.expanded = !this.expanded;
  }
}

import { NgModule } from '@angular/core';
@NgModule({
  declarations: [StorySettingsCardComponent],
  imports: [CommonModule],
  exports: [StorySettingsCardComponent]
})
class SettingsCardStoryModule {}

interface SettingsCardStoryArgs {
  title: string;
  icon: string;
  expanded: boolean;
}

const meta: Meta<SettingsCardStoryArgs> = {
  title: 'Components/SettingsCard',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, SettingsCardStoryModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-settings-card\` component is an expandable card used for organizing settings and configuration options.

## Usage

\`\`\`html
<mj-settings-card
  title="General Settings"
  icon="fa-solid fa-cog"
  [expanded]="isExpanded"
  (toggle)="onToggle()">
  <p>Your settings content here...</p>
</mj-settings-card>
\`\`\`

## Module Import

\`\`\`typescript
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
\`\`\`

## Features
- Expandable/collapsible with animation
- Icon and title in header
- Chevron indicator rotates on expand
- Content projected via ng-content
- Keyboard accessible (Enter/Space to toggle)
- Hover effects on header
        `,
      },
    },
  },
  argTypes: {
    title: {
      control: 'text',
      description: 'Card title',
    },
    icon: {
      control: 'text',
      description: 'Font Awesome icon class',
    },
    expanded: {
      control: 'boolean',
      description: 'Whether the card is expanded',
    },
  },
};

export default meta;
type Story = StoryObj<SettingsCardStoryArgs>;

// Default collapsed
export const Default: Story = {
  args: {
    title: 'General Settings',
    icon: 'fa-solid fa-cog',
    expanded: false,
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="width: 400px;">
        <story-settings-card [title]="'${args.title}'" [icon]="'${args.icon}'" [expanded]="${args.expanded}">
          <div style="padding-top: 16px;">
            <p style="margin: 0 0 12px 0; color: #64748b; font-size: 14px;">
              Configure your general application settings here.
            </p>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #374151;">
              <input type="checkbox" checked>
              Enable notifications
            </label>
          </div>
        </story-settings-card>
      </div>
    `,
  }),
};

// Expanded state
export const Expanded: Story = {
  render: () => ({
    template: `
      <div style="width: 400px;">
        <story-settings-card title="Account Settings" icon="fa-solid fa-user" [expanded]="true">
          <div style="padding-top: 16px;">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                Display Name
              </label>
              <input type="text" value="John Doe" style="
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                box-sizing: border-box;
              ">
            </div>
            <div>
              <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                Email
              </label>
              <input type="email" value="john@example.com" style="
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                box-sizing: border-box;
              ">
            </div>
          </div>
        </story-settings-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Card in expanded state showing form fields.',
      },
    },
  },
};

// Multiple cards
export const MultipleCards: Story = {
  render: () => ({
    template: `
      <div style="width: 450px; display: flex; flex-direction: column; gap: 12px;">
        <story-settings-card title="Profile" icon="fa-solid fa-user" [expanded]="true">
          <div style="padding-top: 16px; color: #64748b; font-size: 14px;">
            Manage your profile information and preferences.
          </div>
        </story-settings-card>

        <story-settings-card title="Security" icon="fa-solid fa-shield-halved" [expanded]="false">
          <div style="padding-top: 16px; color: #64748b; font-size: 14px;">
            Password, two-factor authentication, and security settings.
          </div>
        </story-settings-card>

        <story-settings-card title="Notifications" icon="fa-solid fa-bell" [expanded]="false">
          <div style="padding-top: 16px; color: #64748b; font-size: 14px;">
            Email and push notification preferences.
          </div>
        </story-settings-card>

        <story-settings-card title="Privacy" icon="fa-solid fa-lock" [expanded]="false">
          <div style="padding-top: 16px; color: #64748b; font-size: 14px;">
            Data privacy and sharing settings.
          </div>
        </story-settings-card>

        <story-settings-card title="API Keys" icon="fa-solid fa-key" [expanded]="false">
          <div style="padding-top: 16px; color: #64748b; font-size: 14px;">
            Manage your API keys and access tokens.
          </div>
        </story-settings-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Multiple settings cards in a list, typically used in a settings page layout.',
      },
    },
  },
};

// Icon variations
export const IconVariations: Story = {
  render: () => ({
    template: `
      <div style="width: 400px; display: flex; flex-direction: column; gap: 12px;">
        <story-settings-card title="General" icon="fa-solid fa-cog" [expanded]="false">
          <div style="padding-top: 16px;">General settings content</div>
        </story-settings-card>

        <story-settings-card title="Appearance" icon="fa-solid fa-palette" [expanded]="false">
          <div style="padding-top: 16px;">Theme and display options</div>
        </story-settings-card>

        <story-settings-card title="Language" icon="fa-solid fa-globe" [expanded]="false">
          <div style="padding-top: 16px;">Language and locale settings</div>
        </story-settings-card>

        <story-settings-card title="Integrations" icon="fa-solid fa-plug" [expanded]="false">
          <div style="padding-top: 16px;">Third-party integrations</div>
        </story-settings-card>

        <story-settings-card title="Data Export" icon="fa-solid fa-download" [expanded]="false">
          <div style="padding-top: 16px;">Export your data</div>
        </story-settings-card>

        <story-settings-card title="Advanced" icon="fa-solid fa-sliders" [expanded]="false">
          <div style="padding-top: 16px;">Advanced configuration</div>
        </story-settings-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Different icon choices for various settings categories.',
      },
    },
  },
};

// With form content
export const WithFormContent: Story = {
  render: () => ({
    template: `
      <div style="width: 500px;">
        <story-settings-card title="AI Configuration" icon="fa-solid fa-robot" [expanded]="true">
          <div style="padding-top: 16px;">
            <div style="margin-bottom: 20px;">
              <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                Default AI Model
              </label>
              <select style="
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                background: white;
                box-sizing: border-box;
              ">
                <option>GPT-4</option>
                <option>GPT-3.5 Turbo</option>
                <option>Claude 3 Opus</option>
                <option>Claude 3 Sonnet</option>
              </select>
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                Temperature
              </label>
              <input type="range" min="0" max="100" value="70" style="width: 100%;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-top: 4px;">
                <span>Precise (0)</span>
                <span>Creative (1)</span>
              </div>
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                Max Tokens
              </label>
              <input type="number" value="4096" style="
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                box-sizing: border-box;
              ">
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #374151;">
                <input type="checkbox" checked>
                Enable streaming responses
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #374151;">
                <input type="checkbox">
                Log all prompts
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #374151;">
                <input type="checkbox" checked>
                Cache responses
              </label>
            </div>
          </div>
        </story-settings-card>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Settings card with various form controls - dropdowns, sliders, inputs, and checkboxes.',
      },
    },
  },
};

// Settings page layout
export const SettingsPageLayout: Story = {
  render: () => ({
    template: `
      <div style="padding: 24px; background: #f8fafc; border-radius: 12px; max-width: 600px;">
        <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #1e293b;">Settings</h2>
        <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">
          Manage your account settings and preferences.
        </p>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <story-settings-card title="Account" icon="fa-solid fa-user-circle" [expanded]="true">
            <div style="padding-top: 16px; color: #64748b; font-size: 14px; line-height: 1.6;">
              Update your account information including name, email, and profile picture.
              <div style="margin-top: 12px;">
                <button style="
                  padding: 8px 16px;
                  background: #4f46e5;
                  color: white;
                  border: none;
                  border-radius: 6px;
                  font-size: 13px;
                  cursor: pointer;
                ">Edit Profile</button>
              </div>
            </div>
          </story-settings-card>

          <story-settings-card title="Workspace" icon="fa-solid fa-building" [expanded]="false">
            <div style="padding-top: 16px;">Workspace settings</div>
          </story-settings-card>

          <story-settings-card title="Billing" icon="fa-solid fa-credit-card" [expanded]="false">
            <div style="padding-top: 16px;">Billing and subscription</div>
          </story-settings-card>

          <story-settings-card title="Team Members" icon="fa-solid fa-users" [expanded]="false">
            <div style="padding-top: 16px;">Team management</div>
          </story-settings-card>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Complete settings page layout with header and multiple collapsible sections.',
      },
    },
  },
};
