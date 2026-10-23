import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { RowDriver } from '@memberjunction/predictive-studio-core';

/** The badge a person sees for a driver. */
export type DriverBadge = 'Increases Risk' | 'Lowers Risk';

/**
 * L1 widget: one scored row's signed drivers with their risk badge. Each driver's `Up` is
 * `AtRiskRules.DriverRaisesRisk`, the rule the truth-suite probe also checks (gate W1 → S9.4); this widget owns only the copy.
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
        @for (d of Drivers; track d.Label) {
          <div class="pg-detail-driver-item">
            <div class="pg-detail-driver-label" data-testid="ps-row-driver-label">
              <i class="fa-solid" [class.fa-arrow-up]="d.Up" [class.fa-arrow-down]="!d.Up"
                 [style.color]="d.Up ? 'var(--mj-status-error)' : 'var(--mj-status-success)'"></i>
              {{ d.Label }}
            </div>
            <span class="ps-badge" [class.red]="d.Up" [class.green]="!d.Up" data-testid="ps-row-driver-badge">{{ Badge(d) }}</span>
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
    return PSRowDriversComponent.driverBadgeText(d.Up);
  }

  /** The one place the badge copy is decided. */
  private static driverBadgeText(raisesRisk: boolean): DriverBadge {
    return raisesRisk ? 'Increases Risk' : 'Lowers Risk';
  }
}
