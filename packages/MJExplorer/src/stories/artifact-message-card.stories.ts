import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { ArtifactMessageCardComponent } from '@memberjunction/ng-artifacts';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';
import {
  MockArtifactIconService,
  createMockUserInfo,
  type MockArtifact,
  type MockArtifactVersion
} from './.storybook-mocks';

const meta: Meta<ArtifactMessageCardComponent> = {
  title: 'Components/ArtifactMessageCard',
  component: ArtifactMessageCardComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, ArtifactsModule],
      providers: [
        // Replace real service with mock
        { provide: ArtifactIconService, useClass: MockArtifactIconService }
      ],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`mj-artifact-message-card\` component displays a compact info bar for artifacts embedded in conversation messages.

## Usage

\`\`\`html
<mj-artifact-message-card
  [artifactId]="artifactId"
  [versionNumber]="versionNumber"
  [currentUser]="currentUser"
  (actionPerformed)="onArtifactAction($event)">
</mj-artifact-message-card>
\`\`\`

Or with pre-loaded entities (skips DB queries):

\`\`\`html
<mj-artifact-message-card
  [artifact]="artifactEntity"
  [artifactVersion]="versionEntity"
  [currentUser]="currentUser"
  (actionPerformed)="onArtifactAction($event)">
</mj-artifact-message-card>
\`\`\`

## Module Import

\`\`\`typescript
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
\`\`\`

## States
- **Loading**: Skeleton placeholder with pulse animation
- **Error**: Error message with icon
- **Success**: Interactive info bar with artifact details

## Artifact Types
Different types display different icons and badge colors:
- **Code** (Purple): fa-file-code
- **Report** (Blue): fa-chart-line
- **Dashboard** (Green): fa-chart-bar
- **Document** (Orange): fa-file-lines
- **Image** (Pink): fa-image
- **Component** (Indigo): fa-puzzle-piece
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<ArtifactMessageCardComponent>;

// Mock user for all stories
const mockUser = createMockUserInfo();

// Helper to create mock artifact data objects
// Note: The real component expects ArtifactEntity and ArtifactVersionEntity,
// but in Storybook we pass mock objects that have the same shape
function createMockArtifactData(name: string, type: string, description?: string): MockArtifact {
  return {
    ID: `artifact-${Math.random().toString(36).substr(2, 9)}`,
    Name: name,
    Type: type,
    Description: description
  };
}

function createMockVersionData(versionNumber: number, name?: string): MockArtifactVersion {
  return {
    ID: `version-${Math.random().toString(36).substr(2, 9)}`,
    VersionNumber: versionNumber,
    Name: name
  };
}

// Default with code artifact
export const Default: Story = {
  render: () => ({
    props: {
      currentUser: mockUser,
      artifact: createMockArtifactData('data-processor.ts', 'Code', 'TypeScript data processing utility'),
      artifactVersion: createMockVersionData(3)
    },
    template: `
      <div class="story-width-md">
        <mj-artifact-message-card
          [artifact]="artifact"
          [artifactVersion]="artifactVersion"
          [currentUser]="currentUser">
        </mj-artifact-message-card>
      </div>
    `,
  }),
};

// Loading state - use artifactId without artifact to trigger loading
// Note: In Storybook the RunView will fail, so we show the error state instead
// To show true loading, we'd need to mock RunView
export const LoadingState: Story = {
  render: () => ({
    props: {
      currentUser: mockUser
    },
    template: `
      <div class="story-width-md">
        <div class="story-caption-sm" style="margin-bottom: 8px;">Loading state simulation:</div>
        <div class="artifact-message-card" style="margin: 12px 0;">
          <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
          ">
            <div style="
              width: 32px;
              height: 32px;
              background: #E5E7EB;
              border-radius: 6px;
              animation: pulse 1.5s ease-in-out infinite;
            "></div>
            <div style="
              flex: 1;
              height: 32px;
              background: #E5E7EB;
              border-radius: 4px;
              animation: pulse 1.5s ease-in-out infinite;
            "></div>
          </div>
        </div>
        <style>
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        </style>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Skeleton loading state while artifact data is being fetched. (Simulated in Storybook)',
      },
    },
  },
};

// Error state
export const ErrorState: Story = {
  render: () => ({
    props: {
      currentUser: mockUser
    },
    template: `
      <div class="story-width-md">
        <div class="artifact-message-card" style="margin: 12px 0;">
          <div style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            background: #FEE2E2;
            border: 1px solid #FECACA;
            border-radius: 6px;
            color: #DC2626;
            font-size: 14px;
          ">
            <i class="fa-solid fa-exclamation-circle" style="font-size: 16px;"></i>
            <span>Failed to load artifact</span>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Error state when artifact fails to load.',
      },
    },
  },
};

// All artifact types
export const AllArtifactTypes: Story = {
  render: () => ({
    props: {
      currentUser: mockUser,
      codeArtifact: createMockArtifactData('api-handler.ts', 'Code'),
      codeVersion: createMockVersionData(2),
      reportArtifact: createMockArtifactData('Q4 Sales Analysis', 'Report'),
      reportVersion: createMockVersionData(5),
      dashboardArtifact: createMockArtifactData('Executive Overview', 'Dashboard'),
      dashboardVersion: createMockVersionData(1),
      documentArtifact: createMockArtifactData('Project Requirements', 'Document'),
      documentVersion: createMockVersionData(12)
    },
    template: `
      <div class="story-column story-width-md">
        <div>
          <div class="story-caption">Code Artifact</div>
          <mj-artifact-message-card
            [artifact]="codeArtifact"
            [artifactVersion]="codeVersion"
            [currentUser]="currentUser">
          </mj-artifact-message-card>
        </div>

        <div>
          <div class="story-caption">Report Artifact</div>
          <mj-artifact-message-card
            [artifact]="reportArtifact"
            [artifactVersion]="reportVersion"
            [currentUser]="currentUser">
          </mj-artifact-message-card>
        </div>

        <div>
          <div class="story-caption">Dashboard Artifact</div>
          <mj-artifact-message-card
            [artifact]="dashboardArtifact"
            [artifactVersion]="dashboardVersion"
            [currentUser]="currentUser">
          </mj-artifact-message-card>
        </div>

        <div>
          <div class="story-caption">Document Artifact</div>
          <mj-artifact-message-card
            [artifact]="documentArtifact"
            [artifactVersion]="documentVersion"
            [currentUser]="currentUser">
          </mj-artifact-message-card>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All artifact types with their corresponding icons and badge colors.',
      },
    },
  },
};

// In conversation context
export const InConversationContext: Story = {
  render: () => ({
    props: {
      currentUser: mockUser,
      artifact: createMockArtifactData('Sales Analysis Report', 'Report'),
      artifactVersion: createMockVersionData(2)
    },
    template: `
      <div style="width: 600px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <!-- Message header -->
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8b5cf6, #6366f1);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 14px;
          ">
            <i class="fas fa-robot"></i>
          </div>
          <div>
            <div style="font-size: 14px; font-weight: 600; color: #1f2937;">Analysis Agent</div>
            <div style="font-size: 12px; color: #6b7280;">2 min ago</div>
          </div>
        </div>

        <!-- Message content -->
        <div style="padding-left: 48px;">
          <div style="font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 4px;">
            I've completed the sales analysis you requested. Here's the report:
          </div>

          <!-- Artifact card -->
          <mj-artifact-message-card
            [artifact]="artifact"
            [artifactVersion]="artifactVersion"
            [currentUser]="currentUser">
          </mj-artifact-message-card>

          <div style="font-size: 14px; color: #374151; line-height: 1.6; margin-top: 4px;">
            Click to view the full report with interactive charts.
          </div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Artifact message card displayed within a conversation message.',
      },
    },
  },
};

// Version-specific name override
export const VersionSpecificName: Story = {
  render: () => ({
    props: {
      currentUser: mockUser,
      artifact1: createMockArtifactData('analysis.ts', 'Code'),
      version1: createMockVersionData(1, undefined),
      artifact2: createMockArtifactData('analysis.ts', 'Code'),
      version2: createMockVersionData(2, 'analysis-v2-refactored.ts')
    },
    template: `
      <div class="story-column story-width-md">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Artifact name (no version override):</div>
          <mj-artifact-message-card
            [artifact]="artifact1"
            [artifactVersion]="version1"
            [currentUser]="currentUser">
          </mj-artifact-message-card>
        </div>

        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Version-specific name override:</div>
          <mj-artifact-message-card
            [artifact]="artifact2"
            [artifactVersion]="version2"
            [currentUser]="currentUser">
          </mj-artifact-message-card>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Version can override the artifact name with a version-specific name.',
      },
    },
  },
};

// All states comparison
export const AllStatesComparison: Story = {
  render: () => ({
    props: {
      currentUser: mockUser,
      artifact: createMockArtifactData('component.tsx', 'Code'),
      artifactVersion: createMockVersionData(4)
    },
    template: `
      <div class="story-container story-column story-width-md">
        <div>
          <div class="story-caption-sm story-row story-gap-sm" style="margin-bottom: 8px;">
            <i class="fa-solid fa-spinner fa-spin story-text-info"></i>
            Loading State
          </div>
          <div class="artifact-message-card" style="margin: 12px 0;">
            <div style="
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 12px 16px;
              background: #F9FAFB;
              border: 1px solid #E5E7EB;
              border-radius: 6px;
            ">
              <div style="
                width: 32px;
                height: 32px;
                background: #E5E7EB;
                border-radius: 6px;
                animation: pulse 1.5s ease-in-out infinite;
              "></div>
              <div style="
                flex: 1;
                height: 32px;
                background: #E5E7EB;
                border-radius: 4px;
                animation: pulse 1.5s ease-in-out infinite;
              "></div>
            </div>
          </div>
        </div>

        <div>
          <div class="story-caption-sm story-row story-gap-sm" style="margin-bottom: 8px;">
            <i class="fa-solid fa-exclamation-circle story-text-danger"></i>
            Error State
          </div>
          <div class="artifact-message-card" style="margin: 12px 0;">
            <div style="
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 12px 16px;
              background: #FEE2E2;
              border: 1px solid #FECACA;
              border-radius: 6px;
              color: #DC2626;
              font-size: 14px;
            ">
              <i class="fa-solid fa-exclamation-circle" style="font-size: 16px;"></i>
              <span>Failed to load artifact</span>
            </div>
          </div>
        </div>

        <div>
          <div class="story-caption-sm story-row story-gap-sm" style="margin-bottom: 8px;">
            <i class="fa-solid fa-check-circle story-text-success"></i>
            Success State
          </div>
          <mj-artifact-message-card
            [artifact]="artifact"
            [artifactVersion]="artifactVersion"
            [currentUser]="currentUser">
          </mj-artifact-message-card>
        </div>
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      </style>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Side-by-side comparison of all three states.',
      },
    },
  },
};

// Type badge color reference
export const TypeBadgeColorReference: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <table class="story-table story-max-width-md">
          <thead>
            <tr>
              <th>Type</th>
              <th>Color</th>
              <th>Icon</th>
              <th>Badge</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="label">Code</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-purple"></span>
                  Purple
                </span>
              </td>
              <td><i class="fa-solid fa-file-code story-text-muted"></i></td>
              <td>
                <span style="padding: 2px 8px; background: #8B5CF6; color: white; font-size: 10px; font-weight: 600; border-radius: 3px; text-transform: uppercase;">Code</span>
              </td>
            </tr>
            <tr>
              <td class="label">Report</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-blue"></span>
                  Blue
                </span>
              </td>
              <td><i class="fa-solid fa-chart-line story-text-muted"></i></td>
              <td>
                <span style="padding: 2px 8px; background: #3B82F6; color: white; font-size: 10px; font-weight: 600; border-radius: 3px; text-transform: uppercase;">Report</span>
              </td>
            </tr>
            <tr>
              <td class="label">Dashboard</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-green"></span>
                  Green
                </span>
              </td>
              <td><i class="fa-solid fa-chart-bar story-text-muted"></i></td>
              <td>
                <span style="padding: 2px 8px; background: #10B981; color: white; font-size: 10px; font-weight: 600; border-radius: 3px; text-transform: uppercase;">Dashboard</span>
              </td>
            </tr>
            <tr>
              <td class="label">Document</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch story-bg-orange"></span>
                  Orange
                </span>
              </td>
              <td><i class="fa-solid fa-file-lines story-text-muted"></i></td>
              <td>
                <span style="padding: 2px 8px; background: #F59E0B; color: white; font-size: 10px; font-weight: 600; border-radius: 3px; text-transform: uppercase;">Document</span>
              </td>
            </tr>
            <tr>
              <td class="label">Image</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch" style="background: #EC4899;"></span>
                  Pink
                </span>
              </td>
              <td><i class="fa-solid fa-image story-text-muted"></i></td>
              <td>
                <span style="padding: 2px 8px; background: #EC4899; color: white; font-size: 10px; font-weight: 600; border-radius: 3px; text-transform: uppercase;">Image</span>
              </td>
            </tr>
            <tr>
              <td class="label">Component</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch" style="background: #6366F1;"></span>
                  Indigo
                </span>
              </td>
              <td><i class="fa-solid fa-puzzle-piece story-text-muted"></i></td>
              <td>
                <span style="padding: 2px 8px; background: #6366F1; color: white; font-size: 10px; font-weight: 600; border-radius: 3px; text-transform: uppercase;">Component</span>
              </td>
            </tr>
            <tr>
              <td class="label">Other/Default</td>
              <td>
                <span class="story-color-row">
                  <span class="story-color-swatch" style="background: #6B7280;"></span>
                  Gray
                </span>
              </td>
              <td><i class="fa-solid fa-file story-text-muted"></i></td>
              <td>
                <span style="padding: 2px 8px; background: #6B7280; color: white; font-size: 10px; font-weight: 600; border-radius: 3px; text-transform: uppercase;">Other</span>
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
        story: 'Reference showing artifact type badges, colors, and icons.',
      },
    },
  },
};
