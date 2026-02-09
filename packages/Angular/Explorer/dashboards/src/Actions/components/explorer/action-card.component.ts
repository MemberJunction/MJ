import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { ActionCategoryEntity, ActionExecutionLogEntity } from '@memberjunction/core-entities';
import { ActionEntityExtended } from '@memberjunction/actions-base';
import { RunView } from '@memberjunction/core';

export interface ActionExecutionStats {
  totalExecutions: number;
  successRate: number;
  lastExecuted: Date | null;
  isLoading: boolean;
  isLoaded: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-action-card',
  templateUrl: './action-card.component.html',
  styleUrls: ['./action-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActionCardComponent {
  @Input() Action!: ActionEntityExtended;
  @Input() Categories: Map<string, ActionCategoryEntity> = new Map();
  @Output() ActionClick = new EventEmitter<ActionEntityExtended>();
  @Output() EditClick = new EventEmitter<ActionEntityExtended>();
  @Output() RunClick = new EventEmitter<ActionEntityExtended>();
  @Output() CategoryClick = new EventEmitter<string>();

  public IsExpanded = false;
  public ExecutionStats: ActionExecutionStats = {
    totalExecutions: 0,
    successRate: 0,
    lastExecuted: null,
    isLoading: false,
    isLoaded: false
  };

  constructor(private cdr: ChangeDetectorRef) {}

  public onCardClick(): void {
    this.ActionClick.emit(this.Action);
  }

  public onEditClick(event: MouseEvent): void {
    event.stopPropagation();
    this.EditClick.emit(this.Action);
  }

  public onRunClick(event: MouseEvent): void {
    event.stopPropagation();
    this.RunClick.emit(this.Action);
  }

  public onCategoryClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.Action.CategoryID) {
      this.CategoryClick.emit(this.Action.CategoryID);
    }
  }

  public toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.IsExpanded = !this.IsExpanded;

    if (this.IsExpanded && !this.ExecutionStats.isLoaded && !this.ExecutionStats.isLoading) {
      this.loadExecutionStats();
    }
  }

  private async loadExecutionStats(): Promise<void> {
    this.ExecutionStats.isLoading = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();

      // Load both executions and result codes in parallel
      const [executionsResult, resultCodesResult] = await rv.RunViews([
        {
          EntityName: 'Action Execution Logs',
          ExtraFilter: `ActionID='${this.Action.ID}'`,
          OrderBy: 'StartedAt DESC',
          MaxRows: 100,
          ResultType: 'simple',
          Fields: ['ID', 'ResultCode', 'StartedAt']
        },
        {
          EntityName: 'Action Result Codes',
          ExtraFilter: `ActionID='${this.Action.ID}'`,
          ResultType: 'simple',
          Fields: ['ResultCode', 'IsSuccess']
        }
      ]);

      if (executionsResult.Success && executionsResult.Results) {
        const executions = executionsResult.Results as { ID: string; ResultCode: string; StartedAt: Date }[];

        // Build a map of result codes to IsSuccess
        const successMap = new Map<string, boolean>();
        if (resultCodesResult.Success && resultCodesResult.Results) {
          const resultCodes = resultCodesResult.Results as { ResultCode: string; IsSuccess: boolean }[];
          resultCodes.forEach(rc => {
            successMap.set(rc.ResultCode, rc.IsSuccess);
          });
        }

        // Count successful executions using result code lookup
        const successful = executions.filter(e => {
          if (!e.ResultCode) return false;
          // Look up the result code in the map
          const isSuccess = successMap.get(e.ResultCode);
          // If result code is defined in the map, use it; otherwise fall back to heuristic
          if (isSuccess !== undefined) {
            return isSuccess;
          }
          // Fallback heuristic for unknown result codes
          const code = e.ResultCode.toLowerCase();
          return code === 'success' || code === 'ok' || code === 'completed';
        }).length;

        this.ExecutionStats = {
          totalExecutions: executions.length,
          successRate: executions.length > 0 ? Math.round((successful / executions.length) * 100) : 0,
          lastExecuted: executions.length > 0 ? new Date(executions[0].StartedAt) : null,
          isLoading: false,
          isLoaded: true
        };
      } else {
        this.ExecutionStats.isLoading = false;
        this.ExecutionStats.isLoaded = true;
      }
    } catch (error) {
      console.error('Failed to load execution stats:', error);
      this.ExecutionStats.isLoading = false;
      this.ExecutionStats.isLoaded = true;
    }

    this.cdr.markForCheck();
  }

  public getCategoryName(): string {
    if (!this.Action.CategoryID) return 'Uncategorized';
    return this.Categories.get(this.Action.CategoryID)?.Name || 'Unknown Category';
  }

  public getStatusColor(): 'success' | 'warning' | 'error' | 'info' {
    switch (this.Action.Status) {
      case 'Active': return 'success';
      case 'Pending': return 'warning';
      case 'Disabled': return 'error';
      default: return 'info';
    }
  }

  public getActionIcon(): string {
    // Use custom icon if set, otherwise derive from type
    if (this.Action.IconClass) {
      return this.Action.IconClass;
    }
    switch (this.Action.Type) {
      case 'Generated': return 'fa-solid fa-robot';
      case 'Custom': return 'fa-solid fa-code';
      default: return 'fa-solid fa-bolt';
    }
  }

  public getTypeLabel(): string {
    return this.Action.Type === 'Generated' ? 'AI Generated' : 'Custom';
  }

  public getApprovalStatusIcon(): string {
    switch (this.Action.CodeApprovalStatus) {
      case 'Approved': return 'fa-solid fa-check-circle';
      case 'Pending': return 'fa-solid fa-clock';
      case 'Rejected': return 'fa-solid fa-times-circle';
      default: return 'fa-solid fa-question-circle';
    }
  }

  public getApprovalStatusColor(): string {
    switch (this.Action.CodeApprovalStatus) {
      case 'Approved': return 'success';
      case 'Pending': return 'warning';
      case 'Rejected': return 'error';
      default: return 'info';
    }
  }

  public formatDate(date: Date | null): string {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }
}
