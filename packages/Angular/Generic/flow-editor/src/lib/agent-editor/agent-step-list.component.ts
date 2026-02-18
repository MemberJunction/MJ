import { Component, Input, Output, EventEmitter, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';

/**
 * Tabular list view of agent steps and paths.
 * Alternative to the visual flow canvas — useful for quick overview and bulk editing.
 */
@Component({
  standalone: false,
  selector: 'mj-agent-step-list',
  template: `
    <div class="mj-step-list">
      <!-- Steps Section -->
      <div class="mj-step-list-section">
        <div class="mj-step-list-section-header">
          <h4><i class="fa-solid fa-circle-nodes"></i> Steps ({{ Steps.length }})</h4>
        </div>
        <div class="mj-step-list-table-wrap">
          @if (Steps.length > 0) {
            <table class="mj-step-list-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>Configured</th>
                </tr>
              </thead>
              <tbody>
                @for (step of Steps; track step) {
                  <tr
                    [class.mj-step-list-row--selected]="SelectedStepID === step.ID"
                    (click)="StepClicked.emit(step)">
                    <td class="mj-step-list-name">{{ step.Name }}</td>
                    <td>
                      <span class="mj-step-list-type-badge" [attr.data-type]="step.StepType">
                        {{ step.StepType }}
                      </span>
                    </td>
                    <td>
                      <span class="mj-step-list-status" [attr.data-status]="step.Status">
                        {{ step.Status }}
                      </span>
                    </td>
                    <td>
                      @if (step.StartingStep) {
                        <i class="fa-solid fa-check mj-step-list-check"></i>
                      }
                    </td>
                    <td class="mj-step-list-configured">{{ getConfiguredItem(step) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
          @if (Steps.length === 0) {
            <div class="mj-step-list-empty">
              No steps defined
            </div>
          }
        </div>
      </div>
    
      <!-- Paths Section -->
      <div class="mj-step-list-section">
        <div class="mj-step-list-section-header">
          <h4><i class="fa-solid fa-link"></i> Paths ({{ Paths.length }})</h4>
        </div>
        <div class="mj-step-list-table-wrap">
          @if (Paths.length > 0) {
            <table class="mj-step-list-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Condition</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                @for (path of Paths; track path) {
                  <tr>
                    <td>{{ path.OriginStep }}</td>
                    <td>{{ path.DestinationStep }}</td>
                    <td class="mj-step-list-condition">{{ path.Condition || '(always)' }}</td>
                    <td>{{ path.Priority }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
          @if (Paths.length === 0) {
            <div class="mj-step-list-empty">
              No paths defined
            </div>
          }
        </div>
      </div>
    </div>
    `,
  styles: [`
    .mj-step-list {
      padding: 16px;
      overflow-y: auto;
      height: 100%;
    }

    .mj-step-list-section {
      margin-bottom: 24px;
    }

    .mj-step-list-section-header h4 {
      font-size: 14px;
      font-weight: 600;
      color: #334155;
      margin: 0 0 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      i { font-size: 13px; color: #64748b; }
    }

    .mj-step-list-table-wrap {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .mj-step-list-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;

      th {
        background: #f8fafc;
        padding: 8px 12px;
        text-align: left;
        font-weight: 600;
        color: #64748b;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        border-bottom: 1px solid #e2e8f0;
      }

      td {
        padding: 8px 12px;
        color: #334155;
        border-bottom: 1px solid #f1f5f9;
      }

      tbody tr {
        cursor: pointer;
        transition: background-color 0.1s ease;
        &:hover { background: #f8fafc; }
        &:last-child td { border-bottom: none; }
      }
    }

    .mj-step-list-row--selected {
      background: #eff6ff !important;
    }

    .mj-step-list-name { font-weight: 500; }

    .mj-step-list-type-badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 4px;
      background: #f1f5f9;
      color: #475569;
    }

    .mj-step-list-status {
      font-size: 11px;
      font-weight: 500;
      &[data-status="Active"] { color: #10b981; }
      &[data-status="Disabled"] { color: #94a3b8; }
      &[data-status="Pending"] { color: #f59e0b; }
    }

    .mj-step-list-check { color: #10b981; font-size: 12px; }

    .mj-step-list-configured {
      color: #64748b;
      font-size: 12px;
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mj-step-list-condition {
      font-family: 'SF Mono', monospace;
      font-size: 11px;
      color: #64748b;
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mj-step-list-empty {
      padding: 24px;
      text-align: center;
      color: #94a3b8;
      font-size: 13px;
    }
  `],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentStepListComponent {
  @Input() Steps: MJAIAgentStepEntity[] = [];
  @Input() Paths: MJAIAgentStepPathEntity[] = [];
  @Input() SelectedStepID: string | null = null;

  @Output() StepClicked = new EventEmitter<MJAIAgentStepEntity>();

  getConfiguredItem(step: MJAIAgentStepEntity): string {
    switch (step.StepType) {
      case 'Action': return step.Action || '—';
      case 'Prompt': return step.Prompt || '—';
      case 'Sub-Agent': return step.SubAgent || '—';
      case 'ForEach':
      case 'While': return `${step.LoopBodyType ?? 'Action'} loop`;
      default: return '—';
    }
  }
}
