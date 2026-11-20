import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJMLModelEntity, MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ScoringRefusalText } from '@memberjunction/predictive-studio-core';

/** How many of a run's first row errors are listed. */
const ERRORS_SHOWN = 3;

/**
 * **PSScoringRunsComponent** (L2) — a model's `MJ: ML Scoring Runs`, newest first: status, path, counts (total, written,
 * failed, skipped), a refusal in plain words, the first row errors, the as-of date, and the model's registered artifact
 * hash the runs verified against. Reads through the host's provider.
 */
@Component({
  standalone: true,
  selector: 'ps-scoring-runs',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ps-sr" data-testid="ps-scoring-runs">
      @if (Model?.ArtifactSha256; as sha) {
        <div class="ps-sr-hash" [title]="sha">Registered artifact {{ sha.slice(0, 16) }}…</div>
      }
      @if (Loading) {
        <div class="ps-sr-note"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading scoring runs…</div>
      } @else if (ErrorMessage) {
        <div class="ps-sr-error" data-testid="ps-scoring-runs-error">{{ ErrorMessage }}</div>
      } @else if (Runs.length === 0) {
        <div class="ps-sr-note" data-testid="ps-scoring-runs-empty">This model has not scored anything yet.</div>
      } @else {
        @for (run of Runs; track run.ID) {
          <div class="ps-sr-row" data-testid="ps-scoring-run">
            <div class="ps-sr-line">
              <span [class]="'ps-sr-status ' + run.Status">{{ run.Status }}</span>
              <span class="ps-sr-path">{{ run.Path }}{{ run.DryRun ? ' · dry run' : '' }}</span>
              <span class="ps-sr-counts" data-testid="ps-scoring-run-counts">{{ run.Written }} written of {{ run.Total }} · {{ run.Failed }} failed · {{ run.Skipped }} skipped</span>
              <span class="ps-sr-time">as of {{ run.AsOfDate | date: 'mediumDate' }} · {{ run.StartedAt | date: 'short' }}</span>
            </div>
            @if (RefusalText(run); as refusal) {
              <div class="ps-sr-refusal" data-testid="ps-scoring-run-refusal">{{ refusal }}</div>
            }
            @for (e of FirstErrors(run); track $index) {
              <div class="ps-sr-err" data-testid="ps-scoring-run-error">{{ e.recordId ? 'Record ' + e.recordId + ': ' : '' }}{{ e.message }}</div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .ps-sr { display: flex; flex-direction: column; gap: 8px; }
    .ps-sr-hash { font-family: var(--mj-font-mono, monospace); font-size: 11px; color: var(--mj-text-muted); }
    .ps-sr-note { font-size: 13px; color: var(--mj-text-muted); padding: 8px 0; }
    .ps-sr-error { font-size: 13px; color: var(--mj-status-error-text); background: var(--mj-status-error-bg); border: 1px solid var(--mj-status-error-border); border-radius: 6px; padding: 8px 10px; }
    .ps-sr-row { border: 1px solid var(--mj-border-subtle); border-radius: 8px; padding: 10px 12px; background: var(--mj-bg-surface); }
    .ps-sr-line { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; color: var(--mj-text-primary); }
    .ps-sr-status { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--mj-bg-surface-sunken); color: var(--mj-text-secondary); }
    .ps-sr-status.completed { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
    .ps-sr-status.refused { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
    .ps-sr-status.failed { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
    .ps-sr-path { color: var(--mj-text-secondary); }
    .ps-sr-counts { color: var(--mj-text-primary); }
    .ps-sr-time { margin-left: auto; font-size: 12px; color: var(--mj-text-muted); }
    .ps-sr-refusal { font-size: 13px; color: var(--mj-status-warning-text); margin-top: 4px; }
    .ps-sr-err { font-size: 12px; color: var(--mj-status-error-text); margin-top: 2px; }
  `],
})
export class PSScoringRunsComponent extends BaseAngularComponent implements OnChanges {
  /** The model whose runs are listed. */
  @Input() Model: MJMLModelEntity | null = null;

  /** The runs, newest first. */
  public Runs: readonly MJMLScoringRunEntity[] = [];

  /** True while the runs load. */
  public Loading = false;

  /** Why the runs could not be read, or null. */
  public ErrorMessage: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  /** Reloads when the model changes. */
  public async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['Model'] || changes['Provider']) await this.Reload();
  }

  /** Reads the model's scoring runs. */
  public async Reload(): Promise<void> {
    if (!this.Model) {
      this.Runs = [];
      return;
    }
    this.Loading = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      this.Runs = await this.LoadRuns(this.Model.ID);
    } catch (e) {
      this.Runs = [];
      this.ErrorMessage = `The scoring runs could not be read: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }

  /** The model's scoring runs, newest first, through the host's provider (one batched `RunViews`). */
  protected async LoadRuns(modelId: string): Promise<MJMLScoringRunEntity[]> {
    const [result] = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews<MJMLScoringRunEntity>([
      {
        EntityName: 'MJ: ML Scoring Runs',
        ExtraFilter: `ModelID='${EscapeSQLString(modelId)}'`,
        OrderBy: 'StartedAt DESC',
        MaxRows: 100,
        ResultType: 'entity_object',
      },
    ]);
    if (!result?.Success) throw new Error(result?.ErrorMessage || 'the view returned no result');
    return result.Results;
  }

  /** A refused run's refusal in plain words, or null. */
  public RefusalText(run: MJMLScoringRunEntity): string | null {
    const refusal = run.RefusalObject;
    return refusal ? ScoringRefusalText.For(refusal) : null;
  }

  /** The first row errors of a run (at most three). */
  public FirstErrors(run: MJMLScoringRunEntity): NonNullable<MJMLScoringRunEntity['FirstErrorsObject']> {
    return (run.FirstErrorsObject || []).slice(0, ERRORS_SHOWN);
  }
}
