import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { LifecycleLabels } from '@memberjunction/predictive-studio-core';

/** The chip's colour family per persisted status. */
const CHIP_VARIANT: Readonly<Record<MJMLModelEntity['Status'], 'green' | 'blue' | 'amber' | 'gray' | 'violet'>> = {
  Draft: 'amber',
  Validated: 'blue',
  Published: 'green',
  Archived: 'gray',
  KeepBaseline: 'violet',
  Unevaluated: 'amber',
};

/**
 * **PSLifecycleChipComponent** (L1) — a model's lifecycle chip: the status in words (`KeepBaseline` "ships the simple
 * baseline", `Unevaluated` "trained before the lifecycle gate; retrain to publish"), the "still serving" note of a
 * pre-change model that serves (`ServingWhileUnevaluated`), and the stored `StatusReason` beneath. Props in, nothing
 * out; the text comes from `LifecycleLabels` in Predictive Studio Core, which the dashboards' registry reads too. A run
 * that shipped no model row (no signal, kept the existing rule) is never a chip: it is shown from its run-level record
 * where runs are listed (D4-56).
 */
@Component({
  standalone: true,
  selector: 'ps-lifecycle-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="ps-lc">
      <span [class]="'ps-lc-chip ' + Variant" data-testid="ps-lifecycle-chip">{{ Label }}</span>
      @if (ServingNote) {
        <span class="ps-lc-serving" data-testid="ps-lifecycle-serving"><i class="fa-solid fa-satellite-dish"></i> {{ ServingNote }}</span>
      }
      @if (ShowReason && Detail) {
        <span class="ps-lc-reason" data-testid="ps-lifecycle-reason">{{ Detail }}</span>
      }
    </span>
  `,
  styles: [`
    .ps-lc { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
    .ps-lc-chip {
      display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px;
      font-size: 12px; font-weight: 600; line-height: 1.6; border: 1px solid transparent;
    }
    .ps-lc-chip.green { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); border-color: var(--mj-status-success-border); }
    .ps-lc-chip.blue { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); border-color: var(--mj-status-info-border); }
    .ps-lc-chip.amber { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); border-color: var(--mj-status-warning-border); }
    .ps-lc-chip.gray { background: var(--mj-bg-surface-sunken); color: var(--mj-text-secondary); border-color: var(--mj-border-default); }
    .ps-lc-chip.violet {
      background: color-mix(in srgb, var(--mj-text-violet) 12%, var(--mj-bg-surface));
      color: var(--mj-text-violet);
      border-color: color-mix(in srgb, var(--mj-text-violet) 35%, var(--mj-bg-surface));
    }
    .ps-lc-serving { font-size: 12px; color: var(--mj-status-warning-text); }
    .ps-lc-reason { font-size: 12px; color: var(--mj-text-secondary); line-height: 1.45; max-width: 60ch; }
  `],
})
export class PSLifecycleChipComponent {
  /** The model's persisted `Status`. */
  @Input() Status: MJMLModelEntity['Status'] = 'Draft';

  /** The model's stored `StatusReason`. */
  @Input() StatusReason: string | null = null;

  /** The model's `ServingWhileUnevaluated` flag. */
  @Input() ServingWhileUnevaluated = false;

  /** When false, only the chip and the serving note are shown (a compact list row). */
  @Input() ShowReason = true;

  /** What the chip says. */
  public get Label(): string {
    return LifecycleLabels.For(this.Status, this.StatusReason).Label;
  }

  /** The stored reason, or null. */
  public get Detail(): string | null {
    return LifecycleLabels.For(this.Status, this.StatusReason).Detail;
  }

  /** The "still serving" note of a serving pre-change model, or null. */
  public get ServingNote(): string | null {
    return LifecycleLabels.ServingNote(this.Status, this.ServingWhileUnevaluated);
  }

  /** The chip's colour family. */
  public get Variant(): (typeof CHIP_VARIANT)[MJMLModelEntity['Status']] {
    return CHIP_VARIANT[this.Status];
  }
}
