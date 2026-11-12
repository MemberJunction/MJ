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
import { IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
import {
  ArtifactVersionDiffService,
  type QueryVisualDiffResult,
} from '../../services/artifact-version-diff.service';
import { GitDiffLinesViewComponent } from './git-diff-lines-view.component';

export type QueryDiffTabKind = 'sql' | 'schema' | 'narrative';

@Component({
  selector: 'mj-query-version-diff',
  standalone: true,
  imports: [GitDiffLinesViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-query-vdiff" data-testid="query-visual-version-diff">
      @if (DiffResult) {
        <div class="mj-query-vdiff__nav">
          <div class="mj-query-vdiff__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              class="mj-query-vdiff__tab"
              [class.mj-query-vdiff__tab--active]="ActiveTab === 'sql'"
              (click)="SetTab('sql')"
              data-testid="query-diff-tab-sql"
            >
              <i class="fas fa-database"></i> SQL & Parameters
              @if (DiffResult.SqlChanged) {
                <span class="mj-q-dot"></span>
              }
            </button>
            <button
              type="button"
              role="tab"
              class="mj-query-vdiff__tab"
              [class.mj-query-vdiff__tab--active]="ActiveTab === 'schema'"
              (click)="SetTab('schema')"
              data-testid="query-diff-tab-schema"
            >
              <i class="fas fa-table-columns"></i> Schema & Sample Rows
              @if (TotalSchemaChanges > 0) {
                <span class="mj-q-badge">{{ TotalSchemaChanges }}</span>
              }
            </button>
            <button
              type="button"
              role="tab"
              class="mj-query-vdiff__tab"
              [class.mj-query-vdiff__tab--active]="ActiveTab === 'narrative'"
              (click)="SetTab('narrative')"
            >
              <i class="fas fa-lightbulb"></i> Plan & Interpretation
            </button>
          </div>
        </div>

        @switch (ActiveTab) {
          @case ('sql') {
            <!-- Metadata & Parameter Summary Cards -->
            @if (DiffResult.MetadataDeltas.length > 0 || DiffResult.ParameterDeltas.length > 0) {
              <div class="mj-query-vdiff__cards">
                @if (DiffResult.MetadataDeltas.length > 0) {
                  <section class="mj-query-vdiff__card">
                    <h4><i class="fas fa-gauge-high"></i> Query & Execution Deltas</h4>
                    <div class="mj-query-vdiff__kv-list">
                      @for (m of DiffResult.MetadataDeltas; track m.Label) {
                        <div class="mj-query-vdiff__kv">
                          <span class="mj-query-vdiff__kv-key">{{ m.Label }}</span>
                          <span>
                            <del class="mj-q-del">{{ m.OldValue }}</del> →
                            <strong class="mj-q-add">{{ m.NewValue }}</strong>
                          </span>
                        </div>
                      }
                    </div>
                  </section>
                }

                @if (DiffResult.ParameterDeltas.length > 0) {
                  <section class="mj-query-vdiff__card">
                    <h4><i class="fas fa-sliders"></i> Query Parameters</h4>
                    <div class="mj-query-vdiff__kv-list">
                      @for (p of DiffResult.ParameterDeltas; track p.Label) {
                        <div class="mj-query-vdiff__kv">
                          <code>{{ p.Label }}</code>
                          <span>
                            <del class="mj-q-del">{{ p.OldValue }}</del> →
                            <strong class="mj-q-add">{{ p.NewValue }}</strong>
                          </span>
                        </div>
                      }
                    </div>
                  </section>
                }
              </div>
            }

            @if (DiffResult.IsWhitespaceOnlySqlChange) {
              <div class="mj-query-vdiff__notice">
                <i class="fas fa-info-circle"></i>
                <span>SQL formatting/whitespace changed, while normalized SQL tokens remain equivalent.</span>
              </div>
            }

            @if (DiffResult.HasSql) {
              <mj-git-diff-lines-view
                [Diff]="DiffResult.SqlDiff"
                [HeaderLabel]="'SQL Statement Diff (v' + BaseVersion.VersionNumber + ' → v' + TargetVersion.VersionNumber + ')'"
                [EmptyMessage]="'SQL query text is identical across both versions.'"
                [TestId]="'query-sql-diff-view'"
              ></mj-git-diff-lines-view>
            } @else {
              <div class="mj-query-vdiff__empty">
                <i class="fas fa-table"></i>
                <span>This data artifact uses inline/view data without a SQL statement. Check Schema & Sample Rows.</span>
              </div>
            }
          }

          @case ('schema') {
            <div class="mj-query-vdiff__tables">
              @for (tbl of DiffResult.Tables; track tbl.TableName) {
                <section class="mj-query-vdiff__card">
                  <div class="mj-query-vdiff__tbl-head">
                    <h4><i class="fas fa-table"></i> {{ tbl.TableName }}</h4>
                    <div class="mj-query-vdiff__tbl-meta">
                      @if (tbl.OldRowCount !== null || tbl.NewRowCount !== null) {
                        <span>Rows: {{ tbl.OldRowCount ?? '—' }} → <strong>{{ tbl.NewRowCount ?? '—' }}</strong></span>
                      }
                      <span class="mj-q-status" [attr.data-status]="tbl.Status">{{ tbl.Status }}</span>
                    </div>
                  </div>

                  <!-- Column Schema Table -->
                  <table class="mj-query-vdiff__schema-tbl">
                    <thead>
                      <tr>
                        <th>Column Field</th>
                        <th>Status</th>
                        <th>Display Header</th>
                        <th>SQL / Data Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (col of tbl.ColumnDeltas; track col.FieldName) {
                        <tr [attr.data-status]="col.Status">
                          <td><code>{{ col.FieldName }}</code></td>
                          <td>
                            <span class="mj-q-status" [attr.data-status]="col.Status">{{ col.Status }}</span>
                          </td>
                          <td>
                            @if (col.Status === 'modified' && col.OldLabel !== col.NewLabel) {
                              <del class="mj-q-del">{{ col.OldLabel }}</del> → <strong>{{ col.NewLabel }}</strong>
                            } @else {
                              {{ col.NewLabel !== '—' ? col.NewLabel : col.OldLabel }}
                            }
                          </td>
                          <td>
                            @if (col.Status === 'modified' && col.OldType !== col.NewType) {
                              <del class="mj-q-del">{{ col.OldType }}</del> → <code>{{ col.NewType }}</code>
                            } @else {
                              <code>{{ col.NewType !== '—' ? col.NewType : col.OldType }}</code>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>

                  <!-- Side-by-Side Sample Rows Snapshot when present -->
                  @if (tbl.BaseSampleRows.length > 0 || tbl.TargetSampleRows.length > 0) {
                    <div class="mj-query-vdiff__samples">
                      <div class="mj-query-vdiff__sample-col">
                        <div class="mj-query-vdiff__sample-title">Base Snapshot (v{{ BaseVersion.VersionNumber }})</div>
                        @if (tbl.BaseSampleRows.length === 0) {
                          <div class="mj-query-vdiff__muted">No inline rows captured.</div>
                        } @else {
                          <table class="mj-query-vdiff__mini-tbl">
                            <thead>
                              <tr>
                                @for (col of tbl.SamplePreviewColumns; track col) {
                                  <th>{{ col }}</th>
                                }
                              </tr>
                            </thead>
                            <tbody>
                              @for (r of tbl.BaseSampleRows; track $index) {
                                <tr>
                                  @for (col of tbl.SamplePreviewColumns; track col) {
                                    <td>{{ r[col] }}</td>
                                  }
                                </tr>
                              }
                            </tbody>
                          </table>
                        }
                      </div>

                      <div class="mj-query-vdiff__sample-col">
                        <div class="mj-query-vdiff__sample-title">Target Snapshot (v{{ TargetVersion.VersionNumber }})</div>
                        @if (tbl.TargetSampleRows.length === 0) {
                          <div class="mj-query-vdiff__muted">No inline rows captured.</div>
                        } @else {
                          <table class="mj-query-vdiff__mini-tbl">
                            <thead>
                              <tr>
                                @for (col of tbl.SamplePreviewColumns; track col) {
                                  <th>{{ col }}</th>
                                }
                              </tr>
                            </thead>
                            <tbody>
                              @for (r of tbl.TargetSampleRows; track $index) {
                                <tr>
                                  @for (col of tbl.SamplePreviewColumns; track col) {
                                    <td>{{ r[col] }}</td>
                                  }
                                </tr>
                              }
                            </tbody>
                          </table>
                        }
                      </div>
                    </div>
                  }
                </section>
              }
            </div>
          }

          @case ('narrative') {
            <div class="mj-query-vdiff__tables">
              <section class="mj-query-vdiff__card">
                <h4>
                  <i class="fas fa-diagram-project"></i> Query Plan Redline
                  @if (!DiffResult.PlanChanged) {
                    <span class="mj-q-status" data-status="unchanged">unchanged</span>
                  }
                </h4>
                <div class="mj-query-vdiff__redline">@for (sp of DiffResult.PlanRedline; track $index) {@if (sp.Type === 'delete') {<del class="mj-q-rdel">{{ sp.Text }}</del>} @else if (sp.Type === 'insert') {<ins class="mj-q-rins">{{ sp.Text }}</ins>} @else {{{ sp.Text }}}}</div>
              </section>

              <section class="mj-query-vdiff__card">
                <h4>
                  <i class="fas fa-lightbulb"></i> Interpretation Redline
                  @if (!DiffResult.InterpretationChanged) {
                    <span class="mj-q-status" data-status="unchanged">unchanged</span>
                  }
                </h4>
                <div class="mj-query-vdiff__redline">@for (sp of DiffResult.InterpretationRedline; track $index) {@if (sp.Type === 'delete') {<del class="mj-q-rdel">{{ sp.Text }}</del>} @else if (sp.Type === 'insert') {<ins class="mj-q-rins">{{ sp.Text }}</ins>} @else {{{ sp.Text }}}}</div>
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

      .mj-query-vdiff {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-query-vdiff__nav {
        padding: 6px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
      }

      .mj-query-vdiff__tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .mj-query-vdiff__tab {
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

      .mj-query-vdiff__tab--active {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse, #fff);
      }

      .mj-q-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
      }

      .mj-q-badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
      }

      .mj-query-vdiff__cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
      }

      .mj-query-vdiff__tables {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-query-vdiff__card {
        padding: 14px;
        border-radius: 8px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mj-query-vdiff__card h4 {
        margin: 0;
        font-size: 13px;
        color: var(--mj-text-primary);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mj-query-vdiff__kv-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-query-vdiff__kv {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--mj-bg-surface);
        font-size: 12px;
      }

      .mj-query-vdiff__kv-key {
        font-weight: 600;
        color: var(--mj-text-secondary);
      }

      .mj-q-add {
        color: var(--mj-status-success);
      }

      .mj-q-del {
        color: var(--mj-status-error);
      }

      .mj-query-vdiff__notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-subtle);
        font-size: 12px;
        color: var(--mj-text-secondary);
      }

      .mj-query-vdiff__tbl-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .mj-query-vdiff__tbl-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: var(--mj-text-secondary);
      }

      .mj-q-status {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-muted);
      }

      .mj-q-status[data-status='added'] {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
      }

      .mj-q-status[data-status='removed'] {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 16%, transparent);
      }

      .mj-q-status[data-status='modified'] {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 16%, transparent);
      }

      .mj-query-vdiff__schema-tbl,
      .mj-query-vdiff__mini-tbl {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        background: var(--mj-bg-surface);
        border-radius: 6px;
        overflow: hidden;
      }

      .mj-query-vdiff__schema-tbl th,
      .mj-query-vdiff__schema-tbl td,
      .mj-query-vdiff__mini-tbl th,
      .mj-query-vdiff__mini-tbl td {
        padding: 7px 10px;
        text-align: left;
        border-bottom: 1px solid var(--mj-border-subtle);
      }

      .mj-query-vdiff__schema-tbl tr[data-status='added'] {
        background: color-mix(in srgb, var(--mj-status-success) 9%, var(--mj-bg-surface));
      }

      .mj-query-vdiff__schema-tbl tr[data-status='removed'] {
        background: color-mix(in srgb, var(--mj-status-error) 9%, var(--mj-bg-surface));
      }

      .mj-query-vdiff__samples {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .mj-query-vdiff__sample-col {
        border: 1px solid var(--mj-border-subtle);
        border-radius: 6px;
        padding: 8px;
        background: var(--mj-bg-surface);
        overflow-x: auto;
      }

      .mj-query-vdiff__sample-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--mj-text-secondary);
        margin-bottom: 6px;
      }

      .mj-query-vdiff__redline {
        font-size: 13px;
        line-height: 1.65;
        white-space: pre-wrap;
        padding: 10px;
        border-radius: 6px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        color: var(--mj-text-primary);
      }

      .mj-q-rdel {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 15%, transparent);
        text-decoration: line-through;
        padding: 0 3px;
        border-radius: 3px;
      }

      .mj-q-rins {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
        text-decoration: underline;
        padding: 0 3px;
        border-radius: 3px;
        font-weight: 600;
      }

      .mj-query-vdiff__empty,
      .mj-query-vdiff__muted {
        color: var(--mj-text-muted);
        font-size: 12px;
      }

      .mj-query-vdiff__empty {
        padding: 24px;
        text-align: center;
        background: var(--mj-bg-surface-card);
        border-radius: 8px;
        border: 1px dashed var(--mj-border-default);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
    `,
  ],
})
export class QueryVersionDiffComponent implements IArtifactVersionDiffViewer, OnChanges {
  private readonly diffService = inject(ArtifactVersionDiffService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() BaseVersion!: MJArtifactVersionEntity;
  @Input() TargetVersion!: MJArtifactVersionEntity;

  public DiffResult: QueryVisualDiffResult | null = null;
  public ActiveTab: QueryDiffTabKind = 'sql';

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.BaseVersion && this.TargetVersion) {
      this.DiffResult = this.diffService.ComputeQueryDataDiff(
        this.BaseVersion.Content,
        this.TargetVersion.Content,
      );
      if (!this.DiffResult.HasSql && this.DiffResult.Tables.length > 0) {
        this.ActiveTab = 'schema';
      }
      this.cdr.markForCheck();
    }
  }

  public get TotalSchemaChanges(): number {
    if (!this.DiffResult) return 0;
    return (
      this.DiffResult.AddedColumnsCount +
      this.DiffResult.RemovedColumnsCount +
      this.DiffResult.ModifiedColumnsCount
    );
  }

  public SetTab(tab: QueryDiffTabKind): void {
    this.ActiveTab = tab;
    this.cdr.markForCheck();
  }
}
