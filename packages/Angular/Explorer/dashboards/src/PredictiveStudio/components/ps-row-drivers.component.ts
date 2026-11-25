import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { RowDriver, SemanticsCheckBinding } from '@memberjunction/predictive-studio-core';

/**
 * L1 widget: one scored row's signed drivers with their badge. Each driver's `Up` is signed by Core
 * (`AtRiskRules.SignDriver`, through `ParseRowDrivers`) for the why-badge's binding row; this widget only renders it and
 * owns the copy. With a binding row, the row's `Label` names what a driver raises or lowers; without one (a model
 * published before its rows existed) the badge says "Risk".
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
                 [style.color]="ArrowColor(d)"></i>
              {{ d.Label }}
            </div>
            <span class="ps-badge" [class]="'ps-badge ' + BadgeColor(d)" data-testid="ps-row-driver-badge">{{ Badge(d) }}</span>
          </div>
        }
      </div>
    }
  `,
})
export class PSRowDriversComponent {
  /** The row's drivers, already signed by Core for the why-badge's binding row (`AtRiskRules.ParseRowDrivers`). */
  @Input() Drivers: readonly RowDriver[] | null | undefined = [];

  /** The model's `why-badge` binding row: its `Label` names what the drivers move. Null when the model has none. */
  @Input() Binding: SemanticsCheckBinding | null = null;

  /** Badge text for one driver: "Increases"/"Lowers" and what it moves (the binding row's label, else "Risk"). */
  public Badge(d: RowDriver): string {
    return `${d.Up ? 'Increases' : 'Lowers'} ${this.Binding?.Label || 'Risk'}`;
  }

  /** The badge's colour class: red/green when the direction is risk, blue/gray for a raw contribution (no good or bad side). */
  public BadgeColor(d: RowDriver): 'red' | 'green' | 'blue' | 'gray' {
    if (this.isRawContribution()) return d.Up ? 'blue' : 'gray';
    return d.Up ? 'red' : 'green';
  }

  /** The arrow's colour token, matching {@link BadgeColor}. */
  public ArrowColor(d: RowDriver): string {
    if (this.isRawContribution()) return d.Up ? 'var(--mj-brand-primary)' : 'var(--mj-text-muted)';
    return d.Up ? 'var(--mj-status-error)' : 'var(--mj-status-success)';
  }

  private isRawContribution(): boolean {
    return this.Binding?.DriverDirectionRelativeTo === 'raw-contribution';
  }
}
