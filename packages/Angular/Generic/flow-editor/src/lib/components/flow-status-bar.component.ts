import { Component, Input, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';

/**
 * Status bar at the bottom of the flow editor showing step/path counts and zoom state.
 * Uses D18 end-user vocabulary ("steps" / "paths") and semantic `--mj-*` theme tokens.
 */
@Component({
  standalone: false,
  selector: 'mj-flow-status-bar',
  template: `
    <div class="mj-flow-status-bar">
      <span class="mj-flow-status-item">
        <i class="fa-solid fa-diagram-project"></i>
        {{ NodeCount }} {{ NodeCount === 1 ? 'step' : 'steps' }}
      </span>
      <span class="mj-flow-status-item">
        <i class="fa-solid fa-route"></i>
        {{ ConnectionCount }} {{ ConnectionCount === 1 ? 'path' : 'paths' }}
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
      gap: var(--mj-space-4);
      padding: var(--mj-space-1) var(--mj-space-3-5, 14px);
      background: var(--mj-bg-surface-card);
      border-top: 1px solid var(--mj-border-default);
      font-size: 11px;
      color: var(--mj-text-muted);
      flex-shrink: 0;
      min-height: 28px;
    }

    .mj-flow-status-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .mj-flow-status-item i {
      font-size: 10px;
    }

    .mj-flow-status-item--right {
      margin-left: auto;
      font-family: var(--mj-font-family-mono);
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
