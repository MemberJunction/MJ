import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * Mock EntityLinkPill component for Storybook
 * Replicates the visual behavior without requiring real Metadata/SharedService
 */
@Component({
  selector: 'mj-entity-link-pill-mock',
  template: `
    <span class="entity-link-pill" *ngIf="entityName && recordId" (click)="openRecord()" [title]="tooltipText">
      <i class="entity-icon" [ngClass]="iconClass"></i>
      <span class="entity-label">{{ displayLabel }}</span>
      <i class="fas fa-external-link-alt pill-action"></i>
    </span>
  `,
  styles: [`
    .entity-link-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(99, 102, 241, 0.08));
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      color: #3b82f6;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      max-width: 200px;
    }

    .entity-link-pill:hover {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(99, 102, 241, 0.15));
      border-color: rgba(59, 130, 246, 0.4);
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
    }

    .entity-icon {
      font-size: 11px;
      opacity: 0.9;
    }

    .entity-label {
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }

    .pill-action {
      font-size: 9px;
      opacity: 0.6;
      transition: opacity 0.2s ease;
    }

    .entity-link-pill:hover .pill-action {
      opacity: 1;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
class EntityLinkPillMockComponent {
  @Input() entityName: string | null = null;
  @Input() recordId: string | null = null;
  @Input() recordName: string | null = null;
  @Input() iconClass: string = 'fas fa-link';

  get displayLabel(): string {
    if (this.recordName) {
      return this.recordName;
    }
    if (this.entityName) {
      // Simple entity name display (without the 'MJ: ' prefix)
      return this.entityName.replace('MJ: ', '');
    }
    return 'View Record';
  }

  get tooltipText(): string {
    const entityLabel = this.entityName || 'Record';
    if (this.recordName) {
      return `Open ${entityLabel}: ${this.recordName}`;
    }
    return `Open ${entityLabel}`;
  }

  openRecord(): void {
    console.log(`Opening record: ${this.entityName} - ${this.recordId}`);
    // In Storybook, we just log - the real component uses SharedService.OpenEntityRecord
  }
}

const meta: Meta = {
  title: 'Components/EntityLinkPill',
  component: EntityLinkPillMockComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
      declarations: [EntityLinkPillMockComponent],
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
import { CustomFormsModule } from '@memberjunction/ng-core-entity-forms';
\`\`\`

## Features
- Shows entity icon from metadata (falls back to link icon)
- Displays record name or entity name
- Hover effect with external link indicator
- Opens record in new tab when clicked
- Tooltip shows full entity and record name
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
      <mj-entity-link-pill-mock
        entityName="MJ: AI Agent Runs"
        recordId="abc-123"
        recordName="Customer Support Agent Run #42"
        iconClass="fas fa-robot">
      </mj-entity-link-pill-mock>
    `,
  }),
};

// Without record name (shows entity name)
export const WithoutRecordName: Story = {
  render: () => ({
    template: `
      <mj-entity-link-pill-mock
        entityName="Users"
        recordId="user-456"
        iconClass="fas fa-user">
      </mj-entity-link-pill-mock>
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
        <mj-entity-link-pill-mock
          entityName="MJ: AI Agent Runs"
          recordId="run-1"
          recordName="Agent Run #1"
          iconClass="fas fa-robot">
        </mj-entity-link-pill-mock>

        <mj-entity-link-pill-mock
          entityName="MJ: AI Prompt Runs"
          recordId="prompt-1"
          recordName="Prompt Run #1"
          iconClass="fas fa-brain">
        </mj-entity-link-pill-mock>

        <mj-entity-link-pill-mock
          entityName="Users"
          recordId="user-1"
          recordName="John Smith"
          iconClass="fas fa-user">
        </mj-entity-link-pill-mock>

        <mj-entity-link-pill-mock
          entityName="Actions"
          recordId="action-1"
          recordName="Send Email"
          iconClass="fas fa-bolt">
        </mj-entity-link-pill-mock>

        <mj-entity-link-pill-mock
          entityName="Reports"
          recordId="report-1"
          recordName="Monthly Summary"
          iconClass="fas fa-chart-bar">
        </mj-entity-link-pill-mock>

        <mj-entity-link-pill-mock
          entityName="Entities"
          recordId="entity-1"
          recordName="Customer"
          iconClass="fas fa-database">
        </mj-entity-link-pill-mock>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Pills displaying links to various entity types with appropriate icons.',
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
          <mj-entity-link-pill-mock
            entityName="Users"
            recordId="1"
            recordName="John"
            iconClass="fas fa-user">
          </mj-entity-link-pill-mock>
        </div>
        <div>
          <span class="story-caption-sm" style="display: block; margin-bottom: 4px;">Medium name:</span>
          <mj-entity-link-pill-mock
            entityName="Users"
            recordId="2"
            recordName="Customer Support Agent"
            iconClass="fas fa-user">
          </mj-entity-link-pill-mock>
        </div>
        <div>
          <span class="story-caption-sm" style="display: block; margin-bottom: 4px;">Long name (truncated):</span>
          <mj-entity-link-pill-mock
            entityName="Users"
            recordId="3"
            recordName="Very Long Customer Support Agent Name That Will Be Truncated"
            iconClass="fas fa-user">
          </mj-entity-link-pill-mock>
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
                <mj-entity-link-pill-mock
                  entityName="AI Agents"
                  recordId="agent-1"
                  recordName="Support Bot"
                  iconClass="fas fa-robot">
                </mj-entity-link-pill-mock>
              </td>
              <td class="pad-x">
                <mj-entity-link-pill-mock
                  entityName="MJ: AI Prompt Runs"
                  recordId="prompt-1"
                  recordName="Prompt Run #142"
                  iconClass="fas fa-brain">
                </mj-entity-link-pill-mock>
              </td>
            </tr>
            <tr>
              <td class="pad-x">Test #2</td>
              <td class="pad-x">
                <mj-entity-link-pill-mock
                  entityName="AI Agents"
                  recordId="agent-2"
                  recordName="Data Analyzer"
                  iconClass="fas fa-robot">
                </mj-entity-link-pill-mock>
              </td>
              <td class="pad-x">
                <mj-entity-link-pill-mock
                  entityName="MJ: AI Prompt Runs"
                  recordId="prompt-2"
                  recordName="Prompt Run #143"
                  iconClass="fas fa-brain">
                </mj-entity-link-pill-mock>
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
            <mj-entity-link-pill-mock
              entityName="AI Agents"
              recordId="agent-1"
              recordName="Support Bot"
              iconClass="fas fa-robot">
            </mj-entity-link-pill-mock>
            <mj-entity-link-pill-mock
              entityName="MJ: AI Prompt Runs"
              recordId="prompt-1"
              recordName="Prompt #142"
              iconClass="fas fa-brain">
            </mj-entity-link-pill-mock>
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
        <mj-entity-link-pill-mock
          entityName="Custom Entity"
          recordId="1"
          recordName="Record #1">
        </mj-entity-link-pill-mock>
        <mj-entity-link-pill-mock
          entityName="Another Entity"
          recordId="2"
          recordName="Record #2">
        </mj-entity-link-pill-mock>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When no icon is specified, the default link icon is used.',
      },
    },
  },
};
