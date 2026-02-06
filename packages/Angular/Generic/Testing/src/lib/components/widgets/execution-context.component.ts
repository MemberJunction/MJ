import { Component, Input, ChangeDetectionStrategy, OnChanges, SimpleChanges } from '@angular/core';
import { RunContextDetails } from '@memberjunction/testing-engine-base';

/**
 * Displays execution context information for a test run or test suite run.
 * Shows machine info, user info, and detailed runtime context in a clean, organized layout.
 */
@Component({
  standalone: false,
  selector: 'mj-execution-context',
  template: `
    <div class="execution-context">
      <!-- Machine & User Section -->
      <div class="context-section">
        <div class="section-header">
          <i class="fas fa-server"></i>
          <h4>Machine & User</h4>
        </div>
        <div class="context-grid">
          @if (machineName) {
            <div class="context-item">
              <div class="context-icon">
                <i class="fas fa-desktop"></i>
              </div>
              <div class="context-content">
                <div class="context-label">Machine Name</div>
                <div class="context-value monospace">{{ machineName }}</div>
              </div>
            </div>
          }
    
          @if (machineId) {
            <div class="context-item">
              <div class="context-icon">
                <i class="fas fa-fingerprint"></i>
              </div>
              <div class="context-content">
                <div class="context-label">Machine ID</div>
                <div class="context-value monospace">{{ machineId }}</div>
              </div>
            </div>
          }
    
          @if (runByUserName) {
            <div class="context-item">
              <div class="context-icon">
                <i class="fas fa-user"></i>
              </div>
              <div class="context-content">
                <div class="context-label">Run By</div>
                <div class="context-value">{{ runByUserName }}</div>
              </div>
            </div>
          }
    
          @if (runByUserEmail) {
            <div class="context-item">
              <div class="context-icon">
                <i class="fas fa-envelope"></i>
              </div>
              <div class="context-content">
                <div class="context-label">Email</div>
                <div class="context-value">{{ runByUserEmail }}</div>
              </div>
            </div>
          }
        </div>
      </div>
    
      <!-- Runtime Environment Section -->
      @if (contextDetails) {
        <div class="context-section">
          <div class="section-header">
            <i class="fas fa-cogs"></i>
            <h4>Runtime Environment</h4>
          </div>
          <div class="context-grid">
            @if (contextDetails.osType) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fas" [ngClass]="getOSIcon()"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">Operating System</div>
                  <div class="context-value">{{ getOSDisplayName() }}</div>
                  @if (contextDetails.osVersion) {
                    <div class="context-detail">{{ contextDetails.osVersion }}</div>
                  }
                </div>
              </div>
            }
            @if (contextDetails.nodeVersion) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fab fa-node-js"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">Node.js</div>
                  <div class="context-value">{{ contextDetails.nodeVersion }}</div>
                </div>
              </div>
            }
            @if (contextDetails.timezone) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fas fa-globe"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">Timezone</div>
                  <div class="context-value">{{ contextDetails.timezone }}</div>
                </div>
              </div>
            }
            @if (contextDetails.locale) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fas fa-language"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">Locale</div>
                  <div class="context-value">{{ contextDetails.locale }}</div>
                </div>
              </div>
            }
            @if (contextDetails.ipAddress) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fas fa-network-wired"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">IP Address</div>
                  <div class="context-value monospace">{{ contextDetails.ipAddress }}</div>
                </div>
              </div>
            }
          </div>
        </div>
      }
    
      <!-- CI/CD Section -->
      @if (hasCIInfo()) {
        <div class="context-section ci-section">
          <div class="section-header">
            <i class="fas fa-rocket"></i>
            <h4>CI/CD Pipeline</h4>
          </div>
          <div class="ci-banner" [ngClass]="getCIProviderClass()">
            <div class="ci-provider">
              <i class="fab" [ngClass]="getCIProviderIcon()"></i>
              <span class="ci-provider-name">{{ contextDetails?.ciProvider }}</span>
            </div>
          </div>
          <div class="context-grid">
            @if (contextDetails?.pipelineId) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fas fa-project-diagram"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">Pipeline</div>
                  <div class="context-value">{{ contextDetails?.pipelineId }}</div>
                </div>
              </div>
            }
            @if (contextDetails?.buildNumber) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fas fa-hashtag"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">Build Number</div>
                  <div class="context-value monospace">{{ contextDetails?.buildNumber }}</div>
                </div>
              </div>
            }
            @if (contextDetails?.branch) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fas fa-code-branch"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">Branch</div>
                  <div class="context-value monospace">{{ contextDetails?.branch }}</div>
                </div>
              </div>
            }
            @if (contextDetails?.prNumber) {
              <div class="context-item">
                <div class="context-icon">
                  <i class="fas fa-code-pull-request"></i>
                </div>
                <div class="context-content">
                  <div class="context-label">Pull Request</div>
                  <div class="context-value">#{{ contextDetails?.prNumber }}</div>
                </div>
              </div>
            }
          </div>
        </div>
      }
    
      <!-- Empty State -->
      @if (!hasAnyData()) {
        <div class="empty-state">
          <div class="empty-icon">
            <i class="fas fa-server"></i>
          </div>
          <h3>No Execution Context</h3>
          <p>Execution context information is not available for this run.</p>
        </div>
      }
    </div>
    `,
  styles: [`
    .execution-context {
      padding: 20px;
    }

    .context-section {
      margin-bottom: 24px;
      background: var(--mj-card-background, #ffffff);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--mj-border-color, #e5e7eb);
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--mj-border-color, #e5e7eb);
    }

    .section-header i {
      font-size: 18px;
      color: var(--mj-primary-color, #3b82f6);
      width: 24px;
      text-align: center;
    }

    .section-header h4 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-color, #1f2937);
    }

    .context-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .context-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: var(--mj-background-subtle, #f9fafb);
      border-radius: 8px;
      transition: background-color 0.2s;
    }

    .context-item:hover {
      background: var(--mj-background-hover, #f3f4f6);
    }

    .context-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--mj-primary-color-light, #dbeafe);
      color: var(--mj-primary-color, #3b82f6);
      flex-shrink: 0;
    }

    .context-icon i {
      font-size: 16px;
    }

    .context-content {
      flex: 1;
      min-width: 0;
    }

    .context-label {
      font-size: 12px;
      color: var(--mj-text-secondary, #6b7280);
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .context-value {
      font-size: 14px;
      font-weight: 500;
      color: var(--mj-text-color, #1f2937);
      word-break: break-word;
    }

    .context-value.monospace {
      font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
      font-size: 13px;
    }

    .context-detail {
      font-size: 12px;
      color: var(--mj-text-secondary, #6b7280);
      margin-top: 2px;
    }

    /* CI/CD Section Styles */
    .ci-section .section-header i {
      color: #f59e0b;
    }

    .ci-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      background: linear-gradient(135deg, #1f2937, #374151);
    }

    .ci-banner.github {
      background: linear-gradient(135deg, #24292e, #40444d);
    }

    .ci-banner.azure {
      background: linear-gradient(135deg, #0078d4, #106ebe);
    }

    .ci-banner.jenkins {
      background: linear-gradient(135deg, #d33833, #e6635c);
    }

    .ci-banner.circleci {
      background: linear-gradient(135deg, #343434, #4a4a4a);
    }

    .ci-banner.gitlab {
      background: linear-gradient(135deg, #fc6d26, #e24329);
    }

    .ci-banner.travis {
      background: linear-gradient(135deg, #3eaaaf, #67c2b1);
    }

    .ci-provider {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #ffffff;
    }

    .ci-provider i {
      font-size: 24px;
    }

    .ci-provider-name {
      font-size: 16px;
      font-weight: 600;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--mj-text-secondary, #6b7280);
    }

    .empty-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--mj-background-subtle, #f9fafb);
    }

    .empty-icon i {
      font-size: 28px;
      color: var(--mj-text-tertiary, #9ca3af);
    }

    .empty-state h3 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 600;
      color: var(--mj-text-color, #1f2937);
    }

    .empty-state p {
      margin: 0;
      font-size: 14px;
    }

    /* Node.js icon color */
    .fa-node-js {
      color: #68a063 !important;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExecutionContextComponent implements OnChanges {
  /** Machine hostname */
  @Input() machineName: string | null = null;

  /** Machine ID (MAC address) */
  @Input() machineId: string | null = null;

  /** User name who ran the test */
  @Input() runByUserName: string | null = null;

  /** User email who ran the test */
  @Input() runByUserEmail: string | null = null;

  /** JSON string of RunContextDetails */
  @Input() runContextDetailsJson: string | null = null;

  /** Parsed context details */
  contextDetails: RunContextDetails | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['runContextDetailsJson']) {
      this.parseContextDetails();
    }
  }

  private parseContextDetails(): void {
    if (this.runContextDetailsJson) {
      try {
        this.contextDetails = JSON.parse(this.runContextDetailsJson) as RunContextDetails;
      } catch {
        this.contextDetails = null;
      }
    } else {
      this.contextDetails = null;
    }
  }

  hasAnyData(): boolean {
    return !!(
      this.machineName ||
      this.machineId ||
      this.runByUserName ||
      this.runByUserEmail ||
      this.contextDetails
    );
  }

  hasCIInfo(): boolean {
    return !!(
      this.contextDetails?.ciProvider ||
      this.contextDetails?.pipelineId ||
      this.contextDetails?.buildNumber ||
      this.contextDetails?.branch ||
      this.contextDetails?.prNumber
    );
  }

  getOSIcon(): string {
    const osType = this.contextDetails?.osType?.toLowerCase();
    if (osType === 'darwin') return 'fa-apple';
    if (osType === 'linux') return 'fa-linux';
    if (osType === 'win32' || osType === 'windows') return 'fa-windows';
    return 'fa-desktop';
  }

  getOSDisplayName(): string {
    const osType = this.contextDetails?.osType?.toLowerCase();
    if (osType === 'darwin') return 'macOS';
    if (osType === 'linux') return 'Linux';
    if (osType === 'win32' || osType === 'windows') return 'Windows';
    return this.contextDetails?.osType || 'Unknown';
  }

  getCIProviderClass(): string {
    const provider = this.contextDetails?.ciProvider?.toLowerCase() || '';
    if (provider.includes('github')) return 'github';
    if (provider.includes('azure')) return 'azure';
    if (provider.includes('jenkins')) return 'jenkins';
    if (provider.includes('circle')) return 'circleci';
    if (provider.includes('gitlab')) return 'gitlab';
    if (provider.includes('travis')) return 'travis';
    return '';
  }

  getCIProviderIcon(): string {
    const provider = this.contextDetails?.ciProvider?.toLowerCase() || '';
    if (provider.includes('github')) return 'fa-github';
    if (provider.includes('azure')) return 'fa-microsoft';
    if (provider.includes('jenkins')) return 'fa-jenkins';
    if (provider.includes('circle')) return 'fa-circle';
    if (provider.includes('gitlab')) return 'fa-gitlab';
    if (provider.includes('travis')) return 'fa-travis';
    return 'fa-rocket';
  }
}
