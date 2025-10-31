import { Component } from '@angular/core';
import { ChapterReportEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterReportDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Chapter Reports') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapterreport-form',
    templateUrl: './chapterreport.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterReportFormComponent extends BaseFormComponent {
    public record!: ChapterReportEntity;
} 

export function LoadChapterReportFormComponent() {
    LoadChapterReportDetailsComponent();
}
