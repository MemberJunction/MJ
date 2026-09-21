import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJDialogRef } from '@memberjunction/ng-ui-components';
import { DialogService } from '../../services/dialog.service';
import { MJProjectEntity } from '@memberjunction/core-entities';
import { UserInfo, Metadata } from '@memberjunction/core';

export interface ProjectFormData {
  name: string;
  description: string;
  color: string;
  icon: string;
  /** true = only the owner sees it; false = everyone in the environment does. */
  isPersonal: boolean;
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

        <!-- Visibility. TWO NAMED OPTIONS, not a checkbox: with a checkbox the unchecked
             meaning lives only in the helper text, so the shared state is never actually
             named. A fieldset/legend also gives the group a real accessible name, which a
             bare <label>Visibility</label> did not, and the hint is a sibling of the
             options rather than inside one — inside, a screen reader read the whole hint
             as part of the option's name. -->
        <div class="form-field">
          <fieldset class="visibility-set" aria-describedby="projectVisibilityHint">
            <legend>Visibility</legend>
            <label class="visibility-choice">
              <input type="radio" name="projectVisibility" [value]="true"
                     [(ngModel)]="formData.isPersonal" />
              <span>Only me</span>
            </label>
            <label class="visibility-choice">
              <input type="radio" name="projectVisibility" [value]="false"
                     [(ngModel)]="formData.isPersonal" />
              <span>Everyone</span>
            </label>
            <p class="visibility-hint" id="projectVisibilityHint">
              {{ formData.isPersonal
                  ? 'Only you can see this folder.'
                  : 'Everyone can see this folder and its name. They will not see the conversations you keep in it.' }}
            </p>
          </fieldset>
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
    .visibility-set {
      border: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    /* The legend carries the group's name, so it matches the other field labels. */
    .visibility-set legend {
      padding: 0;
      margin-bottom: 0.15rem;
    }

    /* Scoped as .form-field .visibility-choice (0,2,1) so it deliberately outranks the
       .form-field label rule (0,1,1) this sits inside — at equal specificity that rule
       won on source order and rendered the option text bold.
       (No backticks in here: this block is a template literal.) */
    .form-field .visibility-choice {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-weight: 400;
      margin: 0;
    }

    .visibility-choice input {
      flex: 0 0 auto;
      margin: 0;
    }

    .visibility-hint {
      margin: 0.15rem 0 0;
      color: var(--mj-text-muted);
    }

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
  @Input() dialogRef!: MJDialogRef;
  @Input() project: MJProjectEntity | null = null;
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  /** When creating a new folder, the parent folder ID for nesting (null = top level). */
  @Input() parentId: string | null = null;

  @Output() projectSaved = new EventEmitter<MJProjectEntity>();

  public formData: ProjectFormData = {
    name: '',
    description: '',
    color: '#0076B6',
    icon: 'fa-folder',
    // A NEW folder is personal by default. The conversation sidebar is a personal
    // surface — the conversations in it are already bound to their owner — so a
    // folder everyone can see is the surprising option, not the private one. Folder
    // NAMES are user-authored free text, and before OwnerUserID existed every one of
    // them was readable by every user of the environment, which is what prompted
    // this. Existing folders are untouched: they carry NULL, which still means shared.
    isPersonal: true
  };

  public showNameError = false;
  public isEditMode = false;
  public availableColors = DEFAULT_PROJECT_COLORS;
  public availableIcons = DEFAULT_PROJECT_ICONS;

  /** Translucent tint of the selected color, used behind the preview/icon glyph. */
  public get chipBackground(): string {
    const hex = this.formData.color || '#0076B6';
    // 8-digit hex (#RRGGBBAA) — ~14% alpha tint of the chosen color
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}24` : hex;
  }

  constructor(private cdr: ChangeDetectorRef, private dialogService: DialogService) {
  super();}

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
      icon: this.project.Icon || 'fa-folder',
      // Reflect what the folder IS, not the create-time default — otherwise opening
      // a shared folder's settings and pressing Save would silently make it private.
      isPersonal: !!this.project.OwnerUserID
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
      const md = this.ProviderToUse;
      const project = this.project || await md.GetEntityObject<MJProjectEntity>('MJ: Projects', this.currentUser);

      project.Name = this.formData.name.trim();
      project.Description = this.formData.description.trim() || null;
      project.Color = this.formData.color;
      project.Icon = this.formData.icon;

      // Taking a SHARED folder private removes it from everyone else's sidebar, and any
      // subfolders under it surface as top-level folders for them. That is a big enough
      // effect on other people to be worth confirming; going the other way (private ->
      // shared) only ever adds, so it is not gated.
      const wasShared = this.isEditMode && !this.project?.OwnerUserID;
      if (wasShared && this.formData.isPersonal) {
        const confirmed = await this.dialogService.confirm({
          title: 'Make this folder private?',
          message:
            'This folder is shared. Making it private removes it from everyone else\'s '
            + 'sidebar, and any folders inside it will show up as top-level folders for them. '
            + 'Their conversations are not affected.',
          okText: 'Make private',
          cancelText: 'Cancel',
          dangerous: true,
        });
        if (!confirmed) {
          return;
        }
      }

      // Settable on edit too: "share this with the team" and "take it back" are both
      // things people expect to do to their own folder. Null means shared, which is
      // what every folder created before this column existed carries.
      project.OwnerUserID = this.formData.isPersonal ? this.currentUser.ID : null;

      if (!this.isEditMode) {
        project.EnvironmentID = this.environmentId;
        project.IsArchived = false;
        if (this.parentId) {
          project.ParentID = this.parentId;
        }
      }

      const saved = await project.Save();
      if (saved) {
        this.projectSaved.emit(project);
        this.dialogRef.Close();
      } else {
        throw new Error('Failed to save project');
      }
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Failed to save project. Please try again.');
    }
  }

  onCancel(): void {
    this.dialogRef.Close();
  }
}
