import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

type SpecEditorMode = 'form' | 'json';

interface SpecFormModel {
  name: string;
  title: string;
  description: string;
  type: string;
  location: string;
  exampleUsage: string;
}

const COMPONENT_TYPES = [
  'Report', 'Dashboard', 'Form', 'Chart', 'Table', 'Widget', 'Navigation', 'Search', 'Utility'
];

@Component({
  standalone: false,
  selector: 'mj-spec-editor',
  template: `
    <div class="spec-editor">
      <div class="editor-header">
        <div class="mode-toggle">
          <button class="mode-btn" [class.active]="Mode === 'form'" (click)="SetMode('form')">
            <i class="fa-solid fa-wpforms"></i> Form
          </button>
          <button class="mode-btn" [class.active]="Mode === 'json'" (click)="SetMode('json')">
            <i class="fa-solid fa-code"></i> JSON
          </button>
        </div>
        @if (State.IsEditingSpec) {
          <div class="action-buttons">
            <button kendoButton [themeColor]="'primary'" (click)="ApplyChanges()" class="action-btn">
              <i class="fa-solid fa-check"></i> Apply
            </button>
            <button kendoButton [themeColor]="'base'" (click)="CancelChanges()" class="action-btn">
              Cancel
            </button>
          </div>
        }
      </div>

      <div class="editor-body">
        @if (Mode === 'form') {
          <div class="form-mode">
            <div class="form-row">
              <div class="form-field">
                <label class="form-label">Name</label>
                <input class="form-input" [(ngModel)]="FormModel.name" (ngModelChange)="OnFormChanged()" />
              </div>
              <div class="form-field">
                <label class="form-label">Type</label>
                <select class="form-select" [(ngModel)]="FormModel.type" (ngModelChange)="OnFormChanged()">
                  @for (t of ComponentTypes; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="form-field">
              <label class="form-label">Title</label>
              <input class="form-input" [(ngModel)]="FormModel.title" (ngModelChange)="OnFormChanged()" />
            </div>
            <div class="form-field">
              <label class="form-label">Description</label>
              <textarea class="form-textarea" [(ngModel)]="FormModel.description" (ngModelChange)="OnFormChanged()" rows="3"></textarea>
            </div>
            <div class="form-row">
              <div class="form-field">
                <label class="form-label">Location</label>
                <select class="form-select" [(ngModel)]="FormModel.location" (ngModelChange)="OnFormChanged()">
                  <option value="embedded">embedded</option>
                  <option value="standalone">standalone</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label">Example Usage</label>
                <input class="form-input" [(ngModel)]="FormModel.exampleUsage" (ngModelChange)="OnFormChanged()" placeholder="Optional" />
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
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface);
      flex-shrink: 0;
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
      padding: 4px 12px;
      border: none;
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      font-size: 12px;
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
      font-size: 11px;
    }

    .action-buttons {
      display: flex;
      gap: 6px;
    }

    .action-btn {
      font-size: 12px;
    }

    .editor-body {
      flex: 1;
      overflow: auto;
    }

    .form-mode {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .form-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .form-input {
      padding: 8px 12px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 6px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .form-input:focus {
      border-color: var(--mat-sys-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mat-sys-primary) 15%, transparent);
    }

    .form-textarea {
      padding: 8px 12px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 6px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      font-size: 13px;
      font-family: inherit;
      resize: vertical;
      min-height: 60px;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .form-textarea:focus {
      border-color: var(--mat-sys-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mat-sys-primary) 15%, transparent);
    }

    .form-select {
      padding: 8px 12px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 6px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }

    .form-select:focus {
      border-color: var(--mat-sys-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mat-sys-primary) 15%, transparent);
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
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
export class SpecEditorComponent implements OnInit, OnDestroy {
  Mode: SpecEditorMode = 'form';
  FormModel: SpecFormModel = { name: '', title: '', description: '', type: '', location: '', exampleUsage: '' };
  ComponentTypes: string[] = COMPONENT_TYPES;

  private stateChangedSub: Subscription | null = null;

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.syncSpecToForm();
    this.stateChangedSub = this.State.StateChanged.subscribe(() => {
      if (this.Mode === 'form' && !this.State.IsEditingSpec) {
        this.syncSpecToForm();
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
        location: spec.location || '',
        exampleUsage: spec.exampleUsage || ''
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
      spec.location = this.FormModel.location;
      spec.exampleUsage = this.FormModel.exampleUsage;
      this.State.EditableSpec = JSON.stringify(spec, null, 2);
    } catch {
      // If JSON is invalid, skip sync
    }
  }
}
