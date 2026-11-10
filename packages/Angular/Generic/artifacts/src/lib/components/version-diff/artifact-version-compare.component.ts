import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  Type,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
import {
  ArtifactVersionDiffService,
  type GitTextDiffResult,
  type StructuralJsonDiffItem,
  type StructuralJsonDiffResult,
} from '../../services/artifact-version-diff.service';
import { GitDiffLinesViewComponent } from './git-diff-lines-view.component';

export type UniversalCompareMode = 'visual' | 'json-tree' | 'unified' | 'split';

@Component({
  selector: 'mj-artifact-version-compare',
  standalone: true,
  imports: [CommonModule, FormsModule, GitDiffLinesViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-vcomp" data-testid="artifact-version-compare-workspace">
      <!-- Top Git-Style Compare Bar -->
      <div class="mj-vcomp__bar">
        <div class="mj-vcomp__bar-left">
          <button
            type="button"
            class="mj-vcomp__exit-btn"
            data-testid="exit-compare-btn"
            (click)="ExitRequested.emit()"
          >
            <i class="fas fa-arrow-left"></i>
            <span>Exit Compare</span>
          </button>

          <button
            type="button"
            class="mj-vcomp__icon-btn"
            [class.mj-vcomp__icon-btn--active]="ShowTimeline"
            title="Toggle Commit History Rail"
            data-testid="toggle-commit-timeline-btn"
            (click)="ToggleTimeline()"
          >
            <i class="fas fa-code-branch"></i>
          </button>

          <div class="mj-vcomp__selectors">
            <label class="mj-vcomp__sel-group">
              <span class="mj-vcomp__sel-tag mj-vcomp__sel-tag--base">Base</span>
              <select
                [ngModel]="BaseVersionNumber"
                (ngModelChange)="OnBaseSelected($event)"
                data-testid="compare-base-select"
                aria-label="Compare base version"
              >
                @for (ver of Versions; track ver.ID) {
                  <option [ngValue]="ver.VersionNumber">
                    v{{ ver.VersionNumber }}{{ ver.VersionNumber === LatestVersionNumber ? ' (HEAD)' : '' }}
                  </option>
                }
              </select>
            </label>

            <button
              type="button"
              class="mj-vcomp__swap-btn"
              title="Swap Base and Target versions"
              data-testid="swap-compare-versions-btn"
              (click)="SwapVersions()"
            >
              <i class="fas fa-right-left"></i>
            </button>

            <label class="mj-vcomp__sel-group">
              <span class="mj-vcomp__sel-tag mj-vcomp__sel-tag--target">Target</span>
              <select
                [ngModel]="TargetVersionNumber"
                (ngModelChange)="OnTargetSelected($event)"
                data-testid="compare-target-select"
                aria-label="Compare target version"
              >
                @for (ver of Versions; track ver.ID) {
                  <option [ngValue]="ver.VersionNumber">
                    v{{ ver.VersionNumber }}{{ ver.VersionNumber === LatestVersionNumber ? ' (HEAD)' : '' }}
                  </option>
                }
              </select>
            </label>
          </div>
        </div>

        <div class="mj-vcomp__bar-right">
          <div class="mj-vcomp__modes" role="tablist" aria-label="Diff representation">
            @if (VisualDiffComponentType) {
              <button
                type="button"
                role="tab"
                class="mj-vcomp__mode"
                [class.mj-vcomp__mode--active]="ActiveMode === 'visual'"
                data-testid="compare-mode-visual"
                (click)="SetMode('visual')"
              >
                <i class="fas fa-wand-sparkles"></i> Visual Diff
              </button>
            }
            @if (HasJsonTreeTab) {
              <button
                type="button"
                role="tab"
                class="mj-vcomp__mode"
                [class.mj-vcomp__mode--active]="ActiveMode === 'json-tree'"
                data-testid="compare-mode-json"
                (click)="SetMode('json-tree')"
              >
                <i class="fas fa-sitemap"></i> JSON Tree
                @if ((JsonDiff?.TotalChanges || 0) > 0) {
                  <span class="mj-vcomp__mode-count">{{ JsonDiff!.TotalChanges }}</span>
                }
              </button>
            }
            <button
              type="button"
              role="tab"
              class="mj-vcomp__mode"
              [class.mj-vcomp__mode--active]="ActiveMode === 'unified'"
              data-testid="compare-mode-unified"
              (click)="SetMode('unified')"
            >
              <i class="fas fa-bars-staggered"></i> Unified
            </button>
            <button
              type="button"
              role="tab"
              class="mj-vcomp__mode"
              [class.mj-vcomp__mode--active]="ActiveMode === 'split'"
              data-testid="compare-mode-split"
              (click)="SetMode('split')"
            >
              <i class="fas fa-columns"></i> Split
            </button>
          </div>

          @if (CanEdit && RestorableVersionNumber !== null) {
            <button
              type="button"
              class="mj-vcomp__restore-btn"
              [disabled]="IsRestoring"
              data-testid="restore-compared-version-btn"
              (click)="RequestRestore()"
              [title]="'Create a new latest version from v' + RestorableVersionNumber"
            >
              <i class="fas" [ngClass]="IsRestoring ? 'fa-spinner fa-spin' : 'fa-clock-rotate-left'"></i>
              <span>Restore v{{ RestorableVersionNumber }}</span>
            </button>
          }
        </div>
      </div>

      <!-- Main Split Workspace: Git Commit Timeline + Active Diff Viewport -->
      <div class="mj-vcomp__workspace" [class.mj-vcomp__workspace--no-rail]="!ShowTimeline">
        @if (ShowTimeline) {
          <aside class="mj-vcomp__timeline" data-testid="git-commit-timeline">
            <div class="mj-vcomp__timeline-hdr">
              <span><i class="fas fa-code-commit"></i> Version History ({{ Versions.length }})</span>
            </div>
            <div class="mj-vcomp__commits">
              @for (ver of Versions; track ver.ID; let idx = $index) {
                <div
                  class="mj-vcomp__commit"
                  [class.mj-vcomp__commit--base]="ver.VersionNumber === BaseVersionNumber"
                  [class.mj-vcomp__commit--target]="ver.VersionNumber === TargetVersionNumber"
                  [attr.data-testid]="'commit-node-v' + ver.VersionNumber"
                  (click)="SelectCommitForDiff(ver, idx)"
                >
                  <div class="mj-vcomp__graph-col">
                    <span class="mj-vcomp__dot"></span>
                    @if (idx < Versions.length - 1) {
                      <span class="mj-vcomp__line"></span>
                    }
                  </div>
                  <div class="mj-vcomp__commit-body">
                    <div class="mj-vcomp__commit-top">
                      <strong>v{{ ver.VersionNumber }}</strong>
                      @if (ver.VersionNumber === LatestVersionNumber) {
                        <span class="mj-vcomp__tag mj-vcomp__tag--head">HEAD</span>
                      }
                      @if (ver.VersionNumber === BaseVersionNumber) {
                        <span class="mj-vcomp__tag mj-vcomp__tag--base">BASE</span>
                      }
                      @if (ver.VersionNumber === TargetVersionNumber) {
                        <span class="mj-vcomp__tag mj-vcomp__tag--target">TARGET</span>
                      }
                      @if (IsConversationLinked(ver.ID)) {
                        <span class="mj-vcomp__origin" title="Created in conversation turn">
                          <i class="fas fa-wand-magic-sparkles"></i> Chat
                        </span>
                      } @else {
                        <span class="mj-vcomp__origin" title="Saved directly">
                          <i class="fas fa-pen-nib"></i> Saved
                        </span>
                      }
                    </div>

                    @if (GetCommitSummary(ver); as summary) {
                      <div class="mj-vcomp__commit-msg">{{ summary }}</div>
                    }

                    <div class="mj-vcomp__commit-meta">
                      @if (ver.User) {
                        <span><i class="far fa-user"></i> {{ ver.User }}</span>
                      }
                      <span>{{ ver.__mj_CreatedAt | date: 'short' }}</span>
                      @if (ver.ContentHash) {
                        <code>{{ ver.ContentHash.slice(0, 7) }}</code>
                      }
                    </div>

                    <div class="mj-vcomp__pin-actions" (click)="$event.stopPropagation()">
                      <button
                        type="button"
                        class="mj-vcomp__pin-btn"
                        [class.active]="ver.VersionNumber === BaseVersionNumber"
                        (click)="OnBaseSelected(ver.VersionNumber)"
                      >
                        Set Base
                      </button>
                      <button
                        type="button"
                        class="mj-vcomp__pin-btn"
                        [class.active]="ver.VersionNumber === TargetVersionNumber"
                        (click)="OnTargetSelected(ver.VersionNumber)"
                      >
                        Set Target
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          </aside>
        }

        <!-- Diff Viewport -->
        <main class="mj-vcomp__viewport">
          @if (IsLoadingVersions) {
            <div class="mj-vcomp__loading">
              <i class="fas fa-spinner fa-spin"></i>
              <span>Loading v{{ BaseVersionNumber }} and v{{ TargetVersionNumber }}…</span>
            </div>
          } @else if (!BaseVersion || !TargetVersion) {
            <div class="mj-vcomp__loading">
              <span>Select two versions to compare.</span>
            </div>
          } @else if (BaseVersion.ID === TargetVersion.ID) {
            <div class="mj-vcomp__same-notice">
              <i class="fas fa-circle-info"></i>
              <span>Both Base and Target are set to <strong>v{{ BaseVersion.VersionNumber }}</strong>. Pick a different version on the left to inspect changes.</span>
            </div>
          } @else {
            @switch (ActiveMode) {
              @case ('visual') {
                @if (VisualDiffComponentType) {
                  <ng-container
                    *ngComponentOutlet="
                      VisualDiffComponentType;
                      inputs: { BaseVersion: BaseVersion, TargetVersion: TargetVersion }
                    "
                  ></ng-container>
                }
              }

              @case ('json-tree') {
                @if (JsonDiff) {
                  <div class="mj-vcomp__json-panel" data-testid="structural-json-diff-panel">
                    <div class="mj-vcomp__json-bar">
                      <div class="mj-vcomp__json-filters">
                        <button
                          type="button"
                          class="mj-vcomp__jf-pill"
                          [class.active]="JsonFilter === 'all'"
                          (click)="SetJsonFilter('all')"
                        >
                          All ({{ JsonDiff.TotalChanges }})
                        </button>
                        <button
                          type="button"
                          class="mj-vcomp__jf-pill mj-vcomp__jf-pill--add"
                          [class.active]="JsonFilter === 'added'"
                          (click)="SetJsonFilter('added')"
                        >
                          +Added ({{ JsonDiff.AddedCount }})
                        </button>
                        <button
                          type="button"
                          class="mj-vcomp__jf-pill mj-vcomp__jf-pill--mod"
                          [class.active]="JsonFilter === 'modified'"
                          (click)="SetJsonFilter('modified')"
                        >
                          ~Modified ({{ JsonDiff.ModifiedCount }})
                        </button>
                        <button
                          type="button"
                          class="mj-vcomp__jf-pill mj-vcomp__jf-pill--del"
                          [class.active]="JsonFilter === 'removed'"
                          (click)="SetJsonFilter('removed')"
                        >
                          −Removed ({{ JsonDiff.RemovedCount }})
                        </button>
                      </div>

                      <input
                        type="search"
                        class="mj-vcomp__json-search"
                        placeholder="Filter JSON path or value…"
                        [(ngModel)]="JsonSearchQuery"
                        (ngModelChange)="OnJsonSearchChange()"
                      />
                    </div>

                    @if (FilteredJsonItems.length === 0) {
                      <div class="mj-vcomp__same-notice">
                        <i class="fas fa-circle-check"></i>
                        <span>No JSON property changes match the current filter.</span>
                      </div>
                    } @else {
                      <div class="mj-vcomp__json-list">
                        @for (item of FilteredJsonItems; track item.Path) {
                          <div class="mj-vcomp__json-row" [attr.data-status]="item.Status">
                            <div class="mj-vcomp__json-path">
                              <span class="mj-vcomp__jstatus" [attr.data-status]="item.Status">
                                {{ item.Status }}
                              </span>
                              <code>{{ item.Path }}</code>
                            </div>
                            <div class="mj-vcomp__json-vals">
                              @if (item.Status === 'added') {
                                <span class="mj-j-new">{{ item.NewFormatted }}</span>
                              } @else if (item.Status === 'removed') {
                                <del class="mj-j-old">{{ item.OldFormatted }}</del>
                              } @else {
                                <del class="mj-j-old">{{ item.OldFormatted }}</del>
                                <i class="fas fa-arrow-right"></i>
                                <span class="mj-j-new">{{ item.NewFormatted }}</span>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              }

              @case ('unified') {
                <mj-git-diff-lines-view
                  [Diff]="TextDiff"
                  [Layout]="'unified'"
                  [ShowLayoutToggle]="false"
                  [HeaderLabel]="'v' + BaseVersion.VersionNumber + ' → v' + TargetVersion.VersionNumber + ' Unified Diff'"
                  [TestId]="'universal-unified-diff'"
                ></mj-git-diff-lines-view>
              }

              @case ('split') {
                <mj-git-diff-lines-view
                  [Diff]="TextDiff"
                  [Layout]="'split'"
                  [ShowLayoutToggle]="false"
                  [HeaderLabel]="'v' + BaseVersion.VersionNumber + ' ↔ v' + TargetVersion.VersionNumber + ' Side-by-Side Diff'"
                  [TestId]="'universal-split-diff'"
                ></mj-git-diff-lines-view>
              }
            }
          }
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        flex: 1;
      }

      .mj-vcomp {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--mj-bg-surface-sunken);
      }

      .mj-vcomp__bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        padding: 8px 14px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        flex-shrink: 0;
      }

      .mj-vcomp__bar-left,
      .mj-vcomp__bar-right {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .mj-vcomp__exit-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-vcomp__exit-btn:hover {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
      }

      .mj-vcomp__icon-btn,
      .mj-vcomp__swap-btn {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-vcomp__icon-btn--active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      }

      .mj-vcomp__selectors {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .mj-vcomp__sel-group {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 6px 3px 8px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        font-size: 12px;
      }

      .mj-vcomp__sel-group select {
        border: none;
        background: transparent;
        color: var(--mj-text-primary);
        font-size: 12px;
        font-weight: 600;
        outline: none;
        cursor: pointer;
      }

      .mj-vcomp__sel-tag {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 1px 5px;
        border-radius: 4px;
      }

      .mj-vcomp__sel-tag--base {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 14%, transparent);
      }

      .mj-vcomp__sel-tag--target {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 14%, transparent);
      }

      .mj-vcomp__modes {
        display: inline-flex;
        border: 1px solid var(--mj-border-default);
        border-radius: 7px;
        overflow: hidden;
        background: var(--mj-bg-surface);
      }

      .mj-vcomp__mode {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border: none;
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-vcomp__mode--active {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse, #fff);
      }

      .mj-vcomp__mode-count {
        font-size: 10px;
        padding: 0 5px;
        border-radius: 999px;
        background: rgba(127, 127, 127, 0.22);
      }

      .mj-vcomp__restore-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border-radius: 6px;
        border: 1px solid var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-vcomp__workspace {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 265px minmax(0, 1fr);
        overflow: hidden;
      }

      .mj-vcomp__workspace--no-rail {
        grid-template-columns: minmax(0, 1fr);
      }

      .mj-vcomp__timeline {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--mj-bg-surface);
        border-right: 1px solid var(--mj-border-default);
      }

      .mj-vcomp__timeline-hdr {
        padding: 9px 12px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--mj-text-muted);
        border-bottom: 1px solid var(--mj-border-subtle);
      }

      .mj-vcomp__commits {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mj-vcomp__commit {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr);
        gap: 8px;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease;
      }

      .mj-vcomp__commit:hover {
        background: var(--mj-bg-surface-card);
        border-color: var(--mj-border-subtle);
      }

      .mj-vcomp__commit--base {
        border-color: color-mix(in srgb, var(--mj-status-error) 45%, var(--mj-border-default));
        background: color-mix(in srgb, var(--mj-status-error) 5%, var(--mj-bg-surface));
      }

      .mj-vcomp__commit--target {
        border-color: color-mix(in srgb, var(--mj-status-success) 45%, var(--mj-border-default));
        background: color-mix(in srgb, var(--mj-status-success) 6%, var(--mj-bg-surface));
      }

      .mj-vcomp__graph-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 4px;
      }

      .mj-vcomp__dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--mj-brand-primary);
        flex-shrink: 0;
      }

      .mj-vcomp__line {
        flex: 1;
        width: 2px;
        min-height: 18px;
        margin-top: 3px;
        background: var(--mj-border-default);
      }

      .mj-vcomp__commit-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .mj-vcomp__commit-top {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px;
        font-size: 12px;
        color: var(--mj-text-primary);
      }

      .mj-vcomp__tag {
        font-size: 9px;
        font-weight: 800;
        padding: 1px 5px;
        border-radius: 4px;
      }

      .mj-vcomp__tag--head {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
      }

      .mj-vcomp__tag--base {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 16%, transparent);
      }

      .mj-vcomp__tag--target {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
      }

      .mj-vcomp__origin {
        margin-left: auto;
        font-size: 10px;
        color: var(--mj-text-muted);
      }

      .mj-vcomp__commit-msg {
        font-size: 11px;
        color: var(--mj-text-secondary);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .mj-vcomp__commit-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 10px;
        color: var(--mj-text-muted);
      }

      .mj-vcomp__pin-actions {
        display: flex;
        gap: 4px;
        margin-top: 2px;
      }

      .mj-vcomp__pin-btn {
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 600;
        border-radius: 4px;
        border: 1px solid var(--mj-border-subtle);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-vcomp__pin-btn.active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
      }

      .mj-vcomp__viewport {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 16px;
      }

      .mj-vcomp__loading,
      .mj-vcomp__same-notice {
        padding: 36px 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        background: var(--mj-bg-surface);
        border: 1px dashed var(--mj-border-default);
        border-radius: 10px;
        color: var(--mj-text-secondary);
        font-size: 13px;
      }

      .mj-vcomp__json-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mj-vcomp__json-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px 12px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
      }

      .mj-vcomp__json-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .mj-vcomp__jf-pill {
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-vcomp__jf-pill.active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      }

      .mj-vcomp__json-search {
        min-width: 220px;
        padding: 5px 10px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 12px;
      }

      .mj-vcomp__json-list {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        overflow: hidden;
        background: var(--mj-bg-surface);
      }

      .mj-vcomp__json-row {
        display: grid;
        grid-template-columns: minmax(180px, 34%) minmax(0, 1fr);
        gap: 12px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--mj-border-subtle);
        font-size: 12px;
        align-items: start;
      }

      .mj-vcomp__json-row:last-child {
        border-bottom: none;
      }

      .mj-vcomp__json-path {
        display: flex;
        align-items: center;
        gap: 8px;
        word-break: break-all;
      }

      .mj-vcomp__jstatus {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 999px;
        flex-shrink: 0;
      }

      .mj-vcomp__jstatus[data-status='added'] {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 16%, transparent);
      }

      .mj-vcomp__jstatus[data-status='removed'] {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 16%, transparent);
      }

      .mj-vcomp__jstatus[data-status='modified'] {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 16%, transparent);
      }

      .mj-vcomp__json-vals {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        word-break: break-word;
      }

      .mj-j-old {
        color: var(--mj-status-error);
      }

      .mj-j-new {
        color: var(--mj-status-success);
        font-weight: 600;
      }
    `,
  ],
})
export class ArtifactVersionCompareComponent implements OnChanges {
  private readonly diffService = inject(ArtifactVersionDiffService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() Versions: MJArtifactVersionEntity[] = [];
  @Input() BaseVersion: MJArtifactVersionEntity | null = null;
  @Input() TargetVersion: MJArtifactVersionEntity | null = null;
  @Input() BaseVersionNumber = 1;
  @Input() TargetVersionNumber = 1;
  @Input() VisualDiffComponentType: Type<IArtifactVersionDiffViewer> | null = null;
  @Input() MessageLinkedVersionIds: ReadonlySet<string> = new Set<string>();
  @Input() IsLoadingVersions = false;
  @Input() CanEdit = false;
  @Input() IsRestoring = false;

  @Output() ExitRequested = new EventEmitter<void>();
  @Output() ComparePairChanged = new EventEmitter<{
    baseVersionNumber: number;
    targetVersionNumber: number;
  }>();
  @Output() RestoreVersionRequested = new EventEmitter<number>();

  public ActiveMode: UniversalCompareMode = 'unified';
  public ShowTimeline = true;
  public JsonDiff: StructuralJsonDiffResult | null = null;
  public TextDiff: GitTextDiffResult | null = null;
  public JsonFilter: 'all' | 'added' | 'removed' | 'modified' = 'all';
  public JsonSearchQuery = '';

  private hasInitializedDefaultMode = false;
  private readonly diffCache = new Map<
    string,
    { jsonDiff?: StructuralJsonDiffResult; textDiff?: GitTextDiffResult }
  >();

  public get HasJsonTreeTab(): boolean {
    if (!this.BaseVersion || !this.TargetVersion) {
      return false;
    }
    if (this.JsonDiff) {
      return this.JsonDiff.IsValidJson;
    }
    return this.isContentPairJsonShaped();
  }

  public get LatestVersionNumber(): number {
    return this.Versions.reduce((max, v) => Math.max(max, v.VersionNumber || 0), 1);
  }

  public get RestorableVersionNumber(): number | null {
    // Allow restoring whichever selected version is older than HEAD
    if (this.TargetVersionNumber < this.LatestVersionNumber) {
      return this.TargetVersionNumber;
    }
    if (this.BaseVersionNumber < this.LatestVersionNumber) {
      return this.BaseVersionNumber;
    }
    return null;
  }

  public get FilteredJsonItems(): StructuralJsonDiffItem[] {
    if (!this.JsonDiff) return [];
    const q = this.JsonSearchQuery.trim().toLowerCase();
    return this.JsonDiff.FlatItems.filter((item) => {
      if (this.JsonFilter !== 'all' && item.Status !== this.JsonFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.Path.toLowerCase().includes(q) ||
        item.OldFormatted.toLowerCase().includes(q) ||
        item.NewFormatted.toLowerCase().includes(q)
      );
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['VisualDiffComponentType'] && this.VisualDiffComponentType && !this.hasInitializedDefaultMode) {
      this.ActiveMode = 'visual';
      this.hasInitializedDefaultMode = true;
    }

    if (changes['BaseVersion'] || changes['TargetVersion'] || changes['VisualDiffComponentType']) {
      this.recomputeUniversalDiffs();
    }
  }

  public ToggleTimeline(): void {
    this.ShowTimeline = !this.ShowTimeline;
    this.cdr.markForCheck();
  }

  public SetMode(mode: UniversalCompareMode): void {
    this.ActiveMode = mode;
    this.ensureDiffForActiveMode();
    this.cdr.markForCheck();
  }

  public SetJsonFilter(filter: 'all' | 'added' | 'removed' | 'modified'): void {
    this.JsonFilter = filter;
    this.cdr.markForCheck();
  }

  public OnJsonSearchChange(): void {
    this.cdr.markForCheck();
  }

  public OnBaseSelected(versionNum: number): void {
    this.ComparePairChanged.emit({
      baseVersionNumber: Number(versionNum),
      targetVersionNumber: this.TargetVersionNumber,
    });
  }

  public OnTargetSelected(versionNum: number): void {
    this.ComparePairChanged.emit({
      baseVersionNumber: this.BaseVersionNumber,
      targetVersionNumber: Number(versionNum),
    });
  }

  public SwapVersions(): void {
    this.ComparePairChanged.emit({
      baseVersionNumber: this.TargetVersionNumber,
      targetVersionNumber: this.BaseVersionNumber,
    });
  }

  /**
   * Clicking a commit `vK` in the Git timeline compares it against its immediate predecessor
   * in the listed history (`v_prev -> vK`), or against HEAD when clicking the oldest `v1`.
   */
  public SelectCommitForDiff(ver: MJArtifactVersionEntity, indexInDescList: number): void {
    const olderNeighbor = this.Versions[indexInDescList + 1];
    if (olderNeighbor) {
      this.ComparePairChanged.emit({
        baseVersionNumber: olderNeighbor.VersionNumber,
        targetVersionNumber: ver.VersionNumber,
      });
    } else if (this.Versions.length > 1) {
      const newerNeighbor = this.Versions[indexInDescList - 1] ?? this.Versions[0];
      this.ComparePairChanged.emit({
        baseVersionNumber: ver.VersionNumber,
        targetVersionNumber: newerNeighbor.VersionNumber,
      });
    }
  }

  public IsConversationLinked(versionId: string): boolean {
    if (!versionId) return false;
    return this.MessageLinkedVersionIds.has(versionId.toLowerCase());
  }

  public GetCommitSummary(ver: MJArtifactVersionEntity): string {
    if (ver.Comments?.trim()) return ver.Comments.trim();
    if (ver.Description?.trim()) return ver.Description.trim();
    return '';
  }

  public RequestRestore(): void {
    const verNum = this.RestorableVersionNumber;
    if (verNum !== null) {
      this.RestoreVersionRequested.emit(verNum);
    }
  }

  private recomputeUniversalDiffs(): void {
    if (!this.BaseVersion || !this.TargetVersion) {
      this.JsonDiff = null;
      this.TextDiff = null;
      return;
    }

    if (!this.hasInitializedDefaultMode) {
      if (this.VisualDiffComponentType) {
        this.ActiveMode = 'visual';
      } else if (this.isContentPairJsonShaped()) {
        this.ActiveMode = 'json-tree';
      } else {
        this.ActiveMode = 'unified';
      }
      this.hasInitializedDefaultMode = true;
    } else if (this.ActiveMode === 'visual' && !this.VisualDiffComponentType) {
      this.ActiveMode = this.isContentPairJsonShaped() ? 'json-tree' : 'unified';
    }

    this.ensureDiffForActiveMode();
    this.cdr.markForCheck();
  }

  private ensureDiffForActiveMode(): void {
    if (!this.BaseVersion || !this.TargetVersion || this.BaseVersion.ID === this.TargetVersion.ID) {
      this.JsonDiff = null;
      this.TextDiff = null;
      return;
    }

    const pairKey = this.buildPairCacheKey(this.BaseVersion, this.TargetVersion);
    let entry = this.diffCache.get(pairKey);
    if (!entry) {
      entry = {};
      this.diffCache.set(pairKey, entry);
    }

    if (this.ActiveMode === 'visual') {
      this.JsonDiff = entry.jsonDiff ?? null;
      this.TextDiff = entry.textDiff ?? null;
      return;
    }

    if (this.ActiveMode === 'json-tree') {
      if (!entry.jsonDiff) {
        entry.jsonDiff = this.diffService.ComputeStructuralJsonDiff(
          this.BaseVersion.Content,
          this.TargetVersion.Content,
        );
      }
      this.JsonDiff = entry.jsonDiff;
      this.TextDiff = entry.textDiff ?? null;
      if (!entry.jsonDiff.IsValidJson) {
        this.ActiveMode = 'unified';
        if (!entry.textDiff) {
          entry.textDiff = this.diffService.ComputeGitTextDiff(
            this.BaseVersion.Content,
            this.TargetVersion.Content,
            true,
          );
        }
        this.TextDiff = entry.textDiff;
      }
      return;
    }

    // ActiveMode === 'unified' || ActiveMode === 'split'
    if (!entry.textDiff) {
      entry.textDiff = this.diffService.ComputeGitTextDiff(
        this.BaseVersion.Content,
        this.TargetVersion.Content,
        true,
      );
    }
    this.TextDiff = entry.textDiff;
    this.JsonDiff = entry.jsonDiff ?? null;
  }

  private buildPairCacheKey(baseVer: MJArtifactVersionEntity, targetVer: MJArtifactVersionEntity): string {
    const baseKey = baseVer.ID || `v${baseVer.VersionNumber}:${baseVer.ContentHash || baseVer.Content?.length || 0}`;
    const targetKey =
      targetVer.ID || `v${targetVer.VersionNumber}:${targetVer.ContentHash || targetVer.Content?.length || 0}`;
    return `${baseKey}::${targetKey}`;
  }

  private isContentPairJsonShaped(): boolean {
    const b = (this.BaseVersion?.Content ?? '').trim();
    const t = (this.TargetVersion?.Content ?? '').trim();
    const looksJson = (s: string): boolean =>
      (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
    return looksJson(b) && looksJson(t);
  }
}
