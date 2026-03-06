import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { MJProjectEntity } from '@memberjunction/core-entities';
import { UserInfo, Metadata } from '@memberjunction/core';

export interface ProjectFormData {
  name: string;
  description: string;
  color: string;
  icon: string;
}

const DEFAULT_PROJECT_COLORS = [
  '#0076B6', // MJ Blue
  '#F44336', // Red
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#673AB7', // Deep Purple
  '#3F51B5', // Indigo
  '#2196F3', // Blue
  '#03A9F4', // Light Blue
  '#00BCD4', // Cyan
  '#009688', // Teal
  '#4CAF50', // Green
  '#8BC34A', // Light Green
  '#CDDC39', // Lime
  '#FFEB3B', // Yellow
  '#FFC107', // Amber
  '#FF9800', // Orange
  '#FF5722', // Deep Orange
  '#795548', // Brown
  '#607D8B', // Blue Grey
  '#9E9E9E'  // Grey
];

const DEFAULT_PROJECT_ICONS = [
  'fa-folder',
  'fa-folder-open',
  'fa-briefcase',
  'fa-project-diagram',
  'fa-chart-line',
  'fa-tasks',
  'fa-clipboard-list',
  'fa-bullseye',
  'fa-rocket',
  'fa-lightbulb',
  'fa-brain',
  'fa-cogs',
  'fa-code',
  'fa-database',
  'fa-server',
  'fa-cloud',
  'fa-mobile-alt',
  'fa-desktop',
  'fa-globe',
  'fa-users'
];

@Component({
  standalone: false,
  selector: 'mj-project-form-modal',
  template: `
    <kendo-dialog
      [title]="isEditMode ? 'Edit Project' : 'New Project'"
      [width]="600"
      [minWidth]="400"
      (close)="onCancel()">

      <div class="project-form">
        <!-- Name Input -->
        <div class="form-field">
          <label for="projectName" class="required">
            Project Name
          </label>
          <input
            id="projectName"
            kendoTextBox
            [(ngModel)]="formData.name"
            placeholder="Enter project name"
            class="k-textbox full-width"
            (keydown.enter)="onSave()"
            autofocus />
          @if (showNameError) {
            <div class="error-message">Project name is required</div>
          }
        </div>

        <!-- Description Textarea -->
        <div class="form-field">
          <label for="projectDescription">
            Description
          </label>
          <textarea
            id="projectDescription"
            kendoTextArea
            [(ngModel)]="formData.description"
            placeholder="Enter project description (optional)"
            class="k-textarea full-width"
            rows="3"></textarea>
        </div>

        <!-- Color Picker -->
        <div class="form-field">
          <label>Color</label>
          <div class="color-picker-section">
            <div class="color-palette">
              @for (color of availableColors; track color) {
                <button
                  type="button"
                  class="color-swatch"
                  [class.selected]="formData.color === color"
                  [style.backgroundColor]="color"
                  (click)="selectColor(color)"
                  [title]="color">
                </button>
              }
            </div>
            <div class="custom-color-input">
              <label for="customColor">Custom:</label>
              <input
                id="customColor"
                type="color"
                [(ngModel)]="formData.color"
                class="custom-color-picker" />
              <span class="color-value">{{ formData.color }}</span>
            </div>
          </div>
        </div>

        <!-- Icon Selector -->
        <div class="form-field">
          <label>Icon</label>
          <div class="icon-selector-section">
            <div class="selected-icon-preview">
              <i class="fa-solid {{ formData.icon }}" [style.color]="formData.color"></i>
              <span>{{ formData.icon }}</span>
            </div>
            <div class="icon-grid">
              @for (icon of availableIcons; track icon) {
                <button
                  type="button"
                  class="icon-option"
                  [class.selected]="formData.icon === icon"
                  (click)="selectIcon(icon)"
                  [title]="icon">
                  <i class="fa-solid {{ icon }}"></i>
                </button>
              }
            </div>
          </div>
        </div>
      </div>

      <kendo-dialog-actions>
        <button kendoButton (click)="onCancel()">Cancel</button>
        <button kendoButton [themeColor]="'primary'" (click)="onSave()">
          {{ isEditMode ? 'Save' : 'Create' }}
        </button>
      </kendo-dialog-actions>
    </kendo-dialog>
  `,
  styles: [`
    .project-form {
      padding: 16px;
    }

    .form-field {
      margin-bottom: 20px;
    }

    .form-field label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      font-size: 14px;
      color: #333;
    }

    .form-field label.required::after {
      content: '*';
      color: #F44336;
      margin-left: 4px;
    }

    .full-width {
      width: 100%;
    }

    .error-message {
      color: #F44336;
      font-size: 12px;
      margin-top: 4px;
    }

    /* Color Picker Styles */
    .color-picker-section {
      border: 1px solid #D9D9D9;
      border-radius: 4px;
      padding: 12px;
      background: #F9F9F9;
    }

    .color-palette {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }

    .color-swatch {
      width: 100%;
      aspect-ratio: 1;
      border: 2px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      transition: all 150ms ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .color-swatch:hover {
      transform: scale(1.1);
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    }

    .color-swatch.selected {
      border-color: #0076B6;
      box-shadow: 0 0 0 2px #fff, 0 0 0 4px #0076B6;
    }

    .custom-color-input {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 12px;
      border-top: 1px solid #D9D9D9;
    }

    .custom-color-input label {
      margin: 0;
      font-size: 13px;
    }

    .custom-color-picker {
      width: 50px;
      height: 32px;
      border: 1px solid #D9D9D9;
      border-radius: 4px;
      cursor: pointer;
    }

    .color-value {
      font-family: monospace;
      font-size: 13px;
      color: #666;
    }

    /* Icon Selector Styles */
    .icon-selector-section {
      border: 1px solid #D9D9D9;
      border-radius: 4px;
      padding: 12px;
      background: #F9F9F9;
    }

    .selected-icon-preview {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: white;
      border: 1px solid #D9D9D9;
      border-radius: 4px;
      margin-bottom: 12px;
    }

    .selected-icon-preview i {
      font-size: 24px;
    }

    .selected-icon-preview span {
      font-family: monospace;
      font-size: 13px;
      color: #666;
    }

    .icon-grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 6px;
      max-height: 200px;
      overflow-y: auto;
      padding: 4px;
    }

    .icon-option {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #D9D9D9;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .icon-option:hover {
      background: #F0F0F0;
      border-color: #0076B6;
      transform: scale(1.05);
    }

    .icon-option.selected {
      background: #E3F2FD;
      border-color: #0076B6;
      border-width: 2px;
    }

    .icon-option i {
      font-size: 18px;
      color: #333;
    }

    /* Scrollbar Styles */
    .icon-grid::-webkit-scrollbar {
      width: 8px;
    }

    .icon-grid::-webkit-scrollbar-track {
      background: #F0F0F0;
      border-radius: 4px;
    }

    .icon-grid::-webkit-scrollbar-thumb {
      background: #D9D9D9;
      border-radius: 4px;
    }

    .icon-grid::-webkit-scrollbar-thumb:hover {
      background: #BFBFBF;
    }
  `]
})
export class ProjectFormModalComponent implements OnInit {
  @Input() dialogRef!: DialogRef;
  @Input() project: MJProjectEntity | null = null;
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  @Output() projectSaved = new EventEmitter<MJProjectEntity>();

  public formData: ProjectFormData = {
    name: '',
    description: '',
    color: '#0076B6',
    icon: 'fa-folder'
  };

  public showNameError = false;
  public isEditMode = false;
  public availableColors = DEFAULT_PROJECT_COLORS;
  public availableIcons = DEFAULT_PROJECT_ICONS;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.isEditMode = this.project != null;

    if (this.project) {
      this.loadProjectData();
    }
  }

  private loadProjectData(): void {
    if (!this.project) return;

    this.formData = {
      name: this.project.Name || '',
      description: this.project.Description || '',
      color: this.project.Color || '#0076B6',
      icon: this.project.Icon || 'fa-folder'
    };
  }

  selectColor(color: string): void {
    this.formData.color = color;
    this.cdr.detectChanges();
  }

  selectIcon(icon: string): void {
    this.formData.icon = icon;
    this.cdr.detectChanges();
  }

  async onSave(): Promise<void> {
    // Validate
    if (!this.formData.name.trim()) {
      this.showNameError = true;
      this.cdr.detectChanges();
      return;
    }

    this.showNameError = false;

    try {
      const md = new Metadata();
      const project = this.project || await md.GetEntityObject<MJProjectEntity>('MJ: Projects', this.currentUser);

      project.Name = this.formData.name.trim();
      project.Description = this.formData.description.trim() || null;
      project.Color = this.formData.color;
      project.Icon = this.formData.icon;

      if (!this.isEditMode) {
        project.EnvironmentID = this.environmentId;
        project.IsArchived = false;
      }

      const saved = await project.Save();
      if (saved) {
        this.projectSaved.emit(project);
        this.dialogRef.close();
      } else {
        throw new Error('Failed to save project');
      }
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Failed to save project. Please try again.');
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
