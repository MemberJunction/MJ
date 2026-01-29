import { Component, ChangeDetectorRef } from '@angular/core';
import { ComponentStudioStateService, CodeSection } from '../../services/component-studio-state.service';

@Component({
  selector: 'mj-code-editor-panel',
  template: `
    <div class="code-editor-panel">
      <div class="editor-header">
        <span class="header-title">
          <i class="fa-solid fa-code"></i> Code
        </span>
        <div class="action-buttons">
          @if (State.IsEditingCode) {
            <button kendoButton [themeColor]="'primary'" (click)="ApplyChanges()">
              <i class="fa-solid fa-check"></i> Apply Changes
            </button>
            <button kendoButton [themeColor]="'base'" (click)="CancelChanges()">
              <i class="fa-solid fa-times"></i> Cancel
            </button>
          }
          @if (State.IsRunning) {
            <button kendoButton [themeColor]="'info'" (click)="RefreshComponent()">
              <i class="fa-solid fa-sync-alt"></i> Refresh Component
            </button>
          }
        </div>
      </div>

      <div class="panel-body">
        @if (State.CodeSections.length > 0) {
          <kendo-panelbar>
            @for (section of State.CodeSections; track section.title; let i = $index) {
              <kendo-panelbar-item
                [title]="section.title"
                [expanded]="section.expanded">
                <ng-template kendoPanelBarContent>
                  <div class="code-section">
                    @if (section.isDependency) {
                      <div class="dependency-badge">
                        <i class="fa-solid fa-puzzle-piece"></i> Dependency
                      </div>
                    }
                    <div class="code-editor-container">
                      <mj-code-editor
                        [(ngModel)]="section.code"
                        [language]="'javascript'"
                        [indentWithTab]="true"
                        (ngModelChange)="OnCodeChanged(section)">
                      </mj-code-editor>
                    </div>
                  </div>
                </ng-template>
              </kendo-panelbar-item>
            }
          </kendo-panelbar>
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
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid #e0e0e0;
      background: #fafafa;
      flex-shrink: 0;
    }
    .header-title {
      font-weight: 600;
      font-size: 13px;
      color: #333;
    }
    .header-title i {
      margin-right: 6px;
      color: #666;
    }
    .action-buttons {
      display: flex;
      gap: 6px;
    }
    .panel-body {
      flex: 1;
      overflow: auto;
    }
    .code-section {
      display: flex;
      flex-direction: column;
    }
    .dependency-badge {
      padding: 4px 8px;
      font-size: 11px;
      color: #8B5CF6;
      background: #F5F3FF;
      border-bottom: 1px solid #EDE9FE;
    }
    .dependency-badge i {
      margin-right: 4px;
    }
    .code-editor-container {
      height: 300px;
    }
    .code-editor-container mj-code-editor {
      display: block;
      height: 100%;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: #999;
    }
    .empty-state i {
      font-size: 32px;
      margin-bottom: 12px;
    }
    .empty-state p {
      margin: 0;
      font-size: 13px;
      text-align: center;
    }
  `]
})
export class CodeEditorPanelComponent {

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  OnCodeChanged(section: CodeSection): void {
    this.State.IsEditingCode = true;
  }

  ApplyChanges(): void {
    this.State.ApplyCodeChanges();
  }

  CancelChanges(): void {
    this.State.InitializeEditors();
    this.cdr.detectChanges();
  }

  RefreshComponent(): void {
    this.State.RefreshComponent.emit();
  }
}
