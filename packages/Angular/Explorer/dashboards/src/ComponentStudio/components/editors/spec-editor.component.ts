import { Component, ChangeDetectorRef } from '@angular/core';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

type SpecEditorMode = 'form' | 'json';

interface SpecFormModel {
  name: string;
  title: string;
  description: string;
  type: string;
  version: string;
  namespace: string;
}

const COMPONENT_TYPES = [
  'Report', 'Dashboard', 'Form', 'Chart', 'Table', 'Widget', 'Navigation', 'Search', 'Utility'
];

@Component({
  selector: 'mj-spec-editor',
  template: `
    <div class="spec-editor">
      <div class="editor-header">
        <div class="mode-toggle">
          <button kendoButton
                  [themeColor]="Mode === 'form' ? 'primary' : 'base'"
                  (click)="SetMode('form')"
                  [fillMode]="Mode === 'form' ? 'solid' : 'outline'">
            <i class="fa-solid fa-list-alt"></i> Form
          </button>
          <button kendoButton
                  [themeColor]="Mode === 'json' ? 'primary' : 'base'"
                  (click)="SetMode('json')"
                  [fillMode]="Mode === 'json' ? 'solid' : 'outline'">
            <i class="fa-solid fa-code"></i> JSON
          </button>
        </div>
        @if (State.IsEditingSpec) {
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
        @if (Mode === 'form') {
          <div class="form-mode">
            <div class="form-field">
              <label>Name</label>
              <input kendoTextBox [(ngModel)]="FormModel.name" (ngModelChange)="OnFormChanged()" />
            </div>
            <div class="form-field">
              <label>Title</label>
              <input kendoTextBox [(ngModel)]="FormModel.title" (ngModelChange)="OnFormChanged()" />
            </div>
            <div class="form-field">
              <label>Description</label>
              <textarea kendoTextArea [(ngModel)]="FormModel.description" (ngModelChange)="OnFormChanged()" rows="3"></textarea>
            </div>
            <div class="form-field">
              <label>Type</label>
              <kendo-dropdownlist
                [data]="ComponentTypes"
                [(ngModel)]="FormModel.type"
                (ngModelChange)="OnFormChanged()">
              </kendo-dropdownlist>
            </div>
            <div class="form-row">
              <div class="form-field half">
                <label>Version</label>
                <input kendoTextBox [(ngModel)]="FormModel.version" (ngModelChange)="OnFormChanged()" />
              </div>
              <div class="form-field half">
                <label>Namespace</label>
                <input kendoTextBox [(ngModel)]="FormModel.namespace" (ngModelChange)="OnFormChanged()" />
              </div>
            </div>
          </div>
        } @else {
          <div class="json-mode">
            <mj-code-editor
              [(ngModel)]="State.EditableSpec"
              [language]="'json'"
              [indentWithTab]="true"
              (ngModelChange)="OnJsonChanged()">
            </mj-code-editor>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .spec-editor {
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
    .mode-toggle {
      display: flex;
      gap: 4px;
    }
    .action-buttons {
      display: flex;
      gap: 6px;
    }
    .editor-body {
      flex: 1;
      overflow: auto;
    }
    .form-mode {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .form-field label {
      font-size: 12px;
      font-weight: 600;
      color: #555;
    }
    .form-row {
      display: flex;
      gap: 12px;
    }
    .form-field.half {
      flex: 1;
    }
    .json-mode {
      height: 100%;
    }
    .json-mode mj-code-editor {
      display: block;
      height: 100%;
    }
  `]
})
export class SpecEditorComponent {
  Mode: SpecEditorMode = 'form';
  FormModel: SpecFormModel = { name: '', title: '', description: '', type: '', version: '', namespace: '' };
  ComponentTypes: string[] = COMPONENT_TYPES;

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  SetMode(mode: SpecEditorMode): void {
    if (mode === 'form') {
      this.syncSpecToForm();
    } else {
      this.syncFormToSpec();
    }
    this.Mode = mode;
  }

  OnFormChanged(): void {
    this.syncFormToSpec();
    this.State.IsEditingSpec = true;
  }

  OnJsonChanged(): void {
    this.State.IsEditingSpec = true;
  }

  ApplyChanges(): void {
    if (this.Mode === 'form') {
      this.syncFormToSpec();
    }
    this.State.ApplySpecChanges();
  }

  CancelChanges(): void {
    this.State.InitializeEditors();
    this.syncSpecToForm();
    this.cdr.detectChanges();
  }

  private syncSpecToForm(): void {
    try {
      const spec = JSON.parse(this.State.EditableSpec);
      this.FormModel = {
        name: spec.name || '',
        title: spec.title || '',
        description: spec.description || '',
        type: spec.type || '',
        version: spec.version || '',
        namespace: spec.namespace || ''
      };
    } catch {
      // If JSON is invalid, keep current form values
    }
  }

  private syncFormToSpec(): void {
    try {
      const spec = JSON.parse(this.State.EditableSpec);
      spec.name = this.FormModel.name;
      spec.title = this.FormModel.title;
      spec.description = this.FormModel.description;
      spec.type = this.FormModel.type;
      spec.version = this.FormModel.version;
      spec.namespace = this.FormModel.namespace;
      this.State.EditableSpec = JSON.stringify(spec, null, 2);
    } catch {
      // If JSON is invalid, skip sync
    }
  }
}
