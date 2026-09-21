import { ChangeDetectorRef, Component, Input, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularSplitModule } from 'angular-split';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJMLModelEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { PSModelDetailComponent } from '@memberjunction/ng-core-entity-forms';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { primaryAuc, primaryModelScore, formatMetricValue } from '../predictive-studio.view-models';

interface ModelRowVM {
  id: string;
  name: string;
  version: number;
  algorithm: string;
  holdoutAuc: string;
  holdoutScore: string;
  scoreLabel: string;
  status: string;
  iconClass: string;
}

/**
 * Model Registry panel: master list of trained ML Models + a rich detail pane rendered via the unified
 * {@link PSModelDetailComponent}. Includes resizable split layout with user preference persistence via
 * UserInfoEngine and collapse/expand support.
 *
 * 100% entity-agnostic — model names derive from the producing pipeline, never any business entity.
 */
@Component({
  standalone: true,
  selector: 'ps-registry',
  imports: [CommonModule, AngularSplitModule, PSModelDetailComponent],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-registry.component.css'],
  template: `
    <div class="ps-panel ps-registry" data-testid="ps-registry-panel">
      @if (models.length === 0) {
        <div class="ps-empty" data-testid="ps-registry-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-cubes"></i></span>
          <h3>No trained models yet</h3>
          <p>Train a pipeline to register your first immutable model. Each successful training run produces a versioned model you can validate, publish, and score with here.</p>
        </div>
      } @else {
        <div class="reg-layout" [class.list-collapsed]="isListCollapsed">
          @if (isListCollapsed) {
            <div class="reg-collapsed-strip" role="region" aria-label="Model registry list (collapsed)">
              <button class="reg-rail-collapse" type="button" (click)="toggleList()" aria-label="Expand models list" title="Expand list">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
              <div class="reg-collapsed-strip-label"><i class="fa-solid fa-cubes"></i></div>
            </div>
          }

          <as-split direction="horizontal" class="reg-splitter" unit="percent" [gutterSize]="6" (dragEnd)="onSplitDragEnd($event.sizes)">
            @if (!isListCollapsed) {
              <as-split-area [size]="listSizePct" [minSize]="18" [maxSize]="50">
                <!-- master list -->
                <div class="ps-card mlist" data-testid="ps-registry-list">
                  <div class="ps-card-head">
                    <h3>ML Models</h3>
                    <div style="display:flex;gap:6px;align-items:center">
                      <span class="ps-badge gray">{{ models.length }}</span>
                      <button class="reg-collapse-btn" type="button" (click)="toggleList()" title="Collapse list" aria-label="Collapse list">
                        <i class="fa-solid fa-chevron-left"></i>
                      </button>
                    </div>
                  </div>
                  <div class="ps-card-body" style="padding:8px">
                    @for (m of models; track m.id) {
                      <div class="mrow" data-testid="ps-registry-row" [class.sel]="m.id === selectedId" [class.arc]="m.status === 'Archived'" (click)="select(m.id)">
                        <div class="ico" [class]="m.iconClass"><i class="fa-solid fa-cube"></i></div>
                        <div style="flex:1;min-width:0">
                          <div class="nm">{{ m.name }}</div>
                          <div class="ln2 ps-muted ps-small">v{{ m.version }} &bull; {{ m.algorithm }}</div>
                        </div>
                        <div class="auc">
                          <div class="v">{{ m.holdoutScore }}</div>
                          <div class="st" [class]="statusClass(m.status)">{{ m.status }}</div>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </as-split-area>
            }

            <as-split-area [size]="isListCollapsed ? 100 : detailSizePct" [minSize]="50">
              <!-- detail via unified PSModelDetailComponent -->
              <div class="ps-col detail" data-testid="ps-registry-detail">
                @if (selectedEntity) {
                  <ps-model-detail
                    [model]="selectedEntity"
                    [displayName]="engine ? engine.ModelDisplayName(selectedEntity) : undefined"
                    [provider]="provider"
                    [currentUser]="currentUser"
                    (statusChanged)="onModelStatusChanged($event)">
                  </ps-model-detail>
                } @else {
                  <div class="ps-empty" style="padding: 40px 20px;">
                    <p class="ps-muted">Select a model to view details.</p>
                  </div>
                }
              </div>
            </as-split-area>
          </as-split>
        </div>
      }
    </div>
  `,
})
export class PSRegistryComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  /** Provider to route the promote Remote Op + engine refresh through (multi-provider correctness). */
  @Input() provider: IMetadataProvider | null = null;
  /** Acting user for the engine refresh after a mutation. */
  @Input() currentUser: UserInfo | null = null;

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  public models: ModelRowVM[] = [];
  public selectedId = '';

  // Resizable split state
  public listSizePct = 28;
  public detailSizePct = 72;
  public isListCollapsed = false;

  private _initialModelId?: string;
  @Input()
  public set initialModelId(id: string | undefined) {
    this._initialModelId = id;
    if (id) {
      if (this.models.length === 0 || !this.models.some((m) => UUIDsEqual(m.id, id))) {
        this.buildModels();
      }
      if (this.models.some((m) => UUIDsEqual(m.id, id))) {
        this.selectedId = id;
      }
      this.cdr.detectChanges();
    }
  }
  public get initialModelId(): string | undefined {
    return this._initialModelId;
  }

  ngOnInit(): void {
    const saved = UserInfoEngine.Instance.GetSetting('mj.predictiveStudio.registry.layout');
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        if (typeof prefs.listSizePct === 'number') this.listSizePct = prefs.listSizePct;
        if (typeof prefs.detailSizePct === 'number') this.detailSizePct = prefs.detailSizePct;
        if (typeof prefs.isListCollapsed === 'boolean') this.isListCollapsed = prefs.isListCollapsed;
      } catch {
        // ignore malformed pref
      }
    }

    this.buildModels();
    if (this._initialModelId && this.models.some((m) => UUIDsEqual(m.id, this._initialModelId))) {
      this.selectedId = this._initialModelId;
    } else {
      this.selectedId = this.models[0]?.id ?? '';
    }
  }

  // ---- splitter resizing & persistence ----

  public onSplitDragEnd(sizes: readonly (number | '*')[]): void {
    if (Array.isArray(sizes) && sizes.length === 2 && typeof sizes[0] === 'number' && typeof sizes[1] === 'number') {
      this.listSizePct = Math.round(sizes[0]);
      this.detailSizePct = Math.round(sizes[1]);
      this.saveLayoutPrefs();
    }
  }

  public toggleList(): void {
    this.isListCollapsed = !this.isListCollapsed;
    this.saveLayoutPrefs();
    this.cdr.markForCheck();
  }

  private saveLayoutPrefs(): void {
    const prefs = {
      listSizePct: this.listSizePct,
      detailSizePct: this.detailSizePct,
      isListCollapsed: this.isListCollapsed,
    };
    UserInfoEngine.Instance.SetSettingDebounced('mj.predictiveStudio.registry.layout', JSON.stringify(prefs));
  }

  // ---- selection + master list ----

  public select(id: string): void {
    this.selectedId = id;
  }

  public get selected(): ModelRowVM {
    return this.models.find((m) => m.id === this.selectedId) ?? this.models[0] ?? this.placeholder();
  }

  public get selectedEntity(): MJMLModelEntity | undefined {
    return this.engine?.Models?.find((m) => UUIDsEqual(m.ID, this.selectedId));
  }

  public statusClass(status: string): string {
    switch (status) {
      case 'Published': return 'pub';
      case 'Validated': return 'val';
      case 'Draft': return 'dr';
      case 'Archived': return 'arc';
      default: return 'dr';
    }
  }

  // ---- lifecycle change handling ----

  public async onModelStatusChanged(evt: { modelId: string; newStatus: string }): Promise<void> {
    await this.refreshAfterMutation();
  }

  /** Force-refresh the engine's cached models, then rebuild the master list. */
  private async refreshAfterMutation(): Promise<void> {
    const provider = this.provider ?? undefined;
    await this.engine.Config(true, this.currentUser ?? undefined, provider);
    this.buildModels();
    if (!this.models.some((m) => m.id === this.selectedId)) {
      this.selectedId = this.models[0]?.id ?? '';
    }
    this.cdr.detectChanges();
  }

  // ---- master-list view-models ----

  private buildModels(): void {
    this.models = (this.engine?.Models ?? []).map((m) => this.toVM(m));
  }

  private toVM(m: MJMLModelEntity): ModelRowVM {
    const holdout = primaryAuc(m);
    const score = primaryModelScore(m);
    const formattedScore = score != null ? formatMetricValue(score.key, score.value) : (holdout != null ? holdout.toFixed(3) : '—');
    return {
      id: m.ID,
      name: this.engine?.ModelDisplayName ? this.engine.ModelDisplayName(m) : (m.Pipeline || `Model v${m.Version}`),
      version: m.Version,
      algorithm: this.engine?.AlgorithmName ? this.engine.AlgorithmName(m.AlgorithmID) : (m.Algorithm || 'Algorithm'),
      holdoutAuc: holdout != null ? holdout.toFixed(3) : formattedScore,
      holdoutScore: formattedScore,
      scoreLabel: score?.label ?? 'AUC',
      status: m.Status,
      iconClass: 'xgb',
    };
  }

  private placeholder(): ModelRowVM {
    return { id: '', name: 'No model', version: 0, algorithm: '—', holdoutAuc: '—', holdoutScore: '—', scoreLabel: 'AUC', status: 'Draft', iconClass: 'xgb' };
  }
}
