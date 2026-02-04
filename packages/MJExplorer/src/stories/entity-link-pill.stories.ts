import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { MemberJunctionCoreEntityFormsModule } from '@memberjunction/ng-core-entity-forms';

const meta: Meta = {
  title: 'Components/EntityLinkPill',
  decorators: [
    moduleMetadata({
      imports: [
        CommonModule,
        MemberJunctionCoreEntityFormsModule
      ],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-entity-link-pill\` component displays a clickable pill that links to a related entity record.

## Usage

\`\`\`html
<mj-entity-link-pill
  [entityName]="'MJ: AI Agent Runs'"
  [recordId]="run.TargetLogID"
  [recordName]="run.AgentRunName">
</mj-entity-link-pill>
\`\`\`

## Module Import

The component is part of the custom-forms module in core-entity-forms:
\`\`\`typescript
import { MemberJunctionCoreEntityFormsModule } from '@memberjunction/ng-core-entity-forms';
\`\`\`

## Features
- Shows entity icon from metadata (falls back to link icon)
- Displays record name or entity name
- Hover effect with external link indicator
- Opens record in new tab when clicked
- Tooltip shows full entity and record name

## Note
In Storybook, clicking the pill logs to console instead of opening the record
(SharedService is not initialized in this environment).
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default with record name
export const Default: Story = {
  render: () => ({
    template: `
      <mj-entity-link-pill
        entityName="MJ: AI Agent Runs"
        recordId="abc-123"
        recordName="Customer Support Agent Run #42">
      </mj-entity-link-pill>
    `,
  }),
};

// Without record name (shows entity name)
export const WithoutRecordName: Story = {
  render: () => ({
    template: `
      <mj-entity-link-pill
        entityName="Users"
        recordId="user-456">
      </mj-entity-link-pill>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When no recordName is provided, the entity name is displayed instead.',
      },
    },
  },
};

// Different entity types
export const DifferentEntities: Story = {
  render: () => ({
    template: `
      <div class="story-container story-grid story-gap-md">
        <mj-entity-link-pill
          entityName="MJ: AI Agent Runs"
          recordId="run-1"
          recordName="Agent Run #1">
        </mj-entity-link-pill>

        <mj-entity-link-pill
          entityName="MJ: AI Prompt Runs"
          recordId="prompt-1"
          recordName="Prompt Run #1">
        </mj-entity-link-pill>

        <mj-entity-link-pill
          entityName="Users"
          recordId="user-1"
          recordName="John Smith">
        </mj-entity-link-pill>

        <mj-entity-link-pill
          entityName="Actions"
          recordId="action-1"
          recordName="Send Email">
        </mj-entity-link-pill>

        <mj-entity-link-pill
          entityName="Reports"
          recordId="report-1"
          recordName="Monthly Summary">
        </mj-entity-link-pill>

        <mj-entity-link-pill
          entityName="Entities"
          recordId="entity-1"
          recordName="Customer">
        </mj-entity-link-pill>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Pills displaying links to various entity types. Icons are determined by entity metadata.',
      },
    },
  },
};

// Long name truncation
export const LongNameTruncation: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column story-gap-md">
        <div>
          <span class="story-caption-sm" style="display: block; margin-bottom: 4px;">Short name:</span>
          <mj-entity-link-pill
            entityName="Users"
            recordId="1"
            recordName="John">
          </mj-entity-link-pill>
        </div>
        <div>
          <span class="story-caption-sm" style="display: block; margin-bottom: 4px;">Medium name:</span>
          <mj-entity-link-pill
            entityName="Users"
            recordId="2"
            recordName="Customer Support Agent">
          </mj-entity-link-pill>
        </div>
        <div>
          <span class="story-caption-sm" style="display: block; margin-bottom: 4px;">Long name (truncated):</span>
          <mj-entity-link-pill
            entityName="Users"
            recordId="3"
            recordName="Very Long Customer Support Agent Name That Will Be Truncated">
          </mj-entity-link-pill>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Long names are truncated with ellipsis. Hover to see full name in tooltip.',
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
              <th class="pad-x">Test Run</th>
              <th class="pad-x">Agent</th>
              <th class="pad-x">Related Prompt Run</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pad-x">Test #1</td>
              <td class="pad-x">
                <mj-entity-link-pill
                  entityName="AI Agents"
                  recordId="agent-1"
                  recordName="Support Bot">
                </mj-entity-link-pill>
              </td>
              <td class="pad-x">
                <mj-entity-link-pill
                  entityName="MJ: AI Prompt Runs"
                  recordId="prompt-1"
                  recordName="Prompt Run #142">
                </mj-entity-link-pill>
              </td>
            </tr>
            <tr>
              <td class="pad-x">Test #2</td>
              <td class="pad-x">
                <mj-entity-link-pill
                  entityName="AI Agents"
                  recordId="agent-2"
                  recordName="Data Analyzer">
                </mj-entity-link-pill>
              </td>
              <td class="pad-x">
                <mj-entity-link-pill
                  entityName="MJ: AI Prompt Runs"
                  recordId="prompt-2"
                  recordName="Prompt Run #143">
                </mj-entity-link-pill>
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
        story: 'Entity link pills used in a data table to link to related records.',
      },
    },
  },
};

// In card layout
export const InCardLayout: Story = {
  render: () => ({
    template: `
      <div style="
        padding: 16px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        width: 320px;
      ">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div>
            <div style="font-size: 14px; font-weight: 600; color: #1f2937;">Test Run #42</div>
            <div style="font-size: 12px; color: #6b7280;">Completed 5 min ago</div>
          </div>
          <span style="
            padding: 2px 8px;
            background: #dcfce7;
            color: #166534;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
          ">Passed</span>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 12px;">
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase;">Related Records</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <mj-entity-link-pill
              entityName="AI Agents"
              recordId="agent-1"
              recordName="Support Bot">
            </mj-entity-link-pill>
            <mj-entity-link-pill
              entityName="MJ: AI Prompt Runs"
              recordId="prompt-1"
              recordName="Prompt #142">
            </mj-entity-link-pill>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Entity link pills in a card layout showing related records.',
      },
    },
  },
};

// Default icon fallback
export const DefaultIconFallback: Story = {
  render: () => ({
    template: `
      <div class="story-container story-grid story-gap-md">
        <mj-entity-link-pill
          entityName="Custom Entity"
          recordId="1"
          recordName="Record #1">
        </mj-entity-link-pill>
        <mj-entity-link-pill
          entityName="Another Entity"
          recordId="2"
          recordName="Record #2">
        </mj-entity-link-pill>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When no entity icon is specified in metadata, the default link icon is used.',
      },
    },
  },
};
