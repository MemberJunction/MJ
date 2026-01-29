import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

type RequirementsField = 'functionalRequirements' | 'technicalDesign';

@Component({
  selector: 'mj-requirements-editor',
  template: `
    <div class="requirements-editor">
      <div class="editor-header">
        <span class="header-title">
          <i class="fa-solid" [ngClass]="FieldIcon"></i>
          {{ Title }}
        </span>
        @if (IsEditing) {
          <div class="action-buttons">
            <button kendoButton [themeColor]="'primary'" (click)="ApplyChanges()">
              <i class="fa-solid fa-check"></i> Apply Changes
            </button>
            <button kendoButton [themeColor]="'base'" (click)="CancelChanges()">
              <i class="fa-solid fa-times"></i> Cancel
            </button>
          </div>
        }
      </div>

      <div class="editor-body">
        @if (State.SelectedComponent) {
          <mj-code-editor
            [(ngModel)]="EditableContent"
            [language]="'markdown'"
            [indentWithTab]="true"
            [placeholder]="'Enter ' + Title + ' in markdown format...'"
            (ngModelChange)="OnContentChanged()">
          </mj-code-editor>
        } @else {
          <div class="empty-state">
            <i class="fa-solid fa-file-lines"></i>
            <p>Select a component to edit its {{ Title | lowercase }}.</p>
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
    .editor-body {
      flex: 1;
      overflow: hidden;
    }
    .editor-body mj-code-editor {
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
export class RequirementsEditorComponent {
  @Input() Field: RequirementsField = 'functionalRequirements';
  @Input() Title: string = 'Functional Requirements';

  EditableContent: string = '';
  IsEditing: boolean = false;

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  get FieldIcon(): string {
    return this.Field === 'functionalRequirements' ? 'fa-clipboard-list' : 'fa-drafting-compass';
  }

  ngOnInit(): void {
    this.loadContent();
    this.State.StateChanged.subscribe(() => {
      this.loadContent();
      this.cdr.detectChanges();
    });
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
    } catch (error) {
      console.error('Error applying requirements changes:', error);
    }
  }

  CancelChanges(): void {
    this.loadContent();
    this.IsEditing = false;
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
