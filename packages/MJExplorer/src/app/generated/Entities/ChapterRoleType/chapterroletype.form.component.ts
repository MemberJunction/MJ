import { Component } from '@angular/core';
import { ChapterRoleTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterRoleTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Chapter Role Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapterroletype-form',
    templateUrl: './chapterroletype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterRoleTypeFormComponent extends BaseFormComponent {
    public record!: ChapterRoleTypeEntity;
} 

export function LoadChapterRoleTypeFormComponent() {
    LoadChapterRoleTypeDetailsComponent();
}
