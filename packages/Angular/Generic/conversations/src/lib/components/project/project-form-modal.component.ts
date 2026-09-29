import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJDialogRef } from '@memberjunction/ng-ui-components';
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
    <mj-dialog
      [Title]="isEditMode ? 'Edit Folder' : 'New Folder'"
      [Width]="560"
      [MinWidth]="400"
      [Visible]="true"
      (Close)="onCancel()">

      <div class="project-form">
        <!-- Live preview chip -->
        <div class="folder-preview">
          <span class="folder-preview-chip" [style.backgroundColor]="chipBackground" [style.color]="formData.color">
            <i class="fa-solid {{ formData.icon }}"></i>
          </span>
          <span class="folder-preview-name">{{ formData.name.trim() || 'Untitled folder' }}</span>
        </div>

        <!-- Name Input -->
        <div class="form-field">
          <label for="projectName" class="required">
            Folder Name
          </label>
          <input
            id="projectName"
            type="text"
            [(ngModel)]="formData.name"
            placeholder="e.g. Client work, Research, Ideas"
            class="mj-input full-width"
            (keydown.enter)="onSave()"
            autofocus />
          @if (showNameError) {
            <div class="error-message">Folder name is required</div>
          }
        </div>

        <!-- Description Textarea -->
        <div class="form-field">
          <label for="projectDescription">
            Description
          </label>
          <textarea
            id="projectDescription"
            [(ngModel)]="formData.description"
            placeholder="What goes in this folder? (optional)"
            class="mj-textarea full-width"
            rows="2"></textarea>
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
          <div class="icon-grid">
            @for (icon of availableIcons; track icon) {
              <button
                type="button"
                class="icon-option"
                [class.selected]="formData.icon === icon"
                [style.color]="formData.icon === icon ? formData.color : null"
                (click)="selectIcon(icon)"
                [title]="icon">
                <i class="fa-solid {{ icon }}"></i>
              </button>
            }
          </div>
        </div>
      </div>

      <mj-dialog-actions>
        <button mjButton variant="primary" (click)="onSave()">
          {{ isEditMode ? 'Save Changes' : 'Create Folder' }}
        </button>
        <button mjButton (click)="onCancel()">Cancel</button>
      </mj-dialog-actions>
    </mj-dialog>
  `,
  styles: [`
    .project-form {
      padding: 20px 24px 8px;
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    /* Live preview chip */
    .folder-preview {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 12px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-subtle);
    }
    .folder-preview-chip {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
      transition: background-color 150ms ease, color 150ms ease;
    }
    .folder-preview-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--mj-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-field label {
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.01em;
      color: var(--mj-text-secondary);
    }

    .form-field label.required::after {
      content: '*';
      color: var(--mj-status-error);
      margin-left: 4px;
    }

    .full-width { width: 100%; }

    .error-message {
      color: var(--mj-status-error);
      font-size: 12px;
    }

    /* Color Picker */
    .color-picker-section {
      border: 1px solid var(--mj-border-default);
      border-radius: 12px;
      padding: 14px;
      background: var(--mj-bg-surface);
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
      border: none;
      border-radius: 8px;
      cursor: pointer;
      padding: 0;
      transition: transform 120ms ease, box-shadow 120ms ease;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mj-text-primary) 8%, transparent);
    }

    .color-swatch:hover {
      transform: scale(1.12);
    }

    .color-swatch.selected {
      box-shadow: 0 0 0 2px var(--mj-bg-surface), 0 0 0 4px var(--mj-brand-primary);
    }

    .custom-color-input {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-top: 14px;
      border-top: 1px solid var(--mj-border-subtle);
    }

    .custom-color-input label {
      margin: 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-secondary);
    }

    .custom-color-picker {
      width: 44px;
      height: 30px;
      padding: 2px;
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      cursor: pointer;
      background: var(--mj-bg-surface);
    }

    .color-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      color: var(--mj-text-muted);
      text-transform: uppercase;
    }

    /* Icon Selector */
    .icon-grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 8px;
      max-height: 184px;
      overflow-y: auto;
      padding: 14px;
      border: 1px solid var(--mj-border-default);
      border-radius: 12px;
      background: var(--mj-bg-surface);
    }

    .icon-option {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--mj-border-subtle);
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      cursor: pointer;
      color: var(--mj-text-secondary);
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    .icon-option:hover {
      background: var(--mj-bg-surface-hover);
      border-color: var(--mj-border-strong);
      transform: translateY(-1px);
    }

    .icon-option.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 1px var(--mj-brand-primary);
    }

    .icon-option i { font-size: 17px; }

    /* Scrollbar */
    .icon-grid::-webkit-scrollbar { width: 8px; }
    .icon-grid::-webkit-scrollbar-track {
      background: transparent;
    }
    .icon-grid::-webkit-scrollbar-thumb {
      background: var(--mj-border-strong);
      border-radius: 4px;
    }
    .icon-grid::-webkit-scrollbar-thumb:hover {
      background: var(--mj-text-disabled);
    }
  `]
})
export class ProjectFormModalComponent extends BaseAngularComponent implements OnInit  {
  @Input() DialogRef!: MJDialogRef;

  /** @deprecated Use {@link DialogRef}. */
  @Input() set dialogRef(value: MJDialogRef) {
    this.DialogRef = value;
  }
  /** @deprecated Use {@link DialogRef}. */
  get dialogRef(): MJDialogRef {
    return this.DialogRef;
  }
  @Input() Project: MJProjectEntity | null = null;

  /** @deprecated Use {@link Project}. */
  @Input() set project(value: MJProjectEntity | null) {
    this.Project = value;
  }
  /** @deprecated Use {@link Project}. */
  get project(): MJProjectEntity | null {
    return this.Project;
  }
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  /** When creating a new folder, the parent folder ID for nesting (null = top level). */
  @Input() ParentId: string | null = null;

  /** @deprecated Use {@link ParentId}. */
  @Input() set parentId(value: string | null) {
    this.ParentId = value;
  }
  /** @deprecated Use {@link ParentId}. */
  get parentId(): string | null {
    return this.ParentId;
  }

  @Output() ProjectSaved = new EventEmitter<MJProjectEntity>();

  /**
   * @deprecated Use {@link ProjectSaved}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (projectSaved) keeps working. Must stay AFTER ProjectSaved: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() projectSaved = this.ProjectSaved;

  public FormData: ProjectFormData = {
    name: '',
    description: '',
    color: '#0076B6',
    icon: 'fa-folder'
  };

  /** @deprecated Use {@link FormData}. */
  public get formData(): ProjectFormData {
    return this.FormData;
  }
  /** @deprecated Use {@link FormData}. */
  public set formData(value: ProjectFormData) {
    this.FormData = value;
  }

  public ShowNameError = false;

  /** @deprecated Use {@link ShowNameError}. */
  public get showNameError() {
    return this.ShowNameError;
  }
  /** @deprecated Use {@link ShowNameError}. */
  public set showNameError(value) {
    this.ShowNameError = value;
  }
  public IsEditMode = false;

  /** @deprecated Use {@link IsEditMode}. */
  public get isEditMode() {
    return this.IsEditMode;
  }
  /** @deprecated Use {@link IsEditMode}. */
  public set isEditMode(value) {
    this.IsEditMode = value;
  }
  public AvailableColors = DEFAULT_PROJECT_COLORS;

  /** @deprecated Use {@link AvailableColors}. */
  public get availableColors() {
    return this.AvailableColors;
  }
  /** @deprecated Use {@link AvailableColors}. */
  public set availableColors(value) {
    this.AvailableColors = value;
  }
  public AvailableIcons = DEFAULT_PROJECT_ICONS;

  /** @deprecated Use {@link AvailableIcons}. */
  public get availableIcons() {
    return this.AvailableIcons;
  }
  /** @deprecated Use {@link AvailableIcons}. */
  public set availableIcons(value) {
    this.AvailableIcons = value;
  }

  /** Translucent tint of the selected color, used behind the preview/icon glyph. */
  public get ChipBackground(): string {
    const hex = this.FormData.color || '#0076B6';
    // 8-digit hex (#RRGGBBAA) — ~14% alpha tint of the chosen color
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}24` : hex;
  }

  /** @deprecated Use {@link ChipBackground}. */
  public get chipBackground(): string {
    return this.ChipBackground;
  }

  constructor(private cdr: ChangeDetectorRef) {
  super();}

  ngOnInit(): void {
    this.IsEditMode = this.Project != null;

    if (this.Project) {
      this.loadProjectData();
    }
  }

  private loadProjectData(): void {
    if (!this.Project) return;

    this.FormData = {
      name: this.Project.Name || '',
      description: this.Project.Description || '',
      color: this.Project.Color || '#0076B6',
      icon: this.Project.Icon || 'fa-folder'
    };
  }

  SelectColor(color: string): void {
    this.FormData.color = color;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link SelectColor}. */
  selectColor(color: string): void {
    return this.SelectColor(color);
  }

  SelectIcon(icon: string): void {
    this.FormData.icon = icon;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link SelectIcon}. */
  selectIcon(icon: string): void {
    return this.SelectIcon(icon);
  }

  async OnSave(): Promise<void> {
    // Validate
    if (!this.FormData.name.trim()) {
      this.ShowNameError = true;
      this.cdr.detectChanges();
      return;
    }

    this.ShowNameError = false;

    try {
      const md = this.ProviderToUse;
      const project = this.Project || await md.GetEntityObject<MJProjectEntity>('MJ: Projects', this.CurrentUser);

      project.Name = this.FormData.name.trim();
      project.Description = this.FormData.description.trim() || null;
      project.Color = this.FormData.color;
      project.Icon = this.FormData.icon;

      if (!this.IsEditMode) {
        project.EnvironmentID = this.EnvironmentId;
        project.IsArchived = false;
        if (this.ParentId) {
          project.ParentID = this.ParentId;
        }
      }

      const saved = await project.Save();
      if (saved) {
        this.ProjectSaved.emit(project);
        this.DialogRef.Close();
      } else {
        // Save() records WHY it refused on LatestResult and returns false — a
        // server refusal, a constraint violation, a failed validation. Reporting
        // a generic message here would throw the only copy of that reason away.
        throw new Error(project.LatestResult?.CompleteMessage || 'The save was refused with no reason given.');
      }
    } catch (error) {
      console.error('Error saving project:', error);
      const reason = error instanceof Error ? error.message : String(error);
      alert(`Failed to save folder.\n\n${reason}`);
    }
  }

  /** @deprecated Use {@link OnSave}. */
  async onSave(): Promise<void> {
    return this.OnSave();
  }

  onCancel(): void {
    this.DialogRef.Close();
  }
}
