import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';

// Mock types
type AgentStatus = 'acknowledging' | 'working' | 'completing' | 'completed' | 'error';

interface MockAgentRun {
  ID: string;
  Agent: string;
}

interface MockActiveAgent {
  run: MockAgentRun;
  status: AgentStatus;
  confidence: number | null;
}

/**
 * Mock ActiveAgentIndicator component for Storybook
 * Replicates the visual behavior without requiring actual services
 */
@Component({
  selector: 'mj-active-agent-indicator-mock',
  template: `
    <div class="active-agents-container" *ngIf="activeAgents.length > 0">
      <span class="active-agents-label">Active:</span>
      <div class="agents-wrapper" [class.expanded]="isExpanded">
        <div *ngFor="let agent of displayAgents"
             class="agent-avatar"
             [class.status-acknowledging]="agent.status === 'acknowledging'"
             [class.status-working]="agent.status === 'working'"
             [class.status-completing]="agent.status === 'completing'"
             [class.status-completed]="agent.status === 'completed'"
             [class.status-error]="agent.status === 'error'"
             [title]="getAgentTooltip(agent)"
             (click)="onAgentClick(agent)">
          <div class="avatar-content">
            <i class="fas fa-robot"></i>
          </div>
          <div class="status-indicator" *ngIf="agent.status !== 'completed'">
            <div class="pulse-ring"></div>
          </div>
          <div class="confidence-badge" *ngIf="agent.confidence != null" [title]="'Confidence: ' + (agent.confidence * 100).toFixed(0) + '%'">
            {{ (agent.confidence * 100).toFixed(0) }}%
          </div>
        </div>

        <button class="more-agents" *ngIf="activeAgents.length > maxVisibleAgents && !isExpanded"
                (click)="toggleExpanded()" [title]="'Show all ' + activeAgents.length + ' agents'">
          +{{ activeAgents.length - maxVisibleAgents }}
        </button>
      </div>

      <button class="panel-toggle" (click)="onTogglePanel()" title="Open agent process panel">
        <i class="fas fa-chart-line"></i>
        <span class="agent-count">{{ activeAgents.length }}</span>
      </button>
    </div>
  `,
  styles: [`
    .active-agents-container {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background-color: #F4F4F4;
      border-radius: 20px;
      font-size: 12px;
      color: #6B7280;
      height: 32px;
    }

    .active-agents-label {
      font-weight: 500;
      color: #6B7280;
    }

    .agents-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: 200px;
      overflow: hidden;
      transition: max-width 300ms ease;
    }

    .agents-wrapper.expanded {
      max-width: 600px;
    }

    .agent-avatar {
      position: relative;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 200ms ease;
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 600;
    }

    .agent-avatar:hover {
      transform: scale(1.1);
    }

    .avatar-content {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: white;
      position: relative;
      z-index: 1;
    }

    /* Status-based colors */
    .status-acknowledging .avatar-content {
      background: linear-gradient(135deg, #3B82F6, #2563EB);
    }

    .status-working .avatar-content {
      background: linear-gradient(135deg, #F59E0B, #D97706);
    }

    .status-completing .avatar-content {
      background: linear-gradient(135deg, #10B981, #059669);
    }

    .status-completed .avatar-content {
      background: linear-gradient(135deg, #6B7280, #4B5563);
      opacity: 0.6;
    }

    .status-error .avatar-content {
      background: linear-gradient(135deg, #EF4444, #DC2626);
    }

    /* Animated status indicator */
    .status-indicator {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 10px;
      height: 10px;
      z-index: 2;
    }

    .pulse-ring {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    .status-acknowledging .pulse-ring {
      background: #3B82F6;
    }

    .status-working .pulse-ring {
      background: #F59E0B;
      animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    .status-completing .pulse-ring {
      background: #10B981;
      animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.5;
        transform: scale(1.5);
      }
    }

    /* Confidence badge */
    .confidence-badge {
      position: absolute;
      bottom: -4px;
      right: -4px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 4px;
      padding: 1px 3px;
      font-size: 9px;
      font-weight: 600;
      color: #374151;
      z-index: 3;
      line-height: 1;
    }

    .more-agents {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #E5E7EB;
      border: none;
      color: #6B7280;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 200ms ease;
      flex-shrink: 0;
    }

    .more-agents:hover {
      background: #D1D5DB;
      transform: scale(1.05);
    }

    .panel-toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: #3B82F6;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 12px;
      cursor: pointer;
      transition: all 200ms ease;
      position: relative;
    }

    .panel-toggle:hover {
      background: #2563EB;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
    }

    .agent-count {
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: 600;
      min-width: 20px;
      text-align: center;
    }
  `]
})
class ActiveAgentIndicatorMockComponent {
  @Input() activeAgents: MockActiveAgent[] = [];
  @Input() maxVisibleAgents: number = 3;

  @Output() togglePanel = new EventEmitter<void>();
  @Output() agentSelected = new EventEmitter<MockAgentRun>();

  isExpanded = false;

  get displayAgents(): MockActiveAgent[] {
    if (this.isExpanded) {
      return this.activeAgents;
    }
    return this.activeAgents.slice(0, this.maxVisibleAgents);
  }

  getAgentTooltip(agent: MockActiveAgent): string {
    const statusText = this.getStatusText(agent.status);
    const confidenceText = agent.confidence != null
      ? ` (Confidence: ${(agent.confidence * 100).toFixed(0)}%)`
      : '';
    return `${agent.run.Agent || 'Agent'} - ${statusText}${confidenceText}`;
  }

  getStatusText(status: AgentStatus): string {
    switch (status) {
      case 'acknowledging': return 'Acknowledging request';
      case 'working': return 'Working on task';
      case 'completing': return 'Completing';
      case 'completed': return 'Completed';
      case 'error': return 'Error occurred';
      default: return 'Active';
    }
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  onAgentClick(agent: MockActiveAgent): void {
    this.agentSelected.emit(agent.run);
  }

  onTogglePanel(): void {
    this.togglePanel.emit();
  }
}

const meta: Meta = {
  title: 'Components/ActiveAgentIndicator',
  component: ActiveAgentIndicatorMockComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
      declarations: [ActiveAgentIndicatorMockComponent],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-active-agent-indicator\` component displays active AI agents with status animations.

## Usage

\`\`\`html
<mj-active-agent-indicator
  [conversationId]="conversationId"
  [currentUser]="currentUser"
  [maxVisibleAgents]="3"
  (togglePanel)="onTogglePanel()"
  (agentSelected)="onAgentSelected($event)">
</mj-active-agent-indicator>
\`\`\`

## Module Import

\`\`\`typescript
import { ConversationsModule } from '@memberjunction/ng-conversations';
\`\`\`

## Agent Status Types
- **Acknowledging** (Blue): Agent is acknowledging the request
- **Working** (Orange): Agent is actively working on the task
- **Completing** (Green): Agent is finishing up
- **Completed** (Gray): Agent has finished (no pulse animation)
- **Error** (Red): Agent encountered an error
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Helper to create mock agents
function createMockAgent(name: string, status: AgentStatus, confidence: number | null = null): MockActiveAgent {
  return {
    run: { ID: `agent-${Math.random().toString(36).substr(2, 9)}`, Agent: name },
    status,
    confidence
  };
}

// Default with one active agent
export const Default: Story = {
  render: () => ({
    props: {
      activeAgents: [
        createMockAgent('Support Agent', 'working', 0.85)
      ]
    },
    template: `
      <mj-active-agent-indicator-mock [activeAgents]="activeAgents"></mj-active-agent-indicator-mock>
    `,
  }),
};

// All status types
export const AllStatusTypes: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Acknowledging (Blue):</div>
          <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '1', Agent: 'Support Agent' }, status: 'acknowledging', confidence: null }]"></mj-active-agent-indicator-mock>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Working (Orange):</div>
          <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '2', Agent: 'Data Analyzer' }, status: 'working', confidence: 0.72 }]"></mj-active-agent-indicator-mock>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Completing (Green):</div>
          <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '3', Agent: 'Writer Agent' }, status: 'completing', confidence: 0.95 }]"></mj-active-agent-indicator-mock>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Completed (Gray):</div>
          <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '4', Agent: 'Research Agent' }, status: 'completed', confidence: 0.88 }]"></mj-active-agent-indicator-mock>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Error (Red):</div>
          <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '5', Agent: 'Failed Agent' }, status: 'error', confidence: null }]"></mj-active-agent-indicator-mock>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All five status types with their corresponding colors and animations.',
      },
    },
  },
};

// Multiple agents
export const MultipleAgents: Story = {
  render: () => ({
    props: {
      activeAgents: [
        createMockAgent('Support Agent', 'working', 0.72),
        createMockAgent('Data Analyzer', 'acknowledging', null),
        createMockAgent('Writer Agent', 'completing', 0.95)
      ]
    },
    template: `
      <mj-active-agent-indicator-mock [activeAgents]="activeAgents"></mj-active-agent-indicator-mock>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Multiple agents displayed together with different statuses.',
      },
    },
  },
};

// Overflow with more button
export const OverflowAgents: Story = {
  render: () => ({
    props: {
      activeAgents: [
        createMockAgent('Agent 1', 'working', 0.72),
        createMockAgent('Agent 2', 'acknowledging', null),
        createMockAgent('Agent 3', 'completing', 0.95),
        createMockAgent('Agent 4', 'working', 0.60),
        createMockAgent('Agent 5', 'acknowledging', 0.80)
      ],
      maxVisibleAgents: 3
    },
    template: `
      <div class="story-container story-column">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">5 agents, max visible: 3</div>
          <mj-active-agent-indicator-mock [activeAgents]="activeAgents" [maxVisibleAgents]="maxVisibleAgents"></mj-active-agent-indicator-mock>
        </div>
        <div class="story-text-muted" style="font-size: 12px;">
          Click the "+2" button to expand and see all agents
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When more agents exist than maxVisibleAgents, a "+N" button appears to expand.',
      },
    },
  },
};

// With confidence badges
export const WithConfidenceBadges: Story = {
  render: () => ({
    props: {
      activeAgents: [
        createMockAgent('High Confidence', 'completing', 0.95),
        createMockAgent('Medium Confidence', 'working', 0.72),
        createMockAgent('Low Confidence', 'working', 0.45)
      ]
    },
    template: `
      <mj-active-agent-indicator-mock [activeAgents]="activeAgents"></mj-active-agent-indicator-mock>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Agents with confidence scores display a percentage badge.',
      },
    },
  },
};

// In chat header context
export const InChatHeaderContext: Story = {
  render: () => ({
    props: {
      activeAgents: [
        createMockAgent('Support Agent', 'working', 0.85),
        createMockAgent('Research Agent', 'acknowledging', null)
      ]
    },
    template: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        width: 600px;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
          ">
            <i class="fas fa-comments"></i>
          </div>
          <div>
            <div style="font-size: 14px; font-weight: 600; color: #1f2937;">Chat Session</div>
            <div style="font-size: 12px; color: #6b7280;">Started 5 min ago</div>
          </div>
        </div>
        <mj-active-agent-indicator-mock [activeAgents]="activeAgents"></mj-active-agent-indicator-mock>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Active agent indicator positioned in a chat header context.',
      },
    },
  },
};

// Empty state (no agents)
export const EmptyState: Story = {
  render: () => ({
    props: {
      activeAgents: []
    },
    template: `
      <div class="story-container">
        <div class="story-caption-sm" style="margin-bottom: 8px;">No active agents (component hidden):</div>
        <div class="story-placeholder">
          <mj-active-agent-indicator-mock [activeAgents]="activeAgents"></mj-active-agent-indicator-mock>
          <div class="story-text-muted story-text-center">Component renders nothing when no agents are active</div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When no agents are active, the component renders nothing.',
      },
    },
  },
};

// Status color reference
export const StatusColorReference: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <table class="story-table story-width-lg">
          <thead>
            <tr>
              <th>Status</th>
              <th>Color</th>
              <th>Animation</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="label">Acknowledging</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch" style="background: linear-gradient(135deg, #3B82F6, #2563EB); border-radius: 50%;"></span>
                  Blue
                </span>
              </td>
              <td>2s pulse</td>
              <td>
                <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '1', Agent: 'Agent' }, status: 'acknowledging', confidence: null }]"></mj-active-agent-indicator-mock>
              </td>
            </tr>
            <tr>
              <td class="label">Working</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch" style="background: linear-gradient(135deg, #F59E0B, #D97706); border-radius: 50%;"></span>
                  Orange
                </span>
              </td>
              <td>1.5s pulse</td>
              <td>
                <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '2', Agent: 'Agent' }, status: 'working', confidence: null }]"></mj-active-agent-indicator-mock>
              </td>
            </tr>
            <tr>
              <td class="label">Completing</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch" style="background: linear-gradient(135deg, #10B981, #059669); border-radius: 50%;"></span>
                  Green
                </span>
              </td>
              <td>1s pulse</td>
              <td>
                <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '3', Agent: 'Agent' }, status: 'completing', confidence: null }]"></mj-active-agent-indicator-mock>
              </td>
            </tr>
            <tr>
              <td class="label">Completed</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch" style="background: linear-gradient(135deg, #6B7280, #4B5563); border-radius: 50%;"></span>
                  Gray
                </span>
              </td>
              <td>None</td>
              <td>
                <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '4', Agent: 'Agent' }, status: 'completed', confidence: null }]"></mj-active-agent-indicator-mock>
              </td>
            </tr>
            <tr>
              <td class="label">Error</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch" style="background: linear-gradient(135deg, #EF4444, #DC2626); border-radius: 50%;"></span>
                  Red
                </span>
              </td>
              <td>2s pulse</td>
              <td>
                <mj-active-agent-indicator-mock [activeAgents]="[{ run: { ID: '5', Agent: 'Agent' }, status: 'error', confidence: null }]"></mj-active-agent-indicator-mock>
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
        story: 'Reference table showing status colors and animations.',
      },
    },
  },
};
