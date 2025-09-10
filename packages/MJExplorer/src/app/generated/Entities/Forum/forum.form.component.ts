import { Component } from '@angular/core';
import { ForumEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadForumDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Forums') // Tell MemberJunction about this class
@Component({
    selector: 'gen-forum-form',
    templateUrl: './forum.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ForumFormComponent extends BaseFormComponent {
    public record!: ForumEntity;
} 

export function LoadForumFormComponent() {
    LoadForumDetailsComponent();
}
