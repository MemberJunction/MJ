import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import {
  MJArtifactVersionEntity,
  type SlideDeckThemeSpec,
  type SlideSpec,
} from '@memberjunction/core-entities';
import { IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
import {
  ArtifactVersionDiffService,
  type SlideVisualDiffItem,
  type SlidesVisualDiffResult,
} from '../../services/artifact-version-diff.service';

@Component({
  selector: 'mj-slides-version-diff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-slides-vdiff" data-testid="slides-visual-version-diff">
      @if (DiffResult) {
        <div class="mj-slides-vdiff__summary">
          <div class="mj-slides-vdiff__chips">
            <span class="mj-sv-chip mj-sv-chip--add">+{{ DiffResult.AddedSlides }} added</span>
            <span class="mj-sv-chip mj-sv-chip--del">−{{ DiffResult.RemovedSlides }} removed</span>
            <span class="mj-sv-chip mj-sv-chip--mod">~{{ DiffResult.ModifiedSlides }} modified</span>
            <span class="mj-sv-chip">{{ DiffResult.UnchangedSlides }} unchanged</span>
          </div>

          <label class="mj-slides-vdiff__filter">
            <input
              type="checkbox"
              [checked]="ChangedSlidesOnly"
              (change)="ToggleChangedSlidesOnly()"
            />
            <span>Changed slides only</span>
          </label>
        </div>

        @if (DiffResult.DeckDeltas.length > 0) {
          <div class="mj-slides-vdiff__deck-deltas">
            <strong><i class="fas fa-palette"></i> Deck & Theme Changes:</strong>
            @for (d of DiffResult.DeckDeltas; track d.Label) {
              <span class="mj-slides-vdiff__deck-delta-pill">
                {{ d.Label }}: <del>{{ d.OldValue }}</del> → <strong>{{ d.NewValue }}</strong>
              </span>
            }
          </div>
        }

        <div class="mj-slides-vdiff__body">
          <!-- Slide Diff Filmstrip -->
          <aside class="mj-slides-vdiff__filmstrip" data-testid="slides-diff-filmstrip">
            @for (item of FilteredSlides; track item.SlideID) {
              <button
                type="button"
                class="mj-slides-vdiff__thumb"
                [class.mj-slides-vdiff__thumb--selected]="SelectedSlide?.SlideID === item.SlideID"
                [class.mj-slides-vdiff__thumb--added]="item.Status === 'added'"
                [class.mj-slides-vdiff__thumb--removed]="item.Status === 'removed'"
                [class.mj-slides-vdiff__thumb--modified]="item.Status === 'modified'"
                (click)="SelectSlide(item)"
              >
                <div class="mj-slides-vdiff__thumb-top">
                  <span class="mj-slides-vdiff__thumb-num">
                    @if (item.Status === 'removed') {
                      v{{ BaseVersion.VersionNumber }} #{{ item.OldSlideNumber }}
                    } @else {
                      #{{ item.NewSlideNumber }}
                    }
                  </span>
                  <span class="mj-sv-badge" [attr.data-status]="item.Status">
                    {{ item.Status }}
                  </span>
                </div>
                <div class="mj-slides-vdiff__thumb-title">{{ item.Title }}</div>
                <div class="mj-slides-vdiff__thumb-sub">
                  {{ item.Layout }}
                  @if (item.Reordered && item.OldSlideNumber) {
                    · moved from #{{ item.OldSlideNumber }}
                  }
                </div>
              </button>
            }
          </aside>

          <!-- Side-by-Side 16:9 Stage Comparison + Region & Speaker Notes Redline -->
          <div class="mj-slides-vdiff__stage">
            @if (SelectedSlide; as sel) {
              <div class="mj-slides-vdiff__stage-grid">
                <!-- Base Slide Card -->
                <div class="mj-slides-vdiff__canvas-col">
                  <div class="mj-slides-vdiff__canvas-label">
                    <span>Base · v{{ BaseVersion.VersionNumber }}</span>
                    @if (sel.BaseSlide) {
                      <span>Slide #{{ sel.OldSlideNumber }} · {{ sel.BaseSlide.Layout }}</span>
                    }
                  </div>
                  @if (sel.BaseSlide; as bSlide) {
                    <div
                      class="mj-slides-vdiff__slide-card"
                      [style.background]="GetSlideBg(DiffResult.BaseDeck.Theme)"
                      [style.color]="GetSlideFg(DiffResult.BaseDeck.Theme)"
                    >
                      <div
                        class="mj-slides-vdiff__accent-bar"
                        [style.background]="DiffResult.BaseDeck.Theme.PrimaryColor"
                      ></div>
                      <h4 class="mj-slides-vdiff__slide-h">{{ bSlide.Title }}</h4>
                      @if (bSlide.Subtitle) {
                        <div class="mj-slides-vdiff__slide-sub">{{ bSlide.Subtitle }}</div>
                      }
                      <div class="mj-slides-vdiff__regions-preview">
                        @for (reg of bSlide.Regions; track reg.RegionID) {
                          <div class="mj-slides-vdiff__reg-box">
                            @if (reg.BigNumberValue) {
                              <div
                                class="mj-slides-vdiff__bignum"
                                [style.color]="DiffResult.BaseDeck.Theme.PrimaryColor"
                              >
                                {{ reg.BigNumberValue }}
                              </div>
                              <div class="mj-slides-vdiff__bignum-lbl">{{ reg.BigNumberLabel }}</div>
                            } @else {
                              <div class="mj-slides-vdiff__reg-md">{{ reg.MarkdownContent }}</div>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  } @else {
                    <div class="mj-slides-vdiff__slide-placeholder mj-slides-vdiff__slide-placeholder--added">
                      <i class="fas fa-plus-circle"></i>
                      <span>New slide added in v{{ TargetVersion.VersionNumber }}</span>
                    </div>
                  }
                </div>

                <!-- Target Slide Card -->
                <div class="mj-slides-vdiff__canvas-col">
                  <div class="mj-slides-vdiff__canvas-label">
                    <span>Target · v{{ TargetVersion.VersionNumber }}</span>
                    @if (sel.TargetSlide) {
                      <span>Slide #{{ sel.NewSlideNumber }} · {{ sel.TargetSlide.Layout }}</span>
                    }
                  </div>
                  @if (sel.TargetSlide; as tSlide) {
                    <div
                      class="mj-slides-vdiff__slide-card"
                      [style.background]="GetSlideBg(DiffResult.TargetDeck.Theme)"
                      [style.color]="GetSlideFg(DiffResult.TargetDeck.Theme)"
                    >
                      <div
                        class="mj-slides-vdiff__accent-bar"
                        [style.background]="DiffResult.TargetDeck.Theme.PrimaryColor"
                      ></div>
                      <h4 class="mj-slides-vdiff__slide-h">{{ tSlide.Title }}</h4>
                      @if (tSlide.Subtitle) {
                        <div class="mj-slides-vdiff__slide-sub">{{ tSlide.Subtitle }}</div>
                      }
                      <div class="mj-slides-vdiff__regions-preview">
                        @for (reg of tSlide.Regions; track reg.RegionID) {
                          <div class="mj-slides-vdiff__reg-box">
                            @if (reg.BigNumberValue) {
                              <div
                                class="mj-slides-vdiff__bignum"
                                [style.color]="DiffResult.TargetDeck.Theme.PrimaryColor"
                              >
                                {{ reg.BigNumberValue }}
                              </div>
                              <div class="mj-slides-vdiff__bignum-lbl">{{ reg.BigNumberLabel }}</div>
                            } @else {
                              <div class="mj-slides-vdiff__reg-md">{{ reg.MarkdownContent }}</div>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  } @else {
                    <div class="mj-slides-vdiff__slide-placeholder mj-slides-vdiff__slide-placeholder--removed">
                      <i class="fas fa-trash-can"></i>
                      <span>Slide removed in v{{ TargetVersion.VersionNumber }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Word-Level Redline Breakdown for Regions & Speaker Notes -->
              <div class="mj-slides-vdiff__redlines">
                <h5><i class="fas fa-highlighter"></i> Slide Redline Details</h5>

                <div class="mj-slides-vdiff__redline-card">
                  <div class="mj-slides-vdiff__redline-lbl">Slide Title</div>
                  <div class="mj-slides-vdiff__redline-text">@for (sp of sel.TitleRedline; track $index) {@if (sp.Type === 'delete') {<del class="mj-s-del">{{ sp.Text }}</del>} @else if (sp.Type === 'insert') {<ins class="mj-s-ins">{{ sp.Text }}</ins>} @else {{{ sp.Text }}}}</div>
                </div>

                @for (reg of sel.RegionDeltas; track reg.RegionID) {
                  @if (reg.Status !== 'unchanged') {
                    <div class="mj-slides-vdiff__redline-card">
                      <div class="mj-slides-vdiff__redline-lbl">
                        <span>{{ reg.Label }} ({{ reg.Kind }})</span>
                        <span class="mj-sv-badge" [attr.data-status]="reg.Status">{{ reg.Status }}</span>
                      </div>
                      @if (reg.PropertyDeltas.length > 0) {
                        <div class="mj-slides-vdiff__prop-list">
                          @for (p of reg.PropertyDeltas; track p.Label) {
                            <div>
                              <strong>{{ p.Label }}:</strong>
                              <del class="mj-s-del">{{ p.OldValue }}</del> →
                              <ins class="mj-s-ins">{{ p.NewValue }}</ins>
                            </div>
                          }
                        </div>
                      }
                      <div class="mj-slides-vdiff__redline-text">@for (sp of reg.RedlineSpans; track $index) {@if (sp.Type === 'delete') {<del class="mj-s-del">{{ sp.Text }}</del>} @else if (sp.Type === 'insert') {<ins class="mj-s-ins">{{ sp.Text }}</ins>} @else {{{ sp.Text }}}}</div>
                    </div>
                  }
                }

                @if (sel.SpeakerNotesChanged) {
                  <div class="mj-slides-vdiff__redline-card">
                    <div class="mj-slides-vdiff__redline-lbl">
                      <span><i class="fas fa-comment-dots"></i> Speaker Notes</span>
                      <span class="mj-sv-badge" data-status="modified">modified</span>
                    </div>
                    <div class="mj-slides-vdiff__redline-text">@for (sp of sel.SpeakerNotesRedline; track $index) {@if (sp.Type === 'delete') {<del class="mj-s-del">{{ sp.Text }}</del>} @else if (sp.Type === 'insert') {<ins class="mj-s-ins">{{ sp.Text }}</ins>} @else {{{ sp.Text }}}}</div>
                  </div>
                }
              </div>
            } @else {
              <div class="mj-slides-vdiff__empty">
                <i class="fas fa-circle-check"></i>
                <span>No changed slides match the current filter.</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .mj-slides-vdiff {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-slides-vdiff__summary {
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

      .mj-slides-vdiff__chips {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .mj-sv-chip {
        font-size: 12px;
        font-weight: 600;
        padding: 3px 9px;
        border-radius: 999px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
      }

      .mj-sv-chip--add {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 14%, transparent);
      }

      .mj-sv-chip--del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 14%, transparent);
      }

      .mj-sv-chip--mod {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
      }

      .mj-slides-vdiff__filter {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-slides-vdiff__deck-deltas {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--mj-brand-primary) 7%, var(--mj-bg-surface-card));
        border: 1px solid var(--mj-border-subtle);
        font-size: 12px;
        color: var(--mj-text-primary);
      }

      .mj-slides-vdiff__deck-delta-pill {
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-slides-vdiff__body {
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        gap: 14px;
        align-items: start;
      }

      .mj-slides-vdiff__filmstrip {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 640px;
        overflow-y: auto;
        padding-right: 4px;
      }

      .mj-slides-vdiff__thumb {
        text-align: left;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
        cursor: pointer;
        transition: border-color 0.15s ease, transform 0.1s ease;
      }

      .mj-slides-vdiff__thumb--selected {
        border-color: var(--mj-brand-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 24%, transparent);
      }

      .mj-slides-vdiff__thumb--added {
        border-left: 4px solid var(--mj-status-success);
      }

      .mj-slides-vdiff__thumb--removed {
        border-left: 4px solid var(--mj-status-error);
      }

      .mj-slides-vdiff__thumb--modified {
        border-left: 4px solid var(--mj-brand-primary);
      }

      .mj-slides-vdiff__thumb-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }

      .mj-slides-vdiff__thumb-num {
        font-size: 11px;
        font-weight: 700;
        color: var(--mj-text-muted);
      }

      .mj-sv-badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-muted);
      }

      .mj-sv-badge[data-status='added'] {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
      }

      .mj-sv-badge[data-status='removed'] {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 16%, transparent);
      }

      .mj-sv-badge[data-status='modified'] {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 16%, transparent);
      }

      .mj-slides-vdiff__thumb-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--mj-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mj-slides-vdiff__thumb-sub {
        font-size: 11px;
        color: var(--mj-text-muted);
        margin-top: 2px;
      }

      .mj-slides-vdiff__stage {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .mj-slides-vdiff__stage-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .mj-slides-vdiff__canvas-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-slides-vdiff__canvas-label {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }

      .mj-slides-vdiff__slide-card {
        aspect-ratio: 16 / 9;
        border-radius: 10px;
        border: 1px solid var(--mj-border-default);
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      }

      .mj-slides-vdiff__accent-bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
      }

      .mj-slides-vdiff__slide-h {
        margin: 4px 0 2px;
        font-size: 15px;
        font-weight: 700;
      }

      .mj-slides-vdiff__slide-sub {
        font-size: 11px;
        opacity: 0.78;
        margin-bottom: 8px;
      }

      .mj-slides-vdiff__regions-preview {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        overflow: hidden;
      }

      .mj-slides-vdiff__reg-box {
        padding: 8px;
        border-radius: 6px;
        background: rgba(127, 127, 127, 0.08);
        font-size: 11px;
        overflow: hidden;
      }

      .mj-slides-vdiff__bignum {
        font-size: 20px;
        font-weight: 800;
      }

      .mj-slides-vdiff__bignum-lbl {
        font-size: 11px;
        opacity: 0.8;
      }

      .mj-slides-vdiff__reg-md {
        white-space: pre-wrap;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 6;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .mj-slides-vdiff__slide-placeholder {
        aspect-ratio: 16 / 9;
        border-radius: 10px;
        border: 2px dashed var(--mj-border-default);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 12px;
        color: var(--mj-text-muted);
        background: var(--mj-bg-surface-sunken);
      }

      .mj-slides-vdiff__slide-placeholder--added i {
        color: var(--mj-status-success);
        font-size: 20px;
      }

      .mj-slides-vdiff__slide-placeholder--removed i {
        color: var(--mj-status-error);
        font-size: 20px;
      }

      .mj-slides-vdiff__redlines {
        padding: 14px;
        border-radius: 10px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mj-slides-vdiff__redlines h5 {
        margin: 0;
        font-size: 13px;
        color: var(--mj-text-primary);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .mj-slides-vdiff__redline-card {
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-slides-vdiff__redline-lbl {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        font-weight: 700;
        color: var(--mj-text-secondary);
        margin-bottom: 5px;
      }

      .mj-slides-vdiff__prop-list {
        font-size: 12px;
        margin-bottom: 6px;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .mj-slides-vdiff__redline-text {
        font-size: 13px;
        line-height: 1.6;
        white-space: pre-wrap;
        color: var(--mj-text-primary);
      }

      .mj-s-del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 15%, transparent);
        text-decoration: line-through;
        padding: 0 3px;
        border-radius: 3px;
      }

      .mj-s-ins {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
        text-decoration: underline;
        padding: 0 3px;
        border-radius: 3px;
        font-weight: 600;
      }

      .mj-slides-vdiff__empty {
        padding: 32px;
        text-align: center;
        color: var(--mj-text-secondary);
        background: var(--mj-bg-surface-card);
        border-radius: 10px;
        border: 1px dashed var(--mj-border-default);
      }
    `,
  ],
})
export class SlidesVersionDiffComponent implements IArtifactVersionDiffViewer, OnChanges {
  private readonly diffService = inject(ArtifactVersionDiffService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() BaseVersion!: MJArtifactVersionEntity;
  @Input() TargetVersion!: MJArtifactVersionEntity;

  public DiffResult: SlidesVisualDiffResult | null = null;
  public SelectedSlide: SlideVisualDiffItem | null = null;
  public ChangedSlidesOnly = false;

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.BaseVersion && this.TargetVersion) {
      this.DiffResult = this.diffService.ComputeSlidesVisualDiff(
        this.BaseVersion.Content,
        this.TargetVersion.Content,
      );
      const firstChanged = this.DiffResult.Slides.find((s) => s.Status !== 'unchanged');
      this.SelectedSlide = firstChanged ?? this.DiffResult.Slides[0] ?? null;
      this.cdr.markForCheck();
    }
  }

  public get FilteredSlides(): SlideVisualDiffItem[] {
    if (!this.DiffResult) return [];
    if (!this.ChangedSlidesOnly) return this.DiffResult.Slides;
    return this.DiffResult.Slides.filter((s) => s.Status !== 'unchanged');
  }

  public SelectSlide(item: SlideVisualDiffItem): void {
    this.SelectedSlide = item;
    this.cdr.markForCheck();
  }

  public ToggleChangedSlidesOnly(): void {
    this.ChangedSlidesOnly = !this.ChangedSlidesOnly;
    const list = this.FilteredSlides;
    if (this.SelectedSlide && !list.some((s) => s.SlideID === this.SelectedSlide?.SlideID)) {
      this.SelectedSlide = list[0] ?? null;
    }
    this.cdr.markForCheck();
  }

  public GetSlideBg(theme: SlideDeckThemeSpec | undefined): string {
    return theme?.BackgroundColor || 'var(--mj-bg-surface)';
  }

  public GetSlideFg(theme: SlideDeckThemeSpec | undefined): string {
    return theme?.TextColor || 'var(--mj-text-primary)';
  }
}
