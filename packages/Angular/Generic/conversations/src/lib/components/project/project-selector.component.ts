import { Component, Input, Output, EventEmitter, OnInit, ViewContainerRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJProjectEntity, MJConversationEntity, BuildProjectVisibilityFilter } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import { DialogService } from '../../services/dialog.service';
import { ProjectFormModalComponent } from './project-form-modal.component';
import { UUIDsEqual } from '@memberjunction/global';

export interface ProjectWithStats extends MJProjectEntity {
  conversationCount?: number;
}

@Component({
  standalone: false,
  selector: 'mj-project-selector',
  template: `
    <div class="project-selector">
      <select
        class="mj-select project-dropdown"
        [ngModel]="selectedProject?.ID || ''"
        (ngModelChange)="onProjectSelectChange($event)"
        [disabled]="disabled">
        <option value="" disabled>Select a project...</option>
        @for (project of projectsWithStats; track project.ID) {
          <option [value]="project.ID">{{ project.Name }}{{ showStats && project.conversationCount != null ? ' (' + project.conversationCount + ')' : '' }}</option>
        }
      </select>

      <div class="project-actions">
        @if (selectedProject) {
          <button mjButton
            variant="flat"
            size="sm"
            [disabled]="disabled"
            (click)="onEditProject()"
            title="Edit Project">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button mjButton
            variant="danger"
            size="sm"
            [disabled]="disabled"
            (click)="onDeleteProject()"
            title="Delete Project">
            <i class="fa-solid fa-trash"></i>
          </button>
        }
        <button mjButton
          variant="primary"
          size="sm"
          [disabled]="disabled"
          (click)="onCreateProject()"
          title="Create New Project">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .project-selector {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .project-dropdown {
      flex: 1;
      min-width: 200px;
    }
    .project-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .project-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .project-name {
      font-weight: 500;
      color: #333;
    }
    .project-stats {
      font-size: 12px;
      color: #666;
    }
    .project-actions {
      display: flex;
      gap: 4px;
    }
    .btn-icon {
      min-width: auto;
      padding: 6px 8px;
    }
    .btn-danger:hover:not(:disabled) {
      background-color: #F44336;
      border-color: #F44336;
      color: white;
    }
  `]
})
export class ProjectSelectorComponent extends BaseAngularComponent implements OnInit  {
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
  @Input() SelectedProjectId: string | null = null;

  /** @deprecated Use {@link SelectedProjectId}. */
  @Input() set selectedProjectId(value: string | null) {
    this.SelectedProjectId = value;
  }
  /** @deprecated Use {@link SelectedProjectId}. */
  get selectedProjectId(): string | null {
    return this.SelectedProjectId;
  }
  @Input() Disabled: boolean = false;

  /** @deprecated Use {@link Disabled}. */
  @Input() set disabled(value: boolean) {
    this.Disabled = value;
  }
  /** @deprecated Use {@link Disabled}. */
  get disabled(): boolean {
    return this.Disabled;
  }
  @Input() ShowStats: boolean = true;

  /** @deprecated Use {@link ShowStats}. */
  @Input() set showStats(value: boolean) {
    this.ShowStats = value;
  }
  /** @deprecated Use {@link ShowStats}. */
  get showStats(): boolean {
    return this.ShowStats;
  }

  @Output() ProjectSelected = new EventEmitter<MJProjectEntity | null>();

  /**
   * @deprecated Use {@link ProjectSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (projectSelected) keeps working. Must stay AFTER ProjectSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() projectSelected = this.ProjectSelected;
  @Output() ProjectCreated = new EventEmitter<MJProjectEntity>();

  /**
   * @deprecated Use {@link ProjectCreated}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (projectCreated) keeps working. Must stay AFTER ProjectCreated: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() projectCreated = this.ProjectCreated;
  @Output() ProjectUpdated = new EventEmitter<MJProjectEntity>();

  /**
   * @deprecated Use {@link ProjectUpdated}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (projectUpdated) keeps working. Must stay AFTER ProjectUpdated: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() projectUpdated = this.ProjectUpdated;
  @Output() ProjectDeleted = new EventEmitter<string>();

  /**
   * @deprecated Use {@link ProjectDeleted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (projectDeleted) keeps working. Must stay AFTER ProjectDeleted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() projectDeleted = this.ProjectDeleted;

  public ProjectsWithStats: ProjectWithStats[] = [];

  /** @deprecated Use {@link ProjectsWithStats}. */
  public get projectsWithStats(): ProjectWithStats[] {
    return this.ProjectsWithStats;
  }
  /** @deprecated Use {@link ProjectsWithStats}. */
  public set projectsWithStats(value: ProjectWithStats[]) {
    this.ProjectsWithStats = value;
  }
  public SelectedProject: MJProjectEntity | null = null;

  /** @deprecated Use {@link SelectedProject}. */
  public get selectedProject(): MJProjectEntity | null {
    return this.SelectedProject;
  }
  /** @deprecated Use {@link SelectedProject}. */
  public set selectedProject(value: MJProjectEntity | null) {
    this.SelectedProject = value;
  }

  constructor(
    private dialogService: DialogService,
    private mjDialogService: MJDialogService,
    private viewContainerRef: ViewContainerRef
  ) {
  super();}

  ngOnInit() {
    this.loadProjects();
  }

  private async loadProjects(): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      // Load projects and conversation counts in parallel
      const [projectsResult, conversationsResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Projects',
          // Shared folders plus this user's own — the SAME rule the sidebar uses. Without
          // it this modal listed every personal folder in the environment by name, which
          // is the exposure OwnerUserID exists to close.
          ExtraFilter: `EnvironmentID='${this.EnvironmentId}' AND IsArchived=0`
            + ` AND ${BuildProjectVisibilityFilter(this.CurrentUser?.ID)}`,
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: Conversations',
          ExtraFilter: `EnvironmentID='${this.EnvironmentId}'`,
          ResultType: 'entity_object'
        }
      ], this.CurrentUser);

      if (projectsResult.Success && conversationsResult.Success) {
        const projects = projectsResult.Results as MJProjectEntity[] || [];
        const conversations = conversationsResult.Results as MJConversationEntity[] || [];

        // Calculate conversation counts per project
        const conversationCounts = this.calculateConversationCounts(conversations);

        // Merge projects with stats
        this.ProjectsWithStats = projects.map(p => {
          const projectWithStats = p as ProjectWithStats;
          projectWithStats.conversationCount = conversationCounts.get(p.ID) || 0;
          return projectWithStats;
        });

        if (this.SelectedProjectId) {
          this.SelectedProject = this.ProjectsWithStats.find(p => UUIDsEqual(p.ID, this.SelectedProjectId)) || null;
        }
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  private calculateConversationCounts(conversations: MJConversationEntity[]): Map<string, number> {
    const counts = new Map<string, number>();

    for (const conv of conversations) {
      if (conv.ProjectID) {
        counts.set(conv.ProjectID, (counts.get(conv.ProjectID) || 0) + 1);
      }
    }

    return counts;
  }

  OnProjectChange(project: MJProjectEntity | null): void {
    this.SelectedProject = project;
    this.ProjectSelected.emit(project);
  }

  /** @deprecated Use {@link OnProjectChange}. */
  onProjectChange(project: MJProjectEntity | null): void {
    return this.OnProjectChange(project);
  }

  OnProjectSelectChange(projectId: string): void {
    const project = this.ProjectsWithStats.find(p => UUIDsEqual(p.ID, projectId)) || null;
    this.OnProjectChange(project);
  }

  /** @deprecated Use {@link OnProjectSelectChange}. */
  onProjectSelectChange(projectId: string): void {
    return this.OnProjectSelectChange(projectId);
  }

  OnCreateProject(): void {
    const dialogRef = this.mjDialogService.open({
      content: ProjectFormModalComponent,
      width: 600,
      minWidth: 400
    });

    const modalInstance = dialogRef.Content!.instance as unknown as ProjectFormModalComponent;
    modalInstance.dialogRef = dialogRef;
    modalInstance.environmentId = this.EnvironmentId;
    modalInstance.currentUser = this.CurrentUser;

    modalInstance.projectSaved.subscribe(async (project: MJProjectEntity) => {
      this.ProjectCreated.emit(project);
      await this.loadProjects();
      this.SelectedProject = project;
      this.ProjectSelected.emit(project);
    });
  }

  /** @deprecated Use {@link OnCreateProject}. */
  onCreateProject(): void {
    return this.OnCreateProject();
  }

  OnEditProject(): void {
    if (!this.SelectedProject) return;

    const dialogRef = this.mjDialogService.open({
      content: ProjectFormModalComponent,
      width: 600,
      minWidth: 400
    });

    const modalInstance = dialogRef.Content!.instance as unknown as ProjectFormModalComponent;
    modalInstance.dialogRef = dialogRef;
    modalInstance.project = this.SelectedProject;
    modalInstance.environmentId = this.EnvironmentId;
    modalInstance.currentUser = this.CurrentUser;

    modalInstance.projectSaved.subscribe(async (project: MJProjectEntity) => {
      this.ProjectUpdated.emit(project);
      await this.loadProjects();
      this.SelectedProject = project;
      this.ProjectSelected.emit(project);
    });
  }

  /** @deprecated Use {@link OnEditProject}. */
  onEditProject(): void {
    return this.OnEditProject();
  }

  async OnDeleteProject(): Promise<void> {
    if (!this.SelectedProject) return;

    const projectName = this.SelectedProject.Name;
    const projectId = this.SelectedProject.ID;
    const conversationCount = (this.SelectedProject as ProjectWithStats).conversationCount || 0;

    let message = `Are you sure you want to delete the project "${projectName}"?`;
    if (conversationCount > 0) {
      message += `\n\nThis project has ${conversationCount} conversation(s). The conversations will not be deleted, but will be unassigned from this project.`;
    }

    const confirmed = await this.dialogService.confirm({
      title: 'Delete Project',
      message: message,
      okText: 'Delete',
      cancelText: 'Cancel',
      dangerous: true
    });

    if (!confirmed) return;

    try {
      const md = this.ProviderToUse;
      const project = await md.GetEntityObject<MJProjectEntity>('MJ: Projects', this.CurrentUser);
      await project.Load(projectId);

      const deleted = await project.Delete();
      if (deleted) {
        this.ProjectDeleted.emit(projectId);
        await this.loadProjects();
        this.SelectedProject = null;
        this.ProjectSelected.emit(null);
      } else {
        throw new Error('Delete operation returned false');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      await this.dialogService.alert('Error', 'Failed to delete project. Please try again.');
    }
  }

  /** @deprecated Use {@link OnDeleteProject}. */
  async onDeleteProject(): Promise<void> {
    return this.OnDeleteProject();
  }
}