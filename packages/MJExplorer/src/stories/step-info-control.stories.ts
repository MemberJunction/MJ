import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { MemberJunctionCoreEntityFormsModule } from '@memberjunction/ng-core-entity-forms';

/**
 * Mock AIAgentStepEntity interface for story args
 * Matches the shape expected by StepInfoControlComponent
 */
interface StepInfoArgs {
  StepType: string | null;
  SubAgentID: string | null;
  SubAgent: string | null;
  StartingStep: boolean;
}

interface StepInfoControlStoryArgs {
  step: StepInfoArgs;
}

const meta: Meta<StepInfoControlStoryArgs> = {
  title: 'Components/StepInfoControl',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, MemberJunctionCoreEntityFormsModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-step-info-control\` component displays information about an AI Agent workflow step.

## Usage

\`\`\`html
<mj-step-info-control [step]="step"></mj-step-info-control>
\`\`\`

## Module Import

\`\`\`typescript
import { MemberJunctionCoreEntityFormsModule } from '@memberjunction/ng-core-entity-forms';
\`\`\`

## Step Types
- **Action**: Executes an action (bolt icon)
- **Sub-agent**: Calls another agent (robot icon)
- **Prompt**: Executes an AI prompt (brain icon)
- **Condition**: Conditional branching (code-branch icon)
- **Loop**: Iteration step (repeat icon)
- **Parallel**: Parallel execution (random icon)
- **Default**: Unknown type (cube icon)
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<StepInfoControlStoryArgs>;

// Default action step
export const Default: Story = {
  args: {
    step: {
      StepType: 'Action',
      SubAgentID: null,
      SubAgent: null,
      StartingStep: false
    }
  },
  render: (args) => ({
    props: args,
    template: `
      <mj-step-info-control [step]="step"></mj-step-info-control>
    `,
  }),
};

// All step types
export const AllStepTypes: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div class="story-card">
          <div class="story-caption">Action Step</div>
          <mj-step-info-control [step]="{ StepType: 'Action', SubAgentID: null, SubAgent: null, StartingStep: false }"></mj-step-info-control>
        </div>

        <div class="story-card">
          <div class="story-caption">Sub-Agent Step</div>
          <mj-step-info-control [step]="{ StepType: 'Sub-agent', SubAgentID: 'agent-1', SubAgent: 'Data Analyzer Agent', StartingStep: false }"></mj-step-info-control>
        </div>

        <div class="story-card">
          <div class="story-caption">Prompt Step</div>
          <mj-step-info-control [step]="{ StepType: 'Prompt', SubAgentID: null, SubAgent: null, StartingStep: false }"></mj-step-info-control>
        </div>

        <div class="story-card">
          <div class="story-caption">Condition Step</div>
          <mj-step-info-control [step]="{ StepType: 'Condition', SubAgentID: null, SubAgent: null, StartingStep: false }"></mj-step-info-control>
        </div>

        <div class="story-card">
          <div class="story-caption">Loop Step</div>
          <mj-step-info-control [step]="{ StepType: 'Loop', SubAgentID: null, SubAgent: null, StartingStep: false }"></mj-step-info-control>
        </div>

        <div class="story-card">
          <div class="story-caption">Parallel Step</div>
          <mj-step-info-control [step]="{ StepType: 'Parallel', SubAgentID: null, SubAgent: null, StartingStep: false }"></mj-step-info-control>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All available step types with their corresponding icons.',
      },
    },
  },
};

// Starting step flag
export const StartingStep: Story = {
  render: () => ({
    template: `
      <div class="story-container story-row story-gap-lg">
        <div class="story-card">
          <div class="story-caption">Regular Step</div>
          <mj-step-info-control [step]="{ StepType: 'Action', SubAgentID: null, SubAgent: null, StartingStep: false }"></mj-step-info-control>
        </div>

        <div class="story-card story-card-highlight">
          <div class="story-caption story-text-success">Starting Step</div>
          <mj-step-info-control [step]="{ StepType: 'Action', SubAgentID: null, SubAgent: null, StartingStep: true }"></mj-step-info-control>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Steps marked as StartingStep show a flag indicator.',
      },
    },
  },
};

// Sub-agent step with reference
export const SubAgentWithReference: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <div class="story-card story-max-width-sm">
          <mj-step-info-control [step]="{
            StepType: 'Sub-agent',
            SubAgentID: 'agent-123',
            SubAgent: 'Customer Support Agent',
            StartingStep: false
          }"></mj-step-info-control>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Sub-agent steps display the referenced agent name in blue.',
      },
    },
  },
};

// In workflow diagram context
export const InWorkflowContext: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <div class="story-column" style="gap: 0;">
          <!-- Step 1 -->
          <div class="story-row story-gap-md">
            <div class="story-workflow-step-number story-bg-green">1</div>
            <div class="story-workflow-step-content story-card-highlight">
              <mj-step-info-control [step]="{ StepType: 'Action', SubAgentID: null, SubAgent: null, StartingStep: true }"></mj-step-info-control>
            </div>
          </div>

          <!-- Connector -->
          <div class="story-workflow-connector">
            <div class="story-workflow-connector-line"></div>
          </div>

          <!-- Step 2 -->
          <div class="story-row story-gap-md">
            <div class="story-workflow-step-number story-bg-blue">2</div>
            <div class="story-workflow-step-content">
              <mj-step-info-control [step]="{ StepType: 'Prompt', SubAgentID: null, SubAgent: null, StartingStep: false }"></mj-step-info-control>
            </div>
          </div>

          <!-- Connector -->
          <div class="story-workflow-connector">
            <div class="story-workflow-connector-line"></div>
          </div>

          <!-- Step 3 -->
          <div class="story-row story-gap-md">
            <div class="story-workflow-step-number story-bg-amber">3</div>
            <div class="story-workflow-step-content">
              <mj-step-info-control [step]="{ StepType: 'Condition', SubAgentID: null, SubAgent: null, StartingStep: false }"></mj-step-info-control>
            </div>
          </div>

          <!-- Connector -->
          <div class="story-workflow-connector">
            <div class="story-workflow-connector-line"></div>
          </div>

          <!-- Step 4 -->
          <div class="story-row story-gap-md">
            <div class="story-workflow-step-number story-bg-purple">4</div>
            <div class="story-workflow-step-content">
              <mj-step-info-control [step]="{ StepType: 'Sub-agent', SubAgentID: 'agent-1', SubAgent: 'Response Generator', StartingStep: false }"></mj-step-info-control>
            </div>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Step info controls shown in a workflow diagram context.',
      },
    },
  },
};

// Icon reference
export const IconReference: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <table class="story-table story-max-width-md">
          <thead>
            <tr>
              <th>Step Type</th>
              <th>Icon</th>
              <th>Icon Class</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="label">Action</td>
              <td><i class="fa-solid fa-bolt"></i></td>
              <td class="story-mono">fa-bolt</td>
            </tr>
            <tr>
              <td class="label">Sub-agent</td>
              <td><i class="fa-solid fa-robot"></i></td>
              <td class="story-mono">fa-robot</td>
            </tr>
            <tr>
              <td class="label">Prompt</td>
              <td><i class="fa-solid fa-brain"></i></td>
              <td class="story-mono">fa-brain</td>
            </tr>
            <tr>
              <td class="label">Condition</td>
              <td><i class="fa-solid fa-code-branch"></i></td>
              <td class="story-mono">fa-code-branch</td>
            </tr>
            <tr>
              <td class="label">Loop</td>
              <td><i class="fa-solid fa-repeat"></i></td>
              <td class="story-mono">fa-repeat</td>
            </tr>
            <tr>
              <td class="label">Parallel</td>
              <td><i class="fa-solid fa-random"></i></td>
              <td class="story-mono">fa-random</td>
            </tr>
            <tr>
              <td class="label">Unknown/Default</td>
              <td><i class="fa-solid fa-cube"></i></td>
              <td class="story-mono">fa-cube</td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Reference table showing each step type and its corresponding icon.',
      },
    },
  },
};
