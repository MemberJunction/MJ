import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { AIAgentRunEntity } from '@memberjunction/core-entities';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { DialogService } from '../../services/dialog.service';
import { AgentStateService, AgentStatus, AgentWithStatus } from '../../services/agent-state.service';

interface AgentProcess extends AgentWithStatus {
  expanded: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-agent-process-panel',
  template: `
    @if (activeProcesses.length > 0) {
      <div class="agent-panel" [class.minimized]="isMinimized">
        <div class="panel-header">
          <h3>
            <i class="fas fa-robot"></i>
            Active Agents ({{ activeProcesses.length }})
          </h3>
          <div class="header-actions">
            <button class="header-btn" (click)="isMinimized = !isMinimized" [title]="isMinimized ? 'Expand' : 'Minimize'">
              <i class="fas" [ngClass]="isMinimized ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </button>
          </div>
        </div>

        @if (!isMinimized) {
          <div class="panel-content">
            @for (process of activeProcesses; track process.run.ID) {
              <div class="process-item">
                <div class="process-header" (click)="toggleProcess(process)">
                  <div class="process-info">
                    <div class="agent-avatar-small"
                         [class.status-acknowledging]="process.status === 'acknowledging'"
                         [class.status-working]="process.status === 'working'"
                         [class.status-completing]="process.status === 'completing'"
                         [class.status-completed]="process.status === 'completed'"
                         [class.status-error]="process.status === 'error'">
                      <i class="fas fa-robot"></i>
                      @if (process.status !== 'completed') {
                        <div class="pulse-dot"></div>
                      }
                    </div>
                    <div class="agent-details">
                      <span class="process-name">{{ process.run.Agent || 'Agent' }}</span>
                      <span class="process-status" [class]="'status-' + process.status">
                        {{ getStatusText(process.status) }}
                      </span>
                    </div>
                    @if (process.confidence != null) {
                      <div class="confidence-indicator" [title]="'Confidence: ' + (process.confidence * 100).toFixed(0) + '%'">
                        <i class="fas fa-gauge-high"></i>
                        <span>{{ (process.confidence * 100).toFixed(0) }}%</span>
                      </div>
                    }
                  </div>
                  <i class="fas" [ngClass]="process.expanded ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                </div>

                @if (process.expanded) {
                  <div class="process-details">
                    @if (process.run.StartedAt) {
                      <div class="detail-row">
                        <i class="fas fa-clock"></i>
                        <span>Started: {{ process.run.StartedAt | date:'short' }}</span>
                      </div>
                    }
                    @if (getElapsedTime(process.run)) {
                      <div class="detail-row">
                        <i class="fas fa-hourglass-half"></i>
                        <span>Duration: {{ getElapsedTime(process.run) }}</span>
                      </div>
                    }
                    <div class="process-actions">
                      @if (process.run.Status === 'Running' || process.run.Status === 'Paused') {
                        <button class="btn-action btn-cancel" (click)="onCancelProcess(process)">
                          <i class="fas fa-stop"></i> Cancel
                        </button>
                      }
                      <button class="btn-action" (click)="onViewDetails(process)">
                        <i class="fas fa-external-link-alt"></i> View Details
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .agent-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 450px;
      max-height: 600px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      z-index: 1000;
      transition: all 300ms ease;
      overflow: hidden;
    }
    .agent-panel.minimized { width: 280px; max-height: 60px; }

    .panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, #F9FAFB, #F3F4F6);
      border-radius: 12px 12px 0 0;
    }
    .panel-header h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #111827;
    }
    .header-actions { display: flex; gap: 4px; }
    .header-btn {
      padding: 8px;
      background: transparent;
      border: none;
      cursor: pointer;
      border-radius: 6px;
      color: #6B7280;
      transition: all 150ms ease;
    }
    .header-btn:hover { background: rgba(0,0,0,0.08); color: #111827; }

    .panel-content {
      max-height: 500px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .process-item {
      border-bottom: 1px solid #F3F4F6;
      transition: background 150ms ease;
    }
    .process-item:last-child { border-bottom: none; }
    .process-item:hover { background: #FAFAFA; }

    .process-header {
      padding: 14px 20px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .process-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .agent-avatar-small {
      position: relative;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: white;
      flex-shrink: 0;
    }

    .agent-avatar-small.status-acknowledging { background: linear-gradient(135deg, #3B82F6, #2563EB); }
    .agent-avatar-small.status-working { background: linear-gradient(135deg, #F59E0B, #D97706); }
    .agent-avatar-small.status-completing { background: linear-gradient(135deg, #10B981, #059669); }
    .agent-avatar-small.status-completed { background: linear-gradient(135deg, #6B7280, #4B5563); opacity: 0.6; }
    .agent-avatar-small.status-error { background: linear-gradient(135deg, #EF4444, #DC2626); }

    .pulse-dot {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #10B981;
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.5); }
    }

    .agent-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }

    .process-name {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .process-status {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: inline-block;
      width: fit-content;
    }

    .status-acknowledging { background: #DBEAFE; color: #1E40AF; }
    .status-working { background: #FEF3C7; color: #B45309; }
    .status-completing { background: #D1FAE5; color: #065F46; }
    .status-completed { background: #F3F4F6; color: #6B7280; }
    .status-error { background: #FEE2E2; color: #991B1B; }

    .confidence-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: #F3F4F6;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #374151;
      flex-shrink: 0;
    }

    .process-details {
      padding: 0 20px 16px 68px;
      animation: slideDown 200ms ease;
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .detail-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      font-size: 13px;
      color: #6B7280;
    }
    .detail-row i {
      width: 16px;
      color: #9CA3AF;
      text-align: center;
    }

    .process-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #F3F4F6;
    }

    .btn-action {
      padding: 8px 14px;
      background: #3B82F6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 150ms ease;
    }
    .btn-action:hover {
      background: #2563EB;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
    }

    .btn-cancel {
      background: #EF4444;
    }
    .btn-cancel:hover {
      background: #DC2626;
      box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
    }
  `]
})
export class AgentProcessPanelComponent implements OnInit, OnDestroy {
  @Input() conversationId?: string;
  @Input() currentUser!: UserInfo;

  public activeProcesses: AgentProcess[] = [];
  public isMinimized: boolean = false;

  private subscription?: Subscription;

  constructor(
    private dialogService: DialogService,
    private agentStateService: AgentStateService
  ) {}

  ngOnInit(): void {
    // Start polling for active agents
    this.agentStateService.startPolling(this.currentUser, this.conversationId);

    // Subscribe to active agents
    this.subscription = this.agentStateService
      .getActiveAgents(this.conversationId)
      .subscribe(agents => {
        // Preserve expanded state for existing processes
        this.activeProcesses = agents.map(agent => {
          const existing = this.activeProcesses.find(p => p.run.ID === agent.run.ID);
          return {
            ...agent,
            expanded: existing ? existing.expanded : false
          };
        });
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    // Note: We don't stop polling here as other components may be using the service
  }

  toggleProcess(process: AgentProcess): void {
    process.expanded = !process.expanded;
  }

  getStatusText(status: AgentStatus): string {
    switch (status) {
      case 'acknowledging': return 'Acknowledging';
      case 'working': return 'Working';
      case 'completing': return 'Completing';
      case 'completed': return 'Completed';
      case 'error': return 'Error';
      default: return 'Active';
    }
  }

  getElapsedTime(run: AIAgentRunEntity): string | null {
    if (!run.StartedAt) return null;

    const start = new Date(run.StartedAt).getTime();
    const end = run.CompletedAt ? new Date(run.CompletedAt).getTime() : Date.now();
    const elapsed = end - start;

    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  async onCancelProcess(process: AgentProcess): Promise<void> {
    const confirmed = await this.dialogService.confirm({
      title: 'Cancel Agent',
      message: `Cancel agent "${process.run.Agent || 'Agent'}"?`,
      okText: 'Cancel Agent',
      cancelText: 'Keep Running'
    });

    if (!confirmed) return;

    try {
      const success = await this.agentStateService.cancelAgent(process.run.ID);
      if (!success) {
        await this.dialogService.alert('Error', 'Failed to cancel agent process');
      }
    } catch (error) {
      console.error('Failed to cancel agent process:', error);
      await this.dialogService.alert('Error', 'Failed to cancel agent process');
    }
  }

  onViewDetails(process: AgentProcess): void {
    // TODO: Navigate to agent run details page or open modal
    console.log('View agent run details:', process.run.ID);
  }
}