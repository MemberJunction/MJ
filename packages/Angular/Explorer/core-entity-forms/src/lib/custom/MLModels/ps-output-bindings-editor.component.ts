import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJMLModelEntity, MJMLOutputBindingEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

/** The words of each surface a binding drives. */
const SURFACE_WORDS: Readonly<Record<MJMLOutputBindingEntity['Surface'], string>> = {
  'at-risk-list': 'At-risk list',
  'predictions-grid': 'Predictions grid',
  'record-panel': 'Record panel',
  'why-badge': 'Why badge',
};

/** The words of each sort a binding fixes. */
const SORT_WORDS: Readonly<Record<MJMLOutputBindingEntity['SortsBy'], string>> = {
  'adverse-probability-desc': 'most at risk first',
  'score-desc': 'highest score first',
  'score-asc': 'lowest score first',
  none: 'not sorted',
};

/** The words of each driver direction a binding fixes. */
const DIRECTION_WORDS: Readonly<Record<MJMLOutputBindingEntity['DriverDirectionRelativeTo'], string>> = {
  'adverse-class': 'drivers signed toward the adverse class',
  'raw-contribution': 'drivers as raw contributions',
};

/**
 * **PSOutputBindingsEditorComponent** (L2) — a model's `MJ: ML Output Bindings`, one per surface (at-risk list,
 * predictions grid, record panel, why-badge): the label is editable; the sort and the driver direction are fixed by the
 * model's output semantics and shown read-only. A save the server entity refuses (its semantics check) shows the
 * entity's message beside the row. Reads and saves through the host's provider, as the user.
 */
@Component({
  standalone: true,
  selector: 'ps-output-bindings-editor',
  imports: [CommonModule, FormsModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ps-ob" data-testid="ps-output-bindings-editor">
      @if (Loading) {
        <div class="ps-ob-note"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading output bindings…</div>
      } @else if (LoadError) {
        <div class="ps-ob-error" data-testid="ps-output-bindings-load-error">{{ LoadError }}</div>
      } @else if (Bindings.length === 0) {
        <div class="ps-ob-note" data-testid="ps-output-bindings-empty">This model has no output bindings.</div>
      } @else {
        @for (b of Bindings; track b.ID) {
          <div class="ps-ob-row" data-testid="ps-output-binding">
            <div class="ps-ob-surface">{{ SurfaceWords(b) }}</div>
            <input class="ps-ob-input" type="text" [attr.data-testid]="'ps-output-binding-label-' + b.Surface" [(ngModel)]="b.Label" [disabled]="IsSaving(b)" />
            <div class="ps-ob-fixed">{{ FixedWords(b) }}</div>
            <button mjButton variant="primary" size="sm" data-testid="ps-output-binding-save" [disabled]="IsSaving(b)" (click)="Save(b)">
              <i [class]="IsSaving(b) ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-floppy-disk'"></i> Save
            </button>
            @if (ErrorOf(b); as error) {
              <div class="ps-ob-error" data-testid="ps-output-binding-error">{{ error }}</div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .ps-ob { display: flex; flex-direction: column; gap: 8px; }
    .ps-ob-note { font-size: 13px; color: var(--mj-text-muted); padding: 8px 0; }
    .ps-ob-row { display: grid; grid-template-columns: 140px minmax(160px, 1fr) minmax(160px, 1fr) auto; gap: 8px; align-items: center; border: 1px solid var(--mj-border-subtle); border-radius: 8px; padding: 8px 12px; background: var(--mj-bg-surface); }
    .ps-ob-surface { font-size: 13px; font-weight: 600; color: var(--mj-text-primary); }
    .ps-ob-input { border: 1px solid var(--mj-border-default); border-radius: 6px; padding: 4px 8px; font: inherit; color: var(--mj-text-primary); background: var(--mj-bg-surface); }
    .ps-ob-fixed { font-size: 12px; color: var(--mj-text-muted); }
    .ps-ob-error { grid-column: 1 / -1; font-size: 13px; color: var(--mj-status-error-text); background: var(--mj-status-error-bg); border: 1px solid var(--mj-status-error-border); border-radius: 6px; padding: 6px 10px; }
  `],
})
export class PSOutputBindingsEditorComponent extends BaseAngularComponent implements OnInit {
  /** The model whose bindings are edited; a change reloads (after the first load in `ngOnInit`). */
  @Input()
  set Model(value: MJMLModelEntity | null) {
    if (value === this.model) return;
    this.model = value;
    if (this.initialized) void this.Reload();
  }
  get Model(): MJMLModelEntity | null {
    return this.model;
  }

  /** The model's output bindings, in surface order. */
  public Bindings: MJMLOutputBindingEntity[] = [];

  /** True while the bindings load. */
  public Loading = false;

  /** Why the bindings could not be read, or null. */
  public LoadError: string | null = null;

  private readonly saving = new Set<string>();
  private readonly errors = new Map<string, string>();
  private readonly cdr = inject(ChangeDetectorRef);
  private model: MJMLModelEntity | null = null;
  /** True once `ngOnInit` ran: every input, the Provider included, is bound, so a Model change reloads. */
  private initialized = false;
  /** Counts loads; a load whose token is no longer the latest drops its result (the model changed while it read). */
  private loadToken = 0;

  /** The first load, once every input (the Provider included) is bound. */
  public ngOnInit(): void {
    this.initialized = true;
    void this.Reload();
  }

  /** Reads the model's output bindings; a load the model changed under discards what it read. */
  public async Reload(): Promise<void> {
    const token = ++this.loadToken;
    const model = this.Model;
    this.errors.clear();
    if (!model) {
      this.Bindings = [];
      this.Loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.Loading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const bindings = await this.LoadBindings(model.ID);
      if (token !== this.loadToken) return;
      this.Bindings = bindings;
    } catch (e) {
      if (token !== this.loadToken) return;
      this.Bindings = [];
      this.LoadError = `The output bindings could not be read: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      if (token === this.loadToken) {
        this.Loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  /** The model's output bindings through the host's provider (one batched `RunViews`). */
  protected async LoadBindings(modelId: string): Promise<MJMLOutputBindingEntity[]> {
    const [result] = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews<MJMLOutputBindingEntity>([
      { EntityName: 'MJ: ML Output Bindings', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}'`, OrderBy: 'Surface ASC', ResultType: 'entity_object' },
    ]);
    if (!result?.Success) throw new Error(result?.ErrorMessage || 'the view returned no result');
    return result.Results;
  }

  /**
   * Saves `binding`'s label. A save the server entity refuses — its semantics check, or any validation — shows the
   * entity's `LatestResult.CompleteMessage` beside the row.
   *
   * @returns true when the save succeeded
   */
  public async Save(binding: MJMLOutputBindingEntity): Promise<boolean> {
    this.saving.add(binding.ID);
    this.errors.delete(binding.ID);
    this.cdr.markForCheck();
    try {
      const saved = await binding.Save();
      if (!saved) this.errors.set(binding.ID, binding.LatestResult?.CompleteMessage || 'The label was not saved.');
      return saved;
    } catch (e) {
      this.errors.set(binding.ID, e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      this.saving.delete(binding.ID);
      this.cdr.markForCheck();
    }
  }

  /** True while `binding` saves. */
  public IsSaving(binding: MJMLOutputBindingEntity): boolean {
    return this.saving.has(binding.ID);
  }

  /** The last refused save's message of `binding`, or null. */
  public ErrorOf(binding: MJMLOutputBindingEntity): string | null {
    return this.errors.get(binding.ID) || null;
  }

  /** The surface of `binding` in words. */
  public SurfaceWords(binding: MJMLOutputBindingEntity): string {
    return SURFACE_WORDS[binding.Surface];
  }

  /** The sort and driver direction `binding` fixes, in words. */
  public FixedWords(binding: MJMLOutputBindingEntity): string {
    return `${SORT_WORDS[binding.SortsBy]}; ${DIRECTION_WORDS[binding.DriverDirectionRelativeTo]} (fixed by the model's output semantics)`;
  }
}
