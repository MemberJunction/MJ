import { Component } from '@angular/core';
import { ChapterAuthorizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterAuthorizationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Chapter Authorizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapterauthorization-form',
    templateUrl: './chapterauthorization.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterAuthorizationFormComponent extends BaseFormComponent {
    public record!: ChapterAuthorizationEntity;
} 

export function LoadChapterAuthorizationFormComponent() {
    LoadChapterAuthorizationDetailsComponent();
}
