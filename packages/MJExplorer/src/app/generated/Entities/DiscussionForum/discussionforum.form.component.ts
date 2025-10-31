import { Component } from '@angular/core';
import { DiscussionForumEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDiscussionForumDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Discussion Forums') // Tell MemberJunction about this class
@Component({
    selector: 'gen-discussionforum-form',
    templateUrl: './discussionforum.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DiscussionForumFormComponent extends BaseFormComponent {
    public record!: DiscussionForumEntity;
} 

export function LoadDiscussionForumFormComponent() {
    LoadDiscussionForumDetailsComponent();
}
