import { Component } from '@angular/core';
import { ChapterRoleTypeAuthorizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterRoleTypeAuthorizationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Chapter Role Type Authorizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapterroletypeauthorization-form',
    templateUrl: './chapterroletypeauthorization.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterRoleTypeAuthorizationFormComponent extends BaseFormComponent {
    public record!: ChapterRoleTypeAuthorizationEntity;
} 

export function LoadChapterRoleTypeAuthorizationFormComponent() {
    LoadChapterRoleTypeAuthorizationDetailsComponent();
}
