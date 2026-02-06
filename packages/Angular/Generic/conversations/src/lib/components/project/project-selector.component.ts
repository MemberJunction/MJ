import { Component, Input, Output, EventEmitter, OnInit, ViewContainerRef } from '@angular/core';
import { ProjectEntity, ConversationEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { DialogService as KendoDialogService } from '@progress/kendo-angular-dialog';
import { DialogService } from '../../services/dialog.service';
import { ProjectFormModalComponent } from './project-form-modal.component';

export interface ProjectWithStats extends ProjectEntity {
  conversationCount?: number;
}

@Component({
  standalone: false,
  selector: 'mj-project-selector',
  template: `
    <div class="project-selector">
      <kendo-dropdownlist
        [data]="projectsWithStats"
        [value]="selectedProject"
        [textField]="'Name'"
        [valueField]="'ID'"
        [disabled]="disabled"
        (valueChange)="onProjectChange($event)">
        <ng-template kendoDropDownListItemTemplate let-dataItem>
          <div class="project-item">
            <i class="fa-solid {{ dataItem.Icon || 'fa-folder' }}"
               [style.color]="dataItem.Color || '#0076B6'"></i>
            <div class="project-info">
              <span class="project-name">{{ dataItem.Name }}</span>
              @if (showStats && dataItem.conversationCount != null) {
                <span class="project-stats">{{ dataItem.conversationCount }} conversations</span>
              }
            </div>
          </div>
        </ng-template>
        <ng-template kendoDropDownListValueTemplate let-dataItem>
          <div class="project-item">
            <i class="fa-solid {{ dataItem.Icon || 'fa-folder' }}"
               [style.color]="dataItem.Color || '#0076B6'"></i>
            <span>{{ dataItem.Name }}</span>
          </div>
        </ng-template>
      </kendo-dropdownlist>

      <div class="project-actions">
        @if (selectedProject) {
          <button
            kendoButton
            [icon]="'edit'"
            [disabled]="disabled"
            (click)="onEditProject()"
            title="Edit Project"
            class="btn-icon">
          </button>
          <button
            kendoButton
            [icon]="'trash'"
            [disabled]="disabled"
            (click)="onDeleteProject()"
            title="Delete Project"
            class="btn-icon btn-danger">
          </button>
        }
        <button
          kendoButton
          [icon]="'plus'"
          [disabled]="disabled"
          (click)="onCreateProject()"
          title="Create New Project"
          [themeColor]="'primary'"
          class="btn-icon">
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
    .project-selector kendo-dropdownlist {
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
export class ProjectSelectorComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() selectedProjectId: string | null = null;
  @Input() disabled: boolean = false;
  @Input() showStats: boolean = true;

  @Output() projectSelected = new EventEmitter<ProjectEntity | null>();
  @Output() projectCreated = new EventEmitter<ProjectEntity>();
  @Output() projectUpdated = new EventEmitter<ProjectEntity>();
  @Output() projectDeleted = new EventEmitter<string>();

  public projectsWithStats: ProjectWithStats[] = [];
  public selectedProject: ProjectEntity | null = null;

  constructor(
    private dialogService: DialogService,
    private kendoDialogService: KendoDialogService,
    private viewContainerRef: ViewContainerRef
  ) {}

  ngOnInit() {
    this.loadProjects();
  }

  private async loadProjects(): Promise<void> {
    try {
      const rv = new RunView();

      // Load projects and conversation counts in parallel
      const [projectsResult, conversationsResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Projects',
          ExtraFilter: `EnvironmentID='${this.environmentId}' AND IsArchived=0`,
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Conversations',
          ExtraFilter: `EnvironmentID='${this.environmentId}'`,
          ResultType: 'entity_object'
        }
      ], this.currentUser);

      if (projectsResult.Success && conversationsResult.Success) {
        const projects = projectsResult.Results as ProjectEntity[] || [];
        const conversations = conversationsResult.Results as ConversationEntity[] || [];

        // Calculate conversation counts per project
        const conversationCounts = this.calculateConversationCounts(conversations);

        // Merge projects with stats
        this.projectsWithStats = projects.map(p => {
          const projectWithStats = p as ProjectWithStats;
          projectWithStats.conversationCount = conversationCounts.get(p.ID) || 0;
          return projectWithStats;
        });

        if (this.selectedProjectId) {
          this.selectedProject = this.projectsWithStats.find(p => p.ID === this.selectedProjectId) || null;
        }
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  private calculateConversationCounts(conversations: ConversationEntity[]): Map<string, number> {
    const counts = new Map<string, number>();

    for (const conv of conversations) {
      if (conv.ProjectID) {
        counts.set(conv.ProjectID, (counts.get(conv.ProjectID) || 0) + 1);
      }
    }

    return counts;
  }

  onProjectChange(project: ProjectEntity | null): void {
    this.selectedProject = project;
    this.projectSelected.emit(project);
  }

  onCreateProject(): void {
    const dialogRef = this.kendoDialogService.open({
      content: ProjectFormModalComponent,
      width: 600,
      minWidth: 400
    });

    const modalInstance = dialogRef.content.instance as ProjectFormModalComponent;
    modalInstance.dialogRef = dialogRef;
    modalInstance.environmentId = this.environmentId;
    modalInstance.currentUser = this.currentUser;

    modalInstance.projectSaved.subscribe(async (project: ProjectEntity) => {
      this.projectCreated.emit(project);
      await this.loadProjects();
      this.selectedProject = project;
      this.projectSelected.emit(project);
    });
  }

  onEditProject(): void {
    if (!this.selectedProject) return;

    const dialogRef = this.kendoDialogService.open({
      content: ProjectFormModalComponent,
      width: 600,
      minWidth: 400
    });

    const modalInstance = dialogRef.content.instance as ProjectFormModalComponent;
    modalInstance.dialogRef = dialogRef;
    modalInstance.project = this.selectedProject;
    modalInstance.environmentId = this.environmentId;
    modalInstance.currentUser = this.currentUser;

    modalInstance.projectSaved.subscribe(async (project: ProjectEntity) => {
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
      const md = new Metadata();
      const project = await md.GetEntityObject<ProjectEntity>('MJ: Projects', this.currentUser);
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