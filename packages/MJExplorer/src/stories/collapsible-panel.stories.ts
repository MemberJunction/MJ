import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

const meta: Meta = {
  title: 'Components/CollapsiblePanel',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, BaseFormsModule, BrowserAnimationsModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-collapsible-panel\` component provides expandable/collapsible sections for organizing form content.
It supports search filtering, drag-and-drop reordering, and special styling for related entity sections.

## Usage

\`\`\`html
<mj-collapsible-panel
  sectionKey="details"
  sectionName="Contact Details"
  icon="fa fa-user">
  <!-- Your content here -->
</mj-collapsible-panel>
\`\`\`

## Module Import

\`\`\`typescript
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
\`\`\`

## Features
- **Expand/Collapse**: Click header to toggle visibility
- **Search Filtering**: Highlights matching section names
- **Drag & Drop**: Reorder sections by dragging the grip handle
- **Related Entity Variant**: Blue-themed styling for grid sections
- **Badge Count**: Shows row counts for related entity grids
        `,
      },
    },
  },
  argTypes: {
    sectionName: {
      control: 'text',
      description: 'Display name of the section',
      defaultValue: 'Section Name',
    },
    icon: {
      control: 'text',
      description: 'Font Awesome icon class',
      defaultValue: 'fa fa-folder',
    },
    variant: {
      control: 'select',
      options: ['default', 'related-entity'],
      description: 'Visual style variant',
      defaultValue: 'default',
    },
    badgeCount: {
      control: { type: 'number', min: 0 },
      description: 'Row count badge (for related-entity variant)',
    },
    defaultExpanded: {
      control: 'boolean',
      description: 'Whether the panel starts expanded',
      defaultValue: true,
    },
  },
};

export default meta;
type Story = StoryObj;

// Mock form object for the stories
const mockForm = {
  IsSectionExpanded: (key: string, defaultExpanded?: boolean) => defaultExpanded !== false,
  SetSectionExpanded: (key: string, expanded: boolean) => {},
  getSectionDisplayOrder: (key: string) => 0,
  getSectionOrder: () => ['section1', 'section2', 'section3'],
  setSectionOrder: (order: string[]) => {},
};

// Default panel
export const Default: Story = {
  args: {
    sectionName: 'Contact Information',
    icon: 'fa fa-user',
    variant: 'default',
    defaultExpanded: true,
  },
  render: (args) => ({
    props: {
      ...args,
      form: mockForm,
    },
    template: `
      <div style="max-width: 600px;">
        <mj-collapsible-panel
          [sectionKey]="'contact'"
          [sectionName]="sectionName"
          [icon]="icon"
          [variant]="variant"
          [defaultExpanded]="defaultExpanded"
          [form]="form">
          <div style="padding: 16px 0;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">First Name</label>
                <input type="text" value="John" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Last Name</label>
                <input type="text" value="Doe" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />
              </div>
              <div style="grid-column: span 2;">
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Email</label>
                <input type="email" value="john.doe@example.com" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />
              </div>
            </div>
          </div>
        </mj-collapsible-panel>
      </div>
    `,
  }),
};

// Related entity variant
export const RelatedEntityVariant: Story = {
  args: {
    sectionName: 'Related Orders',
    icon: 'fa fa-shopping-cart',
    variant: 'related-entity',
    badgeCount: 12,
    defaultExpanded: true,
  },
  render: (args) => ({
    props: {
      ...args,
      form: mockForm,
    },
    template: `
      <div style="max-width: 600px;">
        <mj-collapsible-panel
          [sectionKey]="'orders'"
          [sectionName]="sectionName"
          [icon]="icon"
          [variant]="variant"
          [badgeCount]="badgeCount"
          [defaultExpanded]="defaultExpanded"
          [form]="form">
          <div style="background: #f9fafb; border-radius: 6px; padding: 24px; text-align: center; color: #6b7280;">
            <i class="fa fa-table" style="font-size: 32px; margin-bottom: 8px; display: block;"></i>
            Grid content would appear here
          </div>
        </mj-collapsible-panel>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Blue-themed variant for sections containing related entity grids. Shows a badge count of rows.',
      },
    },
  },
};

// Badge count variations
export const BadgeCountVariations: Story = {
  render: () => ({
    props: { form: mockForm },
    template: `
      <div style="max-width: 600px; display: flex; flex-direction: column; gap: 16px;">
        <mj-collapsible-panel
          sectionKey="orders"
          sectionName="Orders"
          icon="fa fa-shopping-cart"
          variant="related-entity"
          [badgeCount]="42"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">Content with 42 items</div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="invoices"
          sectionName="Invoices"
          icon="fa fa-file-invoice"
          variant="related-entity"
          [badgeCount]="0"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">Content with 0 items (gray badge)</div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="notes"
          sectionName="Notes"
          icon="fa fa-sticky-note"
          variant="related-entity"
          [badgeCount]="999"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">Content with 999 items</div>
        </mj-collapsible-panel>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Badge count shows the number of items. Zero shows as gray badge.',
      },
    },
  },
};

// Multiple panels (form layout)
export const FormLayout: Story = {
  render: () => ({
    props: { form: mockForm },
    template: `
      <div style="max-width: 700px; display: flex; flex-direction: column; gap: 16px;">
        <mj-collapsible-panel
          sectionKey="basic"
          sectionName="Basic Information"
          icon="fa fa-info-circle"
          [defaultExpanded]="true"
          [form]="form">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 8px 0;">
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Name</label>
              <input type="text" value="Acme Corporation" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Type</label>
              <select style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
                <option>Customer</option>
                <option>Vendor</option>
              </select>
            </div>
          </div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="address"
          sectionName="Address"
          icon="fa fa-map-marker-alt"
          [defaultExpanded]="true"
          [form]="form">
          <div style="display: grid; grid-template-columns: 1fr; gap: 16px; padding: 8px 0;">
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Street</label>
              <input type="text" value="123 Main Street" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />
            </div>
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 16px;">
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">City</label>
                <input type="text" value="New York" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">State</label>
                <input type="text" value="NY" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Zip</label>
                <input type="text" value="10001" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />
              </div>
            </div>
          </div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="contacts"
          sectionName="Contacts"
          icon="fa fa-users"
          variant="related-entity"
          [badgeCount]="5"
          [defaultExpanded]="false"
          [form]="form">
          <div style="background: #f9fafb; border-radius: 6px; padding: 32px; text-align: center; color: #6b7280;">
            <i class="fa fa-table" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
            Contacts grid (5 records)
          </div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="orders"
          sectionName="Orders"
          icon="fa fa-shopping-cart"
          variant="related-entity"
          [badgeCount]="23"
          [defaultExpanded]="false"
          [form]="form">
          <div style="background: #f9fafb; border-radius: 6px; padding: 32px; text-align: center; color: #6b7280;">
            <i class="fa fa-table" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
            Orders grid (23 records)
          </div>
        </mj-collapsible-panel>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Multiple collapsible panels arranged as a typical entity form. Shows both default and related-entity variants.',
      },
    },
  },
};

// Different icons
export const IconVariations: Story = {
  render: () => ({
    props: { form: mockForm },
    template: `
      <div style="max-width: 500px; display: flex; flex-direction: column; gap: 12px;">
        <mj-collapsible-panel
          sectionKey="user"
          sectionName="User Profile"
          icon="fa fa-user-circle"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">User profile content</div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="settings"
          sectionName="Settings"
          icon="fa fa-cog"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">Settings content</div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="security"
          sectionName="Security"
          icon="fa fa-shield-alt"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">Security content</div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="billing"
          sectionName="Billing"
          icon="fa fa-credit-card"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">Billing content</div>
        </mj-collapsible-panel>

        <mj-collapsible-panel
          sectionKey="notifications"
          sectionName="Notifications"
          icon="fa fa-bell"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">Notification settings</div>
        </mj-collapsible-panel>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Various Font Awesome icons to demonstrate icon customization.',
      },
    },
  },
};

// Collapsed state
export const CollapsedState: Story = {
  render: () => ({
    props: { form: { ...mockForm, IsSectionExpanded: () => false } },
    template: `
      <div style="max-width: 500px;">
        <mj-collapsible-panel
          sectionKey="collapsed"
          sectionName="Collapsed Section"
          icon="fa fa-archive"
          [defaultExpanded]="false"
          [form]="form">
          <div style="padding: 16px;">
            This content is hidden when collapsed.
            <br><br>
            Click the header to expand and see this content.
          </div>
        </mj-collapsible-panel>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Panel in collapsed state. Click the header to expand.',
      },
    },
  },
};

// Drag handle visibility
export const DragHandleDemo: Story = {
  render: () => ({
    props: { form: mockForm },
    template: `
      <div style="max-width: 500px;">
        <div style="margin-bottom: 16px; padding: 12px; background: #fef3c7; border-radius: 6px; font-size: 13px; color: #92400e;">
          <i class="fa fa-info-circle" style="margin-right: 8px;"></i>
          Hover over the panel header to reveal the drag handle on the left
        </div>
        <mj-collapsible-panel
          sectionKey="draggable"
          sectionName="Draggable Section"
          icon="fa fa-arrows-alt"
          [defaultExpanded]="true"
          [form]="form">
          <div style="padding: 16px; text-align: center; color: #6b7280;">
            Hover over the header to see the drag handle appear.
            <br>
            Drag the <i class="fa fa-grip-vertical"></i> icon to reorder sections.
          </div>
        </mj-collapsible-panel>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The drag handle (grip icon) appears on hover, allowing sections to be reordered by dragging.',
      },
    },
  },
};
