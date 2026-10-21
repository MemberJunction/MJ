import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AtRiskRules, type DriverBadge, type RowDriver } from '@memberjunction/predictive-studio-core';

/**
 * L1 widget: one scored row's signed drivers with their risk badge. The badge text comes from
 * {@link AtRiskRules.DriverBadgeText}, so the drawer, the truth-suite probe and the tests share one rule (gate W1 → S9.4).
 */
@Component({
  standalone: true,
  selector: 'ps-row-drivers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../predictive-studio.shared.css', './ps-row-drivers.component.css'],
  template: `
    @if (!Drivers || Drivers.length === 0) {
      <div class="ps-small ps-muted" data-testid="ps-row-drivers-empty">No per-row breakdown was recorded for this row.</div>
    } @else {
      <div class="pg-detail-drivers-list" data-testid="ps-row-drivers">
        @for (d of Drivers; track d.label) {
          <div class="pg-detail-driver-item">
            <div class="pg-detail-driver-label" data-testid="ps-row-driver-label">
              <i class="fa-solid" [class.fa-arrow-up]="d.up" [class.fa-arrow-down]="!d.up"
                 [style.color]="d.up ? 'var(--mj-status-error)' : 'var(--mj-status-success)'"></i>
              {{ d.label }}
            </div>
            <span class="ps-badge" [class.red]="d.up" [class.green]="!d.up" data-testid="ps-row-driver-badge">{{ Badge(d) }}</span>
          </div>
        }
      </div>
    }
  `,
})
export class PSRowDriversComponent {
  /** The row's drivers, already signed relative to the displayed risk (`AtRiskRules.ParseRowDrivers(raw, invertedRisk)`). */
  @Input() Drivers: readonly RowDriver[] | null | undefined = [];

  /** Badge text for one driver. */
  public Badge(d: RowDriver): DriverBadge {
    return AtRiskRules.DriverBadgeText(d.up);
  }
}
