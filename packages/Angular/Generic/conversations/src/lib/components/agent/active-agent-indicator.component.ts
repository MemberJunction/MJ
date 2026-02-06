import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { AIAgentRunEntity } from '@memberjunction/core-entities';
import { AgentStateService, AgentStatus } from '../../services/agent-state.service';
import { Subscription } from 'rxjs';

/**
 * Displays active agent indicators in the chat header with status animations
 * Shows multiple agents with avatars, status colors, and click-to-expand functionality
 */
@Component({
  standalone: false,
  selector: 'mj-active-agent-indicator',
  template: `
    <div class="active-agents-container" *ngIf="activeAgents.length > 0">
      <span class="active-agents-label">Active:</span>
      <div class="agents-wrapper" [class.expanded]="isExpanded">
        @for (agent of displayAgents; track agent.run.ID) {
          <div class="agent-avatar"
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
            @if (agent.confidence != null) {
              <div class="confidence-badge" [title]="'Confidence: ' + (agent.confidence * 100).toFixed(0) + '%'">
                {{ (agent.confidence * 100).toFixed(0) }}%
              </div>
            }
          </div>
        }

        @if (activeAgents.length > maxVisibleAgents && !isExpanded) {
          <button class="more-agents" (click)="toggleExpanded()" [title]="'Show all ' + activeAgents.length + ' agents'">
            +{{ activeAgents.length - maxVisibleAgents }}
          </button>
        }
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
export class ActiveAgentIndicatorComponent implements OnInit, OnDestroy {
  @Input() conversationId?: string;
  @Input() currentUser!: UserInfo;
  @Input() maxVisibleAgents: number = 3;

  @Output() togglePanel = new EventEmitter<void>();
  @Output() agentSelected = new EventEmitter<AIAgentRunEntity>();

  public activeAgents: Array<{ run: AIAgentRunEntity; status: AgentStatus; confidence: number | null }> = [];
  public isExpanded: boolean = false;

  private subscription?: Subscription;

  constructor(private agentStateService: AgentStateService) {}

  ngOnInit(): void {
    // Subscribe to active agents for this conversation
    this.subscription = this.agentStateService
      .getActiveAgents(this.conversationId)
      .subscribe(agents => {
        this.activeAgents = agents;
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  get displayAgents(): Array<{ run: AIAgentRunEntity; status: AgentStatus; confidence: number | null }> {
    if (this.isExpanded) {
      return this.activeAgents;
    }
    return this.activeAgents.slice(0, this.maxVisibleAgents);
  }

  getAgentTooltip(agent: { run: AIAgentRunEntity; status: AgentStatus; confidence: number | null }): string {
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

  onAgentClick(agent: { run: AIAgentRunEntity; status: AgentStatus; confidence: number | null }): void {
    this.agentSelected.emit(agent.run);
  }

  onTogglePanel(): void {
    this.togglePanel.emit();
  }
}
