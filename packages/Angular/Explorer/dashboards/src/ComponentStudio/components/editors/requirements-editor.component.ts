import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

type RequirementsField = 'functionalRequirements' | 'technicalDesign';
type EditorMode = 'preview' | 'edit';

@Component({
  selector: 'mj-requirements-editor',
  template: `
    <div class="requirements-editor">
      <div class="editor-header">
        <span class="header-title">
          <i class="fa-solid" [ngClass]="FieldIcon"></i>
          {{ Title }}
        </span>
        <div class="header-right">
          @if (IsEditing) {
            <div class="action-buttons">
              <button kendoButton [themeColor]="'primary'" (click)="ApplyChanges()" class="action-btn">
                <i class="fa-solid fa-check"></i> Apply
              </button>
              <button kendoButton [themeColor]="'base'" (click)="CancelChanges()" class="action-btn">
                Cancel
              </button>
            </div>
          }
          <div class="mode-toggle">
            <button class="mode-btn" [class.active]="ViewMode === 'preview'" (click)="SetViewMode('preview')">
              <i class="fa-solid fa-eye"></i> Preview
            </button>
            <button class="mode-btn" [class.active]="ViewMode === 'edit'" (click)="SetViewMode('edit')">
              <i class="fa-solid fa-pencil"></i> Edit
            </button>
          </div>
        </div>
      </div>

      <div class="editor-body">
        @if (State.SelectedComponent) {
          @if (ViewMode === 'preview') {
            <div class="preview-container">
              @if (EditableContent) {
                <mj-markdown [data]="EditableContent" [enableCodeCopy]="true"></mj-markdown>
              } @else {
                <div class="empty-preview">
                  <i class="fa-solid fa-file-lines"></i>
                  <p>No {{ Title | lowercase }} defined yet.</p>
                  <button class="edit-link" (click)="SetViewMode('edit')">
                    <i class="fa-solid fa-pencil"></i> Start writing
                  </button>
                </div>
              }
            </div>
          } @else {
            <div class="code-editor-container">
              <mj-code-editor
                [(ngModel)]="EditableContent"
                [language]="'markdown'"
                [indentWithTab]="true"
                [placeholder]="'Enter ' + Title + ' in markdown format...'"
                (ngModelChange)="OnContentChanged()">
              </mj-code-editor>
            </div>
          }
        } @else {
          <div class="empty-state">
            <i class="fa-solid fa-file-lines"></i>
            <p>Select a component to view its {{ Title | lowercase }}.</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .requirements-editor {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface);
      flex-shrink: 0;
      gap: 8px;
    }

    .header-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--mat-sys-on-surface);
      white-space: nowrap;
    }

    .header-title i {
      margin-right: 6px;
      color: var(--mat-sys-primary);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .action-buttons {
      display: flex;
      gap: 6px;
    }

    .action-btn {
      font-size: 12px;
    }

    .mode-toggle {
      display: inline-flex;
      border: 1px solid var(--mat-sys-outline);
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
      color: var(--mat-sys-on-surface-variant);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }

    .mode-btn:not(:last-child) {
      border-right: 1px solid var(--mat-sys-outline);
    }

    .mode-btn:hover {
      background: var(--mat-sys-surface-container);
    }

    .mode-btn.active {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary, #fff);
    }

    .mode-btn i {
      font-size: 10px;
    }

    .editor-body {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .preview-container {
      flex: 1;
      overflow: auto;
      padding: 16px 20px;
    }

    .code-editor-container {
      flex: 1;
      overflow: hidden;
    }

    .code-editor-container mj-code-editor {
      display: block;
      height: 100%;
    }

    .empty-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-preview i {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.4;
    }

    .empty-preview p {
      margin: 0 0 12px;
      font-size: 13px;
    }

    .edit-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 14px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 8px;
      background: transparent;
      color: var(--mat-sys-primary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }

    .edit-link:hover {
      background: var(--mat-sys-primary-container, #e0e7ff);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--mat-sys-on-surface-variant);
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
export class RequirementsEditorComponent implements OnInit, OnDestroy {
  @Input() Field: RequirementsField = 'functionalRequirements';
  @Input() Title: string = 'Functional Requirements';

  EditableContent: string = '';
  IsEditing: boolean = false;
  ViewMode: EditorMode = 'preview';

  private stateChangedSub: Subscription | null = null;

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  get FieldIcon(): string {
    return this.Field === 'functionalRequirements' ? 'fa-clipboard-list' : 'fa-drafting-compass';
  }

  ngOnInit(): void {
    this.loadContent();
    this.stateChangedSub = this.State.StateChanged.subscribe(() => {
      if (!this.IsEditing) {
        this.loadContent();
      }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    if (this.stateChangedSub) {
      this.stateChangedSub.unsubscribe();
      this.stateChangedSub = null;
    }
  }

  SetViewMode(mode: EditorMode): void {
    this.ViewMode = mode;
    this.cdr.detectChanges();
  }

  OnContentChanged(): void {
    this.IsEditing = true;
  }

  ApplyChanges(): void {
    try {
      const spec: ComponentSpec = JSON.parse(this.State.EditableSpec);
      spec[this.Field] = this.EditableContent;
      this.State.UpdateSpec(spec);
      this.IsEditing = false;
      this.ViewMode = 'preview';
    } catch (error) {
      console.error('Error applying requirements changes:', error);
    }
  }

  CancelChanges(): void {
    this.loadContent();
    this.IsEditing = false;
    this.ViewMode = 'preview';
    this.cdr.detectChanges();
  }

  private loadContent(): void {
    try {
      const spec = JSON.parse(this.State.EditableSpec);
      this.EditableContent = spec[this.Field] || '';
    } catch {
      this.EditableContent = '';
    }
  }
}
