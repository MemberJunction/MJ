import { Component } from '@angular/core';
import { ChapterReportCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterReportCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Chapter Report Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapterreportcategory-form',
    templateUrl: './chapterreportcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterReportCategoryFormComponent extends BaseFormComponent {
    public record!: ChapterReportCategoryEntity;
} 

export function LoadChapterReportCategoryFormComponent() {
    LoadChapterReportCategoryDetailsComponent();
}
