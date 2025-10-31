import { Component } from '@angular/core';
import { ChapterAssignmentRuleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterAssignmentRuleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Chapter Assignment Rules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapterassignmentrule-form',
    templateUrl: './chapterassignmentrule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterAssignmentRuleFormComponent extends BaseFormComponent {
    public record!: ChapterAssignmentRuleEntity;
} 

export function LoadChapterAssignmentRuleFormComponent() {
    LoadChapterAssignmentRuleDetailsComponent();
}
