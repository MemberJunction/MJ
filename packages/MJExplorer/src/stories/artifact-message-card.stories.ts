import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';

// Mock interfaces
interface MockArtifact {
  ID: string;
  Name: string;
  Type: string;
  Description?: string;
}

interface MockArtifactVersion {
  ID: string;
  VersionNumber: number;
  Name?: string;
  Description?: string;
}

/**
 * Mock ArtifactMessageCard component for Storybook
 * Replicates the visual behavior without requiring actual services
 */
@Component({
  selector: 'mj-artifact-message-card-mock',
  template: `
    <div class="artifact-message-card" [class.loading]="loading" [class.error]="error">
      <div class="artifact-skeleton" *ngIf="loading">
        <div class="skeleton-icon"></div>
        <div class="skeleton-text"></div>
      </div>

      <div class="artifact-error" *ngIf="error && !loading">
        <i class="fa-solid fa-exclamation-circle"></i>
        <span>Failed to load artifact</span>
      </div>

      <div class="artifact-info-bar" *ngIf="!loading && !error && artifact" (click)="openFullView()">
        <div class="artifact-icon">
          <i class="fa-solid" [ngClass]="getArtifactIcon()"></i>
        </div>
        <div class="artifact-info">
          <span class="artifact-name">{{ displayName }}</span>
          <div class="artifact-meta">
            <span class="artifact-type-badge" [style.background]="getTypeBadgeColor()">
              {{ artifact.Type }}
            </span>
            <span class="artifact-version">v{{ artifactVersion?.VersionNumber || 1 }}</span>
          </div>
        </div>
        <div class="open-icon">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .artifact-message-card {
      margin: 12px 0;
    }

    .artifact-skeleton {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
    }

    .skeleton-icon {
      width: 32px;
      height: 32px;
      background: #E5E7EB;
      border-radius: 6px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-text {
      flex: 1;
      height: 32px;
      background: #E5E7EB;
      border-radius: 4px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .artifact-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #FEE2E2;
      border: 1px solid #FECACA;
      border-radius: 6px;
      color: #DC2626;
      font-size: 14px;
    }

    .artifact-error i {
      font-size: 16px;
    }

    .artifact-info-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .artifact-info-bar:hover {
      border-color: #1e40af;
      box-shadow: 0 2px 8px rgba(30, 64, 175, 0.1);
    }

    .artifact-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F3F4F6;
      border-radius: 6px;
      flex-shrink: 0;
      color: #6B7280;
      font-size: 16px;
    }

    .artifact-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .artifact-name {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .artifact-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .artifact-type-badge {
      display: inline-block;
      padding: 2px 8px;
      color: white;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      border-radius: 3px;
      text-transform: uppercase;
    }

    .artifact-version {
      font-size: 11px;
      color: #6B7280;
      font-weight: 500;
    }

    .open-icon {
      flex-shrink: 0;
      color: #9CA3AF;
      font-size: 14px;
      transition: color 200ms ease;
    }

    .artifact-info-bar:hover .open-icon {
      color: #1e40af;
    }
  `]
})
class ArtifactMessageCardMockComponent {
  @Input() artifact: MockArtifact | null = null;
  @Input() artifactVersion: MockArtifactVersion | null = null;
  @Input() loading: boolean = false;
  @Input() error: boolean = false;

  @Output() actionPerformed = new EventEmitter<{ action: string; artifact: MockArtifact; version?: MockArtifactVersion }>();

  get displayName(): string {
    if (this.artifactVersion?.Name) {
      return this.artifactVersion.Name;
    }
    return this.artifact?.Name || 'Untitled';
  }

  getArtifactIcon(): string {
    if (!this.artifact) return 'fa-file';

    const type = this.artifact.Type?.toLowerCase() || '';

    if (type.includes('code')) return 'fa-code';
    if (type.includes('report')) return 'fa-chart-bar';
    if (type.includes('dashboard')) return 'fa-gauge';
    if (type.includes('document')) return 'fa-file-lines';
    if (type.includes('image')) return 'fa-image';
    if (type.includes('component')) return 'fa-puzzle-piece';

    return 'fa-file';
  }

  getTypeBadgeColor(): string {
    if (!this.artifact) return '#6B7280';

    const type = this.artifact.Type?.toLowerCase() || '';

    if (type.includes('code')) return '#8B5CF6'; // Purple
    if (type.includes('report')) return '#3B82F6'; // Blue
    if (type.includes('dashboard')) return '#10B981'; // Green
    if (type.includes('document')) return '#F59E0B'; // Orange
    if (type.includes('image')) return '#EC4899'; // Pink
    if (type.includes('component')) return '#6366F1'; // Indigo

    return '#6B7280'; // Gray
  }

  openFullView(): void {
    if (this.artifact) {
      this.actionPerformed.emit({
        action: 'open',
        artifact: this.artifact,
        version: this.artifactVersion || undefined
      });
      console.log('Opening artifact:', this.artifact.Name);
    }
  }
}

const meta: Meta = {
  title: 'Components/ArtifactMessageCard',
  component: ArtifactMessageCardMockComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
      declarations: [ArtifactMessageCardMockComponent],
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
- **Code** (Purple): fa-code
- **Report** (Blue): fa-chart-bar
- **Dashboard** (Green): fa-gauge
- **Document** (Orange): fa-file-lines
- **Image** (Pink): fa-image
- **Component** (Indigo): fa-puzzle-piece
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default with code artifact
export const Default: Story = {
  render: () => ({
    props: {
      artifact: {
        ID: 'artifact-1',
        Name: 'data-processor.ts',
        Type: 'Code',
        Description: 'TypeScript data processing utility'
      },
      artifactVersion: {
        ID: 'version-1',
        VersionNumber: 3,
        Name: null
      }
    },
    template: `
      <div class="story-width-md">
        <mj-artifact-message-card-mock
          [artifact]="artifact"
          [artifactVersion]="artifactVersion">
        </mj-artifact-message-card-mock>
      </div>
    `,
  }),
};

// Loading state
export const LoadingState: Story = {
  render: () => ({
    template: `
      <div class="story-width-md">
        <mj-artifact-message-card-mock [loading]="true"></mj-artifact-message-card-mock>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Skeleton loading state while artifact data is being fetched.',
      },
    },
  },
};

// Error state
export const ErrorState: Story = {
  render: () => ({
    template: `
      <div class="story-width-md">
        <mj-artifact-message-card-mock [error]="true"></mj-artifact-message-card-mock>
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
    template: `
      <div class="story-column story-width-md">
        <div>
          <div class="story-caption">Code Artifact</div>
          <mj-artifact-message-card-mock
            [artifact]="{ ID: '1', Name: 'api-handler.ts', Type: 'Code' }"
            [artifactVersion]="{ ID: 'v1', VersionNumber: 2 }">
          </mj-artifact-message-card-mock>
        </div>

        <div>
          <div class="story-caption">Report Artifact</div>
          <mj-artifact-message-card-mock
            [artifact]="{ ID: '2', Name: 'Q4 Sales Analysis', Type: 'Report' }"
            [artifactVersion]="{ ID: 'v2', VersionNumber: 5 }">
          </mj-artifact-message-card-mock>
        </div>

        <div>
          <div class="story-caption">Dashboard Artifact</div>
          <mj-artifact-message-card-mock
            [artifact]="{ ID: '3', Name: 'Executive Overview', Type: 'Dashboard' }"
            [artifactVersion]="{ ID: 'v3', VersionNumber: 1 }">
          </mj-artifact-message-card-mock>
        </div>

        <div>
          <div class="story-caption">Document Artifact</div>
          <mj-artifact-message-card-mock
            [artifact]="{ ID: '4', Name: 'Project Requirements', Type: 'Document' }"
            [artifactVersion]="{ ID: 'v4', VersionNumber: 12 }">
          </mj-artifact-message-card-mock>
        </div>

        <div>
          <div class="story-caption">Image Artifact</div>
          <mj-artifact-message-card-mock
            [artifact]="{ ID: '5', Name: 'Architecture Diagram', Type: 'Image' }"
            [artifactVersion]="{ ID: 'v5', VersionNumber: 3 }">
          </mj-artifact-message-card-mock>
        </div>

        <div>
          <div class="story-caption">Component Artifact</div>
          <mj-artifact-message-card-mock
            [artifact]="{ ID: '6', Name: 'UserProfile Widget', Type: 'Component' }"
            [artifactVersion]="{ ID: 'v6', VersionNumber: 8 }">
          </mj-artifact-message-card-mock>
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
      artifact: {
        ID: 'artifact-1',
        Name: 'Sales Analysis Report',
        Type: 'Report'
      },
      artifactVersion: {
        ID: 'version-1',
        VersionNumber: 2
      }
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
          <mj-artifact-message-card-mock
            [artifact]="artifact"
            [artifactVersion]="artifactVersion">
          </mj-artifact-message-card-mock>

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
    template: `
      <div class="story-column story-width-md">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Artifact name (no version override):</div>
          <mj-artifact-message-card-mock
            [artifact]="{ ID: '1', Name: 'analysis.ts', Type: 'Code' }"
            [artifactVersion]="{ ID: 'v1', VersionNumber: 1, Name: null }">
          </mj-artifact-message-card-mock>
        </div>

        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Version-specific name override:</div>
          <mj-artifact-message-card-mock
            [artifact]="{ ID: '1', Name: 'analysis.ts', Type: 'Code' }"
            [artifactVersion]="{ ID: 'v2', VersionNumber: 2, Name: 'analysis-v2-refactored.ts' }">
          </mj-artifact-message-card-mock>
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
      artifact: {
        ID: 'artifact-1',
        Name: 'component.tsx',
        Type: 'Code'
      },
      artifactVersion: {
        ID: 'version-1',
        VersionNumber: 4
      }
    },
    template: `
      <div class="story-container story-column story-width-md">
        <div>
          <div class="story-caption-sm story-row story-gap-sm" style="margin-bottom: 8px;">
            <i class="fa-solid fa-spinner fa-spin story-text-info"></i>
            Loading State
          </div>
          <mj-artifact-message-card-mock [loading]="true"></mj-artifact-message-card-mock>
        </div>

        <div>
          <div class="story-caption-sm story-row story-gap-sm" style="margin-bottom: 8px;">
            <i class="fa-solid fa-exclamation-circle story-text-danger"></i>
            Error State
          </div>
          <mj-artifact-message-card-mock [error]="true"></mj-artifact-message-card-mock>
        </div>

        <div>
          <div class="story-caption-sm story-row story-gap-sm" style="margin-bottom: 8px;">
            <i class="fa-solid fa-check-circle story-text-success"></i>
            Success State
          </div>
          <mj-artifact-message-card-mock
            [artifact]="artifact"
            [artifactVersion]="artifactVersion">
          </mj-artifact-message-card-mock>
        </div>
      </div>
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
              <td><i class="fa-solid fa-code story-text-muted"></i></td>
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
              <td><i class="fa-solid fa-chart-bar story-text-muted"></i></td>
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
              <td><i class="fa-solid fa-gauge story-text-muted"></i></td>
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
