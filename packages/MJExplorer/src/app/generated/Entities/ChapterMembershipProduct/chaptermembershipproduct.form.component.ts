import { Component } from '@angular/core';
import { ChapterMembershipProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChapterMembershipProductDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Chapter Membership Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chaptermembershipproduct-form',
    templateUrl: './chaptermembershipproduct.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChapterMembershipProductFormComponent extends BaseFormComponent {
    public record!: ChapterMembershipProductEntity;
} 

export function LoadChapterMembershipProductFormComponent() {
    LoadChapterMembershipProductDetailsComponent();
}
