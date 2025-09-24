import { Component } from '@angular/core';
import { ProjectEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProjectDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Projects') // Tell MemberJunction about this class
@Component({
    selector: 'gen-project-form',
    templateUrl: './project.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProjectFormComponent extends BaseFormComponent {
    public record!: ProjectEntity;
} 

export function LoadProjectFormComponent() {
    LoadProjectDetailsComponent();
}
