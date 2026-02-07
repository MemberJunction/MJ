import { Component, ChangeDetectorRef } from '@angular/core';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

@Component({
  standalone: false,
  selector: 'mj-data-requirements-editor',
  template: `
    <div class="data-requirements-editor">
      <div class="editor-header">
        <span class="header-title">
          <i class="fa-solid fa-database"></i>
          Data Requirements
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
          @if (HasDataRequirements) {
            <div class="summary-bar">
              <span class="summary-item">
                <i class="fa-solid fa-table"></i>
                {{ EntityCount }} {{ EntityCount === 1 ? 'entity' : 'entities' }}
              </span>
              <span class="summary-item">
                <i class="fa-solid fa-search"></i>
                {{ QueryCount }} {{ QueryCount === 1 ? 'query' : 'queries' }}
              </span>
              <span class="summary-item mode-badge">
                {{ DataMode }}
              </span>
            </div>
          }
          <div class="json-editor-container">
            <mj-code-editor
              [(ngModel)]="EditableContent"
              [language]="'json'"
              [indentWithTab]="true"
              [placeholder]="'Enter data requirements JSON...'"
              (ngModelChange)="OnContentChanged()">
            </mj-code-editor>
          </div>
        } @else {
          <div class="empty-state">
            <i class="fa-solid fa-database"></i>
            <p>Select a component to edit its data requirements.</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .data-requirements-editor {
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
      background: var(--mat-sys-surface-container-lowest);
      flex-shrink: 0;
    }
    .header-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--mat-sys-on-surface);
    }
    .header-title i {
      margin-right: 6px;
      color: var(--mat-sys-on-surface-variant);
    }
    .action-buttons {
      display: flex;
      gap: 6px;
    }
    .summary-bar {
      display: flex;
      gap: 12px;
      padding: 6px 12px;
      background: var(--mat-sys-primary-container);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      font-size: 12px;
      color: var(--mat-sys-on-primary-container);
      flex-shrink: 0;
    }
    .summary-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .mode-badge {
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      padding: 1px 8px;
      border-radius: 10px;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
    }
    .editor-body {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .json-editor-container {
      flex: 1;
      overflow: hidden;
    }
    .json-editor-container mj-code-editor {
      display: block;
      height: 100%;
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
    }
    .empty-state p {
      margin: 0;
      font-size: 13px;
      text-align: center;
    }
  `]
})
export class DataRequirementsEditorComponent {
  EditableContent: string = '';
  IsEditing: boolean = false;

  private _parsedRequirements: Record<string, unknown> | null = null;

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  get HasDataRequirements(): boolean {
    return this._parsedRequirements != null;
  }

  get EntityCount(): number {
    if (!this._parsedRequirements) return 0;
    const entities = this._parsedRequirements['entities'];
    return Array.isArray(entities) ? entities.length : 0;
  }

  get QueryCount(): number {
    if (!this._parsedRequirements) return 0;
    const queries = this._parsedRequirements['queries'];
    return Array.isArray(queries) ? queries.length : 0;
  }

  get DataMode(): string {
    if (!this._parsedRequirements) return '';
    return (this._parsedRequirements['mode'] as string) || 'views';
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
    this.parseContent();
  }

  ApplyChanges(): void {
    try {
      const spec: ComponentSpec = JSON.parse(this.State.EditableSpec);
      const dataReq = JSON.parse(this.EditableContent);
      spec.dataRequirements = dataReq;
      this.State.UpdateSpec(spec);
      this.IsEditing = false;
    } catch (error) {
      console.error('Error applying data requirements changes:', error);
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
      const dataReq = spec.dataRequirements || { mode: 'views', entities: [], queries: [] };
      this.EditableContent = JSON.stringify(dataReq, null, 2);
      this.parseContent();
    } catch {
      this.EditableContent = '';
      this._parsedRequirements = null;
    }
  }

  private parseContent(): void {
    try {
      this._parsedRequirements = JSON.parse(this.EditableContent);
    } catch {
      this._parsedRequirements = null;
    }
  }
}
