import { Component } from '@angular/core';
import { IssueEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadIssueDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Issues') // Tell MemberJunction about this class
@Component({
    selector: 'gen-issue-form',
    templateUrl: './issue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class IssueFormComponent extends BaseFormComponent {
    public record!: IssueEntity;
} 

export function LoadIssueFormComponent() {
    LoadIssueDetailsComponent();
}
