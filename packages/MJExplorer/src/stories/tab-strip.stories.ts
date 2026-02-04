import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';

const meta: Meta = {
  title: 'Components/TabStrip',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, MJTabStripModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-tabstrip\` component provides a tabbed navigation interface with support for closeable tabs, scroll buttons, and dynamic content.

## Usage

\`\`\`html
<mj-tabstrip [FillWidth]="true" (TabSelected)="onTabSelect($event)">
  <mj-tab Name="Tab 1">
    <mj-tab-body>Content for Tab 1</mj-tab-body>
  </mj-tab>
  <mj-tab Name="Tab 2">
    <mj-tab-body>Content for Tab 2</mj-tab-body>
  </mj-tab>
</mj-tabstrip>
\`\`\`

## Module Import

\`\`\`typescript
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
\`\`\`

## Features
- Closeable tabs with \`[TabCloseable]="true"\`
- Dynamic tab adding/removing
- Scroll buttons for many tabs
- Fill width/height options
- Tab selection events
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default tab strip with 3 tabs
export const Default: Story = {
  render: () => ({
    template: `
      <div style="width: 600px; height: 300px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <mj-tabstrip [FillWidth]="true" [FillHeight]="true">
          <mj-tab Name="Overview">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">
                <h3 style="margin: 0 0 12px 0;">Overview Tab</h3>
                <p style="color: #666; margin: 0;">This is the overview content. The tab strip provides a clean way to organize content into logical sections.</p>
              </div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Details">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">
                <h3 style="margin: 0 0 12px 0;">Details Tab</h3>
                <p style="color: #666; margin: 0;">Detailed information goes here. Each tab can contain any content including forms, tables, or other components.</p>
              </div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Settings">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">
                <h3 style="margin: 0 0 12px 0;">Settings Tab</h3>
                <p style="color: #666; margin: 0;">Configuration options would be displayed here.</p>
              </div>
            </mj-tab-body>
          </mj-tab>
        </mj-tabstrip>
      </div>
    `,
  }),
};

// Closeable tabs
export const CloseableTabs: Story = {
  render: () => ({
    template: `
      <div style="width: 600px; height: 300px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <mj-tabstrip [FillWidth]="true" [FillHeight]="true">
          <mj-tab Name="Main" [TabCloseable]="false">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">
                <h3 style="margin: 0 0 12px 0;">Main Tab (Not Closeable)</h3>
                <p style="color: #666; margin: 0;">This tab cannot be closed. It serves as the primary content area.</p>
              </div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Document 1" [TabCloseable]="true">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">
                <h3 style="margin: 0 0 12px 0;">Document 1</h3>
                <p style="color: #666; margin: 0;">Click the X to close this tab.</p>
              </div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Document 2" [TabCloseable]="true">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">
                <h3 style="margin: 0 0 12px 0;">Document 2</h3>
                <p style="color: #666; margin: 0;">This tab is also closeable.</p>
              </div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Document 3" [TabCloseable]="true">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">
                <h3 style="margin: 0 0 12px 0;">Document 3</h3>
                <p style="color: #666; margin: 0;">Another closeable document tab.</p>
              </div>
            </mj-tab-body>
          </mj-tab>
        </mj-tabstrip>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Tabs can be made closeable with `[TabCloseable]="true"`. The close button appears on hover. The first tab is set to non-closeable to serve as a persistent main tab.',
      },
    },
  },
};

// Many tabs with scrolling
export const ScrollingTabs: Story = {
  render: () => ({
    template: `
      <div style="width: 500px; height: 300px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <mj-tabstrip [FillWidth]="true" [FillHeight]="true" [ScrollAmount]="100">
          <mj-tab Name="Dashboard">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Dashboard content</div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Analytics">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Analytics content</div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Reports">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Reports content</div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Users">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Users content</div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Settings">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Settings content</div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Integrations">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Integrations content</div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Security">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Security content</div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Notifications">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Notifications content</div>
            </mj-tab-body>
          </mj-tab>
        </mj-tabstrip>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When there are more tabs than can fit, scroll buttons appear. Use `[ScrollAmount]` to control how far the tabs scroll with each click.',
      },
    },
  },
};

// Custom content in tabs
export const CustomContent: Story = {
  render: () => ({
    template: `
      <div style="width: 700px; height: 400px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <mj-tabstrip [FillWidth]="true" [FillHeight]="true">
          <mj-tab Name="Form">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 24px;">
                <h3 style="margin: 0 0 20px 0;">User Information</h3>
                <div style="display: grid; gap: 16px; max-width: 400px;">
                  <div>
                    <label style="display: block; font-size: 13px; color: #666; margin-bottom: 4px;">Name</label>
                    <input type="text" placeholder="Enter name" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 13px; color: #666; margin-bottom: 4px;">Email</label>
                    <input type="email" placeholder="Enter email" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 13px; color: #666; margin-bottom: 4px;">Role</label>
                    <select style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                      <option>Admin</option>
                      <option>Editor</option>
                      <option>Viewer</option>
                    </select>
                  </div>
                </div>
              </div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Table">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background: #f5f5f5;">
                      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">ID</th>
                      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Name</th>
                      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Status</th>
                      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">001</td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">Project Alpha</td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;"><span style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Active</span></td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">Jan 15, 2025</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">002</td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">Project Beta</td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;"><span style="background: #fff3e0; color: #e65100; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Pending</span></td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">Jan 20, 2025</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">003</td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">Project Gamma</td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;"><span style="background: #e3f2fd; color: #1565c0; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Review</span></td>
                      <td style="padding: 12px; border-bottom: 1px solid #eee;">Jan 22, 2025</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Cards">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; color: white;">
                  <div style="font-size: 32px; font-weight: bold;">1,234</div>
                  <div style="opacity: 0.9; margin-top: 4px;">Total Users</div>
                </div>
                <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 20px; border-radius: 12px; color: white;">
                  <div style="font-size: 32px; font-weight: bold;">567</div>
                  <div style="opacity: 0.9; margin-top: 4px;">Active Sessions</div>
                </div>
                <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 20px; border-radius: 12px; color: white;">
                  <div style="font-size: 32px; font-weight: bold;">89%</div>
                  <div style="opacity: 0.9; margin-top: 4px;">Success Rate</div>
                </div>
              </div>
            </mj-tab-body>
          </mj-tab>
        </mj-tabstrip>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Tab bodies can contain any content including forms, tables, cards, and other complex layouts.',
      },
    },
  },
};

// Selected tab index
export const SelectedTabIndex: Story = {
  render: () => ({
    template: `
      <div style="width: 600px; height: 250px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <mj-tabstrip [FillWidth]="true" [FillHeight]="true" [SelectedTabIndex]="1">
          <mj-tab Name="First">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">First tab content</div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Second (Default)">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">
                <h3 style="margin: 0 0 12px 0;">Second Tab - Default Selected</h3>
                <p style="color: #666; margin: 0;">This tab is selected by default using [SelectedTabIndex]="1"</p>
              </div>
            </mj-tab-body>
          </mj-tab>
          <mj-tab Name="Third">
            <mj-tab-body [FillWidth]="true" [FillHeight]="true">
              <div style="padding: 20px;">Third tab content</div>
            </mj-tab-body>
          </mj-tab>
        </mj-tabstrip>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Use `[SelectedTabIndex]` to programmatically set which tab is selected. Index is 0-based.',
      },
    },
  },
};
