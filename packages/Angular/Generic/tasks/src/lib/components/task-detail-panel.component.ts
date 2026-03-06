import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';

import { MJTaskEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Task detail panel showing task information, agent details, and agent run
 * Reusable across list and Gantt views
 */
@Component({
  selector: 'mj-task-detail-panel',
  standalone: true,
  imports: [],
  template: `
    <div class="task-detail-panel">
      <div class="detail-header">
        <h3>{{ task.Name }}</h3>
        <button class="close-detail-btn" (click)="closePanel.emit()">
          <i class="fas fa-times"></i>
        </button>
      </div>
    
      <div class="detail-content">
        @if (task.Description) {
          <div class="detail-field">
            <label>Description</label>
            <p>{{ task.Description }}</p>
          </div>
        }
    
        <div class="detail-field">
          <label>Status</label>
          <p>{{ task.Status }}</p>
        </div>
    
        @if (task.PercentComplete != null) {
          <div class="detail-field">
            <label>Progress</label>
            <div class="detail-progress">
              <div class="progress-bar-detail">
                <div class="progress-fill-detail" [style.width.%]="task.PercentComplete"></div>
              </div>
              <span>{{ task.PercentComplete }}%</span>
            </div>
          </div>
        }
    
        @if (task.StartedAt) {
          <div class="detail-field">
            <label>Started</label>
            <p>{{ formatDateTime(task.StartedAt) }}</p>
          </div>
        }
    
        @if (task.DueAt) {
          <div class="detail-field">
            <label>Due</label>
            <p>{{ formatDateTime(task.DueAt) }}</p>
          </div>
        }
    
        @if (task.CompletedAt) {
          <div class="detail-field">
            <label>Completed</label>
            <p>{{ formatDateTime(task.CompletedAt) }}</p>
          </div>
        }
    
        @if (task.User) {
          <div class="detail-field">
            <label>Assigned User</label>
            <p>{{ task.User }}</p>
          </div>
        }
    
        <!-- Agent Information -->
        @if (agent) {
          <div class="detail-field">
            <label>Agent</label>
            <div class="agent-info" (click)="openAgent()">
              <i [class]="'fas fa-' + ('robot')" class="agent-icon"></i>
              <span class="agent-name">{{ agent.Name }}</span>
              <i class="fas fa-external-link-alt link-icon"></i>
            </div>
          </div>
        }
    
        <!-- Agent Run Information -->
        @if (agentRunId) {
          <div class="detail-field">
            <label>Agent Run</label>
            <div class="agent-run-link" (click)="openAgentRun()">
              <span>View Run Details</span>
              <i class="fas fa-external-link-alt link-icon"></i>
            </div>
          </div>
        }
      </div>
    </div>
    `,
  styles: [`
    .task-detail-panel {
      width: 100%;
      height: calc(100% - 45px);
      background: white;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .detail-header {
      padding: 20px;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      background: #F9FAFB;
      flex-shrink: 0;
    }

    .detail-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      flex: 1;
      padding-right: 12px;
    }

    .close-detail-btn {
      background: none;
      border: none;
      color: #6B7280;
      cursor: pointer;
      padding: 4px;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .close-detail-btn:hover {
      background: #E5E7EB;
      color: #111827;
    }

    .detail-content {
      padding: 20px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .detail-field {
      margin-bottom: 20px;
    }

    .detail-field:last-child {
      margin-bottom: 0;
    }

    .detail-field label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .detail-field p {
      margin: 0;
      font-size: 14px;
      color: #111827;
      line-height: 1.5;
    }

    .detail-progress {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-bar-detail {
      flex: 1;
      height: 8px;
      background: #E5E7EB;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill-detail {
      height: calc(100% - 69px);
      background: #3B82F6;
      transition: width 0.3s ease;
    }

    .detail-progress span {
      font-size: 13px;
      font-weight: 600;
      color: #6B7280;
      min-width: 40px;
    }

    .agent-info {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: #F3F4F6;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .agent-info:hover {
      background: #E5E7EB;
    }

    .agent-icon {
      font-size: 18px;
      color: #3B82F6;
    }

    .agent-name {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: #111827;
    }

    .link-icon {
      font-size: 12px;
      color: #6B7280;
    }

    .agent-run-link {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: #F3F4F6;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .agent-run-link:hover {
      background: #E5E7EB;
    }

    .agent-run-link span {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: #111827;
    }
  `]
})
export class TaskDetailPanelComponent implements OnInit, OnChanges {
  @Input() task!: MJTaskEntity;
  @Input() agentRunId: string | null = null;
  @Output() closePanel = new EventEmitter<void>();
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();

  public agent: MJAIAgentEntityExtended | null = null;

  ngOnInit(): void {
    this.loadAgentInfo();
  }

  ngOnChanges(): void {
    this.loadAgentInfo();
  }

  private loadAgentInfo(): void {
    if (!this.task?.AgentID) {
      this.agent = null;
      return;
    }

    // Get agent from AIEngineBase
    const agents = AIEngineBase.Instance.Agents;
    this.agent = agents.find((a: MJAIAgentEntityExtended) => UUIDsEqual(a.ID, this.task.AgentID)) || null;
  }

  public formatDateTime(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  public openAgent(): void {
    if (this.task.AgentID) {
      this.openEntityRecord.emit({
        entityName: 'MJ: AI Agents',
        recordId: this.task.AgentID
      });
    }
  }

  public openAgentRun(): void {
    if (this.agentRunId) {
      this.openEntityRecord.emit({
        entityName: 'MJ: AI Agent Runs',
        recordId: this.agentRunId
      });
    }
  }
}
