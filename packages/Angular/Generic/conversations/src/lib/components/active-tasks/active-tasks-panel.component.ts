import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { ActiveTasksService, ActiveTask } from '../../services/active-tasks.service';

/**
 * Panel component that displays currently running agent tasks.
 * Shows as a floating panel in bottom-right corner when tasks are active.
 */
@Component({
  standalone: false,
  selector: 'mj-active-tasks-panel',
  template: `
    @if ((taskCount$ | async)! > 0) {
      <div class="active-tasks-panel">
        <!-- Migrated from a bespoke header/chevron + @if(isExpanded) disclosure to
             mj-accordion-panel. The floating fixed-position wrapper is preserved; only
             the header→task-list disclosure became the accordion (content disclosure,
             not a whole-panel collapse). -->
        <mj-accordion-panel Size="sm" [FlushBody]="true" [(Expanded)]="isExpanded">
          <ng-template mjAccordionTitle>
            <i class="fas fa-tasks active-tasks-title-icon"></i>
            <span>Active Tasks ({{ taskCount$ | async }})</span>
          </ng-template>
          <ng-template mjAccordionBody>
            <div class="panel-content">
              @for (task of (tasks$ | async); track task) {
                <div class="task-item">
                  <div class="task-header">
                    <i class="fas fa-circle-notch fa-spin"></i>
                    <span class="task-agent">{{ task.agentName }}</span>
                    <span class="task-elapsed">{{ getElapsedTime(task) }}</span>
                  </div>
                  <div class="task-status">{{ getTrimmedStatus(task.status) }}</div>
                </div>
              }
            </div>
          </ng-template>
        </mj-accordion-panel>
      </div>
    }
    `,
  styles: [`
    .active-tasks-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 320px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
    }

    /* Removed bespoke .panel-header chrome (header bar, hover, chevron, flex span) —
       the disclosure header is now owned by mj-accordion-panel. Only the title icon's
       brand color is preserved below. */
    .active-tasks-title-icon {
      color: var(--mj-brand-primary);
    }

    .panel-content {
      max-height: 300px;
      overflow-y: auto;
    }

    .task-item {
      padding: 12px 16px;
      border-bottom: 1px solid var(--mj-border-default);
    }

    .task-item:last-child {
      border-bottom: none;
    }

    .task-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .task-header i {
      color: var(--mj-brand-primary);
      font-size: 14px;
    }

    .task-agent {
      flex: 1;
      font-weight: 600;
      color: var(--mj-text-primary);
      font-size: 14px;
    }

    .task-elapsed {
      font-size: 12px;
      color: var(--mj-text-muted);
      font-weight: 500;
    }

    .task-status {
      font-size: 13px;
      color: var(--mj-text-muted);
      padding-left: 22px;
    }
  `]
})
export class ActiveTasksPanelComponent {
  tasks$: Observable<ActiveTask[]>;
  taskCount$: Observable<number>;
  isExpanded = true;

  constructor(private activeTasksService: ActiveTasksService) {
    this.tasks$ = this.activeTasksService.tasks$;
    this.taskCount$ = this.activeTasksService.taskCount$;
  }

  getElapsedTime(task: ActiveTask): string {
    const elapsed = Date.now() - task.startTime;
    const seconds = Math.floor(elapsed / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  getTrimmedStatus(status: string): string {
    const maxLength = 50;
    if (status.length <= maxLength) {
      return status;
    }
    return status.substring(0, maxLength) + '...';
  }
}
