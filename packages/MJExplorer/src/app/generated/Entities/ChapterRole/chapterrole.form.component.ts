import { Component } from '@angular/core';
import { ChapterRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterRoleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Chapter Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapterrole-form',
    templateUrl: './chapterrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterRoleFormComponent extends BaseFormComponent {
    public record!: ChapterRoleEntity;
} 

export function LoadChapterRoleFormComponent() {
    LoadChapterRoleDetailsComponent();
}
