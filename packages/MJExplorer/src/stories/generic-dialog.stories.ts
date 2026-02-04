import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { GenericDialogModule } from '@memberjunction/ng-generic-dialog';
import { FormsModule } from '@angular/forms';

const meta: Meta = {
  title: 'Components/GenericDialog',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, GenericDialogModule, FormsModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-generic-dialog\` component provides a modal dialog container with configurable title, buttons, and custom content.

## Usage

\`\`\`html
<mj-generic-dialog
  [DialogVisible]="isOpen"
  [DialogTitle]="'Confirm Action'"
  [DialogWidth]="'500px'"
  [ShowOKButton]="true"
  [ShowCancelButton]="true"
  (OKClicked)="onConfirm()"
  (CancelClicked)="onCancel()">
  <p>Dialog content goes here</p>
</mj-generic-dialog>
\`\`\`

## Module Import

\`\`\`typescript
import { GenericDialogModule } from '@memberjunction/ng-generic-dialog';
\`\`\`

## Features
- Configurable title and dimensions
- OK and Cancel buttons with customizable text
- Custom actions slot for additional buttons
- Keyboard support (Escape to close)
- Modal overlay with backdrop
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default dialog
export const Default: Story = {
  render: () => ({
    props: {
      dialogVisible: true,
      onOK: () => console.log('OK clicked'),
      onCancel: () => console.log('Cancel clicked'),
    },
    template: `
      <mj-generic-dialog
        [DialogVisible]="dialogVisible"
        [DialogTitle]="'Confirm Action'"
        [DialogWidth]="'450px'"
        [ShowOKButton]="true"
        [ShowCancelButton]="true"
        (OKClicked)="onOK()"
        (CancelClicked)="onCancel()">
        <div style="padding: 8px 0;">
          <p style="margin: 0; color: #374151;">
            Are you sure you want to proceed with this action? This cannot be undone.
          </p>
        </div>
      </mj-generic-dialog>
    `,
  }),
};

// Custom button text
export const CustomButtons: Story = {
  render: () => ({
    props: {
      dialogVisible: true,
      onOK: () => console.log('Deleted'),
      onCancel: () => console.log('Cancelled'),
    },
    template: `
      <mj-generic-dialog
        [DialogVisible]="dialogVisible"
        [DialogTitle]="'Delete Record'"
        [DialogWidth]="'400px'"
        [ShowOKButton]="true"
        [ShowCancelButton]="true"
        [OKButtonText]="'Delete'"
        [CancelButtonText]="'Keep'"
        (OKClicked)="onOK()"
        (CancelClicked)="onCancel()">
        <div style="padding: 8px 0;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #fef2f2; display: flex; align-items: center; justify-content: center;">
              <i class="fa-solid fa-trash-can" style="color: #dc2626; font-size: 20px;"></i>
            </div>
            <div>
              <div style="font-weight: 600; color: #111827;">Delete "Project Alpha"?</div>
              <div style="font-size: 14px; color: #6b7280;">This action cannot be undone.</div>
            </div>
          </div>
        </div>
      </mj-generic-dialog>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Customize button text with `[OKButtonText]` and `[CancelButtonText]` properties.',
      },
    },
  },
};

// Custom actions
export const CustomActions: Story = {
  render: () => ({
    props: {
      dialogVisible: true,
      onSave: () => console.log('Saved'),
      onSaveAndClose: () => console.log('Saved and closed'),
      onDiscard: () => console.log('Discarded'),
    },
    template: `
      <mj-generic-dialog
        [DialogVisible]="dialogVisible"
        [DialogTitle]="'Unsaved Changes'"
        [DialogWidth]="'500px'"
        [ShowOKButton]="false"
        [ShowCancelButton]="false">
        <div style="padding: 8px 0;">
          <p style="margin: 0 0 16px 0; color: #374151;">
            You have unsaved changes. What would you like to do?
          </p>
          <ul style="margin: 0; padding: 0 0 0 20px; color: #6b7280; font-size: 14px;">
            <li>Modified: config.json</li>
            <li>Modified: settings.ts</li>
            <li>New: helpers.ts</li>
          </ul>
        </div>
        <div custom-actions style="display: flex; gap: 8px; padding-top: 16px; border-top: 1px solid #e5e7eb; margin-top: 16px;">
          <button
            (click)="onSave()"
            style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
            <i class="fa-solid fa-save" style="margin-right: 6px;"></i>
            Save
          </button>
          <button
            (click)="onSaveAndClose()"
            style="padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
            <i class="fa-solid fa-check" style="margin-right: 6px;"></i>
            Save & Close
          </button>
          <button
            (click)="onDiscard()"
            style="padding: 8px 16px; background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-weight: 500;">
            Discard Changes
          </button>
        </div>
      </mj-generic-dialog>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Use the `<div custom-actions>` slot to add custom buttons. Hide default buttons with `[ShowOKButton]="false"` and `[ShowCancelButton]="false"`.',
      },
    },
  },
};

// Large content with scrolling
export const LargeContent: Story = {
  render: () => ({
    props: {
      dialogVisible: true,
      onAccept: () => {
        console.log('Terms accepted');
      },
    },
    template: `
      <mj-generic-dialog
        [DialogVisible]="dialogVisible"
        [DialogTitle]="'Terms of Service'"
        [DialogWidth]="'600px'"
        [DialogHeight]="'500px'"
        [ShowOKButton]="true"
        [ShowCancelButton]="true"
        [OKButtonText]="'I Accept'"
        [CancelButtonText]="'Decline'"
        (OKClicked)="onAccept()">
        <div style="max-height: 350px; overflow-y: auto; padding: 8px 0; font-size: 14px; color: #374151; line-height: 1.6;">
          <h4 style="margin: 0 0 12px 0;">1. Introduction</h4>
          <p>Welcome to our service. By using this application, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.</p>

          <h4 style="margin: 16px 0 12px 0;">2. Use License</h4>
          <p>Permission is granted to temporarily download one copy of the materials (information or software) on our website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
          <ul style="margin: 8px 0; padding-left: 24px;">
            <li>Modify or copy the materials</li>
            <li>Use the materials for any commercial purpose</li>
            <li>Attempt to decompile or reverse engineer any software</li>
            <li>Remove any copyright or proprietary notations</li>
            <li>Transfer the materials to another person</li>
          </ul>

          <h4 style="margin: 16px 0 12px 0;">3. Disclaimer</h4>
          <p>The materials on our website are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>

          <h4 style="margin: 16px 0 12px 0;">4. Limitations</h4>
          <p>In no event shall we or our suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on our website.</p>

          <h4 style="margin: 16px 0 12px 0;">5. Revisions</h4>
          <p>We may revise these terms of service at any time without notice. By using this website you are agreeing to be bound by the then current version of these terms of service.</p>

          <h4 style="margin: 16px 0 12px 0;">6. Privacy Policy</h4>
          <p>Your privacy is important to us. We collect and use personal information only as necessary to deliver our services. We do not sell or share your information with third parties except as required by law.</p>
        </div>
      </mj-generic-dialog>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'For large content, set a fixed `[DialogHeight]` and the content area will scroll. Useful for terms, privacy policies, or long forms.',
      },
    },
  },
};

// No buttons (content only)
export const NoButtons: Story = {
  render: () => ({
    props: {
      dialogVisible: true,
    },
    template: `
      <mj-generic-dialog
        [DialogVisible]="dialogVisible"
        [DialogTitle]="'Loading...'"
        [DialogWidth]="'300px'"
        [ShowOKButton]="false"
        [ShowCancelButton]="false">
        <div style="padding: 24px 0; text-align: center;">
          <div style="width: 48px; height: 48px; margin: 0 auto 16px; border: 3px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <p style="margin: 0; color: #6b7280;">Please wait while we process your request...</p>
        </div>
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </mj-generic-dialog>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Hide all buttons for loading dialogs or informational popups. The dialog can only be closed programmatically.',
      },
    },
  },
};

// Form dialog
export const FormDialog: Story = {
  render: () => ({
    props: {
      dialogVisible: true,
      formData: {
        name: '',
        email: '',
        role: 'user',
      },
      onSave: () => {
        console.log('Saving form data');
      },
    },
    template: `
      <mj-generic-dialog
        [DialogVisible]="dialogVisible"
        [DialogTitle]="'Add New User'"
        [DialogWidth]="'450px'"
        [ShowOKButton]="true"
        [ShowCancelButton]="true"
        [OKButtonText]="'Create User'"
        (OKClicked)="onSave()">
        <div style="padding: 8px 0;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">
              Full Name <span style="color: #dc2626;">*</span>
            </label>
            <input
              type="text"
              [(ngModel)]="formData.name"
              placeholder="Enter full name"
              style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 14px;">
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">
              Email Address <span style="color: #dc2626;">*</span>
            </label>
            <input
              type="email"
              [(ngModel)]="formData.email"
              placeholder="user@example.com"
              style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 14px;">
          </div>
          <div>
            <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">
              Role
            </label>
            <select
              [(ngModel)]="formData.role"
              style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 14px; background: white;">
              <option value="user">User</option>
              <option value="admin">Administrator</option>
              <option value="editor">Editor</option>
            </select>
          </div>
        </div>
      </mj-generic-dialog>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Dialogs can contain forms for data entry. The OK button acts as the submit button.',
      },
    },
  },
};

// Success dialog
export const SuccessDialog: Story = {
  render: () => ({
    props: {
      dialogVisible: true,
    },
    template: `
      <mj-generic-dialog
        [DialogVisible]="dialogVisible"
        [DialogTitle]="'Success!'"
        [DialogWidth]="'400px'"
        [ShowOKButton]="true"
        [ShowCancelButton]="false"
        [OKButtonText]="'Done'">
        <div style="padding: 16px 0; text-align: center;">
          <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: #dcfce7; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <i class="fa-solid fa-check" style="color: #16a34a; font-size: 32px;"></i>
          </div>
          <h3 style="margin: 0 0 8px 0; color: #111827;">Payment Successful</h3>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Your payment of $99.00 has been processed successfully.<br>
            A confirmation email has been sent to your inbox.
          </p>
        </div>
      </mj-generic-dialog>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Success dialogs typically only show an OK/Done button to acknowledge the message.',
      },
    },
  },
};

// Wide dialog
export const WideDialog: Story = {
  render: () => ({
    props: {
      dialogVisible: true,
    },
    template: `
      <mj-generic-dialog
        [DialogVisible]="dialogVisible"
        [DialogTitle]="'Dashboard Configuration'"
        [DialogWidth]="'800px'"
        [ShowOKButton]="true"
        [ShowCancelButton]="true"
        [OKButtonText]="'Save Configuration'">
        <div style="padding: 8px 0;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
            <div>
              <h4 style="margin: 0 0 12px 0; color: #374151;">Layout Settings</h4>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" checked style="width: 16px; height: 16px;">
                  <span style="font-size: 14px; color: #374151;">Show sidebar</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" checked style="width: 16px; height: 16px;">
                  <span style="font-size: 14px; color: #374151;">Enable dark mode</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" style="width: 16px; height: 16px;">
                  <span style="font-size: 14px; color: #374151;">Compact view</span>
                </label>
              </div>
            </div>
            <div>
              <h4 style="margin: 0 0 12px 0; color: #374151;">Widget Settings</h4>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" checked style="width: 16px; height: 16px;">
                  <span style="font-size: 14px; color: #374151;">Show KPI cards</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" checked style="width: 16px; height: 16px;">
                  <span style="font-size: 14px; color: #374151;">Show activity feed</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" checked style="width: 16px; height: 16px;">
                  <span style="font-size: 14px; color: #374151;">Show quick actions</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </mj-generic-dialog>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Wide dialogs can accommodate more complex content with multiple columns.',
      },
    },
  },
};
