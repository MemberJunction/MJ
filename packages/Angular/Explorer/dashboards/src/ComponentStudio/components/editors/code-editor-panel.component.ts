import { Component, ChangeDetectorRef, ViewChild } from '@angular/core';
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { unifiedMergeView, getChunks, goToNextChunk, goToPreviousChunk } from '@codemirror/merge';
import { ComponentStudioStateService, CodeSection } from '../../services/component-studio-state.service';

type CodeViewMode = 'current' | 'original' | 'diff';

@Component({
  standalone: false,
  selector: 'mj-code-editor-panel',
  template: `
    <div class="code-editor-panel">
      <!-- Tab bar: one tab per code section -->
      <div class="code-tab-bar">
        @for (section of State.CodeSections; track section.title; let i = $index) {
          <button class="code-tab"
                  [class.active]="ActiveTabIndex === i"
                  (click)="SelectTab(i)">
            @if (section.isDependency) {
              <i class="fa-solid fa-puzzle-piece dep-icon"></i>
            }
            {{ section.title }}
            @if (HasChanges(section)) {
              <span class="modified-dot" title="Modified"></span>
            }
          </button>
        }
      </div>

      <!-- Toolbar: view mode toggle + actions -->
      <div class="code-toolbar">
        <div class="view-mode-toggle">
          <button class="mode-btn" [class.active]="ViewMode === 'current'" (click)="SetViewMode('current')">
            Current
          </button>
          <button class="mode-btn" [class.active]="ViewMode === 'original'" (click)="SetViewMode('original')">
            Original
          </button>
          <button class="mode-btn" [class.active]="ViewMode === 'diff'" (click)="SetViewMode('diff')">
            <i class="fa-solid fa-code-compare"></i> Diff
          </button>
        </div>
        @if (ViewMode === 'diff') {
          <div class="diff-nav">
            <span class="diff-count">{{ DiffChunkCount }} change{{ DiffChunkCount !== 1 ? 's' : '' }}</span>
            <button class="icon-btn" (click)="GoToPreviousChunk()" title="Previous change (↑)" [disabled]="DiffChunkCount === 0">
              <i class="fa-solid fa-chevron-up"></i>
            </button>
            <button class="icon-btn" (click)="GoToNextChunk()" title="Next change (↓)" [disabled]="DiffChunkCount === 0">
              <i class="fa-solid fa-chevron-down"></i>
            </button>
          </div>
        }
        <span class="toolbar-spacer"></span>
        <button class="icon-btn" (click)="CopyCode()" title="Copy code to clipboard">
          <i class="fa-solid fa-copy"></i>
        </button>
        @if (State.IsEditingCode) {
          <div class="action-buttons">
            <button kendoButton [themeColor]="'primary'" (click)="ApplyChanges()">
              <i class="fa-solid fa-check"></i> Apply
            </button>
            <button kendoButton [themeColor]="'base'" (click)="CancelChanges()">
              Cancel
            </button>
          </div>
        }
      </div>

      <!-- Editor body -->
      <div class="code-editor-body">
        @if (ActiveSection) {
          @switch (ViewMode) {
            @case ('current') {
              <div class="editor-pane">
                <mj-code-editor
                  [(ngModel)]="ActiveSection.code"
                  [language]="'javascript'"
                  [indentWithTab]="true"
                  [placeholder]="'Enter component code...'"
                  (ngModelChange)="OnCodeChanged()">
                </mj-code-editor>
              </div>
            }
            @case ('original') {
              <div class="editor-pane">
                <mj-code-editor
                  [ngModel]="ActiveSection.originalCode"
                  [language]="'javascript'"
                  [readonly]="true">
                </mj-code-editor>
              </div>
            }
            @case ('diff') {
              <div class="editor-pane diff-pane">
                <mj-code-editor
                  #diffEditor
                  [ngModel]="ActiveSection.code"
                  [language]="'javascript'"
                  [readonly]="true"
                  [extensions]="DiffExtensions">
                </mj-code-editor>
              </div>
            }
          }
        } @else {
          <div class="empty-state">
            <i class="fa-solid fa-file-code"></i>
            <p>No code sections available. Select a component to view its code.</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .code-editor-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* ---- Tab bar ---- */
    .code-tab-bar {
      display: flex;
      align-items: center;
      padding: 0 8px;
      height: 36px;
      background: var(--mj-bg-surface-sunken);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
      gap: 2px;
      overflow-x: auto;
    }

    .code-tab {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--mj-text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      font-family: inherit;
      position: relative;
    }

    .code-tab:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
    }

    .code-tab.active {
      background: var(--mj-bg-surface);
      color: var(--mj-brand-primary);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .dep-icon {
      font-size: 10px;
      color: var(--mj-brand-primary);
    }

    .modified-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--mj-status-error);
      display: inline-block;
      margin-left: 2px;
    }

    /* ---- Toolbar ---- */
    .code-toolbar {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
      gap: 8px;
    }

    .view-mode-toggle {
      display: inline-flex;
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      overflow: hidden;
    }

    .mode-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border: none;
      background: transparent;
      color: var(--mj-text-secondary);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }

    .mode-btn:not(:last-child) {
      border-right: 1px solid var(--mj-border-default);
    }

    .mode-btn:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .mode-btn.active {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
    }

    .mode-btn i {
      font-size: 10px;
    }

    .toolbar-spacer {
      flex: 1;
    }

    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--mj-text-secondary);
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    }

    .icon-btn:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
    }

    .action-buttons {
      display: flex;
      gap: 6px;
    }

    .diff-nav {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 4px;
    }

    .diff-count {
      font-size: 11px;
      font-weight: 500;
      color: var(--mj-text-secondary);
      padding: 0 4px;
      white-space: nowrap;
    }

    .icon-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }

    /* ---- Editor body ---- */
    .code-editor-body {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .editor-pane {
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .editor-pane mj-code-editor {
      display: block;
      height: 100%;
    }

    /* ---- Diff-specific styles ---- */
    :host ::ng-deep .diff-pane .cm-mergeView .cm-changedLine {
      background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
    }

    :host ::ng-deep .diff-pane .cm-mergeView .cm-deletedChunk {
      background: color-mix(in srgb, var(--mj-status-error) 8%, transparent);
    }

    /* ---- Empty state ---- */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--mj-text-secondary);
      flex: 1;
    }

    .empty-state i {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.4;
    }

    .empty-state p {
      margin: 0;
      font-size: 13px;
      text-align: center;
    }
  `]
})
export class CodeEditorPanelComponent {
  ActiveTabIndex = 0;
  ViewMode: CodeViewMode = 'current';
  DiffExtensions: Extension[] = [];
  DiffChunkCount = 0;

  @ViewChild('diffEditor') set DiffEditorRef(ref: { view?: EditorView } | undefined) {
    if (ref?.view) {
      this.diffView = ref.view;
      this.updateChunkCount();
    }
  }
  private diffView: EditorView | null = null;

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  get ActiveSection(): CodeSection | null {
    const sections = this.State.CodeSections;
    if (sections.length === 0) return null;
    if (this.ActiveTabIndex >= sections.length) {
      this.ActiveTabIndex = 0;
    }
    return sections[this.ActiveTabIndex];
  }

  HasChanges(section: CodeSection): boolean {
    return section.code !== section.originalCode;
  }

  SelectTab(index: number): void {
    this.ActiveTabIndex = index;
    this.ViewMode = 'current';
    this.cdr.detectChanges();
  }

  SetViewMode(mode: CodeViewMode): void {
    this.ViewMode = mode;
    if (mode === 'diff') {
      this.buildDiffExtensions();
    }
    this.cdr.detectChanges();
  }

  OnCodeChanged(): void {
    this.State.IsEditingCode = true;
  }

  ApplyChanges(): void {
    this.State.ApplyCodeChanges();
  }

  CancelChanges(): void {
    this.State.InitializeEditors();
    this.ActiveTabIndex = 0;
    this.ViewMode = 'current';
    this.cdr.detectChanges();
  }

  CopyCode(): void {
    const section = this.ActiveSection;
    if (!section) return;

    const text = this.ViewMode === 'original' ? section.originalCode : section.code;
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy code to clipboard:', err);
    });
  }

  GoToNextChunk(): void {
    if (this.diffView) {
      goToNextChunk(this.diffView);
    }
  }

  GoToPreviousChunk(): void {
    if (this.diffView) {
      goToPreviousChunk(this.diffView);
    }
  }

  private updateChunkCount(): void {
    if (!this.diffView) {
      this.DiffChunkCount = 0;
      return;
    }
    // Schedule after the merge view has initialized
    Promise.resolve().then(() => {
      if (!this.diffView) return;
      const result = getChunks(this.diffView.state);
      this.DiffChunkCount = result ? result.chunks.length : 0;
      this.cdr.detectChanges();
    });
  }

  private buildDiffExtensions(): void {
    const section = this.ActiveSection;
    if (!section) {
      this.DiffExtensions = [];
      return;
    }

    this.DiffExtensions = unifiedMergeView({
      original: section.originalCode,
      highlightChanges: true,
      gutter: true
    });
  }
}
