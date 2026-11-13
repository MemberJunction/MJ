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
  type DocsVisualDiffBlock,
  type DocsVisualDiffResult,
} from '../../services/artifact-version-diff.service';

@Component({
  selector: 'mj-docs-version-diff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-docs-vdiff" data-testid="docs-visual-version-diff">
      @if (DiffResult) {
        <div class="mj-docs-vdiff__toolbar">
          <div class="mj-docs-vdiff__stats">
            <span class="mj-vdiff-chip mj-vdiff-chip--add">
              <i class="fas fa-plus"></i> {{ DiffResult.AddedWords }} words ({{ DiffResult.AddedBlocks }} blocks)
            </span>
            <span class="mj-vdiff-chip mj-vdiff-chip--del">
              <i class="fas fa-minus"></i> {{ DiffResult.RemovedWords }} words ({{ DiffResult.RemovedBlocks }} blocks)
            </span>
            <span class="mj-vdiff-chip mj-vdiff-chip--mod">
              <i class="fas fa-pen-nib"></i> {{ DiffResult.ModifiedBlocks }} edited
            </span>
          </div>

          <label class="mj-docs-vdiff__toggle">
            <input
              type="checkbox"
              [checked]="HideUnchanged"
              (change)="ToggleHideUnchanged()"
            />
            <span>Changes only ({{ DiffResult.UnchangedBlocks }} unchanged hidden when checked)</span>
          </label>
        </div>

        @if (
          DiffResult.AddedBlocks === 0 &&
          DiffResult.RemovedBlocks === 0 &&
          DiffResult.ModifiedBlocks === 0
        ) {
          <div class="mj-docs-vdiff__identical">
            <i class="fas fa-circle-check"></i>
            <span>Document content is identical between v{{ BaseVersion.VersionNumber }} and v{{ TargetVersion.VersionNumber }}.</span>
          </div>
        } @else {
          <div class="mj-docs-vdiff__paper">
            @for (blk of VisibleBlocks; track blk.BlockKey) {
              <div
                class="mj-docs-vdiff__block"
                [class.mj-docs-vdiff__block--added]="blk.Status === 'added'"
                [class.mj-docs-vdiff__block--removed]="blk.Status === 'removed'"
                [class.mj-docs-vdiff__block--modified]="blk.Status === 'modified'"
                [class.mj-docs-vdiff__block--unchanged]="blk.Status === 'unchanged'"
                [attr.data-testid]="'docs-diff-block-' + blk.Status"
              >
                @if (blk.Status !== 'unchanged') {
                  <div class="mj-docs-vdiff__gutter-badge">
                    @switch (blk.Status) {
                      @case ('added') {
                        <span class="mj-vdiff-pill mj-vdiff-pill--add">Added</span>
                      }
                      @case ('removed') {
                        <span class="mj-vdiff-pill mj-vdiff-pill--del">Removed</span>
                      }
                      @case ('modified') {
                        <span class="mj-vdiff-pill mj-vdiff-pill--mod">Edited</span>
                      }
                    }
                    <span class="mj-docs-vdiff__cat">{{ blk.TitleLabel }}</span>
                  </div>
                }

                @if (blk.Category === 'live-block' || blk.Category === 'artifact-embed') {
                  <!-- Structured Live View / Saved Query / Embedded Artifact Block Diff Card -->
                  <div class="mj-docs-vdiff__livecard">
                    <div class="mj-docs-vdiff__livecard-head">
                      <i
                        class="fas"
                        [class.fa-table]="blk.Category === 'live-block'"
                        [class.fa-cube]="blk.Category === 'artifact-embed'"
                      ></i>
                      <strong>{{ blk.TitleLabel }}</strong>
                      <span class="mj-docs-vdiff__livekind">
                        {{ (blk.TargetBlockSpec || blk.BaseBlockSpec)?.Kind || 'Live Block' }}
                      </span>
                    </div>

                    @if (blk.BlockSpecDeltas.length > 0) {
                      <div class="mj-docs-vdiff__deltas">
                        @for (d of blk.BlockSpecDeltas; track d.Label) {
                          <div class="mj-docs-vdiff__delta-row">
                            <span class="mj-docs-vdiff__delta-key">{{ d.Label }}</span>
                            <span class="mj-docs-vdiff__delta-old">{{ d.OldValue }}</span>
                            <i class="fas fa-arrow-right"></i>
                            <span class="mj-docs-vdiff__delta-new">{{ d.NewValue }}</span>
                          </div>
                        }
                      </div>
                    } @else if (blk.Status === 'added' && blk.TargetBlockSpec; as spec) {
                      <div class="mj-docs-vdiff__live-meta">
                        @if (spec.EntityName) { <span>Entity: <strong>{{ spec.EntityName }}</strong></span> }
                        @if (spec.ViewName) { <span>View: <strong>{{ spec.ViewName }}</strong></span> }
                        @if (spec.QueryName) { <span>Query: <strong>{{ spec.QueryName }}</strong></span> }
                        @if (spec.ExtraFilter) { <span>Filter: <code>{{ spec.ExtraFilter }}</code></span> }
                      </div>
                    } @else if (blk.Status === 'removed' && blk.BaseBlockSpec; as rSpec) {
                      <div class="mj-docs-vdiff__live-meta">
                        @if (rSpec.EntityName) { <span>Entity: <strong>{{ rSpec.EntityName }}</strong></span> }
                        @if (rSpec.ViewName) { <span>View: <strong>{{ rSpec.ViewName }}</strong></span> }
                        @if (rSpec.QueryName) { <span>Query: <strong>{{ rSpec.QueryName }}</strong></span> }
                      </div>
                    }
                  </div>
                } @else {
                  <!-- Word / Google-Docs Style Inline Redline Typography -->
                  <div
                    class="mj-docs-vdiff__prose"
                    [class.mj-docs-vdiff__prose--h1]="blk.Category === 'heading' && blk.HeadingLevel === 1"
                    [class.mj-docs-vdiff__prose--h2]="blk.Category === 'heading' && blk.HeadingLevel === 2"
                    [class.mj-docs-vdiff__prose--h3]="blk.Category === 'heading' && (blk.HeadingLevel || 3) >= 3"
                    [class.mj-docs-vdiff__prose--code]="blk.Category === 'code' || blk.Category === 'table'"
                    [class.mj-docs-vdiff__prose--callout]="blk.Category === 'callout'"
                  >@for (sp of GetCleanSpans(blk); track $index) {@if (sp.Type === 'delete') {<del class="mj-redline-del">{{ sp.Text }}</del>} @else if (sp.Type === 'insert') {<ins class="mj-redline-ins">{{ sp.Text }}</ins>} @else {<span>{{ sp.Text }}</span>}}</div>
                }
              </div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .mj-docs-vdiff {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .mj-docs-vdiff__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        padding: 10px 14px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
      }

      .mj-docs-vdiff__stats {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .mj-vdiff-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        padding: 3px 9px;
        border-radius: 999px;
      }

      .mj-vdiff-chip--add {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 13%, transparent);
      }

      .mj-vdiff-chip--del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 13%, transparent);
      }

      .mj-vdiff-chip--mod {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 13%, transparent);
      }

      .mj-docs-vdiff__toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-docs-vdiff__identical {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 36px 16px;
        background: var(--mj-bg-surface-card);
        border: 1px dashed var(--mj-border-default);
        border-radius: 10px;
        color: var(--mj-text-secondary);
        font-size: 13px;
      }

      .mj-docs-vdiff__identical i {
        color: var(--mj-status-success);
      }

      .mj-docs-vdiff__paper {
        max-width: 860px;
        width: 100%;
        margin: 0 auto;
        padding: 28px 36px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-docs-vdiff__block {
        padding: 10px 14px;
        border-radius: 8px;
        border-left: 3px solid transparent;
        transition: background 0.15s ease;
      }

      .mj-docs-vdiff__block--unchanged {
        opacity: 0.78;
      }

      .mj-docs-vdiff__block--added {
        border-left-color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 7%, var(--mj-bg-surface));
      }

      .mj-docs-vdiff__block--removed {
        border-left-color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 7%, var(--mj-bg-surface));
      }

      .mj-docs-vdiff__block--modified {
        border-left-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 5%, var(--mj-bg-surface));
      }

      .mj-docs-vdiff__gutter-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .mj-vdiff-pill {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 2px 7px;
        border-radius: 999px;
      }

      .mj-vdiff-pill--add {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
      }

      .mj-vdiff-pill--del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 16%, transparent);
      }

      .mj-vdiff-pill--mod {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 16%, transparent);
      }

      .mj-docs-vdiff__cat {
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-docs-vdiff__prose {
        font-size: 14px;
        line-height: 1.7;
        color: var(--mj-text-primary);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .mj-docs-vdiff__prose--h1 {
        font-size: 22px;
        font-weight: 700;
        line-height: 1.3;
      }

      .mj-docs-vdiff__prose--h2 {
        font-size: 18px;
        font-weight: 700;
        line-height: 1.35;
      }

      .mj-docs-vdiff__prose--h3 {
        font-size: 15px;
        font-weight: 700;
      }

      .mj-docs-vdiff__prose--code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        padding: 10px;
        background: var(--mj-bg-surface-sunken);
        border-radius: 6px;
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-docs-vdiff__prose--callout {
        padding: 8px 12px;
        background: var(--mj-bg-surface-card);
        border-radius: 6px;
        font-style: italic;
      }

      .mj-redline-del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 15%, transparent);
        text-decoration: line-through;
        padding: 1px 3px;
        border-radius: 3px;
      }

      .mj-redline-ins {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
        text-decoration: underline;
        text-underline-offset: 2px;
        padding: 1px 3px;
        border-radius: 3px;
        font-weight: 600;
      }

      .mj-docs-vdiff__livecard {
        padding: 10px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-vdiff__livecard-head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--mj-text-primary);
      }

      .mj-docs-vdiff__livecard-head i {
        color: var(--mj-brand-primary);
      }

      .mj-docs-vdiff__livekind {
        margin-left: auto;
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        color: var(--mj-text-secondary);
      }

      .mj-docs-vdiff__deltas {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mj-docs-vdiff__delta-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
        padding: 4px 8px;
        background: var(--mj-bg-surface);
        border-radius: 5px;
      }

      .mj-docs-vdiff__delta-key {
        font-weight: 600;
        color: var(--mj-text-secondary);
        min-width: 110px;
      }

      .mj-docs-vdiff__delta-old {
        color: var(--mj-status-error);
        text-decoration: line-through;
      }

      .mj-docs-vdiff__delta-new {
        color: var(--mj-status-success);
        font-weight: 600;
      }

      .mj-docs-vdiff__live-meta {
        margin-top: 6px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        font-size: 12px;
        color: var(--mj-text-secondary);
      }
    `,
  ],
})
export class DocsVersionDiffComponent implements IArtifactVersionDiffViewer, OnChanges {
  private readonly diffService = inject(ArtifactVersionDiffService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() BaseVersion!: MJArtifactVersionEntity;
  @Input() TargetVersion!: MJArtifactVersionEntity;

  public DiffResult: DocsVisualDiffResult | null = null;
  public HideUnchanged = false;

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.BaseVersion && this.TargetVersion) {
      this.DiffResult = this.diffService.ComputeDocsVisualDiff(
        this.BaseVersion.Content,
        this.TargetVersion.Content,
      );
      this.cdr.markForCheck();
    }
  }

  public get VisibleBlocks(): DocsVisualDiffBlock[] {
    if (!this.DiffResult) return [];
    if (!this.HideUnchanged) return this.DiffResult.Blocks;
    return this.DiffResult.Blocks.filter((b) => b.Status !== 'unchanged');
  }

  public ToggleHideUnchanged(): void {
    this.HideUnchanged = !this.HideUnchanged;
    this.cdr.markForCheck();
  }

  /**
   * Strips leading `#` markers on heading blocks so headings render cleanly in real typography.
   */
  public GetCleanSpans(blk: DocsVisualDiffBlock) {
    if (blk.Category !== 'heading' || blk.RedlineSpans.length === 0) {
      return blk.RedlineSpans;
    }
    const first = blk.RedlineSpans[0];
    const stripped = first.Text.replace(/^#{1,6}\s+/, '');
    return [{ ...first, Text: stripped }, ...blk.RedlineSpans.slice(1)];
  }
}
