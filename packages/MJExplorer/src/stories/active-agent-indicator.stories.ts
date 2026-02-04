import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ConversationsModule } from '@memberjunction/ng-conversations';
import { ActiveAgentIndicatorComponent } from '@memberjunction/ng-conversations';
import { AgentStateService } from '@memberjunction/ng-conversations';
import {
  MockAgentStateService,
  createMockAgent,
  createMockUserInfo,
  type AgentWithStatus
} from './.storybook-mocks';

const meta: Meta<ActiveAgentIndicatorComponent> = {
  title: 'Components/ActiveAgentIndicator',
  component: ActiveAgentIndicatorComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, ConversationsModule],
      providers: [
        // Replace real service with mock
        { provide: AgentStateService, useClass: MockAgentStateService }
      ],
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
type Story = StoryObj<ActiveAgentIndicatorComponent>;

// Mock user for all stories
const mockUser = createMockUserInfo();

// Default with one active agent
export const Default: Story = {
  render: () => {
    // Create mock agents for this story
    const agents: AgentWithStatus[] = [
      createMockAgent('Support Agent', 'working', 0.85)
    ];

    return {
      props: {
        currentUser: mockUser,
        maxVisibleAgents: 3,
        agents
      },
      template: `
        <mj-active-agent-indicator
          [currentUser]="currentUser"
          [maxVisibleAgents]="maxVisibleAgents">
        </mj-active-agent-indicator>
      `,
      moduleMetadata: {
        providers: [
          {
            provide: AgentStateService,
            useFactory: () => {
              const service = new MockAgentStateService();
              service.setActiveAgents(agents);
              return service;
            }
          }
        ]
      }
    };
  },
};

// All status types
export const AllStatusTypes: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Acknowledging (Blue):</div>
          <mj-active-agent-indicator [currentUser]="currentUser"></mj-active-agent-indicator>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Working (Orange):</div>
          <mj-active-agent-indicator [currentUser]="currentUser2"></mj-active-agent-indicator>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Completing (Green):</div>
          <mj-active-agent-indicator [currentUser]="currentUser3"></mj-active-agent-indicator>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Completed (Gray):</div>
          <mj-active-agent-indicator [currentUser]="currentUser4"></mj-active-agent-indicator>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Error (Red):</div>
          <mj-active-agent-indicator [currentUser]="currentUser5"></mj-active-agent-indicator>
        </div>
      </div>
    `,
    props: {
      currentUser: mockUser,
      currentUser2: mockUser,
      currentUser3: mockUser,
      currentUser4: mockUser,
      currentUser5: mockUser
    },
    moduleMetadata: {
      providers: [
        {
          provide: AgentStateService,
          useFactory: () => {
            const service = new MockAgentStateService();
            // Note: In stories using shared template, we'd need separate component instances
            // For this demo, showing the pattern - each story variant would need its own service instance
            service.setActiveAgents([createMockAgent('Agent', 'working', null)]);
            return service;
          }
        }
      ]
    }
  }),
  parameters: {
    docs: {
      description: {
        story: 'All five status types with their corresponding colors and animations. Note: Each indicator shares the same mock service, so they show the same agents. In production, each would have its own state.',
      },
    },
  },
};

// Multiple agents
export const MultipleAgents: Story = {
  render: () => {
    const agents: AgentWithStatus[] = [
      createMockAgent('Support Agent', 'working', 0.72),
      createMockAgent('Data Analyzer', 'acknowledging', null),
      createMockAgent('Writer Agent', 'completing', 0.95)
    ];

    return {
      props: {
        currentUser: mockUser,
        maxVisibleAgents: 3
      },
      template: `
        <mj-active-agent-indicator
          [currentUser]="currentUser"
          [maxVisibleAgents]="maxVisibleAgents">
        </mj-active-agent-indicator>
      `,
      moduleMetadata: {
        providers: [
          {
            provide: AgentStateService,
            useFactory: () => {
              const service = new MockAgentStateService();
              service.setActiveAgents(agents);
              return service;
            }
          }
        ]
      }
    };
  },
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
  render: () => {
    const agents: AgentWithStatus[] = [
      createMockAgent('Agent 1', 'working', 0.72),
      createMockAgent('Agent 2', 'acknowledging', null),
      createMockAgent('Agent 3', 'completing', 0.95),
      createMockAgent('Agent 4', 'working', 0.60),
      createMockAgent('Agent 5', 'acknowledging', 0.80)
    ];

    return {
      props: {
        currentUser: mockUser,
        maxVisibleAgents: 3
      },
      template: `
        <div class="story-container story-column">
          <div>
            <div class="story-caption-sm" style="margin-bottom: 8px;">5 agents, max visible: 3</div>
            <mj-active-agent-indicator
              [currentUser]="currentUser"
              [maxVisibleAgents]="maxVisibleAgents">
            </mj-active-agent-indicator>
          </div>
          <div class="story-text-muted" style="font-size: 12px;">
            Click the "+2" button to expand and see all agents
          </div>
        </div>
      `,
      moduleMetadata: {
        providers: [
          {
            provide: AgentStateService,
            useFactory: () => {
              const service = new MockAgentStateService();
              service.setActiveAgents(agents);
              return service;
            }
          }
        ]
      }
    };
  },
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
  render: () => {
    const agents: AgentWithStatus[] = [
      createMockAgent('High Confidence', 'completing', 0.95),
      createMockAgent('Medium Confidence', 'working', 0.72),
      createMockAgent('Low Confidence', 'working', 0.45)
    ];

    return {
      props: {
        currentUser: mockUser,
        maxVisibleAgents: 3
      },
      template: `
        <mj-active-agent-indicator
          [currentUser]="currentUser"
          [maxVisibleAgents]="maxVisibleAgents">
        </mj-active-agent-indicator>
      `,
      moduleMetadata: {
        providers: [
          {
            provide: AgentStateService,
            useFactory: () => {
              const service = new MockAgentStateService();
              service.setActiveAgents(agents);
              return service;
            }
          }
        ]
      }
    };
  },
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
  render: () => {
    const agents: AgentWithStatus[] = [
      createMockAgent('Support Agent', 'working', 0.85),
      createMockAgent('Research Agent', 'acknowledging', null)
    ];

    return {
      props: {
        currentUser: mockUser,
        maxVisibleAgents: 3
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
          <mj-active-agent-indicator
            [currentUser]="currentUser"
            [maxVisibleAgents]="maxVisibleAgents">
          </mj-active-agent-indicator>
        </div>
      `,
      moduleMetadata: {
        providers: [
          {
            provide: AgentStateService,
            useFactory: () => {
              const service = new MockAgentStateService();
              service.setActiveAgents(agents);
              return service;
            }
          }
        ]
      }
    };
  },
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
      currentUser: mockUser,
      maxVisibleAgents: 3
    },
    template: `
      <div class="story-container">
        <div class="story-caption-sm" style="margin-bottom: 8px;">No active agents (component hidden):</div>
        <div class="story-placeholder">
          <mj-active-agent-indicator
            [currentUser]="currentUser"
            [maxVisibleAgents]="maxVisibleAgents">
          </mj-active-agent-indicator>
          <div class="story-text-muted story-text-center">Component renders nothing when no agents are active</div>
        </div>
      </div>
    `,
    moduleMetadata: {
      providers: [
        {
          provide: AgentStateService,
          useFactory: () => {
            const service = new MockAgentStateService();
            service.setActiveAgents([]); // No agents
            return service;
          }
        }
      ]
    }
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
              <th>Description</th>
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
              <td>Agent is acknowledging the request</td>
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
              <td>Agent is actively working on the task</td>
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
              <td>Agent is finishing up</td>
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
              <td>Agent has finished (no animation)</td>
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
              <td>Agent encountered an error</td>
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
