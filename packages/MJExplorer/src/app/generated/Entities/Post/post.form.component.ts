import { Component } from '@angular/core';
import { PostEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPostDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Posts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-post-form',
    templateUrl: './post.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PostFormComponent extends BaseFormComponent {
    public record!: PostEntity;
} 

export function LoadPostFormComponent() {
    LoadPostDetailsComponent();
}
