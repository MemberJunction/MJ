import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import type { GitTextDiffResult } from '../../services/artifact-version-diff.service';

@Component({
  selector: 'mj-git-diff-lines-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!Diff || Diff.IsIdentical) {
      <div class="mj-git-diff-empty" data-testid="git-diff-identical">
        <i class="fas fa-circle-check"></i>
        <span>{{ EmptyMessage }}</span>
      </div>
    } @else {
      <div class="mj-git-diff-box" [attr.data-testid]="TestId">
        <div class="mj-git-diff-box__meta">
          <div class="mj-git-diff-box__title">
            @if (HeaderLabel) {
              <strong>{{ HeaderLabel }}</strong>
            }
            <span class="mj-git-stat mj-git-stat--add">+{{ Diff.AddedLines }}</span>
            <span class="mj-git-stat mj-git-stat--del">−{{ Diff.RemovedLines }}</span>
          </div>
          @if (ShowLayoutToggle) {
            <div class="mj-git-layout-pills">
              <button
                type="button"
                class="mj-git-pill"
                [class.mj-git-pill--active]="Layout === 'unified'"
                (click)="SetLayout('unified')"
              >
                Unified
              </button>
              <button
                type="button"
                class="mj-git-pill"
                [class.mj-git-pill--active]="Layout === 'split'"
                (click)="SetLayout('split')"
              >
                Split
              </button>
            </div>
          }
        </div>

        @if (Layout === 'unified') {
          <div class="mj-git-unified">
            @for (grp of Diff.Groups; track grp.GroupID) {
              @if (grp.IsCollapsibleContext && !IsExpanded(grp.GroupID)) {
                <button
                  type="button"
                  class="mj-git-ContextExpander"
                  (click)="ExpandGroup(grp.GroupID)"
                >
                  <i class="fas fa-arrows-up-down"></i>
                  <span>Show {{ grp.UnifiedLines.length }} unchanged lines</span>
                </button>
              } @else {
                @for (line of grp.UnifiedLines; track $index) {
                  <div
                    class="mj-git-line"
                    [class.mj-git-line--add]="line.Kind === 'added'"
                    [class.mj-git-line--del]="line.Kind === 'removed'"
                  >
                    <span class="mj-git-num">{{ line.OldLineNumber ?? '' }}</span>
                    <span class="mj-git-num">{{ line.NewLineNumber ?? '' }}</span>
                    <span class="mj-git-sig">
                      {{ line.Kind === 'added' ? '+' : line.Kind === 'removed' ? '−' : ' ' }}
                    </span>
                    <pre class="mj-git-code">@if (line.InlineSpans && line.InlineSpans.length > 0) {@for (sp of line.InlineSpans; track $index) {@if (sp.Type === 'delete') {<mark class="mj-git-tok-del">{{ sp.Text }}</mark>} @else if (sp.Type === 'insert') {<mark class="mj-git-tok-add">{{ sp.Text }}</mark>} @else {{{ sp.Text }}}}} @else {{{ line.Text }}}</pre>
                  </div>
                }
              }
            }
          </div>
        } @else {
          <div class="mj-git-split">
            @for (grp of Diff.Groups; track grp.GroupID) {
              @if (grp.IsCollapsibleContext && !IsExpanded(grp.GroupID)) {
                <button
                  type="button"
                  class="mj-git-ContextExpander"
                  (click)="ExpandGroup(grp.GroupID)"
                >
                  <i class="fas fa-arrows-up-down"></i>
                  <span>Show {{ grp.SplitRows.length }} unchanged lines</span>
                </button>
              } @else {
                @for (row of grp.SplitRows; track $index) {
                  <div class="mj-git-split-row">
                    <div
                      class="mj-git-split-cell"
                      [class.mj-git-line--del]="row.Kind === 'removed' || row.Kind === 'modified'"
                      [class.mj-git-split-cell--empty]="row.LeftText === null"
                    >
                      <span class="mj-git-num">{{ row.LeftLineNumber ?? '' }}</span>
                      <span class="mj-git-sig">{{
                        row.LeftText === null ? ' ' : row.Kind === 'unchanged' ? ' ' : '−'
                      }}</span>
                      @if (row.LeftText !== null) {
                        <pre class="mj-git-code">@if (row.LeftSpans && row.LeftSpans.length > 0) {@for (sp of row.LeftSpans; track $index) {@if (sp.Type === 'delete') {<mark class="mj-git-tok-del">{{ sp.Text }}</mark>} @else {{{ sp.Text }}}}} @else {{{ row.LeftText }}}</pre>
                      }
                    </div>
                    <div
                      class="mj-git-split-cell"
                      [class.mj-git-line--add]="row.Kind === 'added' || row.Kind === 'modified'"
                      [class.mj-git-split-cell--empty]="row.RightText === null"
                    >
                      <span class="mj-git-num">{{ row.RightLineNumber ?? '' }}</span>
                      <span class="mj-git-sig">{{
                        row.RightText === null ? ' ' : row.Kind === 'unchanged' ? ' ' : '+'
                      }}</span>
                      @if (row.RightText !== null) {
                        <pre class="mj-git-code">@if (row.RightSpans && row.RightSpans.length > 0) {@for (sp of row.RightSpans; track $index) {@if (sp.Type === 'insert') {<mark class="mj-git-tok-add">{{ sp.Text }}</mark>} @else {{{ sp.Text }}}}} @else {{{ row.RightText }}}</pre>
                      }
                    </div>
                  </div>
                }
              }
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .mj-git-diff-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 28px 16px;
        color: var(--mj-text-secondary);
        background: var(--mj-bg-surface-card);
        border: 1px dashed var(--mj-border-default);
        border-radius: 8px;
        font-size: 13px;
      }

      .mj-git-diff-empty i {
        color: var(--mj-status-success);
      }

      .mj-git-diff-box {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        overflow: hidden;
        background: var(--mj-bg-surface);
      }

      .mj-git-diff-box__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        font-size: 12px;
      }

      .mj-git-diff-box__title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--mj-text-primary);
      }

      .mj-git-stat {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-weight: 600;
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 999px;
      }

      .mj-git-stat--add {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 14%, transparent);
      }

      .mj-git-stat--del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 14%, transparent);
      }

      .mj-git-layout-pills {
        display: inline-flex;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        overflow: hidden;
      }

      .mj-git-pill {
        border: none;
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        cursor: pointer;
      }

      .mj-git-pill--active {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse, #fff);
      }

      .mj-git-unified,
      .mj-git-split {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.55;
        overflow-x: auto;
      }

      .mj-git-ContextExpander {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 5px 12px;
        border: none;
        border-top: 1px solid var(--mj-border-subtle);
        border-bottom: 1px solid var(--mj-border-subtle);
        background: color-mix(in srgb, var(--mj-brand-primary) 7%, var(--mj-bg-surface-card));
        color: var(--mj-brand-primary);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-git-ContextExpander:hover {
        background: color-mix(in srgb, var(--mj-brand-primary) 13%, var(--mj-bg-surface-card));
      }

      .mj-git-line {
        display: grid;
        grid-template-columns: 42px 42px 20px minmax(0, 1fr);
        align-items: stretch;
      }

      .mj-git-split-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }

      .mj-git-split-cell {
        display: grid;
        grid-template-columns: 40px 18px minmax(0, 1fr);
        border-right: 1px solid var(--mj-border-subtle);
      }

      .mj-git-split-cell:last-child {
        border-right: none;
      }

      .mj-git-split-cell--empty {
        background: var(--mj-bg-surface-sunken);
      }

      .mj-git-line--add {
        background: color-mix(in srgb, var(--mj-status-success) 11%, var(--mj-bg-surface));
      }

      .mj-git-line--del {
        background: color-mix(in srgb, var(--mj-status-error) 11%, var(--mj-bg-surface));
      }

      .mj-git-num {
        padding: 1px 6px;
        text-align: right;
        color: var(--mj-text-muted);
        user-select: none;
        border-right: 1px solid var(--mj-border-subtle);
        font-size: 11px;
      }

      .mj-git-sig {
        text-align: center;
        user-select: none;
        color: var(--mj-text-muted);
        font-weight: 700;
      }

      .mj-git-code {
        margin: 0;
        padding: 1px 8px;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: inherit;
        color: var(--mj-text-primary);
      }

      .mj-git-tok-del {
        background: color-mix(in srgb, var(--mj-status-error) 28%, transparent);
        color: var(--mj-text-primary);
        border-radius: 2px;
        padding: 0 2px;
      }

      .mj-git-tok-add {
        background: color-mix(in srgb, var(--mj-status-success) 28%, transparent);
        color: var(--mj-text-primary);
        border-radius: 2px;
        padding: 0 2px;
      }
    `,
  ],
})
export class GitDiffLinesViewComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() Diff: GitTextDiffResult | null = null;
  @Input() Layout: 'unified' | 'split' = 'unified';
  @Input() ShowLayoutToggle = true;
  @Input() HeaderLabel = '';
  @Input() EmptyMessage = 'No text differences between these versions.';
  @Input() TestId = 'git-diff-lines-view';

  private expandedGroups = new Set<string>();

  public SetLayout(layout: 'unified' | 'split'): void {
    this.Layout = layout;
    this.cdr.markForCheck();
  }

  public IsExpanded(groupId: string): boolean {
    return this.expandedGroups.has(groupId);
  }

  public ExpandGroup(groupId: string): void {
    this.expandedGroups.add(groupId);
    this.cdr.markForCheck();
  }
}
