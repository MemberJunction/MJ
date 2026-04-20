import { Component, Input, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';

/**
 * Status bar at the bottom of the flow editor showing counts and state.
 */
@Component({
  standalone: false,
  selector: 'mj-flow-status-bar',
  template: `
    <div class="mj-flow-status-bar">
      <span class="mj-flow-status-item">
        <i class="fa-solid fa-circle-nodes"></i>
        {{ NodeCount }} {{ NodeCount === 1 ? 'node' : 'nodes' }}
      </span>
      <span class="mj-flow-status-item">
        <i class="fa-solid fa-link"></i>
        {{ ConnectionCount }} {{ ConnectionCount === 1 ? 'connection' : 'connections' }}
      </span>
      @if (SelectedCount > 0) {
        <span class="mj-flow-status-item">
          <i class="fa-solid fa-check-square"></i>
          {{ SelectedCount }} selected
        </span>
      }
      <span class="mj-flow-status-item mj-flow-status-item--right">
        <i class="fa-solid fa-magnifying-glass"></i>
        {{ ZoomLevel }}%
      </span>
    </div>
    `,
  styles: [`
    .mj-flow-status-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 4px 14px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
      flex-shrink: 0;
      min-height: 28px;
    }

    .mj-flow-status-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;

      i { font-size: 10px; }

      &--right {
        margin-left: auto;
      }
    }
  `],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowStatusBarComponent {
  @Input() NodeCount = 0;
  @Input() ConnectionCount = 0;
  @Input() SelectedCount = 0;
  @Input() ZoomLevel = 100;
}
