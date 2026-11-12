import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJReactModule } from '@memberjunction/ng-react';
import { IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
import {
  ArtifactVersionDiffService,
  type ComponentCodeUnitDiff,
  type ComponentSpecVisualDiffResult,
} from '../../services/artifact-version-diff.service';
import { GitDiffLinesViewComponent } from './git-diff-lines-view.component';

export type ComponentDiffTabKind = 'overview' | 'code' | 'preview' | 'specs';

@Component({
  selector: 'mj-component-version-diff',
  standalone: true,
  imports: [MJReactModule, GitDiffLinesViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-comp-vdiff" data-testid="component-visual-version-diff">
      @if (DiffResult) {
        <!-- Sub-Navigation Bar -->
        <div class="mj-comp-vdiff__nav">
          <div class="mj-comp-vdiff__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              class="mj-comp-vdiff__tab"
              [class.mj-comp-vdiff__tab--active]="ActiveTab === 'overview'"
              (click)="SetTab('overview')"
            >
              <i class="fas fa-sitemap"></i> Architecture & Data
            </button>
            <button
              type="button"
              role="tab"
              class="mj-comp-vdiff__tab"
              [class.mj-comp-vdiff__tab--active]="ActiveTab === 'code'"
              (click)="SetTab('code')"
              data-testid="comp-diff-tab-code"
            >
              <i class="fas fa-code"></i> JSX Code Diff
              @if (ChangedCodeUnitsCount > 0) {
                <span class="mj-comp-vdiff__badge">{{ ChangedCodeUnitsCount }}</span>
              }
            </button>
            <button
              type="button"
              role="tab"
              class="mj-comp-vdiff__tab"
              [class.mj-comp-vdiff__tab--active]="ActiveTab === 'preview'"
              (click)="SetTab('preview')"
              data-testid="comp-diff-tab-preview"
            >
              <i class="fas fa-columns"></i> Live Side-by-Side Preview
            </button>
            <button
              type="button"
              role="tab"
              class="mj-comp-vdiff__tab"
              [class.mj-comp-vdiff__tab--active]="ActiveTab === 'specs'"
              (click)="SetTab('specs')"
            >
              <i class="fas fa-compass-drafting"></i> Requirements & Design
            </button>
          </div>
        </div>

        <!-- AI Change Request Banner (when ComponentSpec.changeRequest is present) -->
        @if (DiffResult.ChangeRequestPrompt) {
          <div class="mj-comp-vdiff__prompt-banner" data-testid="comp-diff-change-request">
            <div class="mj-comp-vdiff__prompt-head">
              <i class="fas fa-wand-magic-sparkles"></i>
              <strong>Revision Intent</strong>
              @if (DiffResult.ChangeRequestType) {
                <span class="mj-comp-vdiff__type-pill">{{ DiffResult.ChangeRequestType }}</span>
              }
            </div>
            <div class="mj-comp-vdiff__prompt-quote">"{{ DiffResult.ChangeRequestPrompt }}"</div>
            @if (DiffResult.ChangeSummaryBullets.length > 0) {
              <div class="mj-comp-vdiff__prompt-layers">
                @for (b of DiffResult.ChangeSummaryBullets; track b.Label) {
                  <div class="mj-comp-vdiff__layer-item">
                    <strong>{{ b.Label }}:</strong> {{ b.NewValue }}
                  </div>
                }
              </div>
            }
          </div>
        }

        @switch (ActiveTab) {
          @case ('overview') {
            <div class="mj-comp-vdiff__grid">
              <!-- Component Hierarchy & Code Units Card -->
              <section class="mj-comp-vdiff__card">
                <h4><i class="fas fa-cubes"></i> Component Hierarchy</h4>
                <div class="mj-comp-vdiff__unit-list">
                  @for (unit of DiffResult.CodeUnits; track unit.UnitKey) {
                    @if (unit.UnitKey !== 'bundle:complete') {
                      <button
                        type="button"
                        class="mj-comp-vdiff__unit-row"
                        (click)="OpenCodeUnit(unit)"
                      >
                        <div>
                          <strong>{{ unit.ComponentName }}</strong>
                          <span class="mj-comp-vdiff__muted"> · {{ unit.RoleLabel }}</span>
                        </div>
                        <div class="mj-comp-vdiff__unit-right">
                          @if (!unit.CodeDiff.IsIdentical) {
                            <span class="mj-c-add">+{{ unit.CodeDiff.AddedLines }}</span>
                            <span class="mj-c-del">−{{ unit.CodeDiff.RemovedLines }}</span>
                          }
                          <span class="mj-c-status" [attr.data-status]="unit.Status">
                            {{ unit.Status }}
                          </span>
                        </div>
                      </button>
                    }
                  }
                </div>
              </section>

              <!-- Spec Metadata & Role Changes -->
              <section class="mj-comp-vdiff__card">
                <h4><i class="fas fa-sliders"></i> Contract & Metadata Deltas</h4>
                @if (DiffResult.MetadataDeltas.length === 0 && DiffResult.LibraryDeltas.length === 0) {
                  <div class="mj-comp-vdiff__none">No contract, role, or library changes.</div>
                } @else {
                  <div class="mj-comp-vdiff__kv-list">
                    @for (m of DiffResult.MetadataDeltas; track m.Label) {
                      <div class="mj-comp-vdiff__kv">
                        <span class="mj-comp-vdiff__kv-key">{{ m.Label }}</span>
                        <span>
                          <del class="mj-c-del">{{ m.OldValue }}</del> →
                          <strong class="mj-c-add">{{ m.NewValue }}</strong>
                        </span>
                      </div>
                    }
                    @for (lib of DiffResult.LibraryDeltas; track lib.Name) {
                      <div class="mj-comp-vdiff__kv">
                        <span class="mj-comp-vdiff__kv-key">
                          <i class="fas fa-box-open"></i> {{ lib.Name }}
                        </span>
                        <span class="mj-c-status" [attr.data-status]="lib.Status">
                          {{ lib.Status }} ({{ lib.OldVersion }} → {{ lib.NewVersion }})
                        </span>
                      </div>
                    }
                  </div>
                }
              </section>

              <!-- Data Requirements: Entities & Queries -->
              <section class="mj-comp-vdiff__card mj-comp-vdiff__card--wide">
                <h4><i class="fas fa-database"></i> Data Requirements Deltas (Entities & Queries)</h4>
                @if (DiffResult.EntityDeltas.length === 0 && DiffResult.QueryDeltas.length === 0) {
                  <div class="mj-comp-vdiff__none">No entity or stored-query requirement changes.</div>
                } @else {
                  <div class="mj-comp-vdiff__data-list">
                    @for (ent of DiffResult.EntityDeltas; track ent.EntityName) {
                      <div class="mj-comp-vdiff__data-item">
                        <div class="mj-comp-vdiff__data-head">
                          <strong><i class="fas fa-table"></i> {{ ent.EntityName }}</strong>
                          <span class="mj-c-status" [attr.data-status]="ent.Status">{{ ent.Status }}</span>
                        </div>
                        <div class="mj-comp-vdiff__muted">{{ ent.Summary }}</div>
                        @for (pd of ent.PropertyDeltas; track pd.Label) {
                          <div class="mj-comp-vdiff__prop-line">
                            <span>{{ pd.Label }}:</span>
                            <del class="mj-c-del">{{ pd.OldValue }}</del> →
                            <strong class="mj-c-add">{{ pd.NewValue }}</strong>
                          </div>
                        }
                      </div>
                    }
                    @for (q of DiffResult.QueryDeltas; track q.QueryKey) {
                      <div class="mj-comp-vdiff__data-item">
                        <div class="mj-comp-vdiff__data-head">
                          <strong><i class="fas fa-terminal"></i> {{ q.CategoryPath ? q.CategoryPath + '/' : '' }}{{ q.Name }}</strong>
                          <span class="mj-c-status" [attr.data-status]="q.Status">{{ q.Status }}</span>
                        </div>
                        <div class="mj-comp-vdiff__muted">{{ q.Summary }}</div>
                        @if (q.SqlDiff) {
                          <mj-git-diff-lines-view
                            [Diff]="q.SqlDiff"
                            [HeaderLabel]="'Inline Query SQL'"
                          ></mj-git-diff-lines-view>
                        }
                      </div>
                    }
                  </div>
                }
              </section>
            </div>
          }

          @case ('code') {
            <div class="mj-comp-vdiff__code-pane">
              <div class="mj-comp-vdiff__unit-pills">
                @for (unit of DiffResult.CodeUnits; track unit.UnitKey) {
                  <button
                    type="button"
                    class="mj-comp-vdiff__unit-pill"
                    [class.mj-comp-vdiff__unit-pill--active]="SelectedCodeUnit?.UnitKey === unit.UnitKey"
                    (click)="SelectCodeUnit(unit)"
                  >
                    <span>{{ unit.ComponentName }}</span>
                    @if (!unit.CodeDiff.IsIdentical) {
                      <span class="mj-c-add">+{{ unit.CodeDiff.AddedLines }}</span>
                      <span class="mj-c-del">−{{ unit.CodeDiff.RemovedLines }}</span>
                    }
                  </button>
                }
              </div>

              @if (SelectedCodeUnit; as cu) {
                <mj-git-diff-lines-view
                  [Diff]="cu.CodeDiff"
                  [HeaderLabel]="cu.ComponentName + ' (' + cu.RoleLabel + ')'"
                  [EmptyMessage]="'JSX code for ' + cu.ComponentName + ' is identical across both versions.'"
                  [TestId]="'comp-jsx-diff-view'"
                ></mj-git-diff-lines-view>
              }
            </div>
          }

          @case ('preview') {
            <div class="mj-comp-vdiff__preview-split" data-testid="comp-live-side-by-side">
              <div class="mj-comp-vdiff__preview-col">
                <div class="mj-comp-vdiff__preview-hdr">
                  Base · v{{ BaseVersion.VersionNumber }} ({{ DiffResult.BaseSpec?.title || DiffResult.BaseSpec?.name || 'Base' }})
                </div>
                <div class="mj-comp-vdiff__preview-stage">
                  @if (DiffResult.BaseSpec && (DiffResult.BaseSpec.code || DiffResult.BaseSpec.namespace)) {
                    <mj-react-component [component]="DiffResult.BaseSpec"></mj-react-component>
                  } @else {
                    <div class="mj-comp-vdiff__none">No executable JSX in v{{ BaseVersion.VersionNumber }}.</div>
                  }
                </div>
              </div>

              <div class="mj-comp-vdiff__preview-col">
                <div class="mj-comp-vdiff__preview-hdr">
                  Target · v{{ TargetVersion.VersionNumber }} ({{ DiffResult.TargetSpec?.title || DiffResult.TargetSpec?.name || 'Target' }})
                </div>
                <div class="mj-comp-vdiff__preview-stage">
                  @if (DiffResult.TargetSpec && (DiffResult.TargetSpec.code || DiffResult.TargetSpec.namespace)) {
                    <mj-react-component [component]="DiffResult.TargetSpec"></mj-react-component>
                  } @else {
                    <div class="mj-comp-vdiff__none">No executable JSX in v{{ TargetVersion.VersionNumber }}.</div>
                  }
                </div>
              </div>
            </div>
          }

          @case ('specs') {
            <div class="mj-comp-vdiff__specs">
              <section class="mj-comp-vdiff__card">
                <h4>
                  <i class="fas fa-clipboard-check"></i> Functional Requirements Redline
                  @if (!DiffResult.FunctionalChanged) {
                    <span class="mj-c-status" data-status="unchanged">unchanged</span>
                  }
                </h4>
                <div class="mj-comp-vdiff__redline">@for (sp of DiffResult.FunctionalRedline; track $index) {@if (sp.Type === 'delete') {<del class="mj-c-redline-del">{{ sp.Text }}</del>} @else if (sp.Type === 'insert') {<ins class="mj-c-redline-ins">{{ sp.Text }}</ins>} @else {{{ sp.Text }}}}</div>
              </section>

              <section class="mj-comp-vdiff__card">
                <h4>
                  <i class="fas fa-microchip"></i> Technical Design Redline
                  @if (!DiffResult.TechnicalChanged) {
                    <span class="mj-c-status" data-status="unchanged">unchanged</span>
                  }
                </h4>
                <div class="mj-comp-vdiff__redline">@for (sp of DiffResult.TechnicalRedline; track $index) {@if (sp.Type === 'delete') {<del class="mj-c-redline-del">{{ sp.Text }}</del>} @else if (sp.Type === 'insert') {<ins class="mj-c-redline-ins">{{ sp.Text }}</ins>} @else {{{ sp.Text }}}}</div>
              </section>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .mj-comp-vdiff {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-comp-vdiff__nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
      }

      .mj-comp-vdiff__tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .mj-comp-vdiff__tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-comp-vdiff__tab--active {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse, #fff);
      }

      .mj-comp-vdiff__badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
      }

      .mj-comp-vdiff__prompt-banner {
        padding: 12px 14px;
        border-radius: 8px;
        border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 35%, var(--mj-border-default));
        background: color-mix(in srgb, var(--mj-brand-primary) 7%, var(--mj-bg-surface-card));
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-comp-vdiff__prompt-head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--mj-brand-primary);
      }

      .mj-comp-vdiff__type-pill {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--mj-bg-surface);
      }

      .mj-comp-vdiff__prompt-quote {
        font-size: 13px;
        font-weight: 600;
        color: var(--mj-text-primary);
      }

      .mj-comp-vdiff__prompt-layers {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 12px;
        color: var(--mj-text-secondary);
      }

      .mj-comp-vdiff__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .mj-comp-vdiff__card {
        padding: 14px;
        border-radius: 8px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mj-comp-vdiff__card--wide {
        grid-column: 1 / -1;
      }

      .mj-comp-vdiff__card h4 {
        margin: 0;
        font-size: 13px;
        color: var(--mj-text-primary);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mj-comp-vdiff__unit-list,
      .mj-comp-vdiff__kv-list,
      .mj-comp-vdiff__data-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-comp-vdiff__unit-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-subtle);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 12px;
        cursor: pointer;
        text-align: left;
      }

      .mj-comp-vdiff__unit-row:hover {
        border-color: var(--mj-brand-primary);
      }

      .mj-comp-vdiff__unit-right {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
      }

      .mj-comp-vdiff__kv {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--mj-bg-surface);
        font-size: 12px;
      }

      .mj-comp-vdiff__kv-key {
        font-weight: 600;
        color: var(--mj-text-secondary);
      }

      .mj-comp-vdiff__data-item {
        padding: 10px 12px;
        border-radius: 6px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 12px;
      }

      .mj-comp-vdiff__data-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .mj-comp-vdiff__prop-line {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .mj-comp-vdiff__muted,
      .mj-comp-vdiff__none {
        color: var(--mj-text-muted);
        font-size: 12px;
      }

      .mj-c-add {
        color: var(--mj-status-success);
        font-weight: 600;
      }

      .mj-c-del {
        color: var(--mj-status-error);
        font-weight: 600;
      }

      .mj-c-status {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-muted);
      }

      .mj-c-status[data-status='added'] {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
      }

      .mj-c-status[data-status='removed'] {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 16%, transparent);
      }

      .mj-c-status[data-status='modified'] {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 16%, transparent);
      }

      .mj-comp-vdiff__code-pane,
      .mj-comp-vdiff__specs {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mj-comp-vdiff__unit-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .mj-comp-vdiff__unit-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-comp-vdiff__unit-pill--active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      }

      .mj-comp-vdiff__preview-split {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .mj-comp-vdiff__preview-col {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        overflow: hidden;
        background: var(--mj-bg-surface);
        display: flex;
        flex-direction: column;
      }

      .mj-comp-vdiff__preview-hdr {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        color: var(--mj-text-primary);
      }

      .mj-comp-vdiff__preview-stage {
        min-height: 420px;
        max-height: 620px;
        overflow: auto;
        padding: 8px;
      }

      .mj-comp-vdiff__redline {
        font-size: 13px;
        line-height: 1.65;
        white-space: pre-wrap;
        color: var(--mj-text-primary);
        padding: 10px;
        background: var(--mj-bg-surface);
        border-radius: 6px;
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-c-redline-del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 15%, transparent);
        text-decoration: line-through;
        padding: 0 3px;
        border-radius: 3px;
      }

      .mj-c-redline-ins {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
        text-decoration: underline;
        padding: 0 3px;
        border-radius: 3px;
        font-weight: 600;
      }
    `,
  ],
})
export class ComponentVersionDiffComponent implements IArtifactVersionDiffViewer, OnChanges {
  private readonly diffService = inject(ArtifactVersionDiffService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() BaseVersion!: MJArtifactVersionEntity;
  @Input() TargetVersion!: MJArtifactVersionEntity;

  public DiffResult: ComponentSpecVisualDiffResult | null = null;
  public ActiveTab: ComponentDiffTabKind = 'overview';
  public SelectedCodeUnit: ComponentCodeUnitDiff | null = null;

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.BaseVersion && this.TargetVersion) {
      this.DiffResult = this.diffService.ComputeComponentSpecDiff(
        this.BaseVersion.Content,
        this.TargetVersion.Content,
      );
      const firstChangedCode = this.DiffResult.CodeUnits.find((u) => !u.CodeDiff.IsIdentical);
      this.SelectedCodeUnit = firstChangedCode ?? this.DiffResult.CodeUnits[0] ?? null;
      this.cdr.markForCheck();
    }
  }

  public get ChangedCodeUnitsCount(): number {
    if (!this.DiffResult) return 0;
    return this.DiffResult.CodeUnits.filter(
      (u) => u.UnitKey !== 'bundle:complete' && !u.CodeDiff.IsIdentical,
    ).length;
  }

  public SetTab(tab: ComponentDiffTabKind): void {
    this.ActiveTab = tab;
    this.cdr.markForCheck();
  }

  public SelectCodeUnit(unit: ComponentCodeUnitDiff): void {
    this.SelectedCodeUnit = unit;
    this.cdr.markForCheck();
  }

  public OpenCodeUnit(unit: ComponentCodeUnitDiff): void {
    this.SelectedCodeUnit = unit;
    this.ActiveTab = 'code';
    this.cdr.markForCheck();
  }
}
