import { Component } from '@angular/core';
import { ChapterMeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterMeetingDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Chapter Meetings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chaptermeeting-form',
    templateUrl: './chaptermeeting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterMeetingFormComponent extends BaseFormComponent {
    public record!: ChapterMeetingEntity;
} 

export function LoadChapterMeetingFormComponent() {
    LoadChapterMeetingDetailsComponent();
}
