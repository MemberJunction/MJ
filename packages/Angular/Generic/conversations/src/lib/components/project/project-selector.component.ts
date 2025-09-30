import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ProjectEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';

@Component({
  selector: 'mj-project-selector',
  template: `
    <div class="project-selector">
      <kendo-dropdownlist
        [data]="projects"
        [value]="selectedProject"
        [textField]="'Name'"
        [valueField]="'ID'"
        [disabled]="disabled"
        (valueChange)="onProjectChange($event)">
        <ng-template kendoDropDownListItemTemplate let-dataItem>
          <div class="project-item">
            <i class="fas fa-folder" [style.color]="dataItem.Color || '#0076B6'"></i>
            <span>{{ dataItem.Name }}</span>
          </div>
        </ng-template>
      </kendo-dropdownlist>

      <button
        class="btn-new-project"
        [disabled]="disabled"
        (click)="onCreateProject()"
        title="Create New Project">
        <i class="fas fa-plus"></i>
      </button>
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
    .btn-new-project {
      padding: 8px 12px;
      background: #0076B6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 150ms ease;
    }
    .btn-new-project:hover:not(:disabled) {
      background: #005A8C;
    }
    .btn-new-project:disabled {
      background: #D9D9D9;
      cursor: not-allowed;
    }
  `]
})
export class ProjectSelectorComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() selectedProjectId: string | null = null;
  @Input() disabled: boolean = false;

  @Output() projectSelected = new EventEmitter<ProjectEntity | null>();
  @Output() projectCreated = new EventEmitter<ProjectEntity>();

  public projects: ProjectEntity[] = [];
  public selectedProject: ProjectEntity | null = null;

  ngOnInit() {
    this.loadProjects();
  }

  private async loadProjects(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<ProjectEntity>({
        EntityName: 'MJ: Projects',
        ExtraFilter: `EnvironmentID='${this.environmentId}' AND IsArchived=0`,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success) {
        this.projects = result.Results || [];
        if (this.selectedProjectId) {
          this.selectedProject = this.projects.find(p => p.ID === this.selectedProjectId) || null;
        }
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  onProjectChange(project: ProjectEntity | null): void {
    this.selectedProject = project;
    this.projectSelected.emit(project);
  }

  async onCreateProject(): Promise<void> {
    const name = prompt('Enter project name:');
    if (!name) return;

    try {
      const md = new Metadata();
      const project = await md.GetEntityObject<ProjectEntity>('MJ: Projects', this.currentUser);

      project.Name = name;
      project.EnvironmentID = this.environmentId;
      project.IsArchived = false;

      const saved = await project.Save();
      if (saved) {
        this.projectCreated.emit(project);
        await this.loadProjects();
        this.selectedProject = project;
        this.projectSelected.emit(project);
      }
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project');
    }
  }
}