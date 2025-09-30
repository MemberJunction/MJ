import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { AIAgentRunEntity } from '@memberjunction/core-entities';
import { interval, Subscription } from 'rxjs';
import { switchMap, filter } from 'rxjs/operators';

interface AgentProcess {
  run: AIAgentRunEntity;
  expanded: boolean;
}

@Component({
  selector: 'mj-agent-process-panel',
  template: `
    <div class="agent-panel" *ngIf="activeProcesses.length > 0" [class.minimized]="isMinimized">
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

      <div class="panel-content" *ngIf="!isMinimized">
        <div *ngFor="let process of activeProcesses" class="process-item">
          <div class="process-header" (click)="toggleProcess(process)">
            <div class="process-info">
              <span class="process-name">{{ process.run.Agent }}</span>
              <span class="process-status" [class]="'status-' + (process.run.Status || 'running').toLowerCase()">
                {{ process.run.Status || 'Running' }}
              </span>
            </div>
            <i class="fas" [ngClass]="process.expanded ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
          </div>

          <div class="process-details" *ngIf="process.expanded">
            <div class="detail-row" *ngIf="process.run.StartedAt">
              <i class="fas fa-clock"></i>
              <span>Started: {{ process.run.StartedAt | date:'short' }}</span>
            </div>
            <div class="process-actions">
              <button class="btn-action" (click)="onCancelProcess(process)" *ngIf="process.run.Status === 'Running'">
                <i class="fas fa-stop"></i> Cancel
              </button>
              <button class="btn-action" (click)="onViewDetails(process)">
                <i class="fas fa-external-link-alt"></i> View Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .agent-panel { position: fixed; bottom: 24px; right: 24px; width: 400px; background: white; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); z-index: 1000; transition: all 200ms ease; }
    .agent-panel.minimized { width: 250px; }
    .panel-header { padding: 16px; border-bottom: 1px solid #D9D9D9; display: flex; justify-content: space-between; align-items: center; background: #F8F8F8; border-radius: 8px 8px 0 0; }
    .panel-header h3 { margin: 0; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .header-actions { display: flex; gap: 4px; }
    .header-btn { padding: 6px; background: transparent; border: none; cursor: pointer; border-radius: 3px; color: #666; }
    .header-btn:hover { background: rgba(0,0,0,0.1); }
    .panel-content { max-height: 400px; overflow-y: auto; }
    .process-item { border-bottom: 1px solid #E8E8E8; }
    .process-item:last-child { border-bottom: none; }
    .process-header { padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 150ms ease; }
    .process-header:hover { background: #F9F9F9; }
    .process-info { display: flex; align-items: center; gap: 12px; flex: 1; }
    .process-name { font-size: 14px; font-weight: 500; }
    .process-status { padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 500; text-transform: uppercase; }
    .status-running { background: #E3F2FD; color: #1976D2; }
    .status-completed { background: #E8F5E9; color: #388E3C; }
    .status-error { background: #FFEBEE; color: #D32F2F; }
    .process-details { padding: 0 16px 12px 16px; }
    .detail-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; color: #666; }
    .detail-row i { width: 16px; color: #999; }
    .process-actions { display: flex; gap: 8px; margin-top: 12px; }
    .btn-action { padding: 6px 12px; background: #0076B6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 6px; }
    .btn-action:hover { background: #005A8C; }
  `]
})
export class AgentProcessPanelComponent implements OnInit, OnDestroy {
  @Input() conversationId?: string;
  @Input() currentUser!: UserInfo;

  public activeProcesses: AgentProcess[] = [];
  public isMinimized: boolean = false;

  private pollSubscription?: Subscription;

  ngOnInit() {
    this.loadActiveProcesses();
    this.startPolling();
  }

  ngOnDestroy() {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
    }
  }

  private startPolling(): void {
    // Poll every 5 seconds for active process updates
    this.pollSubscription = interval(5000).pipe(
      switchMap(() => this.loadActiveProcesses())
    ).subscribe();
  }

  private async loadActiveProcesses(): Promise<void> {
    try {
      const rv = new RunView();
      let filter = `Status IN ('Running', 'Pending')`;

      if (this.conversationId) {
        filter += ` AND ConversationID='${this.conversationId}'`;
      }

      const result = await rv.RunView<AIAgentRunEntity>({
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: filter,
        OrderBy: 'StartedAt DESC',
        MaxRows: 20,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success) {
        const runs = result.Results || [];

        // Preserve expanded state for existing processes
        const newProcesses: AgentProcess[] = runs.map(run => {
          const existing = this.activeProcesses.find(p => p.run.ID === run.ID);
          return {
            run,
            expanded: existing ? existing.expanded : false
          };
        });

        this.activeProcesses = newProcesses;
      }
    } catch (error) {
      console.error('Failed to load active agent processes:', error);
    }
  }

  toggleProcess(process: AgentProcess): void {
    process.expanded = !process.expanded;
  }

  async onCancelProcess(process: AgentProcess): Promise<void> {
    if (!confirm(`Cancel agent "${process.run.Agent}"?`)) return;

    try {
      process.run.Status = 'Cancelled';
      await process.run.Save();
      await this.loadActiveProcesses();
    } catch (error) {
      console.error('Failed to cancel agent process:', error);
      alert('Failed to cancel agent process');
    }
  }

  onViewDetails(process: AgentProcess): void {
    // TODO: Navigate to agent run details page or open modal
    console.log('View agent run details:', process.run.ID);
  }
}