import { Component, Input, Output, EventEmitter, OnInit, ViewContainerRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJProjectEntity, MJConversationEntity } from '@memberjunction/core-entities';
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
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() selectedProjectId: string | null = null;
  @Input() disabled: boolean = false;
  @Input() showStats: boolean = true;

  @Output() projectSelected = new EventEmitter<MJProjectEntity | null>();
  @Output() projectCreated = new EventEmitter<MJProjectEntity>();
  @Output() projectUpdated = new EventEmitter<MJProjectEntity>();
  @Output() projectDeleted = new EventEmitter<string>();

  public projectsWithStats: ProjectWithStats[] = [];
  public selectedProject: MJProjectEntity | null = null;

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
          ExtraFilter: `EnvironmentID='${this.environmentId}' AND IsArchived=0`,
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: Conversations',
          ExtraFilter: `EnvironmentID='${this.environmentId}'`,
          ResultType: 'entity_object'
        }
      ], this.currentUser);

      if (projectsResult.Success && conversationsResult.Success) {
        const projects = projectsResult.Results as MJProjectEntity[] || [];
        const conversations = conversationsResult.Results as MJConversationEntity[] || [];

        // Calculate conversation counts per project
        const conversationCounts = this.calculateConversationCounts(conversations);

        // Merge projects with stats
        this.projectsWithStats = projects.map(p => {
          const projectWithStats = p as ProjectWithStats;
          projectWithStats.conversationCount = conversationCounts.get(p.ID) || 0;
          return projectWithStats;
        });

        if (this.selectedProjectId) {
          this.selectedProject = this.projectsWithStats.find(p => UUIDsEqual(p.ID, this.selectedProjectId)) || null;
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

  onProjectChange(project: MJProjectEntity | null): void {
    this.selectedProject = project;
    this.projectSelected.emit(project);
  }

  onProjectSelectChange(projectId: string): void {
    const project = this.projectsWithStats.find(p => UUIDsEqual(p.ID, projectId)) || null;
    this.onProjectChange(project);
  }

  onCreateProject(): void {
    const dialogRef = this.mjDialogService.open({
      content: ProjectFormModalComponent,
      width: 600,
      minWidth: 400
    });

    const modalInstance = dialogRef.Content!.instance as unknown as ProjectFormModalComponent;
    modalInstance.dialogRef = dialogRef;
    modalInstance.environmentId = this.environmentId;
    modalInstance.currentUser = this.currentUser;

    modalInstance.projectSaved.subscribe(async (project: MJProjectEntity) => {
      this.projectCreated.emit(project);
      await this.loadProjects();
      this.selectedProject = project;
      this.projectSelected.emit(project);
    });
  }

  onEditProject(): void {
    if (!this.selectedProject) return;

    const dialogRef = this.mjDialogService.open({
      content: ProjectFormModalComponent,
      width: 600,
      minWidth: 400
    });

    const modalInstance = dialogRef.Content!.instance as unknown as ProjectFormModalComponent;
    modalInstance.dialogRef = dialogRef;
    modalInstance.project = this.selectedProject;
    modalInstance.environmentId = this.environmentId;
    modalInstance.currentUser = this.currentUser;

    modalInstance.projectSaved.subscribe(async (project: MJProjectEntity) => {
      this.projectUpdated.emit(project);
      await this.loadProjects();
      this.selectedProject = project;
      this.projectSelected.emit(project);
    });
  }

  async onDeleteProject(): Promise<void> {
    if (!this.selectedProject) return;

    const projectName = this.selectedProject.Name;
    const projectId = this.selectedProject.ID;
    const conversationCount = (this.selectedProject as ProjectWithStats).conversationCount || 0;

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
      const project = await md.GetEntityObject<MJProjectEntity>('MJ: Projects', this.currentUser);
      await project.Load(projectId);

      const deleted = await project.Delete();
      if (deleted) {
        this.projectDeleted.emit(projectId);
        await this.loadProjects();
        this.selectedProject = null;
        this.projectSelected.emit(null);
      } else {
        throw new Error('Delete operation returned false');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      await this.dialogService.alert('Error', 'Failed to delete project. Please try again.');
    }
  }
}