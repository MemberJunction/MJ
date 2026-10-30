import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJDialogRef } from '@memberjunction/ng-ui-components';
import {
  ConversationEngine,
  MJProjectEntity,
  MJResourcePermissionEntity,
  MJUserEntity,
  PROJECTS_RESOURCE_TYPE_ID,
  ProjectVisibilityTier,
  ResourcePermissionEngine
} from '@memberjunction/core-entities';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';

export interface FolderSharePermission {
  permissionId: string | null;
  type: 'User' | 'Role';
  userId?: string | null;
  userEmail?: string;
  userName?: string;
  roleId?: string | null;
  roleName?: string;
  permissionLevel: 'View' | 'Edit' | 'Owner';
}

export interface ProjectFormData {
  name: string;
  description: string;
  color: string;
  icon: string;
  /** true = owned folder (Private or Shared ACL); false = Public (everyone in the environment). */
  isPersonal: boolean;
  /** Three-tier Google Drive-style folder visibility ('Private' | 'Shared' | 'Public'). */
  visibility?: ProjectVisibilityTier;
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
             as part of the option's name.

             A SHARED folder shows a statement instead of the control. Visibility is a
             create-time choice in one direction only: personal -> shared stays available,
             because it only ever adds. See VisibilityIsLocked for why the reverse is not
             offered. -->
        <div class="form-field">
          @if (VisibilityIsLocked) {
            <fieldset class="visibility-set" aria-describedby="projectVisibilityHint">
              <legend>Visibility</legend>
              <p class="visibility-locked">
                <i class="fa-solid fa-users" aria-hidden="true"></i>
                Shared with everyone
              </p>
              <p class="visibility-hint" id="projectVisibilityHint">
                A shared folder stays shared. To keep something to yourself, create a new
                private folder and move it there.
              </p>
            </fieldset>
          } @else {
            <fieldset class="visibility-set" aria-describedby="projectVisibilityHint">
              <legend>Visibility</legend>
              <label class="visibility-choice">
                <input type="radio" name="projectVisibility" value="Private"
                       [checked]="VisibilityTier === 'Private'"
                       (change)="SelectVisibility('Private')" />
                <span>Only me (Private)</span>
              </label>
              <label class="visibility-choice">
                <input type="radio" name="projectVisibility" value="Shared"
                       [checked]="VisibilityTier === 'Shared'"
                       (change)="SelectVisibility('Shared')" />
                <span>Specific people &amp; roles (Shared)</span>
              </label>
              <label class="visibility-choice">
                <input type="radio" name="projectVisibility" value="Public"
                       [checked]="VisibilityTier === 'Public'"
                       (change)="SelectVisibility('Public')" />
                <span>Everyone (Public)</span>
              </label>
              <p class="visibility-hint" id="projectVisibilityHint">
                {{ VisibilityHint }}
              </p>
            </fieldset>

            @if (VisibilityTier === 'Shared') {
              <div class="folder-acl-panel">
                <div class="folder-acl-add">
                  <input
                    type="email"
                    [(ngModel)]="NewShareEmail"
                    placeholder="Add person by email..."
                    class="mj-input folder-acl-email"
                    (keydown.enter)="$event.preventDefault(); OnAddFolderUser()" />
                  <select [(ngModel)]="NewShareLevel" class="mj-select folder-acl-level">
                    <option value="View">Can View</option>
                    <option value="Edit">Can Edit</option>
                    <option value="Owner">Owner</option>
                  </select>
                  <button type="button" mjButton variant="flat" (click)="OnAddFolderUser()">
                    Add
                  </button>
                </div>
                @if (ShareError) {
                  <div class="error-message">{{ ShareError }}</div>
                }
                @if (FolderPermissions.length > 0) {
                  <div class="folder-acl-list">
                    @for (perm of FolderPermissions; track perm) {
                      <div class="folder-acl-row">
                        <div class="folder-acl-identity">
                          <span class="folder-acl-name">{{ perm.userName || perm.roleName || perm.userEmail }}</span>
                          @if (perm.userEmail && perm.userName) {
                            <span class="folder-acl-sub">{{ perm.userEmail }}</span>
                          }
                        </div>
                        <div class="folder-acl-actions">
                          <select
                            [ngModel]="perm.permissionLevel"
                            (ngModelChange)="OnFolderPermissionLevelChange(perm, $event)"
                            class="mj-select folder-acl-level">
                            <option value="View">Can View</option>
                            <option value="Edit">Can Edit</option>
                            <option value="Owner">Owner</option>
                          </select>
                          <button
                            type="button"
                            class="folder-acl-remove"
                            (click)="OnRemoveFolderPermission(perm)"
                            title="Remove access">
                            <i class="fa-solid fa-times"></i>
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          }
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

    /* A <legend> is not matched by the .form-field label rule, so it inherited 16px/400
       and read larger and lighter than every other field label. Restated here rather than
       widening that selector, which would also catch the option labels below.
       (No backticks in this block: it is a template literal.) */
    .visibility-set legend {
      padding: 0;
      margin-bottom: 0.15rem;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.01em;
      color: var(--mj-text-secondary);
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
      font-size: 13px;
      margin: 0;
      /* The rows were the height of the radio alone (~16px). The checkbox this replaced
         sat in a 31px row, so the tap target got smaller when the control got clearer. */
      padding: 0.25rem 0;
    }

    .visibility-choice input {
      flex: 0 0 auto;
      margin: 0;
    }

    /* The shared-folder statement that stands in for the radios. Matches the option rows
       it replaces — same size, same weight, same 0.25rem row padding — so the dialog does
       not visibly reflow between a folder that offers the choice and one that does not.
       (No backticks in here: this block is a template literal.) */
    .form-field .visibility-locked {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      padding: 0.25rem 0;
      font-weight: 400;
      font-size: 13px;
      color: var(--mj-text-primary);
    }

    .visibility-locked i {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .visibility-hint {
      margin: 0.15rem 0 0;
      /* Unsized it inherited 16px and read LARGER than the options it describes. */
      font-size: 12px;
      line-height: 1.4;
      color: var(--mj-text-muted);
    }

    .folder-acl-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
      padding: 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: 10px;
      background: var(--mj-bg-surface);
    }
    .folder-acl-add {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .folder-acl-email {
      flex: 1;
      min-width: 0;
    }
    .folder-acl-level {
      width: 112px;
    }
    .folder-acl-list {
      display: flex;
      flex-direction: column;
      border-top: 1px solid var(--mj-border-subtle);
      padding-top: 8px;
      gap: 6px;
      max-height: 160px;
      overflow-y: auto;
    }
    .folder-acl-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .folder-acl-identity {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .folder-acl-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .folder-acl-sub {
      font-size: 11px;
      color: var(--mj-text-muted);
    }
    .folder-acl-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .folder-acl-remove {
      padding: 4px 6px;
      border: none;
      background: transparent;
      cursor: pointer;
      color: var(--mj-text-muted);
      border-radius: 4px;
    }
    .folder-acl-remove:hover {
      color: var(--mj-status-error);
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
    icon: 'fa-folder',
    // A NEW folder is personal by default. The conversation sidebar is a personal
    // surface — the conversations in it are already bound to their owner — so a
    // folder everyone can see is the surprising option, not the private one. Folder
    // NAMES are user-authored free text, and before OwnerUserID existed every one of
    // them was readable by every user of the environment, which is what prompted
    // this. Existing folders are untouched: they carry NULL, which still means shared.
    isPersonal: true,
    visibility: 'Private'
  };

  /** @deprecated Use {@link FormData}. */
  public get formData(): ProjectFormData {
    return this.FormData;
  }
  /** @deprecated Use {@link FormData}. */
  public set formData(value: ProjectFormData) {
    this.FormData = value;
  }

  public FolderPermissions: FolderSharePermission[] = [];
  public RemovedFolderPermissionIds: string[] = [];
  public NewShareEmail = '';
  public NewShareLevel: 'View' | 'Edit' | 'Owner' = 'View';
  public ShareError = '';

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

  /**
   * Current three-tier visibility selection (`'Private' | 'Shared' | 'Public'`).
   * Keeps `FormData.isPersonal` in sync (`false` iff `'Public'`).
   */
  public get VisibilityTier(): ProjectVisibilityTier {
    if (!this.FormData.isPersonal) {
      return 'Public';
    }
    return this.FormData.visibility === 'Shared' ? 'Shared' : 'Private';
  }

  public set VisibilityTier(tier: ProjectVisibilityTier) {
    this.FormData.visibility = tier;
    this.FormData.isPersonal = tier !== 'Public';
  }

  public SelectVisibility(tier: ProjectVisibilityTier): void {
    this.VisibilityTier = tier;
    this.ShareError = '';
    this.cdr.detectChanges();
  }

  public get VisibilityHint(): string {
    const tier = this.VisibilityTier;
    if (tier === 'Public') {
      return "Everyone can see this folder and view the conversations in it. Once shared, a folder can't be made private again.";
    }
    if (tier === 'Shared') {
      return 'People and roles you add below can see this folder and inherit its permission on conversations in it.';
    }
    return 'Only you can see this folder.';
  }

  /**
   * True when this dialog is editing a folder that is currently PUBLIC (`OwnerUserID IS NULL`) —
   * in which case visibility is shown as a statement rather than a control.
   */
  public get VisibilityIsLocked(): boolean {
    return this.IsEditMode && !this.Project?.OwnerUserID;
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
      if (this.Project.ID && this.Project.OwnerUserID) {
        void this.loadFolderPermissions();
      }
    }
  }

  private loadProjectData(): void {
    if (!this.Project) return;

    const initialTier =
      ConversationEngine.Instance?.GetProjectVisibilityTier?.(this.Project) ??
      (this.Project.OwnerUserID ? 'Private' : 'Public');

    this.FormData = {
      name: this.Project.Name || '',
      description: this.Project.Description || '',
      color: this.Project.Color || '#0076B6',
      icon: this.Project.Icon || 'fa-folder',
      // Reflect what the folder IS, not the create-time default — otherwise opening
      // a shared folder's settings and pressing Save would silently make it private.
      isPersonal: !!this.Project.OwnerUserID,
      visibility: initialTier
    };
  }

  private async loadFolderPermissions(): Promise<void> {
    if (!this.Project?.ID) return;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJResourcePermissionEntity>({
        EntityName: 'MJ: Resource Permissions',
        ExtraFilter: `ResourceTypeID='${PROJECTS_RESOURCE_TYPE_ID}' AND ResourceRecordID='${this.Project.ID}' AND Status='Approved'`,
        ResultType: 'entity_object'
      });
      if (!result?.Success || !result.Results) return;

      const loaded: FolderSharePermission[] = [];
      for (const perm of result.Results) {
        if (perm.Type === 'Role' && perm.RoleID) {
          loaded.push({
            permissionId: perm.ID,
            type: 'Role',
            roleId: perm.RoleID,
            roleName: perm.Role || perm.RoleID,
            permissionLevel: (perm.PermissionLevel as 'View' | 'Edit' | 'Owner') || 'View'
          });
        } else if (perm.UserID) {
          let userEmail = '';
          let userName = perm.User || '';
          const userResult = await rv.RunView<MJUserEntity>({
            EntityName: 'MJ: Users',
            ExtraFilter: `ID='${perm.UserID}'`,
            ResultType: 'entity_object'
          });
          if (userResult?.Success && userResult.Results?.length) {
            userEmail = userResult.Results[0].Email || '';
            userName = userResult.Results[0].Name || userName;
          }
          loaded.push({
            permissionId: perm.ID,
            type: 'User',
            userId: perm.UserID,
            userEmail,
            userName: userName || userEmail || perm.UserID,
            permissionLevel: (perm.PermissionLevel as 'View' | 'Edit' | 'Owner') || 'View'
          });
        }
      }
      this.FolderPermissions = loaded;
      if (loaded.length > 0 && this.Project.OwnerUserID) {
        this.VisibilityTier = 'Shared';
      }
      this.cdr.detectChanges();
    } catch (err) {
      console.warn('Failed to load folder permissions:', err);
    }
  }

  async OnAddFolderUser(): Promise<void> {
    const email = this.NewShareEmail.trim();
    this.ShareError = '';
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.ShareError = 'Please enter a valid email address.';
      this.cdr.detectChanges();
      return;
    }

    if (this.FolderPermissions.some((p) => p.userEmail?.toLowerCase() === email.toLowerCase())) {
      this.ShareError = 'This user already has access.';
      this.cdr.detectChanges();
      return;
    }

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const userResult = await rv.RunView<MJUserEntity>({
        EntityName: 'MJ: Users',
        ExtraFilter: `Email='${email.replace(/'/g, "''")}'`,
        ResultType: 'entity_object'
      });

      if (!userResult?.Success || !userResult.Results?.length) {
        this.ShareError = 'No user found with that email address.';
        this.cdr.detectChanges();
        return;
      }

      const user = userResult.Results[0];
      this.FolderPermissions.push({
        permissionId: null,
        type: 'User',
        userId: user.ID,
        userEmail: user.Email,
        userName: user.Name || user.Email,
        permissionLevel: this.NewShareLevel
      });
      this.NewShareEmail = '';
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error looking up user:', err);
      this.ShareError = 'Failed to look up user.';
      this.cdr.detectChanges();
    }
  }

  OnFolderPermissionLevelChange(perm: FolderSharePermission, level: 'View' | 'Edit' | 'Owner'): void {
    perm.permissionLevel = level;
    this.cdr.detectChanges();
  }

  OnRemoveFolderPermission(perm: FolderSharePermission): void {
    if (perm.permissionId) {
      this.RemovedFolderPermissionIds.push(perm.permissionId);
    }
    this.FolderPermissions = this.FolderPermissions.filter((p) => p !== perm);
    this.cdr.detectChanges();
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

      // A Public folder cannot be taken private — the control is not rendered for one
      // (see VisibilityIsLocked). This is the same rule expressed where the write happens,
      // so a future template change, a stale `formData` from a reopened dialog, or anything
      // else that sets the flag cannot quietly appropriate a folder the whole team uses.
      const isPersonal = this.VisibilityIsLocked ? false : this.FormData.isPersonal;

      const project = this.Project || await md.GetEntityObject<MJProjectEntity>('MJ: Projects', this.CurrentUser);

      project.Name = this.FormData.name.trim();
      project.Description = this.FormData.description.trim() || null;
      project.Color = this.FormData.color;
      project.Icon = this.FormData.icon;

      // Both Private and Shared folders stay owned by their creator (OwnerUserID set).
      // Public folders set OwnerUserID = null so everyone in the environment can view them.
      project.OwnerUserID = isPersonal ? (this.Project?.OwnerUserID || this.CurrentUser.ID) : null;

      if (!this.IsEditMode) {
        project.EnvironmentID = this.EnvironmentId;
        project.IsArchived = false;
        if (this.ParentId) {
          project.ParentID = this.ParentId;
        }
      }

      const saved = await project.Save();
      if (saved) {
        await this.syncFolderPermissions(project.ID);
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

  private async syncFolderPermissions(projectId: string): Promise<void> {
    if (!projectId) return;
    const md = this.ProviderToUse;
    const tier = this.VisibilityIsLocked ? 'Public' : this.VisibilityTier;

    const idsToDelete = [...this.RemovedFolderPermissionIds];
    if (tier !== 'Shared') {
      for (const perm of this.FolderPermissions) {
        if (perm.permissionId) {
          idsToDelete.push(perm.permissionId);
        }
      }
    }

    // Save() and Delete() report a refusal on LatestResult and return false. Throwing here sends
    // it to OnSave's catch, which shows the reason and keeps the dialog open instead of closing on
    // a folder whose sharing did not take.
    const refused = (entity: MJResourcePermissionEntity, action: string): never => {
      throw new Error(`Could not ${action} a folder permission: ${entity.LatestResult?.CompleteMessage || 'no reason given'}`);
    };

    let changed = false;
    try {
      for (const permId of idsToDelete) {
        const permEntity = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions', this.CurrentUser);
        if (await permEntity.Load(permId)) {
          if (!(await permEntity.Delete())) refused(permEntity, 'remove');
          changed = true;
        }
      }

      if (tier === 'Shared') {
        for (const perm of this.FolderPermissions) {
          const permEntity = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions', this.CurrentUser);
          if (perm.permissionId) {
            if (await permEntity.Load(perm.permissionId)) {
              if (permEntity.PermissionLevel !== perm.permissionLevel) {
                permEntity.PermissionLevel = perm.permissionLevel;
                if (!(await permEntity.Save())) refused(permEntity, 'update');
                changed = true;
              }
            }
          } else {
            permEntity.ResourceTypeID = PROJECTS_RESOURCE_TYPE_ID;
            permEntity.ResourceRecordID = projectId;
            permEntity.Type = perm.type;
            permEntity.UserID = perm.type === 'User' ? (perm.userId ?? null) : null;
            permEntity.RoleID = perm.type === 'Role' ? (perm.roleId ?? null) : null;
            permEntity.PermissionLevel = perm.permissionLevel;
            permEntity.Status = 'Approved';
            if (!(await permEntity.Save())) refused(permEntity, 'add');
            perm.permissionId = permEntity.ID;
            changed = true;
          }
        }
      }
    } finally {
      // Grants that did land before a refusal are real, so the engine still has to see them.
      if (changed) {
        try {
          await ResourcePermissionEngine.Instance?.Config?.(true, this.CurrentUser);
        } catch {
          // Isolated test environments without a global Metadata.Provider may not support engine Config refresh.
        }
      }
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

